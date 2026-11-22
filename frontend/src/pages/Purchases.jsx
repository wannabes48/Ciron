import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import ProductPicker from "../components/ProductPicker";
import { Alert, Button, Card, Field, Input, Modal, PageHeader, Pager, Select, StatusBadge, Table, Textarea, toast, useApi } from "../components/ui";
import { api, listAll } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, money, num, qty } from "../lib/format";
import { useEffect } from "react";

export default function Purchases() {
  const { can } = useAuth();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi("/purchase-orders/", { status, page });
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Purchases" subtitle="Order from suppliers, receive stock, track what you owe."
        actions={can("purchases.manage") && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New purchase order</Button>} />
      <Card bodyClass="p-0">
        <div className="border-b border-slate-100 p-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" className="max-w-[200px]"
            options={["draft", "ordered", "partial", "received", "cancelled"].map((s) => ({ value: s, label: s }))} />
        </div>
        <Table loading={loading} rows={data?.results} onRowClick={setViewing} columns={[
          { key: "number", label: "PO" }, { key: "created_at", label: "Date", render: (r) => date(r.created_at) },
          { key: "supplier_name", label: "Supplier" }, { key: "branch_name", label: "Branch" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "total_ordered", label: "Ordered", align: "right", render: (r) => money(r.total_ordered) },
          { key: "total_received", label: "Received", align: "right", render: (r) => money(r.total_received) },
          { key: "balance", label: "Unpaid", align: "right", render: (r) => Number(r.balance) > 0 ? <span className="text-rose-600">{money(r.balance)}</span> : "—" },
        ]} />
        <Pager data={data} page={page} setPage={setPage} />
      </Card>
      {creating && <POForm onClose={() => setCreating(false)} onSaved={(po) => { setCreating(false); reload(); setViewing(po); }} />}
      {viewing && <PODetail order={viewing} onClose={() => { setViewing(null); reload(); }} />}
    </div>
  );
}

function POForm({ onClose, onSaved }) {
  const [suppliers, setSuppliers] = useState([]);
  const [f, setF] = useState({ supplier: "", expected_date: "", notes: "" });
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { listAll("/suppliers/", { is_active: true }).then(setSuppliers); }, []);
  const add = (p) => setItems([...items, { product: p, unit: "", quantity: 1, unit_cost: p.cost_price }]);
  const setItem = (i, patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_cost || 0), 0);
  const save = async (submit) => {
    try {
      let po = await api("/purchase-orders/", { method: "POST", body: { ...f, expected_date: f.expected_date || null,
        items: items.map((i) => ({ product: i.product.id, unit: i.unit || null, quantity: i.quantity, unit_cost: i.unit_cost })) } });
      if (submit) po = await api(`/purchase-orders/${po.id}/submit/`, { method: "POST" });
      onSaved(po);
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal open onClose={onClose} title="New purchase order" size="lg"
      footer={<><Button variant="secondary" onClick={() => save(false)}>Save draft</Button><Button onClick={() => save(true)}>Submit order</Button></>}>
      <div className="space-y-3">
        <Alert>{error}</Alert>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier"><Select value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} placeholder="Choose supplier" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} /></Field>
          <Field label="Expected delivery"><Input type="date" value={f.expected_date} onChange={(e) => setF({ ...f, expected_date: e.target.value })} /></Field>
        </div>
        <ProductPicker onPick={add} placeholder="Add product to order…" />
        {items.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Product</th><th>Unit</th><th>Qty</th><th>Cost / unit</th><th className="text-right">Total</th><th /></tr></thead>
            <tbody>
              {items.map((i, idx) => (
                <tr key={idx} className="border-t border-slate-100">
                  <td className="py-1.5">{i.product.name}</td>
                  <td><Select value={i.unit} className="w-32" onChange={(e) => {
                    const u = i.product.units.find((x) => x.id === Number(e.target.value));
                    setItem(idx, { unit: e.target.value, unit_cost: (Number(i.product.cost_price) * (u ? Number(u.factor) : 1)).toFixed(2) });
                  }} options={[{ value: "", label: i.product.unit_abbr }, ...i.product.units.map((u) => ({ value: u.id, label: `${u.name} (${qty(u.factor)})` }))]} /></td>
                  <td><Input type="number" className="w-24" value={i.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} /></td>
                  <td><Input type="number" className="w-28" value={i.unit_cost} onChange={(e) => setItem(idx, { unit_cost: e.target.value })} /></td>
                  <td className="tabular text-right">{num(Number(i.quantity) * Number(i.unit_cost))}</td>
                  <td><button onClick={() => setItems(items.filter((_, j) => j !== idx))} className="px-2 text-rose-500"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="text-right text-base font-semibold">Total: {money(total)}</div>
        <Field label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} /></Field>
      </div>
    </Modal>
  );
}

function PODetail({ order, onClose }) {
  const { can } = useAuth();
  const [po, setPo] = useState(order);
  const [mode, setMode] = useState(null); // receive | return
  const [lines, setLines] = useState({});
  const [extra, setExtra] = useState({ supplier_invoice_number: "", additional_costs: "", reason: "" });
  const refresh = async () => setPo(await api(`/purchase-orders/${po.id}/`));
  const act = async (path) => {
    try { setPo(await api(`/purchase-orders/${po.id}/${path}/`, { method: "POST" })); } catch (err) { toast(err.message, "red"); }
  };
  const startReceive = () => {
    setLines(Object.fromEntries(po.items.map((i) => [i.id, { quantity: i.pending_quantity, batch_number: "", expiry_date: "" }])));
    setMode("receive");
  };
  const submitReceive = async () => {
    try {
      await api(`/purchase-orders/${po.id}/receive/`, { method: "POST", body: {
        supplier_invoice_number: extra.supplier_invoice_number, additional_costs: extra.additional_costs || 0,
        lines: Object.entries(lines).map(([item, l]) => ({ item, quantity: l.quantity || 0, batch_number: l.batch_number, expiry_date: l.expiry_date || null })) } });
      toast("Stock received and inventory updated");
      setMode(null);
      refresh();
    } catch (err) { toast(err.message, "red"); }
  };
  const submitReturn = async () => {
    try {
      await api(`/purchase-orders/${po.id}/return/`, { method: "POST", body: { reason: extra.reason,
        lines: Object.entries(lines).filter(([, l]) => Number(l.quantity) > 0).map(([item, l]) => ({ item, quantity: l.quantity })) } });
      toast("Goods returned to supplier");
      setMode(null);
      refresh();
    } catch (err) { toast(err.message, "red"); }
  };
  const manage = can("purchases.manage");
  return (
    <Modal open onClose={onClose} title={`${po.number} · ${po.supplier_name}`} size="lg" footer={manage && !mode && <>
      {["draft", "ordered"].includes(po.status) && <Button variant="ghost" className="mr-auto" onClick={() => window.confirm("Cancel this order?") && act("cancel")}>Cancel order</Button>}
      {po.status === "draft" && <Button variant="secondary" onClick={() => act("submit")}>Submit to supplier</Button>}
      {["partial", "received"].includes(po.status) && <Button variant="secondary" onClick={() => { setLines({}); setMode("return"); }}>Return goods</Button>}
      {["draft", "ordered", "partial"].includes(po.status) && <Button onClick={startReceive}>Receive stock</Button>}
    </>}>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <StatusBadge status={po.status} />
        <span>Ordered {money(po.total_ordered)}</span><span>Received {money(po.total_received)}</span>
        <span>Paid {money(po.amount_paid)}</span><span className="font-medium">Balance {money(po.balance)}</span>
        {po.supplier_invoice_number && <span>Invoice {po.supplier_invoice_number}</span>}
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs uppercase text-slate-500">
          <th className="py-1.5">Product</th><th className="text-right">Ordered</th><th className="text-right">Received</th><th className="text-right">Returned</th><th className="text-right">Cost</th>
          {mode && <th className="pl-3">{mode === "receive" ? "Receive now" : "Return qty"}</th>}
          {mode === "receive" && <><th>Batch</th><th>Expiry</th></>}
        </tr></thead>
        <tbody>
          {po.items.map((i) => (
            <tr key={i.id} className="border-b border-slate-100">
              <td className="py-2">{i.product_name} <span className="text-xs text-slate-400">({i.unit_name})</span></td>
              <td className="tabular text-right">{qty(i.quantity)}</td>
              <td className={`tabular text-right ${Number(i.received_quantity) < Number(i.quantity) ? "text-amber-700" : "text-emerald-700"}`}>{qty(i.received_quantity)}</td>
              <td className="tabular text-right">{qty(i.returned_quantity)}</td>
              <td className="tabular text-right">{num(i.unit_cost)}</td>
              {mode && <td className="pl-3"><Input type="number" className="w-24" value={lines[i.id]?.quantity ?? ""} onChange={(e) => setLines({ ...lines, [i.id]: { ...lines[i.id], quantity: e.target.value } })} /></td>}
              {mode === "receive" && <>
                <td><Input className="w-24" value={lines[i.id]?.batch_number || ""} onChange={(e) => setLines({ ...lines, [i.id]: { ...lines[i.id], batch_number: e.target.value } })} /></td>
                <td><Input type="date" className="w-36" value={lines[i.id]?.expiry_date || ""} onChange={(e) => setLines({ ...lines, [i.id]: { ...lines[i.id], expiry_date: e.target.value } })} /></td>
              </>}
            </tr>
          ))}
        </tbody>
      </table>
      {mode === "receive" && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Supplier invoice no."><Input value={extra.supplier_invoice_number} onChange={(e) => setExtra({ ...extra, supplier_invoice_number: e.target.value })} /></Field>
          <Field label="Transport / extra costs" hint="Spread into product cost"><Input type="number" value={extra.additional_costs} onChange={(e) => setExtra({ ...extra, additional_costs: e.target.value })} /></Field>
          <div className="ml-auto flex gap-2"><Button variant="secondary" onClick={() => setMode(null)}>Back</Button><Button onClick={submitReceive}>Confirm receipt</Button></div>
        </div>
      )}
      {mode === "return" && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Reason" className="flex-1"><Input value={extra.reason} onChange={(e) => setExtra({ ...extra, reason: e.target.value })} /></Field>
          <Button variant="secondary" onClick={() => setMode(null)}>Back</Button><Button variant="danger" onClick={submitReturn} disabled={!extra.reason}>Return to supplier</Button>
        </div>
      )}
      {po.notes && <p className="mt-3 text-sm text-slate-500">{po.notes}</p>}
    </Modal>
  );
}
