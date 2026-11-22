import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button, Card, Input, PageHeader, Select, Table, Tabs, useApi } from "../components/ui";
import { download } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, daysAgo, money, num, PAYMENT_LABELS, qty, today } from "../lib/format";

const GROUPS = [
  ["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"], ["year", "Annual"], ["product", "By product"], ["category", "By category"],
  ["brand", "By brand"], ["cashier", "By cashier"], ["payment_method", "By payment method"], ["sale_type", "Retail vs wholesale"],
  ["customer", "By customer"], ["branch", "By branch"],
];

export default function Reports() {
  const [tab, setTab] = useState("sales");
  const [range, setRange] = useState({ from: daysAgo(29), to: today() });
  const [branch, setBranch] = useState("all");
  const { branches } = useAuth();
  const common = { from: range.from, to: range.to, branch };
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Reports" subtitle="Sales, profit, inventory and cash-up reports."
        actions={<>
          <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="w-40" />
          <span className="text-slate-400">to</span>
          <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="w-40" />
          {branches.length > 1 && <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="w-40" options={[{ value: "all", label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />}
          <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
        </>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "sales", label: "Sales" }, { value: "pl", label: "Profit & loss" }, { value: "inventory", label: "Inventory" }, { value: "cashiers", label: "Cashier cash-up" }]} />
      <div className="print-area a4">
        {tab === "sales" && <SalesReport params={common} />}
        {tab === "pl" && <ProfitLoss params={common} />}
        {tab === "inventory" && <InventoryReport params={common} />}
        {tab === "cashiers" && <Cashiers params={common} />}
      </div>
    </div>
  );
}

function SalesReport({ params }) {
  const [group, setGroup] = useState("day");
  const { data, loading } = useApi("/reports/sales/", { ...params, group });
  const isPay = group === "payment_method";
  const label = (k) => (["day", "week", "month"].includes(group) ? date(k) : group === "year" ? String(k).slice(0, 4) : isPay ? PAYMENT_LABELS[k] || k : k);
  return (
    <Card bodyClass="p-0" title={<Select value={group} onChange={(e) => setGroup(e.target.value)} className="w-56" options={GROUPS.map(([value, label]) => ({ value, label }))} />}
      actions={<Button size="sm" variant="secondary" onClick={() => download("/reports/sales/", { ...params, group, export: "csv" }, `sales_${group}.csv`)}><Download className="h-4 w-4" />Excel / CSV</Button>}>
      {data?.totals && (
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 sm:grid-cols-5">
          {[["Sales", data.totals.sales], ["Gross profit", data.totals.gross_profit], ["Cost of goods", data.totals.cost], ["VAT", data.totals.tax], ["Returns", data.returns]].map(([l, v]) => (
            <div key={l}><div className="text-xs text-slate-500">{l}</div><div className="tabular text-lg font-semibold">{money(v)}</div></div>
          ))}
        </div>
      )}
      <Table loading={loading} rows={data?.rows} rowKey="key" columns={isPay ? [
        { key: "key", label: "Method", render: (r) => label(r.key) },
        { key: "count", label: "Payments", align: "right" },
        { key: "total", label: "Total", align: "right", render: (r) => money(r.total) },
      ] : [
        { key: "key", label: GROUPS.find((g) => g[0] === group)?.[1].replace("By ", "") || "Period", render: (r) => label(r.key) },
        { key: "transactions", label: "Sales", align: "right" },
        ...(group === "product" ? [{ key: "quantity", label: "Qty", align: "right", render: (r) => qty(r.quantity) }] : []),
        { key: "sales", label: "Sales value", align: "right", render: (r) => num(r.sales) },
        { key: "discount", label: "Discounts", align: "right", render: (r) => num(r.discount) },
        { key: "tax", label: "VAT", align: "right", render: (r) => num(r.tax) },
        { key: "cost", label: "Cost", align: "right", render: (r) => num(r.cost) },
        { key: "gross_profit", label: "Gross profit", align: "right", render: (r) => <span className="font-medium">{num(r.gross_profit)}</span> },
        { key: "margin", label: "Margin", align: "right", render: (r) => Number(r.sales) ? `${((Number(r.gross_profit) / Number(r.sales)) * 100).toFixed(1)}%` : "—" },
      ]} />
    </Card>
  );
}

function ProfitLoss({ params }) {
  const { data } = useApi("/reports/profit-loss/", params);
  if (!data) return null;
  const Row = ({ label, value, strong, neg, indent }) => (
    <div className={`flex justify-between border-b border-slate-100 py-2 ${strong ? "font-semibold" : ""} ${indent ? "pl-4 text-slate-600" : ""}`}>
      <span>{label}</span><span className={`tabular ${neg ? "text-rose-600" : ""}`}>{neg ? "(" : ""}{money(value)}{neg ? ")" : ""}</span>
    </div>
  );
  return (
    <Card title={`Profit & loss · ${date(data.from)} – ${date(data.to)}`} className="max-w-2xl">
      <Row label="Sales (incl. VAT, net of returns)" value={data.sales} />
      <Row label="Revenue excl. VAT" value={data.revenue_ex_tax} />
      <Row label="Cost of goods sold" value={data.cost_of_goods} neg />
      <Row label="Gross profit" value={data.gross_profit} strong />
      <div className="pt-3 text-xs font-semibold uppercase text-slate-500">Operating expenses</div>
      {data.expenses_by_category.map((e) => <Row key={e.category} label={e.category} value={e.total} indent neg />)}
      <Row label="Total expenses" value={data.expenses} neg />
      <Row label="Net profit" value={data.net_profit} strong />
      {Number(data.stock_losses) !== 0 && <p className="mt-3 text-xs text-slate-500">Stock written off as damaged/expired in this period: {money(data.stock_losses)} (at cost).</p>}
    </Card>
  );
}

function InventoryReport({ params }) {
  const [type, setType] = useState("valuation");
  const { data, loading } = useApi("/reports/inventory/", { ...params, type });
  const cols = {
    valuation: [
      { key: "name", label: "Product" }, { key: "category", label: "Category" },
      { key: "quantity", label: "Qty", align: "right", render: (r) => `${qty(r.quantity)} ${r.unit}` },
      { key: "cost_value", label: "Value at cost", align: "right", render: (r) => num(r.cost_value) },
      { key: "retail_value", label: "Value at retail", align: "right", render: (r) => num(r.retail_value) },
    ],
    fast_slow: [
      { key: "name", label: "Product" }, { key: "sold", label: "Sold", align: "right", render: (r) => `${qty(r.sold)} ${r.unit}` },
      { key: "per_day", label: "Per day", align: "right" },
      { key: "class", label: "Movement", render: (r) => ({ fast: "🟢 Fast", normal: "Normal", slow: "🟠 Slow", dead: "🔴 Not selling" })[r.class] },
    ],
  };
  const ledger = [
    { key: "date", label: "Date", render: (r) => date(r.date) }, { key: "product", label: "Product" }, { key: "kind", label: "Type" },
    { key: "quantity", label: "Qty", align: "right", render: (r) => qty(r.quantity) }, { key: "value", label: "Value", align: "right", render: (r) => num(r.value) },
    { key: "reference", label: "Ref" }, { key: "user", label: "By" }, { key: "note", label: "Note" },
  ];
  const total = type === "valuation" && data?.rows ? data.rows.reduce((s, r) => s + Number(r.cost_value), 0) : null;
  return (
    <Card bodyClass="p-0" title={<Select value={type} onChange={(e) => setType(e.target.value)} className="w-56" options={[
      { value: "valuation", label: "Stock valuation" }, { value: "fast_slow", label: "Fast & slow movers" }, { value: "movement", label: "Stock movement" },
      { value: "damaged", label: "Damaged goods" }, { value: "expired", label: "Expired goods" }]} />}
      actions={<>{total !== null && <span className="text-sm font-semibold">Total {money(total)}</span>}
        <Button size="sm" variant="secondary" onClick={() => download("/reports/inventory/", { ...params, type, export: "csv" }, `inventory_${type}.csv`)}><Download className="h-4 w-4" />CSV</Button></>}>
      <Table loading={loading} rows={data?.rows} rowKey={type === "valuation" || type === "fast_slow" ? "product" : undefined} columns={cols[type] || ledger} />
    </Card>
  );
}

function Cashiers({ params }) {
  const { data, loading } = useApi("/reports/cashiers/", params);
  const methods = [...new Set((data?.cashiers || []).flatMap((c) => Object.keys(c.methods)))];
  return (
    <Card bodyClass="p-0" title="Payments collected per cashier">
      <Table loading={loading} rows={data?.cashiers} rowKey="user" empty="No payments in this period." columns={[
        { key: "name", label: "Cashier" },
        ...methods.map((m) => ({ key: m, label: PAYMENT_LABELS[m] || m, align: "right", render: (r) => r.methods[m] ? num(r.methods[m].total) : "—" })),
        { key: "total", label: "Total", align: "right", render: (r) => <span className="font-semibold">{money(r.total)}</span> },
      ]} />
    </Card>
  );
}
