"""POS business logic: checkout, hold/resume, quotations, voids, returns and debt payments."""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.models import Shift
from catalog.pricing import money, product_tax_rate, quote_price, split_tax
from core.models import AuditLog, Counter
from crm.models import Customer
from inventory.services import move_stock

from .models import Payment, Sale, SaleItem, SaleReturn, SaleReturnItem

ZERO = Decimal("0")


def _require(user, code):
    if not user.has_code(code):
        raise PermissionDenied(f"Missing permission: {code}")


def open_shift_for(user, branch):
    return Shift.objects.filter(user=user, branch=branch, closed_at__isnull=True).first()


def price_lines(*, business, user, customer, sale_type, items, sale_discount=ZERO):
    """Price every cart line and allocate the sale-level discount. Pure: writes nothing."""
    if not items:
        raise ValidationError({"items": "The cart is empty."})
    inclusive = business.prices_include_vat
    lines = []
    for idx, item in enumerate(items):
        product, unit = item["product"], item.get("unit")
        qty = Decimal(item["quantity"])
        if qty <= 0:
            raise ValidationError({"items": f"Line {idx + 1}: quantity must be positive."})
        if unit is not None and unit.product_id != product.pk:
            raise ValidationError({"items": f"Line {idx + 1}: unit does not belong to {product.name}."})
        if not product.unit.allows_decimal and unit is None and qty != qty.to_integral_value():
            raise ValidationError({"items": f"{product.name} is sold in whole {product.unit.name}s only."})

        q = quote_price(product, qty, unit=unit, customer=customer, sale_type=sale_type)
        price, rule = q.unit_price, q.rule
        override = item.get("unit_price")
        if override is not None and money(override) != price:
            if money(override) < price:
                _require(user, "sales.override_price")
            price, rule = money(override), "manual"

        gross = money(price * qty)
        discount = money(item.get("discount") or ZERO)
        if discount:
            _require(user, "sales.discount")
        if customer is not None and customer.discount_percent:
            discount += money(gross * customer.discount_percent / 100)
        discount = min(discount, gross)
        net = gross - discount

        if q.min_unit_price is not None and net < money(q.min_unit_price * qty) and not user.has_code("sales.override_price"):
            raise ValidationError({"items": f"{product.name} cannot be sold below KSh {q.min_unit_price} per {unit.name if unit else product.unit.name}."})

        lines.append(dict(product=product, unit=unit, quantity=qty, base_quantity=q.base_quantity, unit_price=price,
                          rule=rule, gross=gross, discount=discount, net=net, tax_rate=product_tax_rate(product, business)))

    sale_discount = money(sale_discount or ZERO)
    net_total = sum((l["net"] for l in lines), ZERO)
    if sale_discount:
        _require(user, "sales.discount")
        sale_discount = min(sale_discount, net_total)
    remaining = sale_discount
    for i, l in enumerate(lines):
        share = remaining if i == len(lines) - 1 else (money(sale_discount * l["net"] / net_total) if net_total else ZERO)
        share = min(share, l["net"])
        remaining -= share
        l["allocated"] = share
        payable = l["net"] - share
        _, tax = split_tax(payable, l["tax_rate"], inclusive)
        l["tax"] = tax
        l["line_total"] = payable if inclusive else payable + tax

    totals = dict(
        subtotal=sum((l["gross"] for l in lines), ZERO),
        discount_total=sum((l["discount"] for l in lines), ZERO) + sale_discount,
        sale_discount=sale_discount,
        tax_total=sum((l["tax"] for l in lines), ZERO),
        total=sum((l["line_total"] for l in lines), ZERO),
    )
    return lines, totals


@transaction.atomic
def checkout(*, business, branch, user, data, request=None):
    action = data.get("action", "complete")
    customer = data.get("customer")
    if customer is not None:
        customer = Customer.objects.select_for_update().get(pk=customer.pk)
    sale_type = data.get("sale_type") or ("wholesale" if customer and customer.category != "retail" else "retail")

    lines, totals = price_lines(business=business, user=user, customer=customer, sale_type=sale_type,
                                items=data["items"], sale_discount=data.get("sale_discount"))

    sale = data.get("sale")
    if sale is not None:
        sale = Sale.objects.select_for_update().get(pk=sale.pk)
        if sale.status not in ("held", "quotation"):
            raise ValidationError({"sale": "Only held sales or quotations can be resumed."})
        sale.items.all().delete()
    else:
        sale = Sale(business=business, branch=branch, cashier=user)

    sale.customer = customer
    sale.sale_type = sale_type
    sale.salesperson = data.get("salesperson")
    sale.notes = data.get("notes", "")
    for k, v in totals.items():
        setattr(sale, k, v)

    if action in ("hold", "quotation"):
        sale.status = "held" if action == "hold" else "quotation"
        sale.hold_label = data.get("hold_label", "")
        if action == "quotation":
            sale.valid_until = data.get("valid_until") or (timezone.localdate() + timedelta(days=14))
        if not sale.number or not sale.number.startswith("QT" if action == "quotation" else "H"):
            sale.number = Counter.next(business, "QT" if action == "quotation" else "H")
        sale.save()
        _save_items(sale, lines)
        return sale

    _require(user, "pos.sell")
    # --- payments ---------------------------------------------------------
    payments = data.get("payments") or []
    allowed = set(business.payment_methods)
    for p in payments:
        if p["method"] not in allowed:
            raise ValidationError({"payments": f"Payment method '{p['method']}' is not enabled."})
        if Decimal(p["amount"]) <= 0:
            raise ValidationError({"payments": "Payment amounts must be positive."})
        if p["method"] == "mpesa" and not p.get("reference"):
            raise ValidationError({"payments": "Enter the M-Pesa transaction code."})
    total = totals["total"]
    tendered = sum((Decimal(p["amount"]) for p in payments), ZERO)
    non_cash = sum((Decimal(p["amount"]) for p in payments if p["method"] != "cash"), ZERO)
    if non_cash > total:
        raise ValidationError({"payments": "Non-cash payments exceed the sale total; change can only be given from cash."})
    change = max(tendered - total, ZERO)
    paid = tendered - change
    balance = total - paid

    if balance > 0:
        if customer is None:
            raise ValidationError({"payments": f"KSh {balance} is unpaid. Select a customer to sell on credit."})
        _require(user, "sales.credit")
        if customer.credit_limit <= 0:
            raise ValidationError({"payments": f"{customer.name} has no credit facility."})
        if customer.balance + balance > customer.credit_limit:
            available = max(customer.credit_limit - customer.balance, ZERO)
            raise ValidationError({"payments": f"Credit limit exceeded. Available credit: KSh {available}."})
        sale.due_date = data.get("due_date") or (timezone.localdate() + timedelta(days=customer.payment_terms_days))

    now = timezone.now()
    sale.status = "completed"
    sale.number = Counter.next(business, "S")
    sale.amount_paid = paid
    sale.change_given = change
    sale.balance = balance
    sale.completed_at = now
    sale.created_at = now
    sale.cashier = user
    sale.branch = branch
    sale.shift = open_shift_for(user, branch)
    sale.save()

    items = _save_items(sale, lines)
    cost_total = ZERO
    for item in items:
        moves = move_stock(branch=branch, product=item.product, quantity=-item.base_quantity, kind="sale",
                           user=user, reference=sale.number)
        cost = sum((-m.quantity * m.unit_cost for m in moves), ZERO) if moves else item.product.cost_price * item.base_quantity
        item.cost_total = money(cost)
        cost_total += item.cost_total
        item.save(update_fields=["cost_total"])
    sale.cost_total = cost_total
    sale.save(update_fields=["cost_total"])

    cash_left_for_change = change
    for p in payments:
        amount = Decimal(p["amount"])
        if p["method"] == "cash" and cash_left_for_change:
            used = min(amount, cash_left_for_change)
            amount -= used
            cash_left_for_change -= used
        if amount > 0:
            Payment.objects.create(business=business, sale=sale, customer=customer, branch=branch, shift=sale.shift,
                                   kind="sale", method=p["method"], amount=amount, reference=p.get("reference", ""),
                                   phone=p.get("phone", ""), received_by=user, created_at=now)

    if customer is not None:
        customer.balance += balance
        if business.loyalty_points_per_100:
            customer.loyalty_points += money(paid / 100 * business.loyalty_points_per_100)
        customer.save(update_fields=["balance", "loyalty_points"])

    AuditLog.log(business, user, "sale.completed", sale, request, total=total, credit=balance)
    return sale


def _save_items(sale, lines):
    items = [
        SaleItem(business=sale.business, sale=sale, product=l["product"], unit=l["unit"],
                 unit_name=l["unit"].name if l["unit"] else l["product"].unit.abbreviation,
                 product_name=l["product"].name, quantity=l["quantity"], base_quantity=l["base_quantity"],
                 unit_price=l["unit_price"], price_rule=l["rule"], discount=l["discount"],
                 allocated_sale_discount=l["allocated"], tax_rate=l["tax_rate"], tax_amount=l["tax"],
                 line_total=l["line_total"])
        for l in lines
    ]
    for i in items:
        i.save()
    return items


@transaction.atomic
def void_sale(*, sale, user, reason, request=None):
    _require(user, "sales.void")
    sale = Sale.objects.select_for_update().get(pk=sale.pk)
    if sale.status in ("held", "quotation"):
        sale.status = "voided"
        sale.voided_reason = reason
        sale.save(update_fields=["status", "voided_reason"])
        return sale
    if sale.status != "completed":
        raise ValidationError("Only completed sales can be voided.")
    if sale.returns.exists():
        raise ValidationError("This sale has returns; process a return instead of voiding.")
    for item in sale.items.select_related("product"):
        unit_cost = item.cost_total / item.base_quantity if item.base_quantity else None
        move_stock(branch=sale.branch, product=item.product, quantity=item.base_quantity, kind="sale_return",
                   user=user, reference=sale.number, unit_cost=unit_cost, note=f"Void: {reason}", allow_negative=True)
    for p in sale.payments.filter(kind="sale"):
        Payment.objects.create(business=sale.business, sale=sale, customer=sale.customer, branch=sale.branch,
                               shift=open_shift_for(user, sale.branch), kind="refund", method=p.method,
                               amount=-p.amount, reference=p.reference, received_by=user)
    if sale.customer_id and sale.balance:
        Customer.objects.filter(pk=sale.customer_id).update(balance=F("balance") - sale.balance)
    sale.status = "voided"
    sale.voided_reason = reason
    sale.balance = ZERO
    sale.save(update_fields=["status", "voided_reason", "balance"])
    AuditLog.log(sale.business, user, "sale.voided", sale, request, reason=reason)
    return sale


@transaction.atomic
def process_return(*, sale, user, items, refund_method, reason, request=None):
    """items: [{"sale_item": SaleItem, "quantity": Decimal, "restock": bool}]"""
    _require(user, "sales.refund")
    sale = Sale.objects.select_for_update().get(pk=sale.pk)
    if sale.status != "completed":
        raise ValidationError("Only completed sales can be returned.")
    if not items:
        raise ValidationError({"items": "Select at least one item to return."})
    if refund_method == "credit" and not sale.customer_id:
        raise ValidationError({"refund_method": "Store credit requires a customer on the sale."})

    ret = SaleReturn.objects.create(business=sale.business, number=Counter.next(sale.business, "RT"), sale=sale,
                                    branch=sale.branch, reason=reason, refund_method=refund_method, processed_by=user)
    total = ZERO
    for row in items:
        item = SaleItem.objects.select_for_update().get(pk=row["sale_item"].pk, sale=sale)
        qty = Decimal(row["quantity"])
        returnable = item.quantity - item.returned_quantity
        if qty <= 0 or qty > returnable:
            raise ValidationError({"items": f"{item.product_name}: can return at most {returnable.normalize():f}."})
        amount = money(item.line_total * qty / item.quantity)
        base_qty = item.base_quantity * qty / item.quantity
        unit_cost = item.cost_total / item.base_quantity if item.base_quantity else None
        move_stock(branch=sale.branch, product=item.product, quantity=base_qty, kind="sale_return", user=user,
                   reference=ret.number, unit_cost=unit_cost, note=reason)
        if not row.get("restock", True):
            move_stock(branch=sale.branch, product=item.product, quantity=-base_qty, kind="damaged", user=user,
                       reference=ret.number, unit_cost=unit_cost, note=f"Returned damaged: {reason}", allow_negative=True)
        item.returned_quantity += qty
        item.save(update_fields=["returned_quantity"])
        SaleReturnItem.objects.create(business=sale.business, sale_return=ret, sale_item=item, quantity=qty,
                                      amount=amount, restock=row.get("restock", True))
        total += amount

    # Returned value first cancels any unpaid balance on the sale, the rest is refunded.
    against_balance = min(sale.balance, total)
    cash_refund = total - against_balance
    sale.balance -= against_balance
    sale.refunded_total += total
    sale.save(update_fields=["balance", "refunded_total"])
    if sale.customer_id:
        credit_delta = against_balance + (cash_refund if refund_method == "credit" else ZERO)
        if credit_delta:
            Customer.objects.filter(pk=sale.customer_id).update(balance=F("balance") - credit_delta)
    if cash_refund and refund_method != "credit":
        Payment.objects.create(business=sale.business, sale=sale, customer=sale.customer, branch=sale.branch,
                               shift=open_shift_for(user, sale.branch), kind="refund", method=refund_method,
                               amount=-cash_refund, reference=ret.number, received_by=user)
    ret.refund_amount = total
    ret.save(update_fields=["refund_amount"])
    AuditLog.log(sale.business, user, "sale.returned", sale, request, amount=total, return_number=ret.number)
    return ret


@transaction.atomic
def receive_debt_payment(*, customer, branch, user, amount, method, reference="", request=None):
    """Apply a customer's repayment to their oldest unpaid credit sales first."""
    if not (user.has_code("payments.manage") or user.has_code("pos.sell")):
        raise PermissionDenied("Missing permission: payments.manage")
    amount = money(amount)
    if amount <= 0:
        raise ValidationError({"amount": "Amount must be positive."})
    if method == "mpesa" and not reference:
        raise ValidationError({"reference": "Enter the M-Pesa transaction code."})
    customer = Customer.objects.select_for_update().get(pk=customer.pk)
    shift = open_shift_for(user, branch)
    remaining = amount
    allocations = []
    for sale in Sale.objects.select_for_update().filter(customer=customer, status="completed", balance__gt=0).order_by("created_at"):
        if remaining <= 0:
            break
        applied = min(sale.balance, remaining)
        sale.balance -= applied
        sale.amount_paid += applied
        sale.save(update_fields=["balance", "amount_paid"])
        Payment.objects.create(business=customer.business, sale=sale, customer=customer, branch=branch, shift=shift,
                               kind="debt", method=method, amount=applied, reference=reference, received_by=user)
        allocations.append({"sale": sale.number, "amount": applied})
        remaining -= applied
    if remaining > 0:  # advance payment / overpayment held on account
        Payment.objects.create(business=customer.business, customer=customer, branch=branch, shift=shift,
                               kind="debt", method=method, amount=remaining, reference=reference, received_by=user)
    customer.balance -= amount
    customer.save(update_fields=["balance"])
    AuditLog.log(customer.business, user, "customer.payment", customer, request, amount=amount, method=method)
    return {"customer_balance": customer.balance, "allocations": allocations, "unallocated": remaining}
