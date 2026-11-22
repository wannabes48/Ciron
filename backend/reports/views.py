"""Dashboard and analytics. All figures are scoped to the business, optionally to one branch."""
import csv
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.db.models.functions import Coalesce, TruncDate, TruncMonth, TruncWeek, TruncYear
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Product
from core.api import HasPermissionCode
from crm.models import Customer, Supplier
from expenses.models import Expense
from inventory.models import StockBatch, StockLevel, StockMovement
from purchasing.models import GoodsReceipt
from sales.models import Payment, Sale, SaleItem

MONEY = DecimalField(max_digits=18, decimal_places=4)
ZERO = Decimal("0")

# Fraction of a sale line that was not returned.
KEPT = ExpressionWrapper((F("quantity") - F("returned_quantity")) / F("quantity"), output_field=MONEY)
NET_REVENUE = ExpressionWrapper((F("line_total") - F("tax_amount")) * KEPT, output_field=MONEY)
NET_COST = ExpressionWrapper(F("cost_total") * KEPT, output_field=MONEY)
NET_GROSS_SALES = ExpressionWrapper(F("line_total") * KEPT, output_field=MONEY)


def _d(v):
    return (v or ZERO).quantize(Decimal("0.01"))


def day_start(d):
    return timezone.make_aware(datetime.combine(d, time.min))


def parse_range(request, default_days=30):
    today = timezone.localdate()
    try:
        start = datetime.strptime(request.query_params["from"], "%Y-%m-%d").date() if request.query_params.get("from") else today - timedelta(days=default_days - 1)
        end = datetime.strptime(request.query_params["to"], "%Y-%m-%d").date() if request.query_params.get("to") else today
    except ValueError:
        raise ValidationError("Dates must be YYYY-MM-DD.")
    if start > end:
        raise ValidationError("'from' must be before 'to'.")
    return start, end, day_start(start), day_start(end + timedelta(days=1))


def branch_filter(request):
    """?branch=<id> limits to one branch; ?branch=all (default for owners) consolidates."""
    value = request.query_params.get("branch")
    if value and value != "all":
        return int(value)
    if value == "all" or request.user.role in ("owner", "manager", "accountant", "super_admin"):
        return None
    return request.branch.pk if request.branch else None


def scoped(qs, request, branch_field="branch"):
    qs = qs.filter(business=request.business)
    b = branch_filter(request)
    return qs.filter(**{f"{branch_field}_id": b}) if b else qs


def sales_between(request, start_dt, end_dt):
    return scoped(Sale.objects, request).filter(status="completed", completed_at__gte=start_dt, completed_at__lt=end_dt)


def items_between(request, start_dt, end_dt):
    return scoped(SaleItem.objects, request, "sale__branch").filter(
        sale__status="completed", sale__completed_at__gte=start_dt, sale__completed_at__lt=end_dt)


def profit_summary(request, start_dt, end_dt):
    agg = items_between(request, start_dt, end_dt).aggregate(
        sales=Sum(NET_GROSS_SALES), revenue=Sum(NET_REVENUE), cost=Sum(NET_COST))
    expenses = scoped(Expense.objects, request).filter(
        status="approved", date__gte=timezone.localtime(start_dt).date(), date__lt=timezone.localtime(end_dt).date()
    ).aggregate(t=Sum("amount"))["t"] or ZERO
    gross = (agg["revenue"] or ZERO) - (agg["cost"] or ZERO)
    return {"sales": _d(agg["sales"]), "revenue_ex_tax": _d(agg["revenue"]), "cost_of_goods": _d(agg["cost"]),
            "gross_profit": _d(gross), "expenses": _d(expenses), "net_profit": _d(gross - expenses)}


class DashboardView(APIView):
    permission_classes = [HasPermissionCode]
    permission_map = {"get": "dashboard.view"}

    def get(self, request):
        today = timezone.localdate()
        now = timezone.now()
        t0 = day_start(today)
        week0 = day_start(today - timedelta(days=today.weekday()))
        month0 = day_start(today.replace(day=1))
        tomorrow = day_start(today + timedelta(days=1))

        def sales_total(start):
            return _d(items_between(request, start, tomorrow).aggregate(t=Sum(NET_GROSS_SALES))["t"])

        month_profit = profit_summary(request, month0, tomorrow)
        purchases = scoped(GoodsReceipt.objects, request, "order__branch").filter(
            created_at__gte=month0).aggregate(t=Sum("total"))["t"]

        levels = scoped(StockLevel.objects, request).filter(product__track_stock=True, product__is_active=True)
        inventory_value = levels.filter(quantity__gt=0).aggregate(
            v=Sum(F("quantity") * F("product__cost_price"), output_field=MONEY))["v"]
        low = (levels.filter(quantity__gt=0, quantity__lte=F("product__reorder_level"))
               .select_related("product", "branch", "product__unit").order_by("quantity"))
        out_products = Product.objects.filter(business=request.business, is_active=True, track_stock=True).exclude(
            pk__in=levels.filter(quantity__gt=0).values("product"))

        debts = Customer.objects.filter(business=request.business, balance__gt=0)
        overdue = scoped(Sale.objects, request).filter(status="completed", balance__gt=0, due_date__lt=today)

        recent = sales_between(request, now - timedelta(days=30), tomorrow).select_related("customer", "cashier").order_by("-completed_at")[:10]

        best = (items_between(request, month0, tomorrow).values("product", "product_name")
                .annotate(qty=Sum("base_quantity"), revenue=Sum(NET_GROSS_SALES)).order_by("-revenue")[:10])

        start30 = day_start(today - timedelta(days=29))
        daily = {r["d"]: r for r in items_between(request, start30, tomorrow)
                 .annotate(d=TruncDate("sale__completed_at")).values("d")
                 .annotate(retail=Sum(NET_GROSS_SALES, filter=Q(sale__sale_type="retail")),
                           wholesale=Sum(NET_GROSS_SALES, filter=Q(sale__sale_type="wholesale")),
                           profit=Sum(NET_REVENUE) - Sum(NET_COST))}
        chart = []
        for i in range(30):
            d = today - timedelta(days=29 - i)
            r = daily.get(d, {})
            chart.append({"date": d, "retail": _d(r.get("retail")), "wholesale": _d(r.get("wholesale")),
                          "profit": _d(r.get("profit"))})

        split = items_between(request, month0, tomorrow).values("sale__sale_type").annotate(total=Sum(NET_GROSS_SALES))

        def pay_summary(start):
            rows = scoped(Payment.objects, request).filter(created_at__gte=start, status="confirmed") \
                .values("method").annotate(total=Sum("amount"), count=Count("id"))
            return {r["method"]: {"total": _d(r["total"]), "count": r["count"]} for r in rows}

        expiring = scoped(StockBatch.objects, request).filter(
            quantity_remaining__gt=0, expiry_date__isnull=False, expiry_date__lte=today + timedelta(days=30)).count()

        return Response({
            "sales": {"today": sales_total(t0), "week": sales_total(week0), "month": sales_total(month0),
                      "today_count": sales_between(request, t0, tomorrow).count()},
            "month": {**month_profit, "purchases": _d(purchases)},
            "inventory": {
                "value": _d(inventory_value),
                "low_stock_count": low.count(),
                "out_of_stock_count": out_products.count(),
                "expiring_batches": expiring,
                "low_stock": [{"product": l.product_id, "name": l.product.name, "branch": l.branch.name,
                               "quantity": l.quantity, "unit": l.product.unit.abbreviation,
                               "reorder_level": l.product.reorder_level} for l in low[:10]],
                "out_of_stock": list(out_products.values("id", "name")[:10]),
            },
            "receivables": {"total": _d(debts.aggregate(t=Sum("balance"))["t"]), "customers": debts.count(),
                            "overdue": _d(overdue.aggregate(t=Sum("balance"))["t"]), "overdue_count": overdue.count()},
            "payables": {"total": _d(Supplier.objects.filter(business=request.business, balance__gt=0)
                                     .aggregate(t=Sum("balance"))["t"])},
            "recent_sales": [{"id": s.id, "number": s.number, "customer": s.customer.name if s.customer else None,
                              "cashier": str(s.cashier), "total": s.total, "sale_type": s.sale_type,
                              "payment_status": s.payment_status, "completed_at": s.completed_at} for s in recent],
            "best_sellers": [{"product": b["product"], "name": b["product_name"], "quantity": b["qty"],
                              "revenue": _d(b["revenue"])} for b in best],
            "chart": chart,
            "retail_vs_wholesale": {r["sale__sale_type"]: _d(r["total"]) for r in split},
            "payments": {"today": pay_summary(t0), "month": pay_summary(month0)},
        })


GROUPS = {
    "day": ("sale__completed_at", TruncDate),
    "week": ("sale__completed_at", TruncWeek),
    "month": ("sale__completed_at", TruncMonth),
    "year": ("sale__completed_at", TruncYear),
    "product": ("product_name", None),
    "category": ("product__category__name", None),
    "brand": ("product__brand__name", None),
    "cashier": ("sale__cashier__username", None),
    "sale_type": ("sale__sale_type", None),
    "branch": ("sale__branch__name", None),
    "customer": ("sale__customer__name", None),
}


def csv_response(filename, header, rows):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    w = csv.writer(response)
    w.writerow(header)
    w.writerows(rows)
    return response


class SalesReportView(APIView):
    """GET /reports/sales?group=day|week|month|year|product|category|brand|cashier|sale_type|branch|customer|payment_method
    &from=YYYY-MM-DD&to=YYYY-MM-DD&branch=<id|all>&export=csv"""

    permission_classes = [HasPermissionCode]
    permission_map = {"get": "reports.view"}

    def get(self, request):
        group = request.query_params.get("group", "day")
        start, end, sdt, edt = parse_range(request)
        if group == "payment_method":
            rows = (scoped(Payment.objects, request).filter(created_at__gte=sdt, created_at__lt=edt, status="confirmed")
                    .values("method").annotate(total=Sum("amount"), count=Count("id")).order_by("-total"))
            data = [{"key": r["method"], "total": _d(r["total"]), "count": r["count"]} for r in rows]
            if request.query_params.get("export") == "csv":
                return csv_response("sales_by_payment_method.csv", ["method", "total", "count"],
                                    [[r["key"], r["total"], r["count"]] for r in data])
            return Response({"from": start, "to": end, "group": group, "rows": data})
        if group not in GROUPS:
            raise ValidationError(f"Unknown group '{group}'.")
        field, trunc = GROUPS[group]
        qs = items_between(request, sdt, edt)
        qs = qs.annotate(k=trunc(field)) if trunc else qs.annotate(k=F(field))
        rows = (qs.values("k").annotate(qty=Sum("base_quantity"), sales=Sum(NET_GROSS_SALES),
                                        revenue=Sum(NET_REVENUE), cost=Sum(NET_COST),
                                        tax=Sum(F("tax_amount") * KEPT, output_field=MONEY),
                                        discount=Sum(F("discount") + F("allocated_sale_discount")),
                                        transactions=Count("sale", distinct=True))
                .order_by("k" if trunc else "-sales"))
        data = [{"key": r["k"] if r["k"] is not None else "—", "quantity": r["qty"], "sales": _d(r["sales"]),
                 "tax": _d(r["tax"]), "discount": _d(r["discount"]), "cost": _d(r["cost"]),
                 "gross_profit": _d((r["revenue"] or ZERO) - (r["cost"] or ZERO)),
                 "transactions": r["transactions"]} for r in rows]
        totals = {k: _d(sum((d[k] for d in data), ZERO)) for k in ("sales", "tax", "discount", "cost", "gross_profit")}
        returns = scoped(Sale.objects, request).filter(returns__created_at__gte=sdt, returns__created_at__lt=edt) \
            .aggregate(t=Sum("returns__refund_amount"))["t"]
        if request.query_params.get("export") == "csv":
            cols = ["key", "quantity", "sales", "tax", "discount", "cost", "gross_profit", "transactions"]
            return csv_response(f"sales_by_{group}_{start}_{end}.csv", cols, [[d[c] for c in cols] for d in data])
        return Response({"from": start, "to": end, "group": group, "rows": data, "totals": totals,
                         "returns": _d(returns)})


class ProfitLossView(APIView):
    permission_classes = [HasPermissionCode]
    permission_map = {"get": "reports.view"}

    def get(self, request):
        start, end, sdt, edt = parse_range(request)
        summary = profit_summary(request, sdt, edt)
        expenses = scoped(Expense.objects, request).filter(status="approved", date__gte=start, date__lte=end) \
            .values("category__name").annotate(total=Sum("amount")).order_by("-total")
        damaged = scoped(StockMovement.objects, request).filter(kind__in=["damaged", "expired"], created_at__gte=sdt,
                                                                created_at__lt=edt) \
            .aggregate(v=Sum(-F("quantity") * F("unit_cost"), output_field=MONEY))["v"]
        return Response({"from": start, "to": end, **summary, "stock_losses": _d(damaged),
                         "expenses_by_category": [{"category": e["category__name"], "total": e["total"]} for e in expenses]})


class InventoryReportView(APIView):
    """?type=valuation|movement|fast_slow|expired|damaged"""

    permission_classes = [HasPermissionCode]
    permission_map = {"get": "reports.view"}

    def get(self, request):
        kind = request.query_params.get("type", "valuation")
        start, end, sdt, edt = parse_range(request)
        if kind == "valuation":
            rows = (scoped(StockLevel.objects, request).filter(product__track_stock=True)
                    .values("product", "product__name", "product__sku", "product__category__name", "product__unit__abbreviation")
                    .annotate(quantity=Sum("quantity"),
                              cost_value=Sum(F("quantity") * F("product__cost_price"), output_field=MONEY),
                              retail_value=Sum(F("quantity") * F("product__retail_price"), output_field=MONEY))
                    .order_by("-cost_value"))
            data = [{"product": r["product"], "name": r["product__name"], "sku": r["product__sku"],
                     "category": r["product__category__name"], "unit": r["product__unit__abbreviation"],
                     "quantity": r["quantity"], "cost_value": _d(r["cost_value"]), "retail_value": _d(r["retail_value"])}
                    for r in rows]
        elif kind == "fast_slow":
            sold = dict(scoped(StockMovement.objects, request).filter(kind="sale", created_at__gte=sdt, created_at__lt=edt)
                        .values("product").annotate(q=Sum("quantity")).values_list("product", "q"))
            days = (end - start).days + 1
            data = []
            for p in Product.objects.filter(business=request.business, is_active=True, track_stock=True).select_related("unit"):
                qty = -(sold.get(p.pk) or ZERO)
                data.append({"product": p.pk, "name": p.name, "unit": p.unit.abbreviation, "sold": qty,
                             "per_day": round(qty / days, 2)})
            data.sort(key=lambda r: -r["sold"])
            for i, r in enumerate(data):
                r["class"] = "fast" if i < max(1, len(data) // 5) and r["sold"] > 0 else ("dead" if r["sold"] == 0 else "slow" if i >= len(data) * 0.8 else "normal")
        elif kind in ("damaged", "expired", "movement"):
            qs = scoped(StockMovement.objects, request).filter(created_at__gte=sdt, created_at__lt=edt)
            if kind != "movement":
                qs = qs.filter(kind=kind)
            data = [{"date": m.created_at, "product": m.product.name, "branch": m.branch.name, "kind": m.get_kind_display(),
                     "quantity": m.quantity, "balance_after": m.balance_after, "value": _d(m.quantity * m.unit_cost),
                     "reference": m.reference, "note": m.note, "user": str(m.user) if m.user else None}
                    for m in qs.select_related("product", "branch", "user")[:2000]]
        else:
            raise ValidationError("Unknown report type.")
        if request.query_params.get("export") == "csv" and data:
            cols = list(data[0].keys())
            return csv_response(f"inventory_{kind}.csv", cols, [[r[c] for c in cols] for r in data])
        return Response({"type": kind, "from": start, "to": end, "rows": data})


class CashierReconciliationView(APIView):
    """Per-cashier payment totals for a day — for end-of-day cash-up."""

    permission_classes = [HasPermissionCode]
    permission_map = {"get": "reports.view"}

    def get(self, request):
        start, end, sdt, edt = parse_range(request, default_days=1)
        rows = (scoped(Payment.objects, request).filter(created_at__gte=sdt, created_at__lt=edt, status="confirmed")
                .values("received_by", "received_by__username", "received_by__full_name", "method")
                .annotate(total=Sum("amount"), count=Count("id")))
        out = {}
        for r in rows:
            u = out.setdefault(r["received_by"], {"user": r["received_by"],
                                                  "name": r["received_by__full_name"] or r["received_by__username"],
                                                  "methods": {}, "total": ZERO})
            u["methods"][r["method"]] = {"total": _d(r["total"]), "count": r["count"]}
            u["total"] += r["total"]
        return Response({"from": start, "to": end, "cashiers": list(out.values())})
