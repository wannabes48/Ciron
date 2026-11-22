from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from core.api import TenantModelSerializer
from core.models import Business
from core.onboarding import RESERVED_SUBDOMAINS

from .models import LoginHistory, Shift, User
from .roles import ALL_PERMISSIONS


class UserSerializer(TenantModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)
    pos_pin = serializers.CharField(write_only=True, required=False, allow_blank=True)
    permissions = serializers.SerializerMethodField()
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "email", "phone", "role", "role_display", "default_branch", "branches",
                  "extra_permissions", "revoked_permissions", "is_active", "date_joined", "last_login", "password",
                  "pos_pin", "permissions"]
        read_only_fields = ["date_joined", "last_login"]

    def get_permissions(self, obj):
        return sorted(obj.permission_codes)

    def validate_role(self, value):
        if value == "super_admin":
            raise serializers.ValidationError("Super Admin is a platform role.")
        return value

    def validate(self, attrs):
        for key in ("extra_permissions", "revoked_permissions"):
            bad = set(attrs.get(key) or []) - set(ALL_PERMISSIONS)
            if bad:
                raise serializers.ValidationError({key: f"Unknown permissions: {', '.join(sorted(bad))}"})
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError({"password": "A password is required."})
        business = self.context["request"].business
        username = attrs.get("username")
        if username:
            qs = User.objects.filter(business=business, username__iexact=username)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"username": "This username is taken."})
        return attrs

    def _apply_secrets(self, user, password, pin):
        if password:
            validate_password(password, user)
            user.set_password(password)
        if pin is not None:
            user.pos_pin = make_password(pin) if pin else ""

    def create(self, validated):
        password, pin = validated.pop("password", None), validated.pop("pos_pin", None)
        branches = validated.pop("branches", [])
        user = User(**validated)
        self._apply_secrets(user, password, pin)
        user.save()
        user.branches.set(branches)
        return user

    def update(self, instance, validated):
        password, pin = validated.pop("password", None), validated.pop("pos_pin", None)
        self._apply_secrets(instance, password, pin)
        return super().update(instance, validated)


class BusinessSerializer(serializers.ModelSerializer):
    payment_methods = serializers.ListField(read_only=True)

    class Meta:
        model = Business
        exclude = ["is_active"]
        read_only_fields = ["subdomain", "created_at"]


class RegisterBusinessSerializer(serializers.Serializer):
    business_name = serializers.CharField(max_length=150)
    subdomain = serializers.RegexField(r"^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$", max_length=63,
                                       error_messages={"invalid": "Use 3–63 lowercase letters, digits or hyphens."})
    business_type = serializers.ChoiceField(choices=["retail", "wholesale", "retail_wholesale"], default="retail_wholesale")
    owner_name = serializers.CharField(max_length=120)
    username = serializers.CharField(max_length=60)
    password = serializers.CharField(min_length=6, write_only=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate_subdomain(self, value):
        value = value.lower()
        if value in RESERVED_SUBDOMAINS or Business.objects.filter(subdomain=value).exists():
            raise serializers.ValidationError("This subdomain is not available.")
        return value


class LoginSerializer(serializers.Serializer):
    business = serializers.CharField(required=False, allow_blank=True)
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class ShiftSerializer(TenantModelSerializer):
    user_name = serializers.CharField(source="user.__str__", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = Shift
        fields = "__all__"
        read_only_fields = ["user", "branch", "opened_at", "closed_at", "expected_cash", "variance", "totals_by_method"]


class LoginHistorySerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.__str__", read_only=True)

    class Meta:
        model = LoginHistory
        fields = ["id", "user", "user_name", "event", "ip_address", "user_agent", "created_at"]
