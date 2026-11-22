"""Tenant-aware building blocks shared by every API module."""
from rest_framework import permissions, serializers, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Branch


def resolve_tenant(request):
    """Attach request.business and request.branch for an authenticated request."""
    user = request.user
    business = getattr(user, "business", None)
    if business is None:
        raise PermissionDenied("This account is not attached to a business.")
    if not business.is_active:
        raise PermissionDenied("This business account is suspended.")
    slug = getattr(request._request, "tenant_slug", None) or getattr(request, "tenant_slug", None)
    if slug and slug != business.subdomain:
        raise PermissionDenied("You are not a member of this business.")
    request.business = business

    branch = None
    branch_id = request.headers.get("X-Branch")
    if branch_id:
        branch = Branch.objects.filter(business=business, pk=branch_id, is_active=True).first()
        if branch is None:
            raise ValidationError({"branch": "Unknown branch."})
        allowed = user.branches.all()
        if user.role not in ("owner", "super_admin", "manager") and allowed.exists() and branch not in allowed:
            raise PermissionDenied("You are not assigned to this branch.")
    if branch is None:
        branch = user.default_branch or Branch.objects.filter(business=business, is_active=True).first()
    request.branch = branch
    return business


class HasPermissionCode(permissions.BasePermission):
    """Checks RBAC codes. Views declare ``perm_module`` (-> <module>.view / <module>.manage)
    and/or ``permission_map = {"action_name": "code"}``."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        resolve_tenant(request)
        action = getattr(view, "action", None) or request.method.lower()
        code = getattr(view, "permission_map", {}).get(action)
        if code is None:
            module = getattr(view, "perm_module", None)
            if module is None:
                return True
            code = f"{module}.view" if request.method in permissions.SAFE_METHODS else f"{module}.manage"
        if code == "*":
            return True
        return request.user.has_code(code)


def require(request, code):
    if not request.user.has_code(code):
        raise PermissionDenied(f"Missing permission: {code}")


class TenantSerializerMixin:
    """Restricts every related-object field to objects of the current business,
    so a client can never reference another tenant's records."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        business = getattr(request, "business", None)
        if business is None:
            return
        for field in self.fields.values():
            target = getattr(field, "child_relation", field)
            qs = getattr(target, "queryset", None)
            if qs is not None and hasattr(qs.model, "business_id"):
                target.queryset = qs.filter(business=business)


class TenantModelSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    pass


class TenantViewSet(viewsets.ModelViewSet):
    permission_classes = [HasPermissionCode]
    perm_module = None

    def get_queryset(self):
        return super().get_queryset().filter(business=self.request.business)

    def perform_create(self, serializer):
        serializer.save(business=self.request.business)


class TenantReadOnlyViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [HasPermissionCode]
    perm_module = None

    def get_queryset(self):
        return super().get_queryset().filter(business=self.request.business)


class TenantPKField(serializers.PrimaryKeyRelatedField):
    """PrimaryKeyRelatedField scoped to the request's business at validation time
    (works inside nested/many=True serializers, where __init__-time scoping can't)."""

    def get_queryset(self):
        qs = super().get_queryset()
        request = self.context.get("request")
        business = getattr(request, "business", None)
        if business is None:
            return qs.none()
        return qs.filter(business=business)
