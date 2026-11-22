from decimal import Decimal

from django.core.management.base import BaseCommand

from accounts.models import User
from catalog.models import Brand, Category, PriceTier, Product, ProductUnit, Unit
from core.models import Business
from core.onboarding import create_business
from crm.models import Customer, Supplier
from inventory.services import move_stock


class Command(BaseCommand):
    help = "Create a demo shop (subdomain 'demo', login owner / demo1234) with sample products."

    def handle(self, *args, **opts):
        if Business.objects.filter(subdomain="demo").exists():
            self.stdout.write("Demo business already exists (demo / owner / demo1234).")
            return
        business, owner = create_business(name="Demo Duka", subdomain="demo", owner_username="owner",
                                          owner_password="demo1234", owner_name="Demo Owner", phone="0700000000")
        branch = owner.default_branch
        User.objects.create_user("cashier", "demo1234", business=business, full_name="Jane Cashier", role="cashier",
                                 default_branch=branch)
        pcs = Unit.objects.get(business=business, abbreviation="pcs")
        kg = Unit.objects.get(business=business, abbreviation="kg")
        groceries = Category.objects.create(business=business, name="Groceries")
        drinks = Category.objects.create(business=business, name="Beverages")
        household = Category.objects.create(business=business, name="Household")

        def add(name, cat, unit, cost, retail, wholesale, stock, packs=(), tiers=(), brand=None, reorder=10, **kw):
            p = Product.objects.create(
                business=business, name=name, category=cat, unit=unit, cost_price=Decimal(cost),
                retail_price=Decimal(retail), wholesale_price=Decimal(wholesale) if wholesale else None,
                reorder_level=Decimal(reorder),
                brand=Brand.objects.get_or_create(business=business, name=brand)[0] if brand else None, **kw)
            for pname, factor, pr, pw in packs:
                ProductUnit.objects.create(business=business, product=p, name=pname, factor=Decimal(factor),
                                           retail_price=Decimal(pr) if pr else None,
                                           wholesale_price=Decimal(pw) if pw else None)
            for qty, price in tiers:
                PriceTier.objects.create(business=business, product=p, min_quantity=Decimal(qty), price=Decimal(price))
            move_stock(branch=branch, product=p, quantity=Decimal(stock), kind="opening", user=owner, reference="OPENING")
            return p

        add("Cooking oil 1L", groceries, pcs, 260, 320, 290, 120, packs=[("Carton (12)", 12, 3700, 3400)], brand="Fresh Fri")
        add("Sugar 1kg", groceries, pcs, 145, 180, 160, 200, packs=[("Bale (24)", 24, 4100, 3800)], brand="Mumias")
        add("Rice 1kg", groceries, pcs, 150, 200, 175, 150, packs=[("Bag (25)", 25, 4600, 4300)], brand="Pishori")
        add("Maize flour 2kg", groceries, pcs, 140, 175, 160, 90, packs=[("Bale (12)", 12, 2000, 1850)], brand="Jogoo")
        add("Soda 500ml", drinks, pcs, 45, 70, 55, 240, packs=[("Crate (24)", 24, 1500, 1250)],
            tiers=[(10, 65), (50, 60), (100, 57)], brand="Fanta", wholesale_min_qty=Decimal("48"))
        add("Drinking water 1L", drinks, pcs, 30, 60, 45, 8, packs=[("Pack (12)", 12, 650, 520)], reorder=24)
        add("Bar soap 800g", household, pcs, 150, 210, 185, 0, packs=[("Dozen", 12, 2400, 2150)])
        add("Loose beans", groceries, kg, 120, 160, 145, 50, reorder=10)
        add("Tissue paper (single)", household, pcs, 25, 40, 33, 300, packs=[("Packet (10)", 10, 380, 320)],
            tiers=[(10, 37), (50, 35)])

        Customer.objects.create(business=business, name="Mama Wanjiku Kiosk", phone="0711000001", category="wholesale",
                                credit_limit=Decimal("20000"), payment_terms_days=14)
        Customer.objects.create(business=business, name="John Otieno", phone="0722000002", category="retail",
                                credit_limit=Decimal("3000"))
        Customer.objects.create(business=business, name="Mlimani Distributors", phone="0733000003",
                                category="distributor", credit_limit=Decimal("100000"), payment_terms_days=30)
        Supplier.objects.create(business=business, name="Bidco Africa", phone="0200000000", contact_person="Sales desk")
        Supplier.objects.create(business=business, name="Kapa Wholesalers", phone="0744000004")
        self.stdout.write(self.style.SUCCESS("Demo shop created: shop 'demo', users owner / cashier, password demo1234"))
