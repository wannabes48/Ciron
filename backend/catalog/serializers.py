from django.db import transaction
from rest_framework import serializers

from core.api import TenantModelSerializer

from .models import Brand, Category, CustomerPrice, PriceTier, Product, ProductUnit, Unit


class CategorySerializer(TenantModelSerializer):
    product_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Category
        fields = ["id", "name", "parent", "product_count"]


class BrandSerializer(TenantModelSerializer):
    class Meta:
        model = Brand
        fields = ["id", "name", "manufacturer"]


class UnitSerializer(TenantModelSerializer):
    class Meta:
        model = Unit
        fields = ["id", "name", "abbreviation", "allows_decimal"]


class ProductUnitSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = ProductUnit
        fields = ["id", "name", "factor", "barcode", "retail_price", "wholesale_price"]

    def validate_factor(self, v):
        if v <= 0:
            raise serializers.ValidationError("Must be greater than zero.")
        return v


class PriceTierSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(required=False, allow_blank=True, allow_null=True,
                                      help_text="Name of a ProductUnit; blank = base unit")

    class Meta:
        model = PriceTier
        fields = ["id", "unit_name", "min_quantity", "price", "customer_category"]
        read_only_fields = ["id"]

    def to_representation(self, obj):
        data = super().to_representation(obj)
        data["unit_name"] = obj.unit.name if obj.unit_id else None
        return data


class ProductSerializer(TenantModelSerializer):
    units = ProductUnitSerializer(many=True, required=False)
    price_tiers = PriceTierSerializer(many=True, required=False)
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    brand_name = serializers.CharField(source="brand.name", read_only=True, default=None)
    unit_abbr = serializers.CharField(source="unit.abbreviation", read_only=True)
    unit_allows_decimal = serializers.BooleanField(source="unit.allows_decimal", read_only=True)
    stock = serializers.DecimalField(max_digits=14, decimal_places=3, read_only=True, default=None)
    total_stock = serializers.DecimalField(max_digits=14, decimal_places=3, read_only=True, default=None)

    class Meta:
        model = Product
        fields = ["id", "name", "description", "image", "sku", "barcode", "category", "category_name", "brand",
                  "brand_name", "unit", "unit_abbr", "unit_allows_decimal", "parent", "variant_attributes",
                  "cost_price", "retail_price", "wholesale_price", "min_price", "wholesale_min_qty", "tax_type",
                  "reorder_level", "reorder_quantity", "track_stock", "track_batches", "track_serials", "is_active",
                  "units", "price_tiers", "stock", "total_stock", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]
        extra_kwargs = {"sku": {"required": False}, "barcode": {"required": False}}

    def validate(self, attrs):
        retail = attrs.get("retail_price", getattr(self.instance, "retail_price", None))
        min_price = attrs.get("min_price", getattr(self.instance, "min_price", None))
        if min_price is not None and retail is not None and min_price > retail:
            raise serializers.ValidationError({"min_price": "Minimum price cannot exceed the retail price."})
        names = [u["name"].strip().lower() for u in attrs.get("units", [])]
        if len(names) != len(set(names)):
            raise serializers.ValidationError({"units": "Unit names must be unique."})
        if "units" not in attrs and self.instance is not None:
            names = [u.name.lower() for u in self.instance.units.all()]
        for tier in attrs.get("price_tiers", []):
            if tier.get("unit_name") and tier["unit_name"].strip().lower() not in names:
                raise serializers.ValidationError({"price_tiers": f"Unknown unit '{tier['unit_name']}'."})
        business = self.context["request"].business
        for field in ("sku", "barcode"):
            value = attrs.get(field)
            if value:
                qs = Product.objects.filter(business=business, **{field: value})
                if self.instance:
                    qs = qs.exclude(pk=self.instance.pk)
                if qs.exists():
                    raise serializers.ValidationError({field: f"Another product already uses this {field}."})
        return attrs

    @transaction.atomic
    def create(self, validated):
        units = validated.pop("units", [])
        tiers = validated.pop("price_tiers", [])
        product = Product.objects.create(**validated)
        self._sync(product, units, tiers)
        return product

    @transaction.atomic
    def update(self, instance, validated):
        units = validated.pop("units", None)
        tiers = validated.pop("price_tiers", None)
        instance = super().update(instance, validated)
        self._sync(instance, units, tiers)
        return instance

    def _sync(self, product, units, tiers):
        if units is not None:
            keep = []
            for u in units:
                u = dict(u)
                uid = u.pop("id", None)
                obj = product.units.filter(pk=uid).first() if uid else product.units.filter(name__iexact=u["name"]).first()
                if obj:
                    for k, v in u.items():
                        setattr(obj, k, v)
                    obj.save()
                else:
                    obj = ProductUnit.objects.create(business=product.business, product=product, **u)
                keep.append(obj.pk)
            product.units.exclude(pk__in=keep).delete()
        if tiers is not None:
            product.price_tiers.all().delete()
            by_name = {u.name.lower(): u for u in product.units.all()}
            PriceTier.objects.bulk_create([
                PriceTier(business=product.business, product=product,
                          unit=by_name.get((t.get("unit_name") or "").lower()), min_quantity=t["min_quantity"],
                          price=t["price"], customer_category=t.get("customer_category", ""))
                for t in tiers
            ])


class CustomerPriceSerializer(TenantModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True, default=None)

    class Meta:
        model = CustomerPrice
        fields = ["id", "customer", "product", "product_name", "unit", "unit_name", "price"]
