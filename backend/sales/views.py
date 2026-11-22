from django.db.models import Count
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.api import HasPermissionCode
from core.serializers import BranchSerializer
from accounts.serializers import BusinessSerializer

from . import services
from .models import Payment, Sale, SaleReturn
from .serializers import (CheckoutSerializer, PaymentSerializer, PricePreviewSerializer, ReturnInputSerializer,
                          SaleDetailSerializer, SaleListSerializer, SaleReturnSerializer)


class SaleViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [HasPermissionCode]
    perm_module = "sales"
    permission_map = {"checkout": "pos.sell", "price_preview": "pos.sell", "held": "pos.sell", "void": "sales.void",
                      "process_return": "sales.refund", "receipt": "sales.view"}
    filterset_fields = {"status": ["exact", "in"], "sale_type": ["exact"], "customer": ["exact"],
                        "cashier": ["exact"], "branch": ["exact"], "created_at": ["gte", "lte", "date"],
                        "balance": ["gt"]}
    search_fields = ["number", "customer__name", "customer__phone", "payments__reference"]
    ordering_fields = ["created_at", "total", "balance"]

    def get_queryset(self):
        qs = (Sale.objects.filter(business=self.request.business)
              .select_related("customer", "cashier", "branch").annotate(item_count=Count("items")))
        if self.action == "retrieve" or self.action == "receipt":
            qs = qs.prefetch_related("items", "payments__received_by")
        # Cashiers only see their own sales unless they can view reports.
        if not self.request.user.has_code("reports.view") and self.action in ("list",):
            qs = qs.filter(cashier=self.request.user)
        return qs.distinct()

    def get_serializer_class(self):
        return SaleDetailSerializer if self.action in ("retrieve", "receipt") else SaleListSerializer

    @action(detail=False, methods=["post"])
    def checkout(self, request):
        s = CheckoutSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        sale = services.checkout(business=request.business, branch=request.branch, user=request.user,
                                 data=s.validated_data, request=request)
        return Response(SaleDetailSerializer(Sale.objects.get(pk=sale.pk)).data, status=201)

    @action(detail=False, methods=["post"])
    def price_preview(self, request):
        """Price a cart without saving — the POS calls this as the cart changes."""
        s = PricePreviewSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        d = s.validated_data
        customer = d.get("customer")
        sale_type = d.get("sale_type") or ("wholesale" if customer and customer.category != "retail" else "retail")
        lines, totals = services.price_lines(business=request.business, user=request.user, customer=customer,
                                             sale_type=sale_type, items=d["items"], sale_discount=d.get("sale_discount"))
        return Response({
            "sale_type": sale_type,
            "totals": totals,
            "lines": [{"product": l["product"].pk, "unit": l["unit"].pk if l["unit"] else None,
                       "quantity": l["quantity"], "base_quantity": l["base_quantity"], "unit_price": l["unit_price"],
                       "rule": l["rule"], "gross": l["gross"], "discount": l["discount"] + l["allocated"],
                       "tax": l["tax"], "line_total": l["line_total"]} for l in lines],
        })

    @action(detail=False)
    def held(self, request):
        qs = self.get_queryset().filter(status__in=["held", "quotation"], branch=request.branch)
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        return Response(SaleDetailSerializer(qs.prefetch_related("items", "payments"), many=True).data)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"reason": "A reason is required."}, status=400)
        sale = services.void_sale(sale=self.get_object(), user=request.user, reason=reason, request=request)
        return Response(SaleDetailSerializer(Sale.objects.get(pk=sale.pk)).data)

    @action(detail=True, methods=["post"], url_path="return")
    def process_return(self, request, pk=None):
        sale = self.get_object()
        s = ReturnInputSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        ret = services.process_return(sale=sale, user=request.user, items=s.validated_data["items"],
                                      refund_method=s.validated_data["refund_method"],
                                      reason=s.validated_data["reason"], request=request)
        return Response(SaleReturnSerializer(ret).data, status=201)

    @action(detail=True)
    def receipt(self, request, pk=None):
        sale = self.get_object()
        return Response({
            "sale": SaleDetailSerializer(sale).data,
            "business": BusinessSerializer(request.business, context={"request": request}).data,
            "branch": BranchSerializer(sale.branch).data,
        })


class PaymentViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [HasPermissionCode]
    permission_map = {"list": "sales.view"}
    serializer_class = PaymentSerializer
    filterset_fields = {"method": ["exact"], "kind": ["exact"], "branch": ["exact"], "customer": ["exact"],
                        "shift": ["exact"], "created_at": ["gte", "lte", "date"]}
    search_fields = ["reference", "phone", "sale__number", "customer__name"]

    def get_queryset(self):
        return Payment.objects.filter(business=self.request.business).select_related("sale", "customer", "received_by")


class SaleReturnViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [HasPermissionCode]
    permission_map = {"list": "sales.view", "retrieve": "sales.view"}
    serializer_class = SaleReturnSerializer
    filterset_fields = {"sale": ["exact"], "created_at": ["gte", "lte"]}
    search_fields = ["number", "sale__number"]

    def get_queryset(self):
        return SaleReturn.objects.filter(business=self.request.business).select_related("sale", "processed_by")
