"""End-to-end API tests for the core business flows."""
from decimal import Decimal as D

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from catalog.models import Product, Unit
from crm.models import Customer, Supplier
from inventory.models import StockLevel, StockMovement


class Base(TestCase):
    def register(self, sub="duka", username="owner"):
        c = APIClient()
        r = c.post("/api/auth/register/", {"business_name": f"{sub} shop", "subdomain": sub, "owner_name": "Owner",
                                           "username": username, "password": "secret123"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        return c, r.data

    def setUp(self):
        cache.clear()  # reset auth throttling between tests
        self.c, data = self.register()
        self.business_id = data["business"]["id"]
        self.branch_id = data["branches"][0]["id"]
        self.pcs = Unit.objects.get(business_id=self.business_id, abbreviation="pcs").pk

    def product(self, **kw):
        body = {"name": "Cooking oil 1L", "unit": self.pcs, "retail_price": "320", "wholesale_price": "290",
                "cost_price": "250", "opening_stock": "100"}
        body.update(kw)
        r = self.c.post("/api/products/", body, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def stock(self, pid):
        return StockLevel.objects.get(product_id=pid, branch_id=self.branch_id).quantity

    def checkout(self, items, payments=(), expect=201, **kw):
        r = self.c.post("/api/sales/checkout/", {"items": items, "payments": list(payments), **kw}, format="json")
        self.assertEqual(r.status_code, expect, r.data)
        return r.data


class OnboardingAndTenancyTests(Base):
    def test_login_requires_matching_business(self):
        anon = APIClient()
        ok = anon.post("/api/auth/login/", {"business": "duka", "username": "owner", "password": "secret123"}, format="json")
        self.assertEqual(ok.status_code, 200)
        bad = anon.post("/api/auth/login/", {"business": "other", "username": "owner", "password": "secret123"}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_subdomain_login(self):
        r = APIClient().post("/api/auth/login/", {"username": "owner", "password": "secret123"}, format="json",
                             HTTP_HOST="duka.ciron.local")
        self.assertEqual(r.status_code, 200, r.data)

    def test_tenants_are_isolated(self):
        p = self.product()
        other, _ = self.register("other", "boss")
        self.assertEqual(other.get("/api/products/").data["count"], 0)
        self.assertEqual(other.get(f"/api/products/{p['id']}/").status_code, 404)
        # cannot sell another tenant's product
        r = other.post("/api/sales/checkout/", {"items": [{"product": p["id"], "quantity": 1}],
                                                "payments": [{"method": "cash", "amount": 500}]}, format="json")
        self.assertEqual(r.status_code, 400)
        # token for one shop is rejected on another shop's subdomain
        self.assertEqual(other.get("/api/products/", HTTP_HOST="duka.ciron.local").status_code, 403)

    def test_cashier_permissions(self):
        self.c.post("/api/users/", {"username": "jane", "password": "secret123", "role": "cashier"}, format="json")
        cashier = APIClient()
        tok = cashier.post("/api/auth/login/", {"business": "duka", "username": "jane", "password": "secret123"}, format="json").data
        cashier.credentials(HTTP_AUTHORIZATION=f"Bearer {tok['access']}")
        self.assertEqual(cashier.get("/api/products/").status_code, 200)
        self.assertEqual(cashier.post("/api/products/", {"name": "x"}, format="json").status_code, 403)
        self.assertEqual(cashier.get("/api/reports/dashboard/").status_code, 403)
        self.assertEqual(cashier.get("/api/users/").status_code, 403)


class PricingTests(Base):
    def test_retail_wholesale_tiers_units_and_customer_prices(self):
        p = self.product(name="Soda", retail_price="100", wholesale_price="85", wholesale_min_qty="24",
                         units=[{"name": "Crate", "factor": "24", "retail_price": "2200", "wholesale_price": "2000"}],
                         price_tiers=[{"min_quantity": "10", "price": "90"}, {"min_quantity": "50", "price": "85"},
                                      {"min_quantity": "100", "price": "80"}])
        crate = p["units"][0]["id"]

        def preview(items, **kw):
            r = self.c.post("/api/sales/price_preview/", {"items": items, **kw}, format="json")
            self.assertEqual(r.status_code, 200, r.data)
            return r.data["lines"][0]

        self.assertEqual(preview([{"product": p["id"], "quantity": 5}])["unit_price"], D("100"))
        self.assertEqual(preview([{"product": p["id"], "quantity": 10}])["unit_price"], D("90"))
        self.assertEqual(preview([{"product": p["id"], "quantity": 120}])["unit_price"], D("80"))
        # 2 crates = 48 bottles >= wholesale_min_qty (24) -> wholesale crate price kicks in automatically
        line = preview([{"product": p["id"], "unit": crate, "quantity": 2}])
        self.assertEqual((line["unit_price"], line["base_quantity"], line["rule"]), (D("2000"), D("48"), "wholesale"))
        self.assertEqual(preview([{"product": p["id"], "quantity": 23}])["rule"], "tier")

        wholesale = Customer.objects.create(business_id=self.business_id, name="Mama Mboga", category="wholesale")
        line = preview([{"product": p["id"], "unit": crate, "quantity": 1}], customer=wholesale.pk)
        self.assertEqual((line["unit_price"], line["rule"]), (D("2000"), "wholesale"))

        self.c.post("/api/customer-prices/", {"customer": wholesale.pk, "product": p["id"], "price": "78"}, format="json")
        self.assertEqual(preview([{"product": p["id"], "quantity": 1}], customer=wholesale.pk)["unit_price"], D("78"))

    def test_minimum_price_enforced_for_cashier(self):
        p = self.product(min_price="300")
        self.c.post("/api/users/", {"username": "c1", "password": "secret123", "role": "cashier",
                                    "extra_permissions": ["sales.discount"]}, format="json")
        cashier = APIClient()
        tok = cashier.post("/api/auth/login/", {"business": "duka", "username": "c1", "password": "secret123"}, format="json").data
        cashier.credentials(HTTP_AUTHORIZATION=f"Bearer {tok['access']}")
        r = cashier.post("/api/sales/checkout/", {"items": [{"product": p["id"], "quantity": 1, "discount": "50"}],
                                                  "payments": [{"method": "cash", "amount": 300}]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("below", str(r.data))


class CheckoutTests(Base):
    def test_pos_catalog_grid(self):
        cat = self.c.post("/api/categories/", {"name": "Drinks"}, format="json").data["id"]
        soda = self.product(name="Soda", category=cat)
        oil = self.product(name="Cooking oil")
        hidden = self.product(name="Old stock")
        self.c.patch(f"/api/products/{hidden['id']}/", {"is_active": False}, format="json")
        r = self.c.get("/api/products/pos_catalog/").data
        self.assertEqual([p["name"] for p in r["results"]], ["Cooking oil", "Soda"])  # active only, by name
        self.assertEqual(r["categories"], [{"id": cat, "name": "Drinks", "count": 1}])
        self.assertEqual(r["uncategorised"], 1)
        self.assertEqual([p["id"] for p in self.c.get(f"/api/products/pos_catalog/?category={cat}").data["results"]], [soda["id"]])
        self.assertEqual(self.c.get("/api/products/pos_catalog/?category=top").data["results"], [])
        self.checkout([{"product": oil["id"], "quantity": 1}], [{"method": "cash", "amount": 500}])
        top = self.c.get("/api/products/pos_catalog/?category=top").data["results"]
        self.assertEqual([p["id"] for p in top], [oil["id"]])
        self.assertEqual(top[0]["stock"], D("99"))

    def test_cash_sale_change_stock_and_vat(self):
        self.c.patch("/api/settings/", {"vat_registered": True}, format="json")
        p = self.product()
        sale = self.checkout([{"product": p["id"], "quantity": 3}], [{"method": "cash", "amount": 1000}])
        self.assertEqual(sale["total"], D("960.00"))
        self.assertEqual(sale["change_given"], D("40.00"))
        self.assertEqual(sale["tax_total"], D("132.41"))  # 960 * 16/116, VAT-inclusive
        self.assertEqual(self.stock(p["id"]), D("97"))
        mv = StockMovement.objects.filter(product_id=p["id"], kind="sale").get()
        self.assertEqual((mv.quantity, mv.balance_after, mv.reference), (D("-3"), D("97"), sale["number"]))
        self.assertEqual(sale["payments"][0]["amount"], D("960.00"))

    def test_split_payment_mpesa_requires_code(self):
        p = self.product()
        self.checkout([{"product": p["id"], "quantity": 1}], [{"method": "mpesa", "amount": 320}], expect=400)
        sale = self.checkout([{"product": p["id"], "quantity": 2}],
                             [{"method": "mpesa", "amount": 400, "reference": "SKD12XYZ9"}, {"method": "cash", "amount": 300}])
        self.assertEqual((sale["amount_paid"], sale["change_given"]), (D("640.00"), D("60.00")))

    def test_insufficient_stock_blocks_sale(self):
        p = self.product(opening_stock="2")
        self.checkout([{"product": p["id"], "quantity": 3}], [{"method": "cash", "amount": 2000}], expect=400)
        self.assertEqual(self.stock(p["id"]), D("2"))

    def test_carton_sale_deducts_base_units(self):
        p = self.product(units=[{"name": "Carton", "factor": "12", "retail_price": "3600"}])
        self.checkout([{"product": p["id"], "unit": p["units"][0]["id"], "quantity": 2}], [{"method": "cash", "amount": 7200}])
        self.assertEqual(self.stock(p["id"]), D("76"))

    def test_credit_sale_limit_and_debt_payment(self):
        p = self.product()
        cust = self.c.post("/api/customers/", {"name": "Otieno", "credit_limit": "1000", "category": "retail"}, format="json").data
        self.checkout([{"product": p["id"], "quantity": 4}], [{"method": "cash", "amount": 200}], customer=cust["id"],
                      expect=400)  # 1080 owed > 1000 limit
        s1 = self.checkout([{"product": p["id"], "quantity": 2}], [{"method": "cash", "amount": 100}], customer=cust["id"])
        self.assertEqual(s1["balance"], D("540.00"))
        s2 = self.checkout([{"product": p["id"], "quantity": 1}], [], customer=cust["id"])
        self.assertEqual(Customer.objects.get(pk=cust["id"]).balance, D("860.00"))
        r = self.c.post(f"/api/customers/{cust['id']}/receive_payment/",
                        {"amount": "600", "method": "mpesa", "reference": "QWE123"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["customer_balance"], D("260.00"))
        self.assertEqual([a["sale"] for a in r.data["allocations"]], [s1["number"], s2["number"]])

    def test_hold_and_resume(self):
        p = self.product()
        held = self.checkout([{"product": p["id"], "quantity": 1}], action="hold", hold_label="Customer in blue")
        self.assertEqual(held["status"], "held")
        self.assertEqual(self.stock(p["id"]), D("100"))
        self.assertEqual(len(self.c.get("/api/sales/held/").data), 1)
        done = self.checkout([{"product": p["id"], "quantity": 2}], [{"method": "cash", "amount": 640}], sale=held["id"])
        self.assertEqual((done["id"], done["status"]), (held["id"], "completed"))
        self.assertTrue(done["number"].startswith("S-"))
        self.assertEqual(self.stock(p["id"]), D("98"))

    def test_partial_return_and_void(self):
        p = self.product()
        sale = self.checkout([{"product": p["id"], "quantity": 5}], [{"method": "cash", "amount": 1600}])
        item = sale["items"][0]["id"]
        r = self.c.post(f"/api/sales/{sale['id']}/return/", {"items": [{"sale_item": item, "quantity": 2}],
                                                              "refund_method": "cash", "reason": "Leaking"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["refund_amount"], D("640.00"))
        self.assertEqual(self.stock(p["id"]), D("97"))
        over = self.c.post(f"/api/sales/{sale['id']}/return/", {"items": [{"sale_item": item, "quantity": 4}],
                                                                 "refund_method": "cash", "reason": "x"}, format="json")
        self.assertEqual(over.status_code, 400)
        # damaged return: back in, then written off
        self.c.post(f"/api/sales/{sale['id']}/return/", {"items": [{"sale_item": item, "quantity": 1, "restock": False}],
                                                          "refund_method": "cash", "reason": "Broken"}, format="json")
        self.assertEqual(self.stock(p["id"]), D("97"))
        s2 = self.checkout([{"product": p["id"], "quantity": 1}], [{"method": "cash", "amount": 320}])
        self.assertEqual(self.c.post(f"/api/sales/{s2['id']}/void/", {"reason": "Wrong item"}, format="json").status_code, 200)
        self.assertEqual(self.stock(p["id"]), D("97"))


class PurchasingTests(Base):
    def test_partial_receive_updates_stock_cost_and_supplier_balance(self):
        p = self.product(cost_price="250", opening_stock="0",
                         units=[{"name": "Carton", "factor": "12"}])
        sup = Supplier.objects.create(business_id=self.business_id, name="Bidco")
        po = self.c.post("/api/purchase-orders/", {"supplier": sup.pk, "items": [
            {"product": p["id"], "unit": p["units"][0]["id"], "quantity": "10", "unit_cost": "3120"}]}, format="json").data
        self.assertEqual(po["total_ordered"], D("31200.00"))
        self.c.post(f"/api/purchase-orders/{po['id']}/submit/")
        r = self.c.post(f"/api/purchase-orders/{po['id']}/receive/", {
            "lines": [{"item": po["items"][0]["id"], "quantity": "4", "batch_number": "B1", "expiry_date": "2027-06-30"}],
            "additional_costs": "480", "supplier_invoice_number": "INV-77"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["order"]["status"], "partial")
        self.assertEqual(self.stock(p["id"]), D("48"))
        # landed cost = (4*3120 + 480) / 48 = 270
        self.assertEqual(Product.objects.get(pk=p["id"]).cost_price, D("270.00"))
        self.assertEqual(Supplier.objects.get(pk=sup.pk).balance, D("12960.00"))
        self.c.post(f"/api/suppliers/{sup.pk}/pay/", {"amount": "5000", "method": "bank", "purchase_order": po["id"]}, format="json")
        self.assertEqual(Supplier.objects.get(pk=sup.pk).balance, D("7960.00"))
        r = self.c.post(f"/api/purchase-orders/{po['id']}/return/", {
            "lines": [{"item": po["items"][0]["id"], "quantity": "1"}], "reason": "Damaged in transit"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.stock(p["id"]), D("36"))


class InventoryAndReportsTests(Base):
    def test_adjustment_approval_and_batches_fefo(self):
        p = self.product(track_batches=True, opening_stock="0")
        self.c.post("/api/stock/adjustments/", {"product": p["id"], "quantity": "10", "reason": "opening",
                                                "batch_number": "LATE", "expiry_date": "2027-12-01"}, format="json")
        self.c.post("/api/stock/adjustments/", {"product": p["id"], "quantity": "5", "reason": "opening",
                                                "batch_number": "SOON", "expiry_date": "2027-01-01"}, format="json")
        self.checkout([{"product": p["id"], "quantity": 7}], [{"method": "cash", "amount": 2240}])
        batches = {b["batch_number"]: b["quantity_remaining"] for b in self.c.get("/api/stock/batches/").data["results"]}
        self.assertEqual(batches, {"LATE": D("8")})

        # a storekeeper's adjustment waits for approval
        self.c.post("/api/users/", {"username": "store", "password": "secret123", "role": "storekeeper"}, format="json")
        sk = APIClient()
        tok = sk.post("/api/auth/login/", {"business": "duka", "username": "store", "password": "secret123"}, format="json").data
        sk.credentials(HTTP_AUTHORIZATION=f"Bearer {tok['access']}")
        adj = sk.post("/api/stock/adjustments/", {"product": p["id"], "quantity": "-2", "reason": "damaged"}, format="json").data
        self.assertEqual(adj["status"], "pending")
        self.assertEqual(self.stock(p["id"]), D("8"))
        self.assertEqual(sk.post(f"/api/stock/adjustments/{adj['id']}/approve/").status_code, 403)
        self.c.post(f"/api/stock/adjustments/{adj['id']}/approve/")
        self.assertEqual(self.stock(p["id"]), D("6"))

    def test_dashboard_and_reports(self):
        p = self.product(reorder_level="99")
        self.checkout([{"product": p["id"], "quantity": 2}], [{"method": "cash", "amount": 640}])
        self.c.post("/api/expenses/", {"category": self.c.get("/api/expense-categories/").data[0]["id"],
                                       "description": "Rent", "amount": "100"}, format="json")
        d = self.c.get("/api/reports/dashboard/").data
        self.assertEqual(d["sales"]["today"], D("640.00"))
        self.assertEqual(d["month"]["gross_profit"], D("140.00"))
        self.assertEqual(d["month"]["net_profit"], D("40.00"))
        self.assertEqual(d["inventory"]["low_stock_count"], 1)
        self.assertEqual(d["payments"]["today"]["cash"]["total"], D("640.00"))
        r = self.c.get("/api/reports/sales/?group=product")
        self.assertEqual(r.data["rows"][0]["gross_profit"], D("140.00"))
        csv = self.c.get("/api/reports/sales/?group=day&export=csv")
        self.assertEqual(csv["Content-Type"], "text/csv")

    def test_shift_reconciliation(self):
        p = self.product()
        self.c.post("/api/shifts/open/", {"opening_float": "1000"}, format="json")
        self.checkout([{"product": p["id"], "quantity": 1}], [{"method": "cash", "amount": 500}])
        r = self.c.post("/api/shifts/close/", {"counted_cash": "1300"}, format="json")
        self.assertEqual(r.data["expected_cash"], D("1320.00"))
        self.assertEqual(r.data["variance"], D("-20.00"))
