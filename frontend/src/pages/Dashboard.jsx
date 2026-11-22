import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, PackageX, ShoppingCart } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, PageHeader, StatusBadge, Table, useApi } from "../components/ui";
import { useAuth } from "../lib/auth";
import { dateTime, money, num, PAYMENT_LABELS, qty, short } from "../lib/format";

// Categorical slots 1 & 2 of the validated reference palette.
const SERIES = { retail: "#2a78d6", wholesale: "#eb6834" };

function Stat({ label, value, sub, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className={`mt-0.5 text-xs ${tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-700" : "text-slate-500"}`}>{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + Number(p.value || 0), 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-slate-700">{new Date(label).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 text-slate-600">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: p.fill }} />{p.name}</span>
          <span className="tabular text-slate-900">{money(p.value)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 font-medium text-slate-900"><span>Total</span><span className="tabular">{money(total)}</span></div>
    </div>
  );
}

export default function Dashboard() {
  const { can, user } = useAuth();
  const [branch, setBranch] = useState("all");
  const { data: d, loading, error } = useApi("/reports/dashboard/", { branch });
  const { branches } = useAuth();

  if (error) return <div className="p-6 text-rose-600">{error}</div>;
  if (loading || !d) return <div className="p-10 text-center text-slate-400">Loading dashboard…</div>;

  const rw = d.retail_vs_wholesale || {};
  const rwTotal = Number(rw.retail || 0) + Number(rw.wholesale || 0);
  const methods = Object.entries(d.payments.month).sort((a, b) => b[1].total - a[1].total);
  const methodMax = Math.max(1, ...methods.map(([, v]) => Number(v.total)));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Hello, ${user?.full_name?.split(" ")[0] || user?.username}`}
        subtitle="Here’s how the business is doing."
        actions={<>
          {branches.length > 1 && (
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="all">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {can("pos.sell") && <Link to="/pos"><Button><ShoppingCart className="h-4 w-4" />Open POS</Button></Link>}
        </>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sales today" value={money(d.sales.today)} sub={`${d.sales.today_count} transactions`} />
        <Stat label="Sales this week" value={money(d.sales.week)} />
        <Stat label="Sales this month" value={money(d.sales.month)} />
        <Stat label="Purchases this month" value={money(d.month.purchases)} />
        <Stat label="Gross profit (month)" value={money(d.month.gross_profit)} sub={`Cost of goods ${money(d.month.cost_of_goods)}`} />
        <Stat label="Expenses (month)" value={money(d.month.expenses)} />
        <Stat label="Net profit (month)" value={money(d.month.net_profit)} tone={Number(d.month.net_profit) < 0 ? "bad" : undefined}
          sub={Number(d.month.net_profit) < 0 ? "Loss this month" : "After expenses"} />
        <Stat label="Inventory value (at cost)" value={money(d.inventory.value)} />
        <Stat label="Customers owe you" value={money(d.receivables.total)} sub={`${d.receivables.customers} customers · ${money(d.receivables.overdue)} overdue`} tone={Number(d.receivables.overdue) > 0 ? "warn" : undefined} />
        <Stat label="You owe suppliers" value={money(d.payables.total)} />
        <Stat label="Low stock" value={d.inventory.low_stock_count} sub="at or below reorder level" tone={d.inventory.low_stock_count ? "warn" : undefined} />
        <Stat label="Out of stock" value={d.inventory.out_of_stock_count} sub={d.inventory.expiring_batches ? `${d.inventory.expiring_batches} batches expiring ≤30 days` : "products"} tone={d.inventory.out_of_stock_count ? "bad" : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Sales — last 30 days" className="lg:col-span-2"
          actions={<div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.retail }} />Retail</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.wholesale }} />Wholesale</span>
          </div>}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.chart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={24}
                  tickFormatter={(v) => new Date(v).toLocaleDateString("en-KE", { day: "numeric", month: "short" })} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={short} width={44} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="retail" name="Retail" stackId="s" fill={SERIES.retail} stroke="#fff" strokeWidth={1} />
                <Bar dataKey="wholesale" name="Wholesale" stackId="s" fill={SERIES.wholesale} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Retail vs wholesale (month)">
            {rwTotal === 0 ? <p className="text-sm text-slate-400">No sales yet this month.</p> : (
              <>
                <div className="flex h-3 gap-0.5 overflow-hidden rounded">
                  {["retail", "wholesale"].map((k) => Number(rw[k]) > 0 && (
                    <div key={k} style={{ width: `${(Number(rw[k]) / rwTotal) * 100}%`, background: SERIES[k] }} title={`${k}: ${money(rw[k])}`} />
                  ))}
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  {["retail", "wholesale"].map((k) => (
                    <div key={k} className="flex justify-between">
                      <dt className="flex items-center gap-1.5 capitalize text-slate-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[k] }} />{k}</dt>
                      <dd className="tabular">{money(rw[k])} <span className="text-slate-400">({Math.round((Number(rw[k] || 0) / rwTotal) * 100)}%)</span></dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </Card>
          <Card title="Payments received (month)">
            {methods.length === 0 ? <p className="text-sm text-slate-400">No payments yet.</p> : (
              <ul className="space-y-2.5 text-sm">
                {methods.map(([m, v]) => (
                  <li key={m}>
                    <div className="flex justify-between"><span className="text-slate-600">{PAYMENT_LABELS[m] || m} <span className="text-xs text-slate-400">· {v.count}</span></span><span className="tabular font-medium">{money(v.total)}</span></div>
                    <div className="mt-1 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-slate-500" style={{ width: `${Math.max(0, (Number(v.total) / methodMax) * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
            {Object.keys(d.payments.today).length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                Today: {Object.entries(d.payments.today).map(([m, v]) => `${PAYMENT_LABELS[m] || m} ${num(v.total)}`).join(" · ")}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Recent transactions" className="lg:col-span-2" bodyClass="p-0"
          actions={<Link to="/sales" className="flex items-center gap-1 text-xs font-medium text-brand-700">All sales <ArrowRight className="h-3 w-3" /></Link>}>
          <Table rows={d.recent_sales} empty="No sales yet." columns={[
            { key: "number", label: "Sale" },
            { key: "completed_at", label: "Time", render: (r) => dateTime(r.completed_at) },
            { key: "customer", label: "Customer", render: (r) => r.customer || <span className="text-slate-400">Walk-in</span> },
            { key: "sale_type", label: "Type", render: (r) => <Badge color={r.sale_type === "wholesale" ? "blue" : "slate"}>{r.sale_type}</Badge> },
            { key: "payment_status", label: "Status", render: (r) => <StatusBadge status={r.payment_status} /> },
            { key: "total", label: "Total", align: "right", render: (r) => money(r.total) },
          ]} />
        </Card>
        <Card title="Best sellers (month)" bodyClass="p-0">
          <Table rows={d.best_sellers} rowKey="product" empty="No sales yet." columns={[
            { key: "name", label: "Product" },
            { key: "quantity", label: "Qty", align: "right", render: (r) => qty(r.quantity) },
            { key: "revenue", label: "Sales", align: "right", render: (r) => num(r.revenue) },
          ]} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />Low stock</span>} bodyClass="p-0"
          actions={<Link to="/inventory?tab=reorder" className="text-xs font-medium text-brand-700">Reorder list</Link>}>
          <Table rows={d.inventory.low_stock} rowKey="product" empty="All products are above reorder level." columns={[
            { key: "name", label: "Product" },
            { key: "branch", label: "Branch" },
            { key: "quantity", label: "In stock", align: "right", render: (r) => `${qty(r.quantity)} ${r.unit}` },
            { key: "reorder_level", label: "Reorder at", align: "right", render: (r) => qty(r.reorder_level) },
          ]} />
        </Card>
        <Card title={<span className="flex items-center gap-2"><PackageX className="h-4 w-4 text-rose-600" />Out of stock</span>} bodyClass="p-0">
          <Table rows={d.inventory.out_of_stock} empty="Nothing is out of stock." columns={[{ key: "name", label: "Product" }]} />
        </Card>
      </div>
    </div>
  );
}
