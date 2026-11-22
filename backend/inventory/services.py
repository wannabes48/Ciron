"""All stock changes go through move_stock() so the ledger and levels never drift apart."""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from catalog.pricing import money

from .models import StockBatch, StockLevel, StockMovement

ZERO = Decimal("0")


class InsufficientStock(ValidationError):
    pass


def current_stock(branch, product):
    level = StockLevel.objects.filter(branch=branch, product=product).first()
    return level.quantity if level else ZERO


@transaction.atomic
def move_stock(*, branch, product, quantity, kind, user=None, reference="", unit_cost=None, note="",
               batch_number="", expiry_date=None, allow_negative=None):
    """Apply a signed base-unit quantity to a branch's stock and write ledger rows.

    Outgoing stock is drawn from batches first-expiring-first-out when the product tracks
    batches. Returns the list of StockMovement rows created.
    """
    quantity = Decimal(quantity)
    if not product.track_stock or quantity == 0:
        return []
    business = branch.business
    if allow_negative is None:
        allow_negative = business.allow_negative_stock
    cost = product.cost_price if unit_cost is None else Decimal(unit_cost)

    level, _ = StockLevel.objects.select_for_update().get_or_create(
        business=business, branch=branch, product=product, defaults={"quantity": ZERO}
    )
    if quantity < 0 and level.quantity + quantity < 0 and not allow_negative:
        raise InsufficientStock(
            {"stock": f"Insufficient stock for {product.name}: available {level.quantity.normalize():f}, requested {(-quantity).normalize():f}."}
        )

    movements = []
    balance = level.quantity

    def record(qty, batch=None, row_cost=cost):
        nonlocal balance
        balance += qty
        movements.append(StockMovement(
            business=business, branch=branch, product=product, batch=batch, kind=kind, quantity=qty,
            balance_after=balance, unit_cost=money(row_cost), reference=reference, note=note[:255], user=user,
        ))

    if quantity > 0:
        batch = None
        if product.track_batches or batch_number or expiry_date:
            batch = StockBatch.objects.create(
                business=business, branch=branch, product=product, batch_number=batch_number or "",
                expiry_date=expiry_date, quantity_received=quantity, quantity_remaining=quantity, unit_cost=money(cost),
            )
        record(quantity, batch)
    else:
        remaining = -quantity
        if product.track_batches:
            batches = (StockBatch.objects.select_for_update()
                       .filter(branch=branch, product=product, quantity_remaining__gt=0)
                       .order_by("expiry_date", "received_at", "id"))
            if batch_number:
                batches = batches.filter(batch_number=batch_number)
            for b in batches:
                if remaining <= 0:
                    break
                take = min(b.quantity_remaining, remaining)
                b.quantity_remaining -= take
                b.save(update_fields=["quantity_remaining"])
                record(-take, b, b.unit_cost)
                remaining -= take
        if remaining > 0:
            record(-remaining)

    StockMovement.objects.bulk_create(movements)
    level.quantity = balance
    level.save(update_fields=["quantity"])
    return movements


def update_average_cost(product, incoming_qty, incoming_unit_cost):
    """Weighted average cost across all branches, applied before stock is added."""
    incoming_qty = Decimal(incoming_qty)
    if incoming_qty <= 0:
        return
    on_hand = StockLevel.objects.filter(product=product).aggregate(s=Sum("quantity"))["s"] or ZERO
    on_hand = max(on_hand, ZERO)
    total_qty = on_hand + incoming_qty
    new_cost = (on_hand * product.cost_price + incoming_qty * Decimal(incoming_unit_cost)) / total_qty
    product.cost_price = money(new_cost)
    product.save(update_fields=["cost_price", "updated_at"])
