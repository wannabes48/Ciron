import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Plus, X } from "lucide-react";
import ProductPicker from "../components/ProductPicker";
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Pager, Select, StatusBadge, Table, Tabs, toast, useApi } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, dateTime, money, qty } from "../lib/format";

const KIND_OPTIONS = ["opening", "purchase", "purchase_return", "sale", "sale_return", "adjustment", "stocktake", "transfer_out", "transfer_in", "damaged", "expired"]
  .map((k) => ({ value: k, label: k.replace(/_/g, " ") }));

export default function Inventory() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "movements";
  const { can } = useAuth();
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Inventory" subtitle="Every unit in and out, with who, when and why." />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[
        { value: "movements", label: "Stock ledger" },
        { value: "adjustments", label: "Adjustments" },
        { value: "transfers", label: "Transfers" },
        { value: "stocktakes", label: "Stocktake" },
        { value: "expiry", label: "Batches & expiry" },
        { value: "reorder", label: "Reorder" },
      ]} />
      {tab === "movements" && <Movements />}
      {tab === "adjustments" && <Adjustments canApprove={can("stock.approve")} canManage={can("stock.manage")} />}
      {tab === "transfers" && <Transfers canManage={can("stock.manage")} />}
      {tab === "stocktakes" && <Stocktakes canManage={can("stock.manage")} canApprove={can("stock.approve")} />}
      {tab === "expiry" && <Expiry />}
      {tab === "reorder" && <Reorder />}
    </div>
  );
}

function Movements() {
  const [product, setProduct] = useState(null);
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading } = useApi("/stock/movements/", { product: product?.id, kind, page });
  return (
    <Card bodyClass="p-0">
      <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
        <ProductPicker className="w-72" value={product} onPick={setProduct} placeholder="Filter by product…" />
        {product && <Button variant="ghost" size="sm" onClick={() => setProduct(null)}>Clear</Button>}
        <Select className="max-w-[200px]" value={kind} onChange={(e) => setKind(e.target.value)} placeholder="All movement types" options={KIND_OPTIONS} />
      </div>
      <Table loading={loading} rows={data?.results} columns={[
        { key: "created_at", label: "When", render: (r) => dateTime(r.created_at) },
        { key: "product_name", label: "Product" },
        { key: "kind_display", label: "Type", render: (r) => <Badge color={Number(r.quantity) > 0 ? "green" : "red"}>{r.kind_display}</Badge> },
        { key: "quantity", label: "Qty", align: "right", render: (r) => <span className={Number(r.quantity) > 0 ? "text-emerald-700" : "text-rose-600"}>{Number(r.quantity) > 0 ? "+" : ""}{qty(r.quantity)}</span> },
        { key: "balance_after", label: "Balance", align: "right", render: (r) => qty(r.balance_after) },
        { key: "reference", label: "Reference" },
        { key: "branch_name", label: "Branch" },
        { key: "user_name", label: "By" },
        { key: "note", label: "Note", className: "max-w-[200px] truncate text-slate-500" },
      ]} />
      <Pager data={data} page={page} setPage={setPage} />
    </Card>
  );
}

function Adjustments({ canApprove, canManage }) {
  const [status, setStatus] = useState("");
  const { data, loading, reload } = useApi("/stock/adjustments/", { status });
  const [open, setOpen] = useState(false);
  const decide = async (id, action) => {
    try { await api(`/stock/adjustments/${id}/${action}/`, { method: "POST" }); reload(); } catch (err) { toast(err.message, "red"); }
  };
  return (
    <Card bodyClass="p-0" title="Stock adjustments" actions={<>
      <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All" className="w-36" options={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} />
      {canManage && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New adjustment</Button>}
    </>}>
      <Table loading={loading} rows={data?.results} columns={[
        { key: "created_at", label: "Date", render: (r) => dateTime(r.created_at) },
        { key: "product_name", label: "Product" },
        { key: "quantity", label: "Qty", align: "right", render: (r) => `${Number(r.quantity) > 0 ? "+" : ""}${qty(r.quantity)}` },
        { key: "reason", label: "Reason", render: (r) => r.reason.replace(/_/g, " ") },
        { key: "note", label: "Note" },
        { key: "requested_by_name", label: "Requested by" },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        { key: "act", label: "", render: (r) => canApprove && r.status === "pending" && (
          <div className="flex gap-1">
            <Button size="sm" onClick={() => decide(r.id, "approve")}><Check className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="secondary" onClick={() => decide(r.id, "reject")}><X className="h-3.5 w-3.5" /></Button>
          </div>) },
      ]} />
      {open && <AdjustmentForm onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} canApprove={canApprove} />}
    </Card>
  );
}

function AdjustmentForm({ onClose, onSaved, canApprove }) {
  const [product, setProduct] = useState(null);
  const [f, setF] = useState({ direction: "-1", quantity: "", reason: "damaged", unit: "", note: "", batch_number: "", expiry_date: "" });
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await api("/stock/adjustments/", { method: "POST", body: {
        product: product?.id, unit: f.unit || null, quantity: Number(f.quantity) * Number(f.direction), reason: f.reason, note: f.note,
        batch_number: f.batch_number, expiry_date: f.expiry_date || null } });
      toast(canApprove ? "Stock adjusted" : "Adjustment sent for approval");
      onSaved();
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal open onClose={onClose} title="Stock adjustment" size="sm" footer={<Button onClick={save}>{canApprove ? "Apply" : "Submit for approval"}</Button>}>
      <div className="space-y-3">
        <Alert>{error}</Alert>
        <Field label="Product"><ProductPicker value={product} onPick={setProduct} /></Field>
        {product && <p className="text-xs text-slate-500">Current stock: {qty(product.stock)} {product.unit_abbr}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Direction"><Select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })} options={[{ value: "-1", label: "Remove (−)" }, { value: "1", label: "Add (+)" }]} /></Field>
          <Field label="Quantity"><Input type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
        </div>
        {product?.units?.length > 0 && (
          <Field label="Unit"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} options={[{ value: "", label: product.unit_abbr }, ...product.units.map((u) => ({ value: u.id, label: u.name }))]} /></Field>
        )}
        <Field label="Reason"><Select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} options={[
          { value: "damaged", label: "Damaged" }, { value: "expired", label: "Expired" }, { value: "lost", label: "Lost / stolen" }, { value: "found", label: "Found" },
          { value: "correction", label: "Count correction" }, { value: "opening", label: "Opening stock" }, { value: "other", label: "Other" }]} /></Field>
        {f.direction === "1" && product?.track_batches && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Batch no."><Input value={f.batch_number} onChange={(e) => setF({ ...f, batch_number: e.target.value })} /></Field>
            <Field label="Expiry"><Input type="date" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} /></Field>
          </div>
        )}
        <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function Transfers({ canManage }) {
  const { data, loading, reload } = useApi("/stock/transfers/");
  const { branches, branch } = useAuth();
  const [open, setOpen] = useState(false);
  const act = async (id, action) => {
    try { await api(`/stock/transfers/${id}/${action}/`, { method: "POST" }); reload(); } catch (err) { toast(err.message, "red"); }
  };
  return (
    <Card bodyClass="p-0" title="Branch transfers" actions={canManage && branches.length > 1 && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New transfer</Button>}>
      {branches.length < 2 && <p className="p-4 text-sm text-slate-500">Add a second branch in Settings to transfer stock between locations.</p>}
      <Table loading={loading} rows={data?.results} columns={[
        { key: "number", label: "No." },
        { key: "created_at", label: "Date", render: (r) => date(r.created_at) },
        { key: "route", label: "Route", render: (r) => `${r.from_branch_name} → ${r.to_branch_name}` },
        { key: "items", label: "Items", render: (r) => r.items.map((i) => `${i.product_name} × ${qty(i.quantity)}`).join(", ") },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        { key: "act", label: "", render: (r) => canManage && (
          <div className="flex gap-1">
            {r.status === "pending" && <Button size="sm" onClick={() => act(r.id, "dispatch_goods")}>Dispatch</Button>}
            {r.status === "in_transit" && <Button size="sm" onClick={() => act(r.id, "receive")}>Receive</Button>}
            {["pending", "in_transit"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => act(r.id, "cancel")}>Cancel</Button>}
          </div>) },
      ]} />
      {open && <TransferForm branches={branches} from={branch?.id} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
    </Card>
  );
}

function TransferForm({ branches, from, onClose, onSaved }) {
  const [f, setF] = useState({ from_branch: from, to_branch: branches.find((b) => b.id !== from)?.id, note: "" });
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await api("/stock/transfers/", { method: "POST", body: { ...f, items: items.map((i) => ({ product: i.product.id, quantity: i.quantity })) } });
      onSaved();
    } catch (err) { setError(err.message); }
  };
  const opts = branches.map((b) => ({ value: b.id, label: b.name }));
  return (
    <Modal open onClose={onClose} title="New stock transfer" footer={<Button onClick={save}>Create transfer</Button>}>
      <div className="space-y-3">
        <Alert>{error}</Alert>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><Select value={f.from_branch} onChange={(e) => setF({ ...f, from_branch: Number(e.target.value) })} options={opts} /></Field>
          <Field label="To"><Select value={f.to_branch} onChange={(e) => setF({ ...f, to_branch: Number(e.target.value) })} options={opts} /></Field>
        </div>
        <ProductPicker onPick={(p) => setItems([...items, { product: p, quantity: 1 }])} placeholder="Add product…" />
        {items.map((i, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{i.product.name}</span>
            <Input type="number" className="w-28" value={i.quantity} onChange={(e) => setItems(items.map((x, j) => j === idx ? { ...x, quantity: e.target.value } : x))} />
            <span className="w-10 text-xs text-slate-500">{i.product.unit_abbr}</span>
            <button onClick={() => setItems(items.filter((_, j) => j !== idx))} className="text-rose-500"><X className="h-4 w-4" /></button>
          </div>
        ))}
        <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function Stocktakes({ canManage, canApprove }) {
  const { data, loading, reload } = useApi("/stock/stocktakes/");
  const [active, setActive] = useState(null);
  const start = async () => {
    try { const st = await api("/stock/stocktakes/", { method: "POST", body: { note: "" } }); reload(); setActive(st); } catch (err) { toast(err.message, "red"); }
  };
  return (
    <Card bodyClass="p-0" title="Stocktakes (physical counts)" actions={canManage && <Button size="sm" onClick={start}><Plus className="h-4 w-4" />Start count</Button>}>
      <Table loading={loading} rows={data?.results} onRowClick={setActive} columns={[
        { key: "number", label: "No." },
        { key: "created_at", label: "Started", render: (r) => dateTime(r.created_at) },
        { key: "branch_name", label: "Branch" },
        { key: "lines", label: "Counted", render: (r) => `${r.lines.filter((l) => l.counted_quantity !== null).length} / ${r.lines.length}` },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]} />
      {active && <StocktakeSheet stocktake={active} canApprove={canApprove} onClose={() => { setActive(null); reload(); }} />}
    </Card>
  );
}

function StocktakeSheet({ stocktake, canApprove, onClose }) {
  const [st, setSt] = useState(stocktake);
  const [counts, setCounts] = useState({});
  const [filter, setFilter] = useState("");
  const open = st.status === "open";
  const save = async () => {
    const payload = Object.entries(counts).map(([product, counted_quantity]) => ({ product, counted_quantity }));
    setSt(await api(`/stock/stocktakes/${st.id}/count/`, { method: "POST", body: { counts: payload } }));
    setCounts({});
    toast("Counts saved");
  };
  const complete = async () => {
    if (!window.confirm("Post all variances to stock? This cannot be undone.")) return;
    try {
      if (Object.keys(counts).length) await save();
      const r = await api(`/stock/stocktakes/${st.id}/complete/`, { method: "POST" });
      toast(`Stocktake completed — ${r.variances.length} variances posted`);
      onClose();
    } catch (err) { toast(err.message, "red"); }
  };
  const lines = st.lines.filter((l) => !filter || l.product_name.toLowerCase().includes(filter.toLowerCase()) || l.barcode === filter);
  return (
    <Modal open onClose={onClose} title={`Stocktake ${st.number}`} size="lg" footer={open && <>
      <Button variant="secondary" onClick={save}>Save counts</Button>
      {canApprove && <Button onClick={complete}>Complete & post variances</Button>}
    </>}>
      <Input placeholder="Filter or scan barcode…" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-3" />
      <Table rows={lines} columns={[
        { key: "product_name", label: "Product" },
        { key: "expected_quantity", label: "Expected", align: "right", render: (r) => qty(r.expected_quantity) },
        { key: "counted", label: "Counted", align: "right", render: (r) => open ? (
          <Input type="number" className="ml-auto w-24 text-right" value={counts[r.product] ?? r.counted_quantity ?? ""} onChange={(e) => setCounts({ ...counts, [r.product]: e.target.value })} />
        ) : qty(r.counted_quantity) },
        { key: "var", label: "Variance", align: "right", render: (r) => {
          const c = counts[r.product] ?? r.counted_quantity;
          if (c === null || c === undefined || c === "") return "—";
          const v = Number(c) - Number(r.expected_quantity);
          return <span className={v < 0 ? "text-rose-600" : v > 0 ? "text-emerald-700" : ""}>{v > 0 ? "+" : ""}{qty(v)}</span>;
        } },
      ]} />
    </Modal>
  );
}

function Expiry() {
  const [days, setDays] = useState(60);
  const { data, loading } = useApi("/stock/batches/expiring/", { days });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card bodyClass="p-0" title="Batches expiring soon" actions={<Select value={days} onChange={(e) => setDays(e.target.value)} className="w-40"
      options={[30, 60, 90, 180].map((d) => ({ value: d, label: `Next ${d} days` }))} />}>
      <Table loading={loading} rows={data} empty="No batches expiring in this window." columns={[
        { key: "product_name", label: "Product" },
        { key: "batch_number", label: "Batch" },
        { key: "branch_name", label: "Branch" },
        { key: "expiry_date", label: "Expiry", render: (r) => <span className={r.expiry_date < today ? "font-medium text-rose-600" : "text-amber-700"}>{date(r.expiry_date)}{r.expiry_date < today && " (expired)"}</span> },
        { key: "quantity_remaining", label: "Qty left", align: "right", render: (r) => qty(r.quantity_remaining) },
        { key: "value", label: "Value at cost", align: "right", render: (r) => money(Number(r.quantity_remaining) * Number(r.unit_cost)) },
      ]} />
    </Card>
  );
}

function Reorder() {
  const { data, loading } = useApi("/stock/insights/reorder/");
  return (
    <Card bodyClass="p-0" title="Reorder recommendations" actions={<span className="text-xs text-slate-500">Suggested qty covers ~14 days of recent sales</span>}>
      <Table loading={loading} rows={data} rowKey="product" empty="Nothing needs reordering." columns={[
        { key: "name", label: "Product" },
        { key: "stock", label: "In stock", align: "right", render: (r) => `${qty(r.stock)} ${r.unit}` },
        { key: "reorder_level", label: "Reorder level", align: "right", render: (r) => qty(r.reorder_level) },
        { key: "avg_daily_sales", label: "Avg daily sales", align: "right", render: (r) => qty(r.avg_daily_sales) },
        { key: "suggested_quantity", label: "Suggested order", align: "right", render: (r) => <span className="font-semibold">{qty(r.suggested_quantity)}</span> },
      ]} />
    </Card>
  );
}
