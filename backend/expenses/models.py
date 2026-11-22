from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import Branch, TenantModel


class ExpenseCategory(TenantModel):
    name = models.CharField(max_length=80)

    class Meta:
        verbose_name_plural = "expense categories"
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["business", "name"], name="uniq_expense_category")]

    def __str__(self):
        return self.name


class Expense(TenantModel):
    STATUS = [("pending", "Pending approval"), ("approved", "Approved"), ("rejected", "Rejected")]
    RECURRENCE = [("", "One-off"), ("weekly", "Weekly"), ("monthly", "Monthly"), ("yearly", "Yearly")]
    METHODS = [("cash", "Cash"), ("mpesa", "M-Pesa"), ("bank", "Bank"), ("card", "Card"), ("cheque", "Cheque")]

    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT, related_name="expenses")
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    date = models.DateField(default=timezone.localdate, db_index=True)
    payment_method = models.CharField(max_length=10, choices=METHODS, default="cash")
    reference = models.CharField(max_length=60, blank=True)
    receipt = models.FileField(upload_to="expense_receipts/", blank=True, null=True)
    recurrence = models.CharField(max_length=10, choices=RECURRENCE, blank=True, default="")
    status = models.CharField(max_length=10, choices=STATUS, default="pending")
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]
