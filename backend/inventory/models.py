from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from catalog.models import Product, ProductUnit
from core.models import Branch, TenantModel

QTY = dict(max_digits=14, decimal_places=3)


class StockLevel(TenantModel):
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="stock_levels")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="stock_levels")
    quantity = models.DecimalField(**QTY, default=Decimal("0"))

    class Meta:
        constraints = [models.UniqueConstraint(fields=["branch", "product"], name="uniq_stock_level")]


class StockBatch(TenantModel):
    """A lot of stock with its own batch number / expiry. Sold first-expiring-first-out."""

    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="batches")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="batches")
    batch_number = models.CharField(max_length=60, blank=True)
    expiry_date = models.DateField(null=True, blank=True, db_index=True)
    quantity_received = models.DecimalField(**QTY)
    quantity_remaining = models.DecimalField(**QTY)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    received_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["expiry_date", "received_at"]


class SerialNumber(TenantModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="serials")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    serial = models.CharField(max_length=100)
    status = models.CharField(max_length=10, default="in_stock",
                              choices=[("in_stock", "In stock"), ("sold", "Sold"), ("returned", "Returned"), ("damaged", "Damaged")])
    sale_item = models.ForeignKey("sales.SaleItem", null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["business", "product", "serial"], name="uniq_serial")]


class StockMovement(TenantModel):
    """Immutable ledger of every stock change: what, how much, why, who, when."""

    KINDS = [
        ("opening", "Opening stock"),
        ("purchase", "Purchase received"),
        ("purchase_return", "Returned to supplier"),
        ("sale", "Sale"),
        ("sale_return", "Customer return"),
        ("adjustment", "Adjustment"),
        ("stocktake", "Stocktake correction"),
        ("transfer_out", "Transfer out"),
        ("transfer_in", "Transfer in"),
        ("damaged", "Damaged"),
        ("expired", "Expired"),
    ]

    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="movements")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="movements")
    batch = models.ForeignKey(StockBatch, null=True, blank=True, on_delete=models.SET_NULL)
    kind = models.CharField(max_length=20, choices=KINDS, db_index=True)
    quantity = models.DecimalField(**QTY, help_text="Signed, in base units (+in / -out)")
    balance_after = models.DecimalField(**QTY)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    reference = models.CharField(max_length=60, blank=True, help_text="e.g. S-000123, PO-000004")
    note = models.CharField(max_length=255, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class StockAdjustment(TenantModel):
    """Requested stock correction; applied to the ledger only once approved."""

    REASONS = [("damaged", "Damaged"), ("expired", "Expired"), ("lost", "Lost/stolen"), ("found", "Found"),
               ("correction", "Count correction"), ("opening", "Opening stock"), ("other", "Other")]
    STATUS = [("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")]

    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    unit = models.ForeignKey(ProductUnit, null=True, blank=True, on_delete=models.SET_NULL)
    quantity = models.DecimalField(**QTY, help_text="Signed quantity in the chosen unit")
    reason = models.CharField(max_length=20, choices=REASONS)
    batch_number = models.CharField(max_length=60, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=10, choices=STATUS, default="pending")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class StockTransfer(TenantModel):
    STATUS = [("pending", "Pending"), ("in_transit", "In transit"), ("received", "Received"), ("cancelled", "Cancelled")]

    number = models.CharField(max_length=20)
    from_branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="transfers_out")
    to_branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="transfers_in")
    status = models.CharField(max_length=12, choices=STATUS, default="pending")
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    received_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class StockTransferItem(TenantModel):
    transfer = models.ForeignKey(StockTransfer, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.DecimalField(**QTY, help_text="Base units")


class Stocktake(TenantModel):
    STATUS = [("open", "Counting"), ("completed", "Completed"), ("cancelled", "Cancelled")]
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    number = models.CharField(max_length=20)
    status = models.CharField(max_length=10, choices=STATUS, default="open")
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class StocktakeLine(TenantModel):
    stocktake = models.ForeignKey(Stocktake, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    expected_quantity = models.DecimalField(**QTY)
    counted_quantity = models.DecimalField(**QTY, null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["stocktake", "product"], name="uniq_stocktake_line")]
