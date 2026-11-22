import { useEffect, useState } from "react";
import { Printer, RotateCcw, Ban } from "lucide-react";
import Receipt from "../components/Receipt";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Pager, Select, StatusBadge, Table, Tabs, toast, useApi } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime, money, num, qty, PAYMENT_LABELS } from "../lib/format";

export default function Sales() {
  const [tab, setTab] = useState("sales");
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Sales" subtitle="Sales history, receipts, returns and payments." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "sales", label: "Sales" }, { value: "quotes", label: "Quotations & held" }, { value: "payments", label: "Payments" }, { value: "returns", label: "Returns" }]} />
      {tab === "sales" && <SalesList />}
      {tab === "quotes" && <SalesList statuses="quotation,held" />}
      {tab === "payments" && <Payments />}
      {tab === "returns" && <Returns />}
    </div>
  );
}

function SalesList({ statuses = "completed,voided" }) {
  const [search, setSearch] = useState("");
  const [saleType, setSaleType] = useState("");
  const [unpaid, setUnpaid] = useState(false);
  const [day, setDay] = useState("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const { data, loading, reload } = useApi("/sales/", { search, sale_type: saleType, status__in: statuses, balance__gt: unpaid ? 0 : undefined, created_at__date: day, page });
  useEffect(() => setPage(1), [search, saleType, unpaid, day]);
  return (
    <Card bodyClass="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <Input placeholder="Sale no., customer, M-Pesa code…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={saleType} onChange={(e) => setSaleType(e.target.value)} placeholder="Retail & wholesale" className="max-w-[180px]" options={[{ value: "retail", label: "Retail" }, { value: "wholesale", label: "Wholesale" }]} />
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="max-w-[160px]" />
        <Checkbox label="Unpaid only" checked={unpaid} onChange={(e) => setUnpaid(e.target.checked)} />
      </div>
      <Table loading={loading} rows={data?.results} onRowClick={async (r) => setViewing(await api(`/sales/${r.id}/`))} columns={[
        { key: "number", label: "Sale" }, { key: "created_at", label: "Date", render: (r) => dateTime(r.completed_at || r.created_at) },
        { key: "customer_name", label: "Customer", render: (r) => r.customer_name || <span className="text-slate-400">Walk-in</span> },
        { key: "sale_type", label: "Type", render: (r) => <Badge color={r.sale_type === "wholesale" ? "blue" : "slate"}>{r.sale_type}</Badge> },
        { key: "cashier_name", label: "Cashier" }, { key: "item_count", label: "Items", align: "right" },
        { key: "payment_status", label: "Status", render: (r) => <StatusBadge status={r.payment_status} /> },
        { key: "total", label: "Total", align: "right", render: (r) => money(r.total) },
        { key: "balance", label: "Balance", align: "right", render: (r) => Number(r.balance) > 0 ? <span className="text-rose-600">{money(r.balance)}</span> : "—" },
      ]} />
      <Pager data={data} page={page} setPage={setPage} />
      {viewing && <SaleDetail sale={viewing} onClose={() => { setViewing(null); reload(); }} />}
    </Card>
  );
}

function SaleDetail({ sale, onClose }) {
  const { can, business, branches } = useAuth();
  const [s, setS] = useState(sale);
  const [mode, setMode] = useState(null);
  const [ret, setRet] = useState({});
  const [refund, setRefund] = useState({ method: "cash", reason: "" });
  const [error, setError] = useState("");
  const branch = branches.find((b) => b.id === s.branch);

  const doReturn = async () => {
    setError("");
    try {
      const items = Object.entries(ret).filter(([, v]) => Number(v.quantity) > 0).map(([id, v]) => ({ sale_item: Number(id), quantity: v.quantity, restock: v.restock !== false }));
      const r = await api(`/sales/${s.id}/return/`, { method: "POST", body: { items, refund_method: refund.method, reason: refund.reason } });
      toast(`Return ${r.number} processed: ${money(r.refund_amount)}`);
      setS(await api(`/sales/${s.id}/`));
      setMode(null);
      setRet({});
    } catch (err) { setError(err.message); }
  };
  const doVoid = async () => {
    const reason = window.prompt("Reason for voiding this sale?");
    if (!reason) return;
    try { setS(await api(`/sales/${s.id}/void/`, { method: "POST", body: { reason } })); toast("Sale voided, stock restored"); }
    catch (err) { toast(err.message, "red"); }
  };

  return (
    <Modal open onClose={onClose} title={`Sale ${s.number}`} size="lg" footer={!mode && <>
      {can("sales.void") && s.status === "completed" && Number(s.refunded_total) === 0 && <Button variant="ghost" className="mr-auto text-rose-600" onClick={doVoid}><Ban className="h-4 w-4" />Void</Button>}
      {can("sales.refund") && s.status === "completed" && <Button variant="secondary" onClick={() => setMode("return")}><RotateCcw className="h-4 w-4" />Return / refund</Button>}
      <Button onClick={() => setMode("receipt")}><Printer className="h-4 w-4" />Receipt</Button>
    </>}>
      {mode === "receipt" ? (
        <div>
          <div className="print-area"><Receipt sale={s} business={business} branch={branch} /></div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setMode(null)}>Back</Button><Button onClick={() => window.print()}>Print</Button></div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <StatusBadge status={s.payment_status} />
            <span>{dateTime(s.completed_at || s.created_at)}</span><span>Cashier: {s.cashier_name}</span>
            <span>Customer: {s.customer_name || "Walk-in"}</span><span className="capitalize">{s.sale_type}</span>
            {s.voided_reason && <span className="text-rose-600">Voided: {s.voided_reason}</span>}
          </div>
          <Alert>{error}</Alert>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="py-1.5">Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Disc.</th><th className="text-right">Total</th>
              {mode === "return" && <><th className="pl-3">Return</th><th>Restock</th></>}
            </tr></thead>
            <tbody>
              {s.items.map((i) => {
                const returnable = Number(i.quantity) - Number(i.returned_quantity);
                return (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className="py-2">{i.product_name} <span className="text-xs text-slate-400">{i.unit_name}{i.price_rule !== "retail" && ` · ${i.price_rule}`}</span>
                      {Number(i.returned_quantity) > 0 && <span className="ml-1 text-xs text-amber-700">({qty(i.returned_quantity)} returned)</span>}</td>
                    <td className="tabular text-right">{qty(i.quantity)}</td>
                    <td className="tabular text-right">{num(i.unit_price)}</td>
                    <td className="tabular text-right">{Number(i.discount) + Number(i.allocated_sale_discount) ? num(Number(i.discount) + Number(i.allocated_sale_discount)) : ""}</td>
                    <td className="tabular text-right">{num(i.line_total)}</td>
                    {mode === "return" && <>
                      <td className="pl-3">{returnable > 0 ? <Input type="number" min="0" max={returnable} className="w-20" placeholder={`≤${qty(returnable)}`} value={ret[i.id]?.quantity || ""} onChange={(e) => setRet({ ...ret, [i.id]: { ...ret[i.id], quantity: e.target.value } })} /> : "—"}</td>
                      <td>{returnable > 0 && <Checkbox checked={ret[i.id]?.restock !== false} onChange={(e) => setRet({ ...ret, [i.id]: { ...ret[i.id], restock: e.target.checked } })} label="" />}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <dl className="tabular ml-auto mt-3 w-64 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{num(s.subtotal)}</dd></div>
            {Number(s.discount_total) > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{num(s.discount_total)}</dd></div>}
            {Number(s.tax_total) > 0 && <div className="flex justify-between"><dt>VAT</dt><dd>{num(s.tax_total)}</dd></div>}
            <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{money(s.total)}</dd></div>
            <div className="flex justify-between"><dt>Paid</dt><dd>{money(s.amount_paid)}</dd></div>
            {Number(s.refunded_total) > 0 && <div className="flex justify-between text-amber-700"><dt>Returned</dt><dd>{money(s.refunded_total)}</dd></div>}
            {Number(s.balance) > 0 && <div className="flex justify-between text-rose-600"><dt>Balance</dt><dd>{money(s.balance)}</dd></div>}
          </dl>
          <h4 className="mb-1 mt-4 text-sm font-semibold">Payments</h4>
          <Table rows={s.payments} empty="No payments." columns={[
            { key: "created_at", label: "When", render: (r) => dateTime(r.created_at) },
            { key: "kind", label: "Type" }, { key: "method", label: "Method", render: (r) => PAYMENT_LABELS[r.method] },
            { key: "reference", label: "Reference" }, { key: "received_by_name", label: "By" },
            { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) }]} />
          {mode === "return" && (
            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Field label="Refund via"><Select value={refund.method} onChange={(e) => setRefund({ ...refund, method: e.target.value })}
                options={[...["cash", "mpesa", "card", "bank"].map((m) => ({ value: m, label: PAYMENT_LABELS[m] })), ...(s.customer ? [{ value: "credit", label: "Customer account" }] : [])]} /></Field>
              <Field label="Reason" className="flex-1"><Input value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} placeholder="e.g. Expired, wrong item" /></Field>
              <Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button>
              <Button variant="danger" onClick={doReturn} disabled={!refund.reason}>Process return</Button>
              <p className="w-full text-xs text-amber-800">Untick “restock” for damaged items — they’re recorded as damaged instead of going back on the shelf. Any unpaid balance on the sale is reduced first.</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function Payments() {
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading } = useApi("/payments/", { method, search, page });
  return (
    <Card bodyClass="p-0">
      <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
        <Input placeholder="Reference / M-Pesa code / sale…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={method} onChange={(e) => setMethod(e.target.value)} placeholder="All methods" className="max-w-[160px]" options={Object.entries(PAYMENT_LABELS).filter(([k]) => k !== "credit").map(([value, label]) => ({ value, label }))} />
      </div>
      <Table loading={loading} rows={data?.results} columns={[
        { key: "created_at", label: "When", render: (r) => dateTime(r.created_at) },
        { key: "kind", label: "Type", render: (r) => <Badge color={r.kind === "refund" ? "red" : r.kind === "debt" ? "violet" : "slate"}>{r.kind}</Badge> },
        { key: "method_display", label: "Method" }, { key: "reference", label: "Reference" },
        { key: "sale_number", label: "Sale" }, { key: "customer_name", label: "Customer" }, { key: "received_by_name", label: "By" },
        { key: "amount", label: "Amount", align: "right", render: (r) => <span className={Number(r.amount) < 0 ? "text-rose-600" : ""}>{money(r.amount)}</span> },
      ]} />
      <Pager data={data} page={page} setPage={setPage} />
    </Card>
  );
}

function Returns() {
  const [page, setPage] = useState(1);
  const { data, loading } = useApi("/returns/", { page });
  return (
    <Card bodyClass="p-0">
      <Table loading={loading} rows={data?.results} columns={[
        { key: "number", label: "Return" }, { key: "created_at", label: "When", render: (r) => dateTime(r.created_at) },
        { key: "sale_number", label: "Original sale" },
        { key: "items", label: "Items", render: (r) => r.items.map((i) => `${i.product_name} × ${qty(i.quantity)}${i.restock ? "" : " (damaged)"}`).join(", ") },
        { key: "reason", label: "Reason" }, { key: "refund_method", label: "Refund via", render: (r) => PAYMENT_LABELS[r.refund_method] || "Account" },
        { key: "processed_by_name", label: "By" },
        { key: "refund_amount", label: "Amount", align: "right", render: (r) => money(r.refund_amount) },
      ]} />
      <Pager data={data} page={page} setPage={setPage} />
    </Card>
  );
}
