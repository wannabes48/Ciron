from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.pricing import money
from core.models import AuditLog, Counter
from crm.models import Supplier, SupplierPayment, SupplierProduct
from inventory.services import move_stock, update_average_cost

from .models import GoodsReceipt, GoodsReceiptItem, PurchaseOrder, PurchaseOrderItem

ZERO = Decimal("0")


@transaction.atomic
def receive_goods(*, order, user, lines, supplier_invoice_number="", additional_costs=ZERO, request=None):
    """lines: [{"item": PurchaseOrderItem, "quantity": Decimal, "batch_number": str, "expiry_date": date}]

    Supports partial receiving. Additional costs (transport...) are spread over the received
    lines in proportion to value, so product cost reflects landed cost.
    """
    order = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
    if order.status in ("received", "cancelled"):
        raise ValidationError(f"Purchase order is {order.get_status_display().lower()}.")
    lines = [l for l in lines if Decimal(l["quantity"]) > 0]
    if not lines:
        raise ValidationError({"lines": "Enter at least one received quantity."})

    additional_costs = money(additional_costs or ZERO)
    goods_value = sum((Decimal(l["quantity"]) * l["item"].unit_cost for l in lines), ZERO)
    receipt = GoodsReceipt.objects.create(business=order.business, number=Counter.next(order.business, "GRN"),
                                          order=order, supplier_invoice_number=supplier_invoice_number,
                                          additional_costs=additional_costs, received_by=user)
    for l in lines:
        item = PurchaseOrderItem.objects.select_for_update().get(pk=l["item"].pk, order=order)
        qty = Decimal(l["quantity"])
        line_value = qty * item.unit_cost
        extra = (additional_costs * line_value / goods_value) if goods_value else ZERO
        base_qty = qty * item.factor
        landed_unit_cost = (line_value + extra) / base_qty
        update_average_cost(item.product, base_qty, landed_unit_cost)
        move_stock(branch=order.branch, product=item.product, quantity=base_qty, kind="purchase", user=user,
                   reference=order.number, unit_cost=landed_unit_cost, batch_number=l.get("batch_number", ""),
                   expiry_date=l.get("expiry_date"), note=f"{receipt.number} {supplier_invoice_number}".strip())
        item.received_quantity += qty
        item.save(update_fields=["received_quantity"])
        GoodsReceiptItem.objects.create(business=order.business, receipt=receipt, order_item=item, quantity=qty,
                                        batch_number=l.get("batch_number", ""), expiry_date=l.get("expiry_date"))
        SupplierProduct.objects.update_or_create(business=order.business, supplier=order.supplier, product=item.product,
                                                 defaults={"last_cost": money(item.unit_cost / item.factor)})

    receipt_total = money(goods_value + additional_costs)
    receipt.total = receipt_total
    receipt.save(update_fields=["total"])
    order.total_received += receipt_total
    order.additional_costs += additional_costs
    if supplier_invoice_number:
        order.supplier_invoice_number = supplier_invoice_number
    fully = all(i.received_quantity >= i.quantity for i in order.items.all())
    order.status = "received" if fully else "partial"
    order.save()
    Supplier.objects.filter(pk=order.supplier_id).update(balance=F("balance") + receipt_total)
    AuditLog.log(order.business, user, "purchase.received", order, request, receipt=receipt.number, total=receipt_total)
    return receipt


@transaction.atomic
def return_to_supplier(*, order, user, lines, reason, request=None):
    """lines: [{"item": PurchaseOrderItem, "quantity": Decimal}] — quantities in the ordered unit."""
    order = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
    total = ZERO
    for l in lines:
        item = PurchaseOrderItem.objects.select_for_update().get(pk=l["item"].pk, order=order)
        qty = Decimal(l["quantity"])
        if qty <= 0:
            continue
        if qty > item.received_quantity - item.returned_quantity:
            raise ValidationError({"lines": f"{item.product.name}: cannot return more than was received."})
        move_stock(branch=order.branch, product=item.product, quantity=-(qty * item.factor), kind="purchase_return",
                   user=user, reference=order.number, unit_cost=item.unit_cost / item.factor, note=reason)
        item.returned_quantity += qty
        item.save(update_fields=["returned_quantity"])
        total += money(qty * item.unit_cost)
    order.returned_total += total
    order.save(update_fields=["returned_total"])
    Supplier.objects.filter(pk=order.supplier_id).update(balance=F("balance") - total)
    AuditLog.log(order.business, user, "purchase.returned", order, request, total=total, reason=reason)
    return total


@transaction.atomic
def pay_supplier(*, supplier, user, amount, method, reference="", order=None, note="", request=None):
    amount = money(amount)
    if amount <= 0:
        raise ValidationError({"amount": "Amount must be positive."})
    payment = SupplierPayment.objects.create(business=supplier.business, supplier=supplier, purchase_order=order,
                                             amount=amount, method=method, reference=reference, note=note, paid_by=user)
    if order is not None:
        PurchaseOrder.objects.filter(pk=order.pk).update(amount_paid=F("amount_paid") + amount)
    Supplier.objects.filter(pk=supplier.pk).update(balance=F("balance") - amount)
    AuditLog.log(supplier.business, user, "supplier.payment", supplier, request, amount=amount, method=method)
    return payment


def submit_order(order, user):
    if order.status != "draft":
        raise ValidationError("Only draft orders can be submitted.")
    if not order.items.exists():
        raise ValidationError("Add products to the order first.")
    order.status = "ordered"
    order.submitted_at = timezone.now()
    order.save(update_fields=["status", "submitted_at"])
    return order
