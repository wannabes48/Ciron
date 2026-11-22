from django.db.models import Q
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from accounts.serializers import BusinessSerializer

from .api import HasPermissionCode, TenantViewSet
from .models import AuditLog, Branch, ContactMessage, Notification
from .serializers import AuditLogSerializer, BranchSerializer, ContactMessageSerializer, NotificationSerializer


class BusinessSettingsView(APIView):
    permission_classes = [HasPermissionCode]
    permission_map = {"get": "*", "patch": "settings.manage", "put": "settings.manage"}

    def get(self, request):
        return Response(BusinessSerializer(request.business, context={"request": request}).data)

    def patch(self, request):
        s = BusinessSerializer(request.business, data=request.data, partial=True, context={"request": request})
        s.is_valid(raise_exception=True)
        s.save()
        AuditLog.log(request.business, request.user, "settings.updated", request.business, request,
                     fields=",".join(sorted(request.data.keys())))
        return Response(s.data)

    put = patch


class BranchViewSet(TenantViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    perm_module = "branches"
    permission_map = {"list": "*", "retrieve": "*"}

    def perform_destroy(self, instance):
        if instance.is_main:
            raise ValidationError("The main branch cannot be removed.")
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class AuditLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [HasPermissionCode]
    permission_map = {"list": "audit.view"}
    serializer_class = AuditLogSerializer
    filterset_fields = ["user", "action", "object_type"]
    search_fields = ["action", "object_id"]

    def get_queryset(self):
        return AuditLog.objects.filter(business=self.request.business).select_related("user")


class NotificationViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    permission_classes = [HasPermissionCode]
    permission_map = {"list": "*", "partial_update": "*", "update": "*", "mark_all_read": "*"}
    serializer_class = NotificationSerializer
    filterset_fields = ["is_read", "kind"]

    def get_queryset(self):
        qs = Notification.objects.filter(business=self.request.business)
        if self.request.user.has_code("stock.view") or self.request.user.has_code("reports.view"):
            return qs.filter(Q(user=self.request.user) | Q(user__isnull=True))
        return qs.filter(user=self.request.user)

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        self.get_queryset().update(is_read=True)
        return Response({"ok": True})


class ContactThrottle(AnonRateThrottle):
    rate = "5/hour"


class ContactMessageView(APIView):
    """Public contact form on the marketing site."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ContactThrottle]

    def post(self, request):
        s = ContactMessageSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if s.validated_data.pop("website", ""):  # honeypot: bots fill hidden fields
            return Response({"ok": True}, status=201)
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        ip = forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR")
        ContactMessage.objects.create(**s.validated_data, ip_address=ip or None)
        return Response({"ok": True}, status=201)
