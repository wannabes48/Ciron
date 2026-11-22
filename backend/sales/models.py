from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from catalog.models import Product, ProductUnit
from core.models import Branch, TenantModel
from crm.models import Customer

MONEY = dict(max_digits=14, decimal_places=2)
QTY = dict(max_digits=14, decimal_places=3)
ZERO = Decimal("0")

PAYMENT_METHODS = [
    ("cash", "Cash"),
    ("mpesa", "M-Pesa"),
    ("card", "Card"),
    ("bank", "Bank transfer"),
    ("cheque", "Cheque"),
]


class Sale(TenantModel):
    STATUS = [
        ("quotation", "Quotation"),
        ("held", "Held / suspended"),
        ("completed", "Completed"),
        ("voided", "Voided"),
    ]
    TYPES = [("retail", "Retail"), ("wholesale", "Wholesale")]

    number = models.CharField(max_length=20, db_index=True)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="sales")
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.PROTECT, related_name="sales")
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales")
    salesperson = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    shift = models.ForeignKey("accounts.Shift", null=True, blank=True, on_delete=models.SET_NULL, related_name="sales")
    sale_type = models.CharField(max_length=10, choices=TYPES, default="retail")
    status = models.CharField(max_length=10, choices=STATUS, default="completed", db_index=True)

    subtotal = models.DecimalField(**MONEY, default=ZERO, help_text="Sum of lines before discounts")
    discount_total = models.DecimalField(**MONEY, default=ZERO)
    sale_discount = models.DecimalField(**MONEY, default=ZERO, help_text="Whole-sale discount amount")
    tax_total = models.DecimalField(**MONEY, default=ZERO)
    total = models.DecimalField(**MONEY, default=ZERO, help_text="Amount payable")
    cost_total = models.DecimalField(**MONEY, default=ZERO)
    amount_paid = models.DecimalField(**MONEY, default=ZERO)
    change_given = models.DecimalField(**MONEY, default=ZERO)
    refunded_total = models.DecimalField(**MONEY, default=ZERO)
    balance = models.DecimalField(**MONEY, default=ZERO, help_text="Outstanding credit on this sale")
    due_date = models.DateField(null=True, blank=True)

    notes = models.CharField(max_length=255, blank=True)
    hold_label = models.CharField(max_length=60, blank=True)
    valid_until = models.DateField(null=True, blank=True, help_text="Quotations")
    etims_invoice_number = models.CharField(max_length=60, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    voided_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.number

    @property
    def payment_status(self):
        if self.status != "completed":
            return self.status
        if self.balance <= 0:
            return "paid"
        return "partial" if self.amount_paid > 0 else "unpaid"


class SaleItem(TenantModel):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="sale_items")
    unit = models.ForeignKey(ProductUnit, null=True, blank=True, on_delete=models.PROTECT)
    unit_name = models.CharField(max_length=40)
    product_name = models.CharField(max_length=200)
    quantity = models.DecimalField(**QTY)
    base_quantity = models.DecimalField(**QTY)
    unit_price = models.DecimalField(**MONEY)
    price_rule = models.CharField(max_length=12, default="retail")
    discount = models.DecimalField(**MONEY, default=ZERO, help_text="Line discount amount")
    allocated_sale_discount = models.DecimalField(**MONEY, default=ZERO)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=ZERO)
    tax_amount = models.DecimalField(**MONEY, default=ZERO)
    line_total = models.DecimalField(**MONEY, help_text="Payable amount for the line, after all discounts")
    cost_total = models.DecimalField(**MONEY, default=ZERO)
    returned_quantity = models.DecimalField(**QTY, default=ZERO)

    class Meta:
        ordering = ["id"]


class Payment(TenantModel):
    KINDS = [("sale", "Sale payment"), ("debt", "Debt repayment"), ("refund", "Refund")]
    STATUS = [("pending", "Pending"), ("confirmed", "Confirmed"), ("failed", "Failed")]

    sale = models.ForeignKey(Sale, null=True, blank=True, on_delete=models.CASCADE, related_name="payments")
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    shift = models.ForeignKey("accounts.Shift", null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")
    kind = models.CharField(max_length=8, choices=KINDS, default="sale")
    method = models.CharField(max_length=10, choices=PAYMENT_METHODS)
    amount = models.DecimalField(**MONEY, help_text="Negative for refunds")
    reference = models.CharField(max_length=60, blank=True, help_text="M-Pesa code, cheque no., card ref...")
    phone = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=10, choices=STATUS, default="confirmed")
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at"]


class SaleReturn(TenantModel):
    number = models.CharField(max_length=20)
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="returns")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    reason = models.CharField(max_length=255)
    refund_method = models.CharField(max_length=10, help_text="cash/mpesa/... or 'credit' to reduce the customer's balance")
    refund_amount = models.DecimalField(**MONEY, default=ZERO)
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class SaleReturnItem(TenantModel):
    sale_return = models.ForeignKey(SaleReturn, on_delete=models.CASCADE, related_name="items")
    sale_item = models.ForeignKey(SaleItem, on_delete=models.PROTECT, related_name="return_items")
    quantity = models.DecimalField(**QTY, help_text="In the unit it was sold in")
    amount = models.DecimalField(**MONEY)
    restock = models.BooleanField(default=True, help_text="False = damaged, written off")
