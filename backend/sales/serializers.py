from rest_framework import serializers

from accounts.models import User
from catalog.models import Product, ProductUnit
from core.api import TenantPKField
from crm.models import Customer

from .models import PAYMENT_METHODS, Payment, Sale, SaleItem, SaleReturn, SaleReturnItem


class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = ["id", "product", "product_name", "unit", "unit_name", "quantity", "base_quantity", "unit_price",
                  "price_rule", "discount", "allocated_sale_discount", "tax_rate", "tax_amount", "line_total",
                  "returned_quantity"]


class PaymentSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source="get_method_display", read_only=True)
    sale_number = serializers.CharField(source="sale.number", read_only=True, default=None)
    customer_name = serializers.CharField(source="customer.name", read_only=True, default=None)
    received_by_name = serializers.CharField(source="received_by.__str__", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = ["id", "sale", "sale_number", "customer", "customer_name", "branch", "kind", "method",
                  "method_display", "amount", "reference", "phone", "status", "received_by", "received_by_name",
                  "created_at"]


class SaleListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True, default=None)
    cashier_name = serializers.CharField(source="cashier.__str__", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    payment_status = serializers.CharField(read_only=True)
    item_count = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = Sale
        fields = ["id", "number", "status", "sale_type", "customer", "customer_name", "cashier", "cashier_name",
                  "branch", "branch_name", "total", "amount_paid", "balance", "refunded_total", "payment_status",
                  "due_date", "hold_label", "item_count", "created_at", "completed_at"]


class SaleDetailSerializer(SaleListSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True, default=None)
    customer_kra_pin = serializers.CharField(source="customer.kra_pin", read_only=True, default=None)

    class Meta(SaleListSerializer.Meta):
        fields = SaleListSerializer.Meta.fields + [
            "items", "payments", "subtotal", "discount_total", "sale_discount", "tax_total", "change_given",
            "notes", "valid_until", "voided_reason", "customer_phone", "customer_kra_pin", "etims_invoice_number"]


# ---- Checkout input --------------------------------------------------------

class CartItemSerializer(serializers.Serializer):
    product = TenantPKField(queryset=Product.objects.select_related("unit"))
    unit = TenantPKField(queryset=ProductUnit.objects.all(), required=False, allow_null=True)
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    discount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)


class PaymentInputSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=[m for m, _ in PAYMENT_METHODS])
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=60)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=20)


class CheckoutSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["complete", "hold", "quotation"], default="complete")
    sale = TenantPKField(queryset=Sale.objects.all(), required=False, allow_null=True,
                                              help_text="Held sale / quotation being resumed")
    customer = TenantPKField(queryset=Customer.objects.all(), required=False, allow_null=True)
    salesperson = TenantPKField(queryset=User.objects.all(), required=False, allow_null=True)
    sale_type = serializers.ChoiceField(choices=["retail", "wholesale"], required=False, allow_null=True)
    items = CartItemSerializer(many=True)
    sale_discount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    payments = PaymentInputSerializer(many=True, required=False, default=list)
    due_date = serializers.DateField(required=False, allow_null=True)
    valid_until = serializers.DateField(required=False, allow_null=True)
    hold_label = serializers.CharField(required=False, allow_blank=True, max_length=60)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=255)


class PricePreviewSerializer(serializers.Serializer):
    customer = TenantPKField(queryset=Customer.objects.all(), required=False, allow_null=True)
    sale_type = serializers.ChoiceField(choices=["retail", "wholesale"], required=False, allow_null=True)
    items = CartItemSerializer(many=True)
    sale_discount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)


class ReturnItemInputSerializer(serializers.Serializer):
    sale_item = TenantPKField(queryset=SaleItem.objects.all())
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    restock = serializers.BooleanField(default=True)


class ReturnInputSerializer(serializers.Serializer):
    items = ReturnItemInputSerializer(many=True)
    refund_method = serializers.ChoiceField(choices=[m for m, _ in PAYMENT_METHODS] + [("credit", "Customer account")])
    reason = serializers.CharField(max_length=255)


class SaleReturnSerializer(serializers.ModelSerializer):
    sale_number = serializers.CharField(source="sale.number", read_only=True)
    processed_by_name = serializers.CharField(source="processed_by.__str__", read_only=True)
    items = serializers.SerializerMethodField()

    class Meta:
        model = SaleReturn
        fields = ["id", "number", "sale", "sale_number", "reason", "refund_method", "refund_amount", "processed_by",
                  "processed_by_name", "created_at", "items"]

    def get_items(self, obj):
        return [{"product_name": i.sale_item.product_name, "unit_name": i.sale_item.unit_name, "quantity": i.quantity,
                 "amount": i.amount, "restock": i.restock} for i in obj.items.select_related("sale_item")]
