import csv
import io
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, F, DecimalField, OuterRef, Prefetch, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core.api import TenantViewSet, require
from core.models import AuditLog
from crm.models import Customer
from inventory.models import StockLevel
from inventory.services import move_stock

from .models import Brand, Category, CustomerPrice, PriceTier, Product, ProductUnit, Unit
from .pricing import quote_price
from .serializers import (BrandSerializer, CategorySerializer, CustomerPriceSerializer, ProductSerializer,
                          UnitSerializer)

QTY_FIELD = DecimalField(max_digits=14, decimal_places=3)


class CategoryViewSet(TenantViewSet):
    queryset = Category.objects.annotate(product_count=Count("products"))
    serializer_class = CategorySerializer
    perm_module = "products"
    search_fields = ["name"]
    pagination_class = None


class BrandViewSet(TenantViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer
    perm_module = "products"
    search_fields = ["name", "manufacturer"]
    pagination_class = None


class UnitViewSet(TenantViewSet):
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer
    perm_module = "products"
    pagination_class = None


class ProductViewSet(TenantViewSet):
    queryset = Product.objects.select_related("category", "brand", "unit")
    serializer_class = ProductSerializer
    perm_module = "products"
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    search_fields = ["name", "sku", "barcode", "units__barcode"]
    filterset_fields = ["category", "brand", "is_active", "tax_type", "track_batches"]
    ordering_fields = ["name", "retail_price", "created_at", "stock"]
    permission_map = {"pos_search": "pos.sell", "pos_catalog": "pos.sell", "quote": "pos.sell", "export_csv": "products.view",
                      "import_csv": "products.manage", "upload_image": "products.manage"}

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related(
            "units",
            Prefetch("price_tiers", queryset=PriceTier.objects.select_related("unit")),
            "customer_prices",
        )
        branch = self.request.branch
        stock_sq = StockLevel.objects.filter(product=OuterRef("pk"), branch=branch).values("quantity")[:1]
        total_sq = (StockLevel.objects.filter(product=OuterRef("pk")).values("product")
                    .annotate(t=Sum("quantity")).values("t")[:1])
        qs = qs.annotate(stock=Coalesce(Subquery(stock_sq, output_field=QTY_FIELD), Value(Decimal("0")), output_field=QTY_FIELD),
                         total_stock=Coalesce(Subquery(total_sq, output_field=QTY_FIELD), Value(Decimal("0")), output_field=QTY_FIELD))
        params = self.request.query_params
        if params.get("stock_status") == "low":
            qs = qs.filter(track_stock=True, stock__gt=0, stock__lte=F("reorder_level"))
        elif params.get("stock_status") == "out":
            qs = qs.filter(track_stock=True, stock__lte=0)
        return qs.distinct()

    def perform_create(self, serializer):
        product = serializer.save(business=self.request.business)
        opening = self.request.data.get("opening_stock")
        if opening not in (None, "", 0, "0"):
            move_stock(branch=self.request.branch, product=product, quantity=Decimal(str(opening)), kind="opening",
                       user=self.request.user, reference="OPENING",
                       batch_number=self.request.data.get("batch_number", ""),
                       expiry_date=self.request.data.get("expiry_date") or None)
        AuditLog.log(self.request.business, self.request.user, "product.created", product, self.request)

    def perform_update(self, serializer):
        before = {f: getattr(serializer.instance, f) for f in ("retail_price", "wholesale_price", "min_price", "cost_price")}
        product = serializer.save()
        changed = {f: f"{before[f]} -> {getattr(product, f)}" for f in before if before[f] != getattr(product, f)}
        AuditLog.log(self.request.business, self.request.user, "product.updated", product, self.request, **changed)

    def perform_destroy(self, instance):
        if instance.sale_items.exists() or instance.movements.exists():
            instance.is_active = False
            instance.save(update_fields=["is_active"])
            AuditLog.log(self.request.business, self.request.user, "product.deactivated", instance, self.request)
        else:
            AuditLog.log(self.request.business, self.request.user, "product.deleted", instance, self.request, name=instance.name)
            instance.delete()

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
    def upload_image(self, request, pk=None):
        product = self.get_object()
        if "image" not in request.FILES:
            raise ValidationError({"image": "No file uploaded."})
        product.image = request.FILES["image"]
        product.save(update_fields=["image"])
        return Response(self.get_serializer(product).data)

    @action(detail=False)
    def pos_search(self, request):
        """Fast lookup for the POS: exact barcode/SKU (incl. pack barcodes) first, then name search."""
        q = (request.query_params.get("q") or "").strip()
        if not q:
            return Response([])
        qs = self.get_queryset().filter(is_active=True)
        exact_unit = ProductUnit.objects.filter(business=request.business, barcode=q).first()
        exact = list(qs.filter(Q(barcode=q) | Q(sku__iexact=q) | Q(units__barcode=q))[:5])
        if exact:
            data = self.get_serializer(exact, many=True).data
            if exact_unit:
                for row in data:
                    if row["id"] == exact_unit.product_id:
                        row["scanned_unit"] = exact_unit.pk
            return Response({"exact": True, "results": data})
        terms = q.split()
        for t in terms:
            qs = qs.filter(Q(name__icontains=t) | Q(sku__icontains=t) | Q(brand__name__icontains=t))
        return Response({"exact": False, "results": self.get_serializer(qs[:20], many=True).data})

    @action(detail=False)
    def pos_catalog(self, request):
        """Product grid for the POS. ?category=<id>|top|uncategorised, ?page=N (48 per page).
        Page 1 also returns the category chips (active products only)."""
        from datetime import timedelta

        from django.utils import timezone

        page_size = 48
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except ValueError:
            page = 1
        category = request.query_params.get("category") or ""
        qs = self.get_queryset().filter(is_active=True)
        if category == "top":
            since = timezone.now() - timedelta(days=30)
            qs = qs.annotate(sold=Count("sale_items", filter=Q(
                sale_items__sale__status="completed", sale_items__sale__created_at__gte=since,
                sale_items__sale__branch=request.branch))).filter(sold__gt=0).order_by("-sold", "name")
        elif category == "uncategorised":
            qs = qs.filter(category__isnull=True).order_by("name")
        elif category:
            qs = qs.filter(category_id=category).order_by("name")
        else:
            qs = qs.order_by("name")
        start = (page - 1) * page_size
        rows = list(qs[start:start + page_size + 1])
        data = {"results": self.get_serializer(rows[:page_size], many=True).data, "has_more": len(rows) > page_size}
        if page == 1:
            cats = (Category.objects.filter(business=request.business)
                    .annotate(n=Count("products", filter=Q(products__is_active=True))).filter(n__gt=0).order_by("name"))
            data["categories"] = [{"id": c.id, "name": c.name, "count": c.n} for c in cats]
            data["uncategorised"] = Product.objects.filter(business=request.business, is_active=True,
                                                           category__isnull=True).count()
        return Response(data)

    @action(detail=False, methods=["post"])
    def quote(self, request):
        """Preview the price the engine would apply: {product, unit?, quantity, customer?, sale_type?}"""
        product = self.get_queryset().get(pk=request.data["product"])
        unit = product.units.filter(pk=request.data.get("unit")).first() if request.data.get("unit") else None
        customer = Customer.objects.filter(business=request.business, pk=request.data.get("customer")).first()
        q = quote_price(product, Decimal(str(request.data.get("quantity", 1))), unit=unit, customer=customer,
                        sale_type=request.data.get("sale_type", "retail"))
        return Response({"unit_price": q.unit_price, "rule": q.rule, "base_quantity": q.base_quantity,
                         "min_unit_price": q.min_unit_price})

    # ---- CSV import / export -------------------------------------------------
    CSV_COLUMNS = ["name", "sku", "barcode", "category", "brand", "unit", "cost_price", "retail_price",
                   "wholesale_price", "min_price", "wholesale_min_qty", "reorder_level", "tax_type", "is_active",
                   "stock"]

    @action(detail=False)
    def export_csv(self, request):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="products.csv"'
        writer = csv.writer(response)
        writer.writerow(self.CSV_COLUMNS)
        for p in self.filter_queryset(self.get_queryset()):
            writer.writerow([p.name, p.sku, p.barcode, p.category.name if p.category else "",
                             p.brand.name if p.brand else "", p.unit.abbreviation, p.cost_price, p.retail_price,
                             p.wholesale_price if p.wholesale_price is not None else "",
                             p.min_price if p.min_price is not None else "", p.wholesale_min_qty, p.reorder_level,
                             p.tax_type, int(p.is_active), p.stock])
        return response

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser])
    def import_csv(self, request):
        """Create or update products by SKU. Optional 'stock' column sets opening stock for new products."""
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload a CSV file."})
        business = request.business
        reader = csv.DictReader(io.StringIO(upload.read().decode("utf-8-sig")))
        units = {u.abbreviation.lower(): u for u in Unit.objects.filter(business=business)}
        units.update({u.name.lower(): u for u in Unit.objects.filter(business=business)})
        created = updated = 0
        errors = []

        def dec(v, default=None):
            v = (v or "").strip().replace(",", "")
            if not v:
                return default
            try:
                return Decimal(v)
            except InvalidOperation:
                raise ValueError(f"'{v}' is not a number")

        with transaction.atomic():
            for line, row in enumerate(reader, start=2):
                try:
                    name = (row.get("name") or "").strip()
                    if not name:
                        raise ValueError("name is required")
                    unit = units.get((row.get("unit") or "pcs").strip().lower())
                    if unit is None:
                        raise ValueError(f"unknown unit '{row.get('unit')}'")
                    retail = dec(row.get("retail_price"))
                    if retail is None:
                        raise ValueError("retail_price is required")
                    cat = (row.get("category") or "").strip()
                    brand = (row.get("brand") or "").strip()
                    fields = dict(
                        name=name, unit=unit, retail_price=retail,
                        cost_price=dec(row.get("cost_price"), Decimal("0")),
                        wholesale_price=dec(row.get("wholesale_price")), min_price=dec(row.get("min_price")),
                        wholesale_min_qty=dec(row.get("wholesale_min_qty"), Decimal("0")),
                        reorder_level=dec(row.get("reorder_level"), Decimal("0")),
                        tax_type=(row.get("tax_type") or "standard").strip() or "standard",
                        is_active=(row.get("is_active") or "1").strip().lower() not in ("0", "false", "no"),
                        category=Category.objects.get_or_create(business=business, name=cat)[0] if cat else None,
                        brand=Brand.objects.get_or_create(business=business, name=brand)[0] if brand else None,
                    )
                    sku = (row.get("sku") or "").strip()
                    barcode = (row.get("barcode") or "").strip()
                    product = Product.objects.filter(business=business, sku=sku).first() if sku else None
                    if product:
                        for k, v in fields.items():
                            setattr(product, k, v)
                        if barcode:
                            product.barcode = barcode
                        product.save()
                        updated += 1
                    else:
                        product = Product.objects.create(business=business, sku=sku, barcode=barcode, **fields)
                        stock = dec(row.get("stock"))
                        if stock:
                            move_stock(branch=request.branch, product=product, quantity=stock, kind="opening",
                                       user=request.user, reference="IMPORT")
                        created += 1
                except Exception as exc:  # report every bad row, keep going
                    errors.append({"line": line, "error": str(exc)})
            if errors:
                transaction.set_rollback(True)
        if not errors:
            AuditLog.log(business, request.user, "product.imported", None, request, created=created, updated=updated)
        return Response({"created": 0 if errors else created, "updated": 0 if errors else updated, "errors": errors},
                        status=400 if errors else 200)


class CustomerPriceViewSet(TenantViewSet):
    queryset = CustomerPrice.objects.select_related("product", "unit")
    serializer_class = CustomerPriceSerializer
    perm_module = "customers"
    filterset_fields = ["customer", "product"]

    def perform_create(self, serializer):
        require(self.request, "products.manage")
        serializer.save(business=self.request.business)
