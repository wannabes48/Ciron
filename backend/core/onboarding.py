from django.db import transaction

from .models import Branch, Business

DEFAULT_UNITS = [("Piece", "pcs", False), ("Kilogram", "kg", True), ("Gram", "g", True), ("Litre", "L", True),
                 ("Millilitre", "ml", True), ("Metre", "m", True)]
DEFAULT_EXPENSE_CATEGORIES = ["Rent", "Electricity", "Water", "Transport", "Salaries", "Internet", "Packaging",
                              "Maintenance", "Licences & permits", "Other"]
RESERVED_SUBDOMAINS = {"www", "app", "api", "admin", "static", "media", "mail", "ciron", "help", "support"}


@transaction.atomic
def create_business(*, name, subdomain, owner_username, owner_password, owner_name="", phone="", email="",
                    business_type="retail_wholesale"):
    from accounts.models import User
    from catalog.models import Unit
    from expenses.models import ExpenseCategory

    business = Business.objects.create(name=name, subdomain=subdomain.lower(), phone=phone, email=email,
                                       business_type=business_type)
    branch = Branch.objects.create(business=business, name="Main branch", code="MAIN", is_main=True)
    owner = User.objects.create_user(username=owner_username, password=owner_password, business=business,
                                     full_name=owner_name, email=email, phone=phone, role="owner",
                                     default_branch=branch)
    Unit.objects.bulk_create([Unit(business=business, name=n, abbreviation=a, allows_decimal=d) for n, a, d in DEFAULT_UNITS])
    ExpenseCategory.objects.bulk_create([ExpenseCategory(business=business, name=n) for n in DEFAULT_EXPENSE_CATEGORIES])
    return business, owner
