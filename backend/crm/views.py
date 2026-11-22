from decimal import Decimal

from django.db.models import DecimalField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from core.api import TenantViewSet, require
from purchasing.models import PurchaseOrder
from purchasing.services import pay_supplier
from sales.models import Payment, Sale
from sales.services import receive_debt_payment

from .models import Customer, Supplier, SupplierProduct
from .serializers import CustomerSerializer, SupplierPaymentSerializer, SupplierProductSerializer, SupplierSerializer

MONEY = DecimalField(max_digits=14, decimal_places=2)


def statement_rows(entries):
    """entries: iterable of (date, ref, description, debit, credit) -> rows with running balance."""
    balance = Decimal("0")
    rows = []
    for date, ref, desc, debit, credit in sorted(entries, key=lambda e: e[0]):
        balance += debit - credit
        rows.append({"date": date, "reference": ref, "description": desc, "debit": debit, "credit": credit,
                     "balance": balance})
    return rows


class CustomerViewSet(TenantViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    perm_module = "customers"
    search_fields = ["name", "phone", "email", "kra_pin"]
    filterset_fields = ["category", "is_active"]
    ordering_fields = ["name", "balance", "created_at"]
    permission_map = {"receive_payment": "*", "statement": "customers.view", "history": "customers.view",
                      "debtors": "customers.view"}

    def get_queryset(self):
        overdue = (Sale.objects.filter(customer=OuterRef("pk"), status="completed", balance__gt=0,
                                       due_date__lt=timezone.localdate())
                   .values("customer").annotate(t=Sum("balance")).values("t")[:1])
        qs = super().get_queryset().annotate(
            overdue_amount=Coalesce(Subquery(overdue, output_field=MONEY), Value(Decimal("0")), output_field=MONEY))
        if self.request.query_params.get("with_balance"):
            qs = qs.filter(balance__gt=0)
        return qs

    @action(detail=True, methods=["post"])
    def receive_payment(self, request, pk=None):
        result = receive_debt_payment(customer=self.get_object(), branch=request.branch, user=request.user,
                                      amount=Decimal(str(request.data.get("amount", 0))),
                                      method=request.data.get("method", "cash"),
                                      reference=request.data.get("reference", ""), request=request)
        return Response(result)

    @action(detail=True)
    def statement(self, request, pk=None):
        c = self.get_object()
        entries = []
        for s in c.sales.filter(status="completed"):
            entries.append((s.completed_at, s.number, f"Sale ({s.get_sale_type_display()})", s.total, Decimal("0")))
        for p in Payment.objects.filter(customer=c):
            if p.kind == "refund":
                continue  # refunds to customer are offset by the return credit below
            entries.append((p.created_at, p.reference or (p.sale.number if p.sale_id else ""),
                            f"Payment – {p.get_method_display()}", Decimal("0"), p.amount))
        for s in c.sales.filter(status="completed", refunded_total__gt=0):
            for r in s.returns.all():
                cash_refunds = sum((-p.amount for p in s.payments.filter(kind="refund", reference=r.number)), Decimal("0"))
                entries.append((r.created_at, r.number, f"Return on {s.number}", cash_refunds, r.refund_amount))
        return Response({"customer": CustomerSerializer(c, context={"request": request}).data,
                         "rows": statement_rows(entries)})

    @action(detail=True)
    def history(self, request, pk=None):
        from sales.serializers import SaleListSerializer
        sales = self.get_object().sales.exclude(status="voided").order_by("-created_at")[:200]
        return Response(SaleListSerializer(sales, many=True).data)

    @action(detail=False)
    def debtors(self, request):
        """Aged receivables: current, 1-30, 31-60, 61-90, 90+ days overdue."""
        today = timezone.localdate()
        buckets = {}
        for s in Sale.objects.filter(business=request.business, status="completed", balance__gt=0).select_related("customer"):
            days = (today - s.due_date).days if s.due_date else 0
            key = "current" if days <= 0 else "1_30" if days <= 30 else "31_60" if days <= 60 else "61_90" if days <= 90 else "90_plus"
            row = buckets.setdefault(s.customer_id, {"customer": s.customer_id, "name": s.customer.name,
                                                     "phone": s.customer.phone, "total": Decimal("0"),
                                                     "current": Decimal("0"), "1_30": Decimal("0"), "31_60": Decimal("0"),
                                                     "61_90": Decimal("0"), "90_plus": Decimal("0")})
            row[key] += s.balance
            row["total"] += s.balance
        return Response(sorted(buckets.values(), key=lambda r: -r["total"]))


class SupplierViewSet(TenantViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    perm_module = "suppliers"
    search_fields = ["name", "phone", "contact_person", "kra_pin"]
    filterset_fields = ["is_active"]
    ordering_fields = ["name", "balance"]
    permission_map = {"pay": "payments.manage", "statement": "suppliers.view", "catalog": "suppliers.view",
                      "payments": "suppliers.view", "performance": "suppliers.view"}

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        supplier = self.get_object()
        order = None
        if request.data.get("purchase_order"):
            order = PurchaseOrder.objects.get(business=request.business, supplier=supplier, pk=request.data["purchase_order"])
        payment = pay_supplier(supplier=supplier, user=request.user, amount=Decimal(str(request.data.get("amount", 0))),
                               method=request.data.get("method", "cash"), reference=request.data.get("reference", ""),
                               order=order, note=request.data.get("note", ""), request=request)
        return Response(SupplierPaymentSerializer(payment).data, status=201)

    @action(detail=True)
    def statement(self, request, pk=None):
        s = self.get_object()
        entries = []
        for po in s.purchase_orders.exclude(status__in=["draft", "cancelled"]):
            for grn in po.receipts.all():
                entries.append((grn.created_at, grn.number, f"Goods received – {po.number}", Decimal("0"), grn.total))
            if po.returned_total:
                entries.append((po.created_at, po.number, "Purchase return", po.returned_total, Decimal("0")))
        for p in s.payments.all():
            entries.append((p.created_at, p.reference, f"Payment – {p.method}", p.amount, Decimal("0")))
        # For suppliers the running balance is what we owe: credit (received) increases it.
        rows = statement_rows([(d, r, desc, cr, dr) for d, r, desc, dr, cr in entries])
        return Response({"supplier": SupplierSerializer(s, context={"request": request}).data, "rows": rows})

    @action(detail=True)
    def catalog(self, request, pk=None):
        qs = SupplierProduct.objects.filter(supplier=self.get_object()).select_related("product")
        return Response(SupplierProductSerializer(qs, many=True).data)

    @action(detail=True)
    def payments(self, request, pk=None):
        return Response(SupplierPaymentSerializer(self.get_object().payments.all()[:200], many=True).data)

    @action(detail=False)
    def performance(self, request):
        rows = []
        for s in Supplier.objects.filter(business=request.business):
            orders = s.purchase_orders.exclude(status__in=["draft", "cancelled"])
            total = orders.count()
            complete = orders.filter(status="received").count()
            agg = orders.aggregate(value=Sum("total_received"), returned=Sum("returned_total"))
            rows.append({"supplier": s.pk, "name": s.name, "orders": total,
                         "fulfilment_rate": round(complete / total * 100, 1) if total else None,
                         "purchased_value": agg["value"] or 0, "returned_value": agg["returned"] or 0,
                         "balance": s.balance})
        return Response(sorted(rows, key=lambda r: -float(r["purchased_value"])))
