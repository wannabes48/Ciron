from django.db import transaction
from rest_framework import serializers

from catalog.models import Product, ProductUnit
from core.api import TenantModelSerializer, TenantPKField

from .models import GoodsReceipt, PurchaseOrder, PurchaseOrderItem


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    product = TenantPKField(queryset=Product.objects.all())
    unit = TenantPKField(queryset=ProductUnit.objects.all(), required=False, allow_null=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    unit_name = serializers.SerializerMethodField()
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    pending_quantity = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrderItem
        fields = ["id", "product", "product_name", "unit", "unit_name", "quantity", "unit_cost", "received_quantity",
                  "returned_quantity", "pending_quantity", "line_total"]
        read_only_fields = ["received_quantity", "returned_quantity"]

    def get_unit_name(self, obj):
        return obj.unit.name if obj.unit_id else obj.product.unit.abbreviation

    def get_pending_quantity(self, obj):
        return max(obj.quantity - obj.received_quantity, 0)

    def validate(self, attrs):
        if attrs.get("unit") and attrs["unit"].product_id != attrs["product"].pk:
            raise serializers.ValidationError({"unit": "Unit does not belong to the product."})
        if attrs["quantity"] <= 0:
            raise serializers.ValidationError({"quantity": "Must be positive."})
        return attrs


class PurchaseOrderSerializer(TenantModelSerializer):
    items = PurchaseOrderItemSerializer(many=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ["id", "number", "supplier", "supplier_name", "branch", "branch_name", "status", "expected_date",
                  "supplier_invoice_number", "additional_costs", "total_ordered", "total_received", "amount_paid",
                  "returned_total", "balance", "notes", "items", "created_by", "created_at", "submitted_at"]
        read_only_fields = ["number", "status", "total_ordered", "total_received", "amount_paid", "returned_total",
                            "created_by", "submitted_at", "additional_costs"]
        extra_kwargs = {"branch": {"required": False}}

    @transaction.atomic
    def create(self, validated):
        items = validated.pop("items")
        order = PurchaseOrder.objects.create(**validated)
        self._write_items(order, items)
        return order

    @transaction.atomic
    def update(self, instance, validated):
        items = validated.pop("items", None)
        if items is not None and instance.status != "draft":
            raise serializers.ValidationError("Items can only be changed while the order is a draft.")
        instance = super().update(instance, validated)
        if items is not None:
            instance.items.all().delete()
            self._write_items(instance, items)
        return instance

    def _write_items(self, order, items):
        if not items:
            raise serializers.ValidationError({"items": "Add at least one product."})
        total = 0
        for i in items:
            i.pop("id", None)
            PurchaseOrderItem.objects.create(business=order.business, order=order, **i)
            total += i["quantity"] * i["unit_cost"]
        order.total_ordered = total
        order.save(update_fields=["total_ordered"])


class ReceiveLineSerializer(serializers.Serializer):
    item = TenantPKField(queryset=PurchaseOrderItem.objects.all())
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    batch_number = serializers.CharField(required=False, allow_blank=True, default="")
    expiry_date = serializers.DateField(required=False, allow_null=True)


class ReceiveSerializer(serializers.Serializer):
    lines = ReceiveLineSerializer(many=True)
    supplier_invoice_number = serializers.CharField(required=False, allow_blank=True, default="")
    additional_costs = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)


class ReturnLineSerializer(serializers.Serializer):
    item = TenantPKField(queryset=PurchaseOrderItem.objects.all())
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3)


class PurchaseReturnSerializer(serializers.Serializer):
    lines = ReturnLineSerializer(many=True)
    reason = serializers.CharField(max_length=255)


class GoodsReceiptSerializer(serializers.ModelSerializer):
    received_by_name = serializers.CharField(source="received_by.__str__", read_only=True)

    class Meta:
        model = GoodsReceipt
        fields = ["id", "number", "supplier_invoice_number", "additional_costs", "total", "received_by_name", "created_at"]
