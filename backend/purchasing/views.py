from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from core.api import TenantViewSet
from core.models import AuditLog, Counter

from . import services
from .models import PurchaseOrder
from .serializers import GoodsReceiptSerializer, PurchaseOrderSerializer, PurchaseReturnSerializer, ReceiveSerializer


class PurchaseOrderViewSet(TenantViewSet):
    queryset = PurchaseOrder.objects.select_related("supplier", "branch").prefetch_related("items__product__unit", "items__unit")
    serializer_class = PurchaseOrderSerializer
    perm_module = "purchases"
    filterset_fields = {"status": ["exact", "in"], "supplier": ["exact"], "branch": ["exact"], "created_at": ["gte", "lte"]}
    search_fields = ["number", "supplier__name", "supplier_invoice_number"]

    def perform_create(self, serializer):
        branch = serializer.validated_data.get("branch") or self.request.branch
        order = serializer.save(business=self.request.business, branch=branch, created_by=self.request.user,
                                number=Counter.next(self.request.business, "PO"))
        AuditLog.log(self.request.business, self.request.user, "purchase.created", order, self.request)

    def perform_destroy(self, instance):
        if instance.status != "draft":
            raise ValidationError("Only drafts can be deleted; cancel the order instead.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        order = services.submit_order(self.get_object(), request.user)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status not in ("draft", "ordered"):
            raise ValidationError("Orders with received goods cannot be cancelled.")
        order.status = "cancelled"
        order.save(update_fields=["status"])
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        order = self.get_object()
        s = ReceiveSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        receipt = services.receive_goods(order=order, user=request.user, lines=s.validated_data["lines"],
                                         supplier_invoice_number=s.validated_data["supplier_invoice_number"],
                                         additional_costs=s.validated_data["additional_costs"], request=request)
        return Response({"receipt": GoodsReceiptSerializer(receipt).data,
                         "order": self.get_serializer(self.get_queryset().get(pk=order.pk)).data})

    @action(detail=True, methods=["post"], url_path="return")
    def return_goods(self, request, pk=None):
        order = self.get_object()
        s = PurchaseReturnSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        total = services.return_to_supplier(order=order, user=request.user, lines=s.validated_data["lines"],
                                            reason=s.validated_data["reason"], request=request)
        return Response({"returned": total, "order": self.get_serializer(self.get_queryset().get(pk=order.pk)).data})

    @action(detail=True)
    def receipts(self, request, pk=None):
        return Response(GoodsReceiptSerializer(self.get_object().receipts.all(), many=True).data)
