from django.db.models import Sum
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core.api import TenantModelSerializer, TenantViewSet
from core.models import AuditLog

from .models import Expense, ExpenseCategory


class ExpenseCategorySerializer(TenantModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ["id", "name"]


class ExpenseSerializer(TenantModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.__str__", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = Expense
        fields = "__all__"
        read_only_fields = ["status", "recorded_by", "approved_by", "created_at"]
        extra_kwargs = {"branch": {"required": False}}

    def validate_amount(self, v):
        if v <= 0:
            raise serializers.ValidationError("Amount must be positive.")
        return v


class ExpenseCategoryViewSet(TenantViewSet):
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    perm_module = "expenses"
    pagination_class = None


class ExpenseViewSet(TenantViewSet):
    queryset = Expense.objects.select_related("category", "recorded_by", "branch")
    serializer_class = ExpenseSerializer
    perm_module = "expenses"
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    permission_map = {"approve": "expenses.approve", "reject": "expenses.approve", "summary": "expenses.view"}
    filterset_fields = {"category": ["exact"], "status": ["exact"], "branch": ["exact"], "date": ["gte", "lte", "exact"],
                        "payment_method": ["exact"], "recurrence": ["exact"]}
    search_fields = ["description", "reference"]

    def perform_create(self, serializer):
        approved = self.request.user.has_code("expenses.approve")
        expense = serializer.save(business=self.request.business,
                                  branch=serializer.validated_data.get("branch") or self.request.branch,
                                  recorded_by=self.request.user, status="approved" if approved else "pending",
                                  approved_by=self.request.user if approved else None)
        AuditLog.log(self.request.business, self.request.user, "expense.recorded", expense, self.request, amount=expense.amount)

    def perform_update(self, serializer):
        if serializer.instance.status == "approved" and not self.request.user.has_code("expenses.approve"):
            raise ValidationError("Approved expenses can only be changed by an approver.")
        serializer.save()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        e = self.get_object()
        e.status, e.approved_by = "approved", request.user
        e.save(update_fields=["status", "approved_by"])
        return Response(self.get_serializer(e).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        e = self.get_object()
        e.status, e.approved_by = "rejected", request.user
        e.save(update_fields=["status", "approved_by"])
        return Response(self.get_serializer(e).data)

    @action(detail=False)
    def summary(self, request):
        """?period=daily|weekly|monthly&date__gte=&date__lte= → totals per period and per category."""
        qs = self.filter_queryset(self.get_queryset()).filter(status="approved")
        trunc = {"daily": TruncDate, "weekly": TruncWeek, "monthly": TruncMonth}.get(
            request.query_params.get("period", "daily"), TruncDate)
        by_period = qs.annotate(p=trunc("date")).values("p").annotate(total=Sum("amount")).order_by("p")
        by_category = qs.values("category__name").annotate(total=Sum("amount")).order_by("-total")
        return Response({
            "total": qs.aggregate(t=Sum("amount"))["t"] or 0,
            "by_period": [{"period": r["p"], "total": r["total"]} for r in by_period],
            "by_category": [{"category": r["category__name"], "total": r["total"]} for r in by_category],
            "generated_at": timezone.now(),
        })
