from decimal import Decimal

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models import Q
from django.utils import timezone

from core.models import Branch, Business, TenantModel

from .roles import ROLE_CHOICES, ROLE_PERMISSIONS


class UserManager(BaseUserManager):
    def create_user(self, username, password=None, business=None, **extra):
        user = self.model(username=username, business=business, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True, role="super_admin")
        return self.create_user(username, password, business=None, **extra)

    def get_by_natural_key(self, username):
        # Used by createsuperuser / admin: platform users have no business.
        return self.get(business__isnull=True, username=username)


class User(AbstractBaseUser, PermissionsMixin):
    business = models.ForeignKey(Business, null=True, blank=True, on_delete=models.CASCADE, related_name="users")
    username = models.CharField(max_length=60)
    full_name = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="cashier")
    default_branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    branches = models.ManyToManyField(Branch, blank=True, related_name="staff",
                                      help_text="Branches this user may work in (empty = all).")
    extra_permissions = models.JSONField(default=list, blank=True)
    revoked_permissions = models.JSONField(default=list, blank=True)
    pos_pin = models.CharField(max_length=128, blank=True, help_text="Hashed quick-switch PIN for cashiers.")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = []
    objects = UserManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["business", "username"], name="uniq_username_per_business"),
            models.UniqueConstraint(fields=["username"], condition=Q(business__isnull=True), name="uniq_platform_username"),
        ]

    def __str__(self):
        return self.full_name or self.username

    @property
    def permission_codes(self):
        if self.is_superuser:
            return set(ROLE_PERMISSIONS["super_admin"])
        perms = set(ROLE_PERMISSIONS.get(self.role, set()))
        perms |= set(self.extra_permissions or [])
        perms -= set(self.revoked_permissions or [])
        return perms

    def has_code(self, code):
        return code in self.permission_codes


class LoginHistory(TenantModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="logins")
    event = models.CharField(max_length=10, choices=[("login", "Login"), ("logout", "Logout"), ("failed", "Failed")])
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Shift(TenantModel):
    """A cashier's till session, from opening float to counted closing cash."""

    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="shifts")
    opened_at = models.DateTimeField(default=timezone.now)
    opening_float = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    closed_at = models.DateTimeField(null=True, blank=True)
    expected_cash = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    counted_cash = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    variance = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    totals_by_method = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-opened_at"]

    @property
    def is_open(self):
        return self.closed_at is None
