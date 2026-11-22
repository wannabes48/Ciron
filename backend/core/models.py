from decimal import Decimal

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models, transaction


class Business(models.Model):
    """A tenant. Every shop on Ciron is one Business, served at <subdomain>.<root domain>."""

    name = models.CharField(max_length=150)
    subdomain = models.CharField(
        max_length=63,
        unique=True,
        validators=[RegexValidator(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", "Lowercase letters, digits and hyphens only.")],
    )
    business_type = models.CharField(max_length=20, default="retail_wholesale",
                                     choices=[("retail", "Retail"), ("wholesale", "Wholesale"), ("retail_wholesale", "Retail & Wholesale")])
    logo = models.ImageField(upload_to="logos/", blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    kra_pin = models.CharField("KRA PIN", max_length=20, blank=True)
    currency = models.CharField(max_length=3, default="KES")

    # Tax
    vat_registered = models.BooleanField(default=False)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("16.00"))
    prices_include_vat = models.BooleanField(default=True)

    # Sales behaviour
    allow_negative_stock = models.BooleanField(default=False)
    loyalty_points_per_100 = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"),
                                                 help_text="Loyalty points earned per KSh 100 spent (0 disables).")
    receipt_header = models.TextField(blank=True)
    receipt_footer = models.TextField(blank=True, default="Thank you for shopping with us!")
    enabled_payment_methods = models.JSONField(default=list, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "businesses"

    def __str__(self):
        return self.name

    @property
    def payment_methods(self):
        return self.enabled_payment_methods or ["cash", "mpesa", "card", "bank", "cheque", "credit"]


class TenantModel(models.Model):
    """Abstract base for every record that belongs to a single business."""

    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="+", editable=False)

    class Meta:
        abstract = True


class Branch(TenantModel):
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=10, blank=True)
    location = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    is_main = models.BooleanField(default=False)
    is_warehouse = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "branches"
        ordering = ["-is_main", "name"]

    def __str__(self):
        return self.name


class Counter(TenantModel):
    """Per-business gap-free document numbering (S-000001, PO-000001, ...)."""

    key = models.CharField(max_length=20)
    value = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["business", "key"], name="uniq_counter")]

    @classmethod
    def next(cls, business, key, prefix=None, width=6):
        with transaction.atomic():
            counter, _ = cls.objects.select_for_update().get_or_create(business=business, key=key)
            counter.value += 1
            counter.save(update_fields=["value"])
        return f"{prefix or key}-{counter.value:0{width}d}"


class AuditLog(TenantModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=60)
    object_type = models.CharField(max_length=60, blank=True)
    object_id = models.CharField(max_length=40, blank=True)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def log(cls, business, user, action, obj=None, request=None, **details):
        ip = None
        if request is not None:
            ip = (request.META.get("HTTP_X_FORWARDED_FOR") or request.META.get("REMOTE_ADDR") or "").split(",")[0].strip() or None
        return cls.objects.create(
            business=business,
            user=user if getattr(user, "is_authenticated", False) else None,
            action=action,
            object_type=obj.__class__.__name__ if obj is not None else "",
            object_id=str(obj.pk) if obj is not None else "",
            details={k: str(v) for k, v in details.items()},
            ip_address=ip,
        )


class Notification(TenantModel):
    LEVELS = [("info", "Info"), ("warning", "Warning"), ("danger", "Danger"), ("success", "Success")]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE,
                             help_text="Empty = visible to all managers of the business.")
    kind = models.CharField(max_length=40)
    level = models.CharField(max_length=10, choices=LEVELS, default="info")
    title = models.CharField(max_length=150)
    message = models.TextField(blank=True)
    link = models.CharField(max_length=200, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class ContactMessage(models.Model):
    """Enquiries from the public website (sales, support, partnerships). Not tenant data."""

    TOPICS = [
        ("sales", "Sales and pricing"),
        ("demo", "Book a demo"),
        ("support", "Support for my shop"),
        ("partnership", "Partnership"),
        ("other", "Something else"),
    ]
    name = models.CharField(max_length=120)
    business_name = models.CharField(max_length=160, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    topic = models.CharField(max_length=20, choices=TOPICS, default="sales")
    message = models.TextField(max_length=4000)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    handled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.get_topic_display()})"
