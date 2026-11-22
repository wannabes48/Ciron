from decimal import Decimal

from django.contrib.auth import authenticate
from django.db.models import Sum
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from core.api import HasPermissionCode, TenantViewSet, resolve_tenant
from core.models import AuditLog, Branch
from core.onboarding import create_business

from .models import LoginHistory, Shift, User
from .roles import ALL_PERMISSIONS, ROLE_CHOICES, ROLE_PERMISSIONS
from .serializers import (BusinessSerializer, LoginHistorySerializer, LoginSerializer, RegisterBusinessSerializer,
                          ShiftSerializer, UserSerializer)


def _client(request):
    ip = (request.META.get("HTTP_X_FORWARDED_FOR") or request.META.get("REMOTE_ADDR") or "").split(",")[0].strip()
    return ip or None, request.META.get("HTTP_USER_AGENT", "")[:255]


def session_payload(user, request):
    from core.serializers import BranchSerializer

    refresh = RefreshToken.for_user(user)
    business = user.business
    branches = Branch.objects.filter(business=business, is_active=True)
    if user.role not in ("owner", "manager") and user.branches.exists():
        branches = branches.filter(pk__in=user.branches.values("pk"))
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user, context={"request": request}).data,
        "business": BusinessSerializer(business, context={"request": request}).data,
        "branches": BranchSerializer(branches, many=True).data,
    }


class LoginThrottle(AnonRateThrottle):
    rate = "20/min"


class RegisterBusinessView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        s = RegisterBusinessSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        business, owner = create_business(name=d["business_name"], subdomain=d["subdomain"],
                                          owner_username=d["username"], owner_password=d["password"],
                                          owner_name=d["owner_name"], phone=d.get("phone", ""), email=d.get("email", ""),
                                          business_type=d["business_type"])
        AuditLog.log(business, owner, "business.registered", business, request)
        return Response(session_payload(owner, request), status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        business = request.tenant_slug or s.validated_data.get("business") or None
        if not business:
            raise ValidationError({"business": "Enter your shop's Ciron address."})
        user = authenticate(request, business=business.lower(), username=s.validated_data["username"],
                            password=s.validated_data["password"])
        ip, agent = _client(request)
        if user is None:
            failed = User.objects.filter(business__subdomain=business.lower(),
                                         username__iexact=s.validated_data["username"]).first()
            if failed:
                LoginHistory.objects.create(business=failed.business, user=failed, event="failed", ip_address=ip, user_agent=agent)
            raise ValidationError({"detail": "Invalid shop address, username or password."})
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        LoginHistory.objects.create(business=user.business, user=user, event="login", ip_address=ip, user_agent=agent)
        return Response(session_payload(user, request))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.business_id:
            ip, agent = _client(request)
            LoginHistory.objects.create(business=request.user.business, user=request.user, event="logout",
                                        ip_address=ip, user_agent=agent)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [HasPermissionCode]

    def get(self, request):
        resolve_tenant(request)
        return Response(session_payload(request.user, request))


class RolesView(APIView):
    permission_classes = [HasPermissionCode]

    def get(self, request):
        return Response({
            "roles": [{"value": v, "label": l, "permissions": sorted(ROLE_PERMISSIONS[v])} for v, l in ROLE_CHOICES if v != "super_admin"],
            "permissions": [{"code": c, "label": l} for c, l in ALL_PERMISSIONS.items()],
        })


class UserViewSet(TenantViewSet):
    queryset = User.objects.all().prefetch_related("branches")
    serializer_class = UserSerializer
    perm_module = "users"
    permission_map = {"list": "users.manage", "retrieve": "users.manage"}
    search_fields = ["username", "full_name", "phone", "email"]
    filterset_fields = ["role", "is_active"]

    def perform_create(self, serializer):
        user = serializer.save(business=self.request.business)
        AuditLog.log(self.request.business, self.request.user, "user.created", user, self.request, role=user.role)

    def perform_update(self, serializer):
        if serializer.instance == self.request.user and serializer.validated_data.get("is_active") is False:
            raise ValidationError("You cannot suspend your own account.")
        user = serializer.save()
        AuditLog.log(self.request.business, self.request.user, "user.updated", user, self.request)

    def perform_destroy(self, instance):
        # Users referenced by sales can't be deleted; suspend instead.
        if instance == self.request.user:
            raise ValidationError("You cannot delete your own account.")
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        AuditLog.log(self.request.business, self.request.user, "user.suspended", instance, self.request)


class LoginHistoryViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [HasPermissionCode]
    permission_map = {"list": "audit.view"}
    serializer_class = LoginHistorySerializer
    filterset_fields = ["user", "event"]

    def get_queryset(self):
        return LoginHistory.objects.filter(business=self.request.business).select_related("user")


def shift_totals(shift):
    rows = shift.payments.values("method").annotate(total=Sum("amount"))
    totals = {r["method"]: r["total"] for r in rows}
    expected = shift.opening_float + (totals.get("cash") or Decimal("0"))
    return totals, expected


class ShiftViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [HasPermissionCode]
    serializer_class = ShiftSerializer
    permission_map = {"list": "pos.sell", "retrieve": "pos.sell", "current": "pos.sell", "open": "pos.sell", "close": "pos.sell"}
    filterset_fields = ["user", "branch"]

    def get_queryset(self):
        qs = Shift.objects.filter(business=self.request.business).select_related("user", "branch")
        if not self.request.user.has_code("reports.view"):
            qs = qs.filter(user=self.request.user)
        return qs

    @action(detail=False)
    def current(self, request):
        shift = Shift.objects.filter(user=request.user, branch=request.branch, closed_at__isnull=True).first()
        if not shift:
            return Response(None)
        data = ShiftSerializer(shift, context={"request": request}).data
        totals, expected = shift_totals(shift)
        data["live_totals"], data["live_expected_cash"] = totals, expected
        return Response(data)

    @action(detail=False, methods=["post"])
    def open(self, request):
        if Shift.objects.filter(user=request.user, branch=request.branch, closed_at__isnull=True).exists():
            raise ValidationError("You already have an open shift at this branch.")
        shift = Shift.objects.create(business=request.business, branch=request.branch, user=request.user,
                                     opening_float=Decimal(str(request.data.get("opening_float") or 0)))
        AuditLog.log(request.business, request.user, "shift.opened", shift, request, float=shift.opening_float)
        return Response(ShiftSerializer(shift, context={"request": request}).data, status=201)

    @action(detail=False, methods=["post"])
    def close(self, request):
        shift = Shift.objects.filter(user=request.user, branch=request.branch, closed_at__isnull=True).first()
        if not shift:
            raise ValidationError("No open shift.")
        totals, expected = shift_totals(shift)
        counted = Decimal(str(request.data.get("counted_cash") or 0))
        shift.closed_at = timezone.now()
        shift.expected_cash = expected
        shift.counted_cash = counted
        shift.variance = counted - expected
        shift.totals_by_method = {k: str(v) for k, v in totals.items()}
        shift.notes = request.data.get("notes", "")
        shift.save()
        AuditLog.log(request.business, request.user, "shift.closed", shift, request, variance=shift.variance)
        return Response(ShiftSerializer(shift, context={"request": request}).data)
