# Ciron — POS & business management for Kenyan retail and wholesale shops

Multi-tenant SaaS: every business gets its own account, served at `<shop>.ciron.co.ke`, with its own
products, prices, tax settings, branches, staff and payment methods.

| Layer | Tech |
|---|---|
| Backend | Django 6 + Django REST Framework, JWT auth (SimpleJWT) |
| Database | PostgreSQL in production (`DATABASE_URL`), SQLite fallback for local dev |
| Frontend | React 19 + Vite + Tailwind CSS 4, Recharts, lucide icons |

## Quick start (local)

```powershell
# Backend
cd backend
.venv\Scripts\Activate.ps1          # venv already created; else: python -m venv .venv; pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py seed_demo          # demo shop: shop "demo", users owner / cashier, password demo1234
python manage.py runserver

# Frontend (second terminal)
cd frontend
npm install
npm run dev                         # http://localhost:5173  (proxies /api to :8000)
```

Sign in with shop address `demo`, user `owner` (or `cashier`), password `demo1234` — or create a new shop at `/register`.

Tests: `cd backend; python manage.py test tests` (17 end-to-end API tests: tenancy isolation, RBAC, pricing engine,
checkout/VAT/change, credit limits & debt repayment, hold/resume, returns & voids, partial purchase receiving with
landed cost, FEFO batches, approvals, dashboard figures, shift cash-up).

## Architecture

**Tenancy.** Shared database, every tenant table has a `business` FK (`core.TenantModel`). The tenant is resolved from
the authenticated user; `TenantSubdomainMiddleware` reads the subdomain from `Host` (or `X-Business` in dev) and
requests whose subdomain doesn't match the user's business are rejected. All related-object fields in serializers are
scoped to the current business (`TenantModelSerializer`, `TenantPKField`), so one shop can never reference another's
records. Usernames are unique per business; login = shop + username + password.

**RBAC.** `accounts/roles.py` maps roles (Owner, Manager, Cashier, Storekeeper, Accountant, Salesperson) to permission
codes; owners can grant/revoke individual codes per employee. Views declare `perm_module` / `permission_map`.

**Pricing engine** (`catalog/pricing.py`) — first match wins:
1. customer-specific negotiated price → 2. quantity tier (e.g. 1–9 @100, 10–49 @90, 50–99 @85, 100+ @80) →
3. wholesale price (wholesale/distributor customer, cashier toggled wholesale, or quantity ≥ product's auto-wholesale
threshold) → 4. retail. Minimum selling price is enforced unless the user holds `sales.override_price`.
The POS asks the server to price the cart on every change (`/sales/price_preview/`), so the screen always shows what
will be charged.

**Units of measure.** Stock is counted in a base unit (pcs, kg, L). `ProductUnit` defines packs (Carton = 12, Dozen = 12,
Packet = 10) with optional own prices/barcodes; selling or receiving a pack converts to base units automatically.

**Stock ledger.** Every change goes through `inventory.services.move_stock()`, which locks the stock row, writes an
immutable `StockMovement` (qty, balance after, cost, reason, reference, user, time) and draws batch-tracked stock
first-expiring-first-out. Adjustments by non-approvers wait in an approval queue.

**Money.** Customer and supplier balances are maintained by the services (`sales/services.py`, `purchasing/services.py`);
debt repayments are allocated to the oldest unpaid sales first. Purchase receiving spreads transport/extra costs into a
weighted-average landed cost.

## API map (all under `/api/`)

`auth/register|login|logout|refresh|me|roles` · `settings` · `branches` · `users` · `shifts` (+ `current|open|close`) ·
`categories|brands|units` · `products` (+ `pos_search|pos_catalog|quote|import_csv|export_csv|upload_image`) · `customer-prices` ·
`stock/movements|batches|adjustments|transfers|stocktakes|insights` · `customers` (+ `receive_payment|statement|history|debtors`) ·
`suppliers` (+ `pay|statement|catalog|payments|performance`) · `sales` (+ `checkout|price_preview|held|void|return|receipt`) ·
`payments` · `returns` · `purchase-orders` (+ `submit|receive|return|cancel|receipts`) · `expenses` (+ `approve|reject|summary`) ·
`expense-categories` · `reports/dashboard|sales|profit-loss|inventory|cashiers` · `audit-logs` · `login-history` · `notifications`

## Public website

`frontend/src/site/`: home (`/`, with the animated receipt-printer checkout demo), `/pricing`, `/contact`
(posts to `POST /api/public/contact/`, stored as `core.ContactMessage`, visible in Django admin; throttled 5/hour,
honeypot field), `/legal/terms|privacy|refunds|cookies`, shared header and footer. Styled with the Ciron Design
System tokens (`--c-*` CSS variables in `index.css`, light and dark). Contact details, legal entity name and plan
prices live in `src/site/config.js`. On a shop subdomain the root shows that shop's sign-in instead of the home page.

## POS keyboard shortcuts

F2 search/scan · Enter add · `12*barcode` add 12 · F3 customer · F4 wholesale toggle · F6 hold · F7 resume · F8 sale
discount · F9 pay · +/− quantity · ↑/↓ select line · Del remove · Esc clear. USB/Bluetooth barcode scanners work out
of the box (they type + Enter into the search box).

## Status

Phase 1 (this build) covers the full core flow: onboarding, RBAC, products/units/variants fields/tiers, POS
(retail + wholesale, split payments, credit, hold/resume, quotations, receipts, returns, voids, shifts), inventory
ledger/batches/expiry/adjustments/transfers/stocktake/reorder, customers & credit, suppliers, purchasing & receiving,
expenses, dashboard and reports with CSV export.

### Next phases
- **M-Pesa Daraja**: STK Push from the payment dialog, C2B confirmation webhook, auto-matching & settlement.
- **KRA eTIMS**: invoice signing/submission (field `Sale.etims_invoice_number` reserved).
- **Wholesale orders**: sales orders with delivery notes and partial fulfilment; proforma invoice PDF (ReportLab is installed).
- **Notifications**: scheduled low-stock / expiry / overdue-debt / daily-summary jobs → in-app, email, SMS, WhatsApp.
- **Offline POS**: IndexedDB cache of catalog + queued sales, sync on reconnect; Django Channels for live updates.
- Camera barcode scanning (ZXing), PDF/Excel exports, serial-number capture at the till, recurring-expense automation,
  backup/restore, platform super-admin console, production deployment (Postgres, gunicorn/uvicorn, nginx wildcard TLS).
