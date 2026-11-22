import { useState } from "react";
import { Plus } from "lucide-react";
import Statement from "../components/Statement";
import { Alert, Button, Card, Field, Input, Modal, PageHeader, Select, Table, Tabs, Textarea, toast, useApi } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime, money } from "../lib/format";

export default function Suppliers() {
  const { can } = useAuth();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const { data, loading, reload } = useApi("/suppliers/", { search });
  const perf = useApi(tab === "performance" ? "/suppliers/performance/" : null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Suppliers" subtitle="Who you buy from, and what you owe them."
        actions={can("suppliers.manage") && <Button onClick={() => setEditing({ payment_terms_days: 30, is_active: true })}><Plus className="h-4 w-4" />Add supplier</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "all", label: "Suppliers" }, { value: "performance", label: "Performance" }]} />
      {tab === "all" ? (
        <Card bodyClass="p-0">
          <div className="border-b border-slate-100 p-3"><Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" /></div>
          <Table loading={loading} rows={data?.results} onRowClick={setViewing} columns={[
            { key: "name", label: "Supplier", render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-400">{r.contact_person}</div></div> },
            { key: "phone", label: "Phone" }, { key: "kra_pin", label: "KRA PIN" },
            { key: "payment_terms_days", label: "Terms", render: (r) => `${r.payment_terms_days} days` },
            { key: "balance", label: "We owe", align: "right", render: (r) => <span className={Number(r.balance) > 0 ? "font-medium text-rose-600" : ""}>{money(r.balance)}</span> },
          ]} />
        </Card>
      ) : (
        <Card bodyClass="p-0">
          <Table loading={perf.loading} rows={perf.data} rowKey="supplier" columns={[
            { key: "name", label: "Supplier" }, { key: "orders", label: "Orders", align: "right" },
            { key: "fulfilment_rate", label: "Fully delivered", align: "right", render: (r) => r.fulfilment_rate === null ? "—" : `${r.fulfilment_rate}%` },
            { key: "purchased_value", label: "Purchased", align: "right", render: (r) => money(r.purchased_value) },
            { key: "returned_value", label: "Returned", align: "right", render: (r) => money(r.returned_value) },
            { key: "balance", label: "Balance", align: "right", render: (r) => money(r.balance) },
          ]} />
        </Card>
      )}
      {editing && <SupplierForm supplier={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {viewing && <SupplierDetail supplier={viewing} onClose={() => { setViewing(null); reload(); }} onEdit={() => { setEditing(viewing); setViewing(null); }} />}
    </div>
  );
}

function SupplierForm({ supplier, onClose, onSaved }) {
  const [f, setF] = useState(supplier);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try { await api(f.id ? `/suppliers/${f.id}/` : "/suppliers/", { method: f.id ? "PATCH" : "POST", body: f }); onSaved(); }
    catch (err) { setError(err.message); }
  };
  return (
    <Modal open onClose={onClose} title={f.id ? "Edit supplier" : "New supplier"} footer={<Button onClick={save}>Save</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Alert>{error}</Alert></div>
        <Field label="Name" className="sm:col-span-2"><Input value={f.name || ""} onChange={set("name")} autoFocus /></Field>
        <Field label="Contact person"><Input value={f.contact_person || ""} onChange={set("contact_person")} /></Field>
        <Field label="Phone"><Input value={f.phone || ""} onChange={set("phone")} /></Field>
        <Field label="Email"><Input value={f.email || ""} onChange={set("email")} /></Field>
        <Field label="KRA PIN"><Input value={f.kra_pin || ""} onChange={set("kra_pin")} /></Field>
        <Field label="Payment terms (days)"><Input type="number" value={f.payment_terms_days} onChange={set("payment_terms_days")} /></Field>
        <Field label="Address"><Input value={f.address || ""} onChange={set("address")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes || ""} onChange={set("notes")} /></Field>
      </div>
    </Modal>
  );
}

function SupplierDetail({ supplier, onClose, onEdit }) {
  const { can } = useAuth();
  const [s, setS] = useState(supplier);
  const [tab, setTab] = useState("statement");
  const statement = useApi(tab === "statement" ? `/suppliers/${s.id}/statement/` : null);
  const catalog = useApi(tab === "catalog" ? `/suppliers/${s.id}/catalog/` : null);
  const payments = useApi(tab === "payments" ? `/suppliers/${s.id}/payments/` : null);
  const orders = useApi("/purchase-orders/", { supplier: s.id, status__in: "partial,received" });
  const [pay, setPay] = useState({ amount: "", method: "bank", reference: "", purchase_order: "" });
  const record = async () => {
    try {
      await api(`/suppliers/${s.id}/pay/`, { method: "POST", body: { ...pay, purchase_order: pay.purchase_order || null } });
      toast("Supplier payment recorded");
      setS(await api(`/suppliers/${s.id}/`));
      setPay({ amount: "", method: "bank", reference: "", purchase_order: "" });
      statement.reload(); payments.reload();
    } catch (err) { toast(err.message, "red"); }
  };
  return (
    <Modal open onClose={onClose} title={s.name} size="lg" footer={can("suppliers.manage") && <Button variant="secondary" onClick={onEdit}>Edit details</Button>}>
      <div className="mb-4 rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">We owe</div><div className="text-xl font-semibold">{money(s.balance)}</div></div>
      {can("payments.manage") && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
          <Field label="Pay supplier (KSh)"><Input type="number" className="w-32" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="Method"><Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} options={["cash", "mpesa", "bank", "cheque"].map((m) => ({ value: m, label: m }))} /></Field>
          <Field label="Reference"><Input className="w-36" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
          <Field label="Against order"><Select value={pay.purchase_order} onChange={(e) => setPay({ ...pay, purchase_order: e.target.value })} placeholder="General"
            options={(orders.data?.results || []).filter((o) => Number(o.balance) > 0).map((o) => ({ value: o.id, label: `${o.number} (${money(o.balance)})` }))} /></Field>
          <Button onClick={record} disabled={!pay.amount}>Record</Button>
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "statement", label: "Statement" }, { value: "payments", label: "Payments" }, { value: "catalog", label: "Products supplied" }]} />
      {tab === "statement" && statement.data && <Statement party={statement.data.supplier} rows={statement.data.rows} kind="supplier" />}
      {tab === "payments" && <Table rows={payments.data} columns={[
        { key: "created_at", label: "Date", render: (r) => dateTime(r.created_at) }, { key: "method", label: "Method" },
        { key: "reference", label: "Reference" }, { key: "order_number", label: "Order" },
        { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) }]} />}
      {tab === "catalog" && <Table rows={catalog.data} empty="Products appear here once you receive goods from this supplier." columns={[
        { key: "product_name", label: "Product" }, { key: "supplier_code", label: "Supplier code" },
        { key: "last_cost", label: "Last cost (per base unit)", align: "right", render: (r) => money(r.last_cost) }]} />}
    </Modal>
  );
}
