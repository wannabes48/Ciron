from decimal import Decimal

from django.conf import settings
from django.db import models

from core.models import TenantModel

MONEY = dict(max_digits=14, decimal_places=2)


class Customer(TenantModel):
    CATEGORIES = [("retail", "Retail"), ("wholesale", "Wholesale"), ("distributor", "Distributor")]

    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=30, blank=True, db_index=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    kra_pin = models.CharField(max_length=20, blank=True)
    category = models.CharField(max_length=12, choices=CATEGORIES, default="retail")
    credit_limit = models.DecimalField(**MONEY, default=Decimal("0"), help_text="0 = no credit allowed")
    payment_terms_days = models.PositiveIntegerField(default=30)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    balance = models.DecimalField(**MONEY, default=Decimal("0"), help_text="Amount the customer owes us")
    loyalty_points = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    sms_opt_in = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Supplier(TenantModel):
    name = models.CharField(max_length=150)
    contact_person = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    kra_pin = models.CharField(max_length=20, blank=True)
    payment_terms_days = models.PositiveIntegerField(default=30)
    balance = models.DecimalField(**MONEY, default=Decimal("0"), help_text="Amount we owe the supplier")
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class SupplierProduct(TenantModel):
    """Supplier catalog entry: what a supplier sells us and at what price."""

    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name="catalog")
    product = models.ForeignKey("catalog.Product", on_delete=models.CASCADE, related_name="supplier_entries")
    supplier_code = models.CharField(max_length=60, blank=True)
    last_cost = models.DecimalField(**MONEY, null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["supplier", "product"], name="uniq_supplier_product")]


class SupplierPayment(TenantModel):
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="payments")
    purchase_order = models.ForeignKey("purchasing.PurchaseOrder", null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name="payments")
    amount = models.DecimalField(**MONEY)
    method = models.CharField(max_length=10)
    reference = models.CharField(max_length=60, blank=True)
    note = models.CharField(max_length=255, blank=True)
    paid_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
