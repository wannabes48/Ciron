"""Pricing engine — decides the unit price for a POS line.

Precedence (first match wins):
  1. Customer-specific negotiated price for (customer, product, unit).
  2. Quantity tier price (highest tier whose min_quantity <= quantity), optionally
     restricted to a customer category.
  3. Wholesale price, when the sale is wholesale (wholesale/distributor customer or the
     cashier chose wholesale mode) or the base-unit quantity reaches wholesale_min_qty.
  4. Retail price.

Prices for alternative units (carton, dozen...) come from ProductUnit; if a unit has no
explicit price, it is derived as base price x factor.
"""
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

WHOLESALE_CATEGORIES = {"wholesale", "distributor"}
CENT = Decimal("0.01")


@dataclass
class PriceQuote:
    unit_price: Decimal
    rule: str  # customer | tier | wholesale | retail
    base_quantity: Decimal
    min_unit_price: Decimal | None
    factor: Decimal


def money(value) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def _unit_price(product, unit, kind):
    factor = unit.factor if unit else Decimal("1")
    if kind == "wholesale":
        if unit and unit.wholesale_price is not None:
            return unit.wholesale_price
        if product.wholesale_price is not None:
            return money(product.wholesale_price * factor)
        kind = "retail"
    if unit and unit.retail_price is not None:
        return unit.retail_price
    return money(product.retail_price * factor)


def quote_price(product, quantity, unit=None, customer=None, sale_type="retail") -> PriceQuote:
    quantity = Decimal(quantity)
    factor = unit.factor if unit else Decimal("1")
    base_qty = quantity * factor
    min_unit_price = money(product.min_price * factor) if product.min_price is not None else None
    category = getattr(customer, "category", None) or "retail"

    if customer is not None:
        special = next(
            (cp for cp in product.customer_prices.all() if cp.customer_id == customer.pk and cp.unit_id == (unit.pk if unit else None)),
            None,
        )
        if special:
            return PriceQuote(special.price, "customer", base_qty, min_unit_price, factor)

    tiers = [
        t for t in product.price_tiers.all()
        if t.unit_id == (unit.pk if unit else None)
        and t.min_quantity <= quantity
        and (not t.customer_category or t.customer_category == category)
    ]
    if tiers:
        best = max(tiers, key=lambda t: t.min_quantity)
        return PriceQuote(best.price, "tier", base_qty, min_unit_price, factor)

    is_wholesale = (
        sale_type == "wholesale"
        or category in WHOLESALE_CATEGORIES
        or (product.wholesale_min_qty and base_qty >= product.wholesale_min_qty)
    )
    has_wholesale_price = product.wholesale_price is not None or (unit is not None and unit.wholesale_price is not None)
    if is_wholesale and has_wholesale_price:
        return PriceQuote(_unit_price(product, unit, "wholesale"), "wholesale", base_qty, min_unit_price, factor)

    return PriceQuote(_unit_price(product, unit, "retail"), "retail", base_qty, min_unit_price, factor)


def split_tax(amount, rate, inclusive):
    """Returns (net, tax) for a line amount at the given VAT rate (percentage)."""
    amount = Decimal(amount)
    rate = Decimal(rate)
    if rate <= 0:
        return money(amount), Decimal("0.00")
    if inclusive:
        tax = money(amount * rate / (Decimal("100") + rate))
        return money(amount - tax), tax
    tax = money(amount * rate / Decimal("100"))
    return money(amount), tax


def product_tax_rate(product, business):
    if not business.vat_registered or product.tax_type in ("zero", "exempt"):
        return Decimal("0")
    return business.vat_rate
