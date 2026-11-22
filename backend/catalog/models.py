from decimal import Decimal

from django.db import models
from django.db.models import Q

from core.models import TenantModel


class Category(TenantModel):
    name = models.CharField(max_length=100)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")

    class Meta:
        verbose_name_plural = "categories"
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["business", "name"], name="uniq_category")]

    def __str__(self):
        return self.name


class Brand(TenantModel):
    name = models.CharField(max_length=100)
    manufacturer = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["business", "name"], name="uniq_brand")]

    def __str__(self):
        return self.name


class Unit(TenantModel):
    """Base unit of measure in which stock is counted (piece, kg, litre...)."""

    name = models.CharField(max_length=40)
    abbreviation = models.CharField(max_length=10)
    allows_decimal = models.BooleanField(default=False, help_text="e.g. kg/litres can be sold in fractions.")

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["business", "name"], name="uniq_unit")]

    def __str__(self):
        return self.abbreviation


class Product(TenantModel):
    TAX_CHOICES = [("standard", "Standard VAT"), ("zero", "Zero-rated"), ("exempt", "Exempt")]

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="products/", blank=True, null=True)
    sku = models.CharField(max_length=60, blank=True)
    barcode = models.CharField(max_length=64, blank=True, db_index=True)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="products")
    brand = models.ForeignKey(Brand, null=True, blank=True, on_delete=models.SET_NULL, related_name="products")
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="products", help_text="Base stock unit")

    # Variants: a variant points at its parent product ("Soda" -> "Soda 500ml").
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="variants")
    variant_attributes = models.JSONField(default=dict, blank=True, help_text='{"size": "500ml", "colour": "red"}')

    # Prices are per base unit. Prices for packs/cartons live on ProductUnit.
    cost_price = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"),
                                     help_text="Weighted average purchase cost per base unit.")
    retail_price = models.DecimalField(max_digits=14, decimal_places=2)
    wholesale_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    min_price = models.DecimalField("Minimum selling price", max_digits=14, decimal_places=2, null=True, blank=True)
    wholesale_min_qty = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0"),
                                            help_text="Base-unit quantity from which wholesale price applies automatically (0 = only for wholesale customers).")
    tax_type = models.CharField(max_length=10, choices=TAX_CHOICES, default="standard")

    reorder_level = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0"))
    reorder_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0"))
    track_stock = models.BooleanField(default=True)
    track_batches = models.BooleanField(default=False, help_text="Track batch numbers and expiry dates.")
    track_serials = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["business", "sku"], condition=~Q(sku=""), name="uniq_sku"),
            models.UniqueConstraint(fields=["business", "barcode"], condition=~Q(barcode=""), name="uniq_barcode"),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        changed = []
        if not self.sku:
            self.sku = f"P{self.pk:06d}"
            changed.append("sku")
        if not self.barcode:
            self.barcode = generate_ean13(self.business_id, self.pk)
            changed.append("barcode")
        if changed:
            type(self).objects.filter(pk=self.pk).update(**{f: getattr(self, f) for f in changed})


def generate_ean13(business_id, product_id):
    """Internal in-store EAN-13 (prefix 2 = restricted circulation)."""
    body = f"2{business_id % 1000:03d}{product_id % 100000000:08d}"[:12]
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(body))
    return body + str((10 - total % 10) % 10)


class ProductUnit(TenantModel):
    """An alternative selling/purchasing unit: 1 Carton = 12 bottles, 1 Dozen = 12 pcs."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="units")
    name = models.CharField(max_length=40)
    factor = models.DecimalField(max_digits=12, decimal_places=3, help_text="Base units contained in one of this unit.")
    barcode = models.CharField(max_length=64, blank=True, db_index=True)
    retail_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    wholesale_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    class Meta:
        ordering = ["factor"]
        constraints = [models.UniqueConstraint(fields=["product", "name"], name="uniq_product_unit")]

    def __str__(self):
        return f"{self.name} ({self.factor})"


class PriceTier(TenantModel):
    """Quantity-break pricing. Quantities are in the given unit (base unit when unit is empty)."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="price_tiers")
    unit = models.ForeignKey(ProductUnit, null=True, blank=True, on_delete=models.CASCADE, related_name="price_tiers")
    min_quantity = models.DecimalField(max_digits=12, decimal_places=3)
    price = models.DecimalField(max_digits=14, decimal_places=2)
    customer_category = models.CharField(max_length=20, blank=True,
                                         help_text="Restrict the tier to retail/wholesale/distributor customers (blank = everyone).")

    class Meta:
        ordering = ["min_quantity"]


class CustomerPrice(TenantModel):
    """A negotiated price for a specific customer."""

    customer = models.ForeignKey("crm.Customer", on_delete=models.CASCADE, related_name="special_prices")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="customer_prices")
    unit = models.ForeignKey(ProductUnit, null=True, blank=True, on_delete=models.CASCADE)
    price = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["customer", "product", "unit"], name="uniq_customer_price")]
