from rest_framework import serializers

from core.api import TenantModelSerializer

from .models import Customer, Supplier, SupplierPayment, SupplierProduct


class CustomerSerializer(TenantModelSerializer):
    available_credit = serializers.SerializerMethodField()
    overdue_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, default=0)

    class Meta:
        model = Customer
        fields = "__all__"
        read_only_fields = ["balance", "loyalty_points", "created_at"]

    def get_available_credit(self, obj):
        return max(obj.credit_limit - obj.balance, 0)


class SupplierSerializer(TenantModelSerializer):
    class Meta:
        model = Supplier
        fields = "__all__"
        read_only_fields = ["balance", "created_at"]


class SupplierProductSerializer(TenantModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = SupplierProduct
        fields = ["id", "supplier", "product", "product_name", "supplier_code", "last_cost"]


class SupplierPaymentSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    order_number = serializers.CharField(source="purchase_order.number", read_only=True, default=None)

    class Meta:
        model = SupplierPayment
        fields = ["id", "supplier", "supplier_name", "purchase_order", "order_number", "amount", "method",
                  "reference", "note", "paid_by", "created_at"]
