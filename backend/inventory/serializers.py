from rest_framework import serializers

from catalog.models import Product
from core.api import TenantModelSerializer, TenantPKField

from .models import (StockAdjustment, StockBatch, StockMovement, Stocktake, StocktakeLine, StockTransfer,
                     StockTransferItem)


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    user_name = serializers.CharField(source="user.__str__", read_only=True, default=None)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    batch_number = serializers.CharField(source="batch.batch_number", read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = ["id", "branch", "branch_name", "product", "product_name", "kind", "kind_display", "quantity",
                  "balance_after", "unit_cost", "reference", "note", "user", "user_name", "batch_number", "created_at"]


class StockBatchSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = StockBatch
        fields = ["id", "branch", "branch_name", "product", "product_name", "batch_number", "expiry_date",
                  "quantity_received", "quantity_remaining", "unit_cost", "received_at"]


class StockAdjustmentSerializer(TenantModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    requested_by_name = serializers.CharField(source="requested_by.__str__", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.__str__", read_only=True, default=None)

    class Meta:
        model = StockAdjustment
        fields = "__all__"
        read_only_fields = ["branch", "status", "requested_by", "approved_by", "decided_at"]

    def validate(self, attrs):
        if attrs.get("quantity") == 0:
            raise serializers.ValidationError({"quantity": "Quantity cannot be zero."})
        unit = attrs.get("unit")
        if unit and unit.product_id != attrs["product"].pk:
            raise serializers.ValidationError({"unit": "Unit does not belong to this product."})
        return attrs


class StockTransferItemSerializer(serializers.ModelSerializer):
    product = TenantPKField(queryset=Product.objects.all())
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = StockTransferItem
        fields = ["id", "product", "product_name", "quantity"]


class StockTransferSerializer(TenantModelSerializer):
    items = StockTransferItemSerializer(many=True)
    from_branch_name = serializers.CharField(source="from_branch.name", read_only=True)
    to_branch_name = serializers.CharField(source="to_branch.name", read_only=True)

    class Meta:
        model = StockTransfer
        fields = ["id", "number", "from_branch", "from_branch_name", "to_branch", "to_branch_name", "status", "note",
                  "items", "created_by", "received_by", "created_at", "received_at"]
        read_only_fields = ["number", "status", "created_by", "received_by", "received_at"]

    def validate(self, attrs):
        if attrs["from_branch"] == attrs["to_branch"]:
            raise serializers.ValidationError("Choose two different branches.")
        if not attrs.get("items"):
            raise serializers.ValidationError({"items": "Add at least one product."})
        if any(i["quantity"] <= 0 for i in attrs["items"]):
            raise serializers.ValidationError({"items": "Quantities must be positive."})
        return attrs

    def create(self, validated):
        items = validated.pop("items")
        transfer = StockTransfer.objects.create(**validated)
        for i in items:
            StockTransferItem.objects.create(business=transfer.business, transfer=transfer, **i)
        return transfer


class StocktakeLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    sku = serializers.CharField(source="product.sku", read_only=True)
    barcode = serializers.CharField(source="product.barcode", read_only=True)

    class Meta:
        model = StocktakeLine
        fields = ["id", "product", "product_name", "sku", "barcode", "expected_quantity", "counted_quantity"]
        read_only_fields = ["product", "expected_quantity"]


class StocktakeSerializer(TenantModelSerializer):
    lines = StocktakeLineSerializer(many=True, read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = Stocktake
        fields = ["id", "number", "branch", "branch_name", "status", "note", "lines", "created_by", "created_at",
                  "completed_at"]
        read_only_fields = ["number", "branch", "status", "created_by", "completed_at"]
