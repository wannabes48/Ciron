"""Role-based access control.

Each role maps to a set of permission codes. Owners can grant/revoke individual codes
per user (User.extra_permissions / User.revoked_permissions).
"""

ALL_PERMISSIONS = {
    "dashboard.view": "View dashboard",
    "pos.sell": "Process sales at the POS",
    "sales.view": "View sales history",
    "sales.discount": "Apply discounts",
    "sales.override_price": "Sell below minimum price / override prices",
    "sales.credit": "Sell on credit",
    "sales.refund": "Process returns and refunds",
    "sales.void": "Void/cancel completed sales",
    "products.view": "View products",
    "products.manage": "Create/edit/delete products",
    "stock.view": "View stock levels and movements",
    "stock.manage": "Record stock-in, adjustments, transfers",
    "stock.approve": "Approve stock adjustments",
    "customers.view": "View customers",
    "customers.manage": "Create/edit customers",
    "suppliers.view": "View suppliers",
    "suppliers.manage": "Create/edit suppliers",
    "purchases.view": "View purchase orders",
    "purchases.manage": "Create/receive purchase orders",
    "payments.manage": "Record customer and supplier payments",
    "expenses.view": "View expenses",
    "expenses.manage": "Record expenses",
    "expenses.approve": "Approve expenses",
    "reports.view": "View reports",
    "users.manage": "Manage employees and roles",
    "branches.manage": "Manage branches",
    "settings.manage": "Change business settings",
    "audit.view": "View audit and activity logs",
}

_ALL = set(ALL_PERMISSIONS)

ROLE_PERMISSIONS = {
    "super_admin": _ALL,
    "owner": _ALL,
    "manager": _ALL - {"settings.manage", "users.manage", "branches.manage"},
    "cashier": {"pos.sell", "sales.view", "products.view", "customers.view", "stock.view"},
    "storekeeper": {
        "products.view", "products.manage", "stock.view", "stock.manage",
        "suppliers.view", "purchases.view", "purchases.manage",
    },
    "accountant": {
        "dashboard.view", "sales.view", "payments.manage", "expenses.view", "expenses.manage",
        "expenses.approve", "reports.view", "customers.view", "suppliers.view", "purchases.view",
        "stock.view", "products.view", "audit.view",
    },
    "salesperson": {
        "pos.sell", "sales.view", "sales.credit", "products.view", "customers.view",
        "customers.manage", "stock.view",
    },
}

ROLE_CHOICES = [
    ("super_admin", "Super Admin"),
    ("owner", "Shop Owner"),
    ("manager", "Manager"),
    ("cashier", "Cashier"),
    ("storekeeper", "Storekeeper"),
    ("accountant", "Accountant"),
    ("salesperson", "Salesperson"),
]
