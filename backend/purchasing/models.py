from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from catalog.models import Product, ProductUnit
from core.models import Branch, TenantModel
from crm.models import Supplier

MONEY = dict(max_digits=14, decimal_places=2)
QTY = dict(max_digits=14, decimal_places=3)
ZERO = Decimal("0")


class PurchaseOrder(TenantModel):
    STATUS = [
        ("draft", "Draft"),
        ("ordered", "Submitted to supplier"),
        ("partial", "Partially received"),
        ("received", "Received"),
        ("cancelled", "Cancelled"),
    ]

    number = models.CharField(max_length=20, db_index=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_orders")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="purchase_orders")
    status = models.CharField(max_length=10, choices=STATUS, default="draft", db_index=True)
    expected_date = models.DateField(null=True, blank=True)
    supplier_invoice_number = models.CharField(max_length=60, blank=True)
    additional_costs = models.DecimalField(**MONEY, default=ZERO, help_text="Transport, loading etc. — spread over received items' cost")
    total_ordered = models.DecimalField(**MONEY, default=ZERO)
    total_received = models.DecimalField(**MONEY, default=ZERO, help_text="Value of goods received (what we owe)")
    amount_paid = models.DecimalField(**MONEY, default=ZERO)
    returned_total = models.DecimalField(**MONEY, default=ZERO)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.number

    @property
    def balance(self):
        return self.total_received - self.returned_total - self.amount_paid


class PurchaseOrderItem(TenantModel):
    order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    unit = models.ForeignKey(ProductUnit, null=True, blank=True, on_delete=models.PROTECT)
    quantity = models.DecimalField(**QTY, help_text="Ordered, in the chosen unit")
    unit_cost = models.DecimalField(**MONEY, help_text="Cost per chosen unit")
    received_quantity = models.DecimalField(**QTY, default=ZERO)
    returned_quantity = models.DecimalField(**QTY, default=ZERO)

    class Meta:
        ordering = ["id"]

    @property
    def factor(self):
        return self.unit.factor if self.unit_id else Decimal("1")

    @property
    def line_total(self):
        return self.quantity * self.unit_cost


class GoodsReceipt(TenantModel):
    number = models.CharField(max_length=20)
    order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="receipts")
    supplier_invoice_number = models.CharField(max_length=60, blank=True)
    additional_costs = models.DecimalField(**MONEY, default=ZERO)
    total = models.DecimalField(**MONEY, default=ZERO)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)


class GoodsReceiptItem(TenantModel):
    receipt = models.ForeignKey(GoodsReceipt, on_delete=models.CASCADE, related_name="items")
    order_item = models.ForeignKey(PurchaseOrderItem, on_delete=models.PROTECT)
    quantity = models.DecimalField(**QTY)
    batch_number = models.CharField(max_length=60, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
