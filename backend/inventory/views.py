from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from catalog.models import Product
from core.api import HasPermissionCode, TenantReadOnlyViewSet, TenantViewSet, require
from core.models import AuditLog, Counter

from .models import StockAdjustment, StockBatch, StockLevel, StockMovement, Stocktake, StocktakeLine, StockTransfer
from .serializers import (StockAdjustmentSerializer, StockBatchSerializer, StockMovementSerializer,
                          StocktakeLineSerializer, StocktakeSerializer, StockTransferSerializer)
from .services import move_stock

ADJUSTMENT_KIND = {"damaged": "damaged", "expired": "expired", "opening": "opening"}


class StockMovementViewSet(TenantReadOnlyViewSet):
    """The stock ledger. Filter by product, branch, kind, date range."""

    queryset = StockMovement.objects.select_related("product", "branch", "user", "batch")
    serializer_class = StockMovementSerializer
    perm_module = "stock"
    filterset_fields = {"product": ["exact"], "branch": ["exact"], "kind": ["exact", "in"], "user": ["exact"],
                        "created_at": ["gte", "lte", "date"]}
    search_fields = ["reference", "product__name", "note"]


class StockBatchViewSet(TenantReadOnlyViewSet):
    queryset = StockBatch.objects.select_related("product", "branch").filter(quantity_remaining__gt=0)
    serializer_class = StockBatchSerializer
    perm_module = "stock"
    filterset_fields = {"product": ["exact"], "branch": ["exact"], "expiry_date": ["lte", "gte"]}

    @action(detail=False)
    def expiring(self, request):
        days = int(request.query_params.get("days", 30))
        qs = self.get_queryset().filter(expiry_date__isnull=False,
                                        expiry_date__lte=timezone.localdate() + timedelta(days=days))
        return Response(self.get_serializer(qs, many=True).data)


def apply_adjustment(adj, approver, request=None):
    factor = adj.unit.factor if adj.unit_id else Decimal("1")
    move_stock(branch=adj.branch, product=adj.product, quantity=adj.quantity * factor,
               kind=ADJUSTMENT_KIND.get(adj.reason, "adjustment"), user=approver, reference=f"ADJ-{adj.pk}",
               note=f"{adj.get_reason_display()}: {adj.note}".strip(": "), batch_number=adj.batch_number,
               expiry_date=adj.expiry_date)
    adj.status = "approved"
    adj.approved_by = approver
    adj.decided_at = timezone.now()
    adj.save(update_fields=["status", "approved_by", "decided_at"])
    AuditLog.log(adj.business, approver, "stock.adjusted", adj, request, product=adj.product.name, quantity=adj.quantity)


class StockAdjustmentViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                             viewsets.GenericViewSet):
    """Adjustments by users with stock.approve apply immediately; others wait for approval."""

    permission_classes = [HasPermissionCode]
    serializer_class = StockAdjustmentSerializer
    perm_module = "stock"
    permission_map = {"approve": "stock.approve", "reject": "stock.approve"}
    filterset_fields = ["status", "product", "reason", "branch"]

    def get_queryset(self):
        return StockAdjustment.objects.filter(business=self.request.business).select_related(
            "product", "requested_by", "approved_by", "unit")

    @transaction.atomic
    def perform_create(self, serializer):
        adj = serializer.save(business=self.request.business, branch=self.request.branch, requested_by=self.request.user)
        if self.request.user.has_code("stock.approve"):
            apply_adjustment(adj, self.request.user, self.request)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def approve(self, request, pk=None):
        adj = StockAdjustment.objects.select_for_update().get(pk=self.get_object().pk)
        if adj.status != "pending":
            raise ValidationError("Already decided.")
        apply_adjustment(adj, request.user, request)
        return Response(self.get_serializer(adj).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        adj = self.get_object()
        if adj.status != "pending":
            raise ValidationError("Already decided.")
        adj.status, adj.approved_by, adj.decided_at = "rejected", request.user, timezone.now()
        adj.save(update_fields=["status", "approved_by", "decided_at"])
        return Response(self.get_serializer(adj).data)


class StockTransferViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                           viewsets.GenericViewSet):
    permission_classes = [HasPermissionCode]
    serializer_class = StockTransferSerializer
    perm_module = "stock"
    permission_map = {"dispatch_goods": "stock.manage", "receive": "stock.manage", "cancel": "stock.manage"}
    filterset_fields = ["status", "from_branch", "to_branch"]

    def get_queryset(self):
        return StockTransfer.objects.filter(business=self.request.business).select_related(
            "from_branch", "to_branch").prefetch_related("items__product")

    def perform_create(self, serializer):
        serializer.save(business=self.request.business, created_by=self.request.user,
                        number=Counter.next(self.request.business, "TR"))

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def dispatch_goods(self, request, pk=None):
        t = StockTransfer.objects.select_for_update().get(pk=self.get_object().pk)
        if t.status != "pending":
            raise ValidationError("Transfer already dispatched.")
        for i in t.items.select_related("product"):
            move_stock(branch=t.from_branch, product=i.product, quantity=-i.quantity, kind="transfer_out",
                       user=request.user, reference=t.number, note=f"To {t.to_branch.name}")
        t.status = "in_transit"
        t.save(update_fields=["status"])
        return Response(self.get_serializer(t).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def receive(self, request, pk=None):
        t = StockTransfer.objects.select_for_update().get(pk=self.get_object().pk)
        if t.status != "in_transit":
            raise ValidationError("Only in-transit transfers can be received.")
        for i in t.items.select_related("product"):
            move_stock(branch=t.to_branch, product=i.product, quantity=i.quantity, kind="transfer_in",
                       user=request.user, reference=t.number, note=f"From {t.from_branch.name}")
        t.status, t.received_by, t.received_at = "received", request.user, timezone.now()
        t.save(update_fields=["status", "received_by", "received_at"])
        return Response(self.get_serializer(t).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def cancel(self, request, pk=None):
        t = StockTransfer.objects.select_for_update().get(pk=self.get_object().pk)
        if t.status == "in_transit":  # return goods to source
            for i in t.items.select_related("product"):
                move_stock(branch=t.from_branch, product=i.product, quantity=i.quantity, kind="transfer_in",
                           user=request.user, reference=t.number, note="Transfer cancelled")
        elif t.status != "pending":
            raise ValidationError("Cannot cancel a received transfer.")
        t.status = "cancelled"
        t.save(update_fields=["status"])
        return Response(self.get_serializer(t).data)


class StocktakeViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                       viewsets.GenericViewSet):
    """Physical count: snapshot expected quantities, record counts, then post the differences."""

    permission_classes = [HasPermissionCode]
    serializer_class = StocktakeSerializer
    perm_module = "stock"
    permission_map = {"count": "stock.manage", "complete": "stock.approve"}

    def get_queryset(self):
        return Stocktake.objects.filter(business=self.request.business).prefetch_related("lines__product")

    @transaction.atomic
    def perform_create(self, serializer):
        st = serializer.save(business=self.request.business, branch=self.request.branch, created_by=self.request.user,
                             number=Counter.next(self.request.business, "ST"))
        levels = dict(StockLevel.objects.filter(branch=st.branch).values_list("product_id", "quantity"))
        products = Product.objects.filter(business=st.business, is_active=True, track_stock=True)
        if self.request.data.get("category"):
            products = products.filter(category_id=self.request.data["category"])
        StocktakeLine.objects.bulk_create([
            StocktakeLine(business=st.business, stocktake=st, product=p, expected_quantity=levels.get(p.pk, Decimal("0")))
            for p in products
        ])

    @action(detail=True, methods=["post"])
    def count(self, request, pk=None):
        """Body: {"counts": [{"product": id, "counted_quantity": n}, ...]}"""
        st = self.get_object()
        if st.status != "open":
            raise ValidationError("Stocktake is closed.")
        for c in request.data.get("counts", []):
            st.lines.filter(product_id=c["product"]).update(counted_quantity=c["counted_quantity"])
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def complete(self, request, pk=None):
        st = Stocktake.objects.select_for_update().get(pk=self.get_object().pk)
        if st.status != "open":
            raise ValidationError("Stocktake is closed.")
        variances = []
        for line in st.lines.select_related("product").exclude(counted_quantity__isnull=True):
            diff = line.counted_quantity - line.expected_quantity
            if diff:
                move_stock(branch=st.branch, product=line.product, quantity=diff, kind="stocktake", user=request.user,
                           reference=st.number, note="Stocktake variance", allow_negative=True)
                variances.append({"product": line.product.name, "difference": diff})
        st.status, st.completed_at = "completed", timezone.now()
        st.save(update_fields=["status", "completed_at"])
        AuditLog.log(st.business, request.user, "stocktake.completed", st, request, lines=len(variances))
        return Response({"stocktake": self.get_serializer(st).data, "variances": variances})


class InventoryInsightsViewSet(viewsets.ViewSet):
    permission_classes = [HasPermissionCode]
    permission_map = {"reorder": "stock.view", "valuation": "stock.view"}

    @action(detail=False)
    def reorder(self, request):
        """Products at/below reorder level, with a suggested order quantity based on 30-day sales velocity."""
        branch = request.branch
        since = timezone.now() - timedelta(days=30)
        sold = dict(StockMovement.objects.filter(branch=branch, kind="sale", created_at__gte=since)
                    .values("product").annotate(q=Sum("quantity")).values_list("product", "q"))
        rows = []
        levels = StockLevel.objects.filter(branch=branch, product__track_stock=True, product__is_active=True,
                                           quantity__lte=F("product__reorder_level")).select_related("product", "product__unit")
        for lvl in levels:
            p = lvl.product
            daily = -(sold.get(p.pk) or 0) / Decimal(30)
            suggested = max(p.reorder_quantity, (daily * 14 + p.reorder_level - lvl.quantity)).quantize(Decimal("1"))
            rows.append({"product": p.pk, "name": p.name, "unit": p.unit.abbreviation, "stock": lvl.quantity,
                         "reorder_level": p.reorder_level, "avg_daily_sales": round(daily, 2),
                         "suggested_quantity": max(suggested, Decimal("0"))})
        return Response(rows)

    @action(detail=False)
    def valuation(self, request):
        qs = StockLevel.objects.filter(business=request.business, quantity__gt=0)
        if request.query_params.get("branch"):
            qs = qs.filter(branch_id=request.query_params["branch"])
        require(request, "stock.view")
        agg = qs.aggregate(cost=Sum(F("quantity") * F("product__cost_price")),
                           retail=Sum(F("quantity") * F("product__retail_price")))
        return Response({"cost_value": agg["cost"] or 0, "retail_value": agg["retail"] or 0})
