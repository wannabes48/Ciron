import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import ProductPicker from "../components/ProductPicker";
import Statement from "../components/Statement";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Pager, Select, StatusBadge, Table, Tabs, Textarea, toast, useApi } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, money } from "../lib/format";

const CATS = [{ value: "retail", label: "Retail" }, { value: "wholesale", label: "Wholesale" }, { value: "distributor", label: "Distributor" }];

export default function Customers() {
  const { can } = useAuth();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const { data, loading, reload } = useApi("/customers/", { search, category, page, with_balance: tab === "debtors" ? 1 : undefined, ordering: tab === "debtors" ? "-balance" : undefined });
  useEffect(() => setPage(1), [search, category, tab]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Customers" subtitle="Customer accounts, credit and purchase history."
        actions={can("customers.manage") && <Button onClick={() => setEditing({ category: "retail", credit_limit: 0, payment_terms_days: 30, discount_percent: 0, sms_opt_in: true, is_active: true })}><Plus className="h-4 w-4" />Add customer</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "all", label: "All customers" }, { value: "debtors", label: "With balances" }, { value: "aging", label: "Debt aging" }]} />
      {tab === "aging" ? <Aging onOpen={async (id) => setViewing(await api(`/customers/${id}/`))} /> : (
        <Card bodyClass="p-0">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            <Input placeholder="Search name, phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All types" className="max-w-[160px]" options={CATS} />
          </div>
          <Table loading={loading} rows={data?.results} onRowClick={setViewing} columns={[
            { key: "name", label: "Name", render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-400">{r.phone}</div></div> },
            { key: "category", label: "Type", render: (r) => <Badge color={r.category === "retail" ? "slate" : "blue"}>{r.category}</Badge> },
            { key: "credit_limit", label: "Credit limit", align: "right", render: (r) => Number(r.credit_limit) ? money(r.credit_limit) : "—" },
            { key: "balance", label: "Balance owed", align: "right", render: (r) => <span className={Number(r.balance) > 0 ? "font-medium text-rose-600" : ""}>{money(r.balance)}</span> },
            { key: "overdue_amount", label: "Overdue", align: "right", render: (r) => Number(r.overdue_amount) > 0 ? <span className="text-rose-600">{money(r.overdue_amount)}</span> : "—" },
            { key: "loyalty_points", label: "Points", align: "right" },
          ]} />
          <Pager data={data} page={page} setPage={setPage} />
        </Card>
      )}
      {editing && <CustomerForm customer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {viewing && <CustomerDetail customer={viewing} onClose={() => { setViewing(null); reload(); }} onEdit={() => { setEditing(viewing); setViewing(null); }} />}
    </div>
  );
}

function Aging({ onOpen }) {
  const { data, loading } = useApi("/customers/debtors/");
  return (
    <Card bodyClass="p-0">
      <Table loading={loading} rows={data} rowKey="customer" onRowClick={(r) => onOpen(r.customer)} empty="No outstanding debts." columns={[
        { key: "name", label: "Customer" }, { key: "phone", label: "Phone" },
        { key: "current", label: "Not yet due", align: "right", render: (r) => money(r.current) },
        { key: "1_30", label: "1–30 days", align: "right", render: (r) => money(r["1_30"]) },
        { key: "31_60", label: "31–60", align: "right", render: (r) => money(r["31_60"]) },
        { key: "61_90", label: "61–90", align: "right", render: (r) => money(r["61_90"]) },
        { key: "90_plus", label: "90+", align: "right", render: (r) => <span className={Number(r["90_plus"]) ? "text-rose-600" : ""}>{money(r["90_plus"])}</span> },
        { key: "total", label: "Total", align: "right", render: (r) => <span className="font-semibold">{money(r.total)}</span> },
      ]} />
    </Card>
  );
}

function CustomerForm({ customer, onClose, onSaved }) {
  const [f, setF] = useState(customer);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async () => {
    try {
      await api(f.id ? `/customers/${f.id}/` : "/customers/", { method: f.id ? "PATCH" : "POST", body: f });
      onSaved();
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal open onClose={onClose} title={f.id ? "Edit customer" : "New customer"} footer={<Button onClick={save}>Save</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Alert>{error}</Alert></div>
        <Field label="Name" className="sm:col-span-2"><Input value={f.name || ""} onChange={set("name")} autoFocus /></Field>
        <Field label="Phone"><Input value={f.phone || ""} onChange={set("phone")} /></Field>
        <Field label="Email"><Input value={f.email || ""} onChange={set("email")} /></Field>
        <Field label="Type"><Select value={f.category} onChange={set("category")} options={CATS} /></Field>
        <Field label="KRA PIN"><Input value={f.kra_pin || ""} onChange={set("kra_pin")} /></Field>
        <Field label="Credit limit (KSh)" hint="0 = cash only"><Input type="number" value={f.credit_limit} onChange={set("credit_limit")} /></Field>
        <Field label="Payment terms (days)"><Input type="number" value={f.payment_terms_days} onChange={set("payment_terms_days")} /></Field>
        <Field label="Standing discount (%)"><Input type="number" value={f.discount_percent} onChange={set("discount_percent")} /></Field>
        <Field label="Address"><Input value={f.address || ""} onChange={set("address")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes || ""} onChange={set("notes")} /></Field>
        <div className="flex gap-5"><Checkbox label="SMS notifications" checked={f.sms_opt_in} onChange={set("sms_opt_in")} /><Checkbox label="Active" checked={f.is_active} onChange={set("is_active")} /></div>
      </div>
    </Modal>
  );
}

function CustomerDetail({ customer, onClose, onEdit }) {
  const { can } = useAuth();
  const [c, setC] = useState(customer);
  const [tab, setTab] = useState("history");
  const history = useApi(tab === "history" ? `/customers/${c.id}/history/` : null);
  const statement = useApi(tab === "statement" ? `/customers/${c.id}/statement/` : null);
  const prices = useApi(tab === "prices" ? "/customer-prices/" : null, { customer: c.id });
  const [pay, setPay] = useState({ amount: "", method: "cash", reference: "" });
  const [busy, setBusy] = useState(false);

  const receive = async () => {
    setBusy(true);
    try {
      const r = await api(`/customers/${c.id}/receive_payment/`, { method: "POST", body: pay });
      toast(`Payment recorded. New balance ${money(r.customer_balance)}`);
      setC(await api(`/customers/${c.id}/`));
      setPay({ amount: "", method: "cash", reference: "" });
      statement.reload(); history.reload();
    } catch (err) { toast(err.message, "red"); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={c.name} size="lg" footer={can("customers.manage") && <Button variant="secondary" onClick={onEdit}>Edit details</Button>}>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Balance owed", money(c.balance), Number(c.balance) > 0 && "text-rose-600"], ["Available credit", money(c.available_credit)], ["Overdue", money(c.overdue_amount), Number(c.overdue_amount) > 0 && "text-rose-600"], ["Loyalty points", c.loyalty_points]].map(([l, v, cls]) => (
          <div key={l} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{l}</div><div className={`text-lg font-semibold ${cls || ""}`}>{v}</div></div>
        ))}
      </div>
      {Number(c.balance) > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
          <Field label="Receive payment (KSh)"><Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="w-36" /></Field>
          <Field label="Method"><Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} options={[{ value: "cash", label: "Cash" }, { value: "mpesa", label: "M-Pesa" }, { value: "bank", label: "Bank" }, { value: "cheque", label: "Cheque" }, { value: "card", label: "Card" }]} /></Field>
          <Field label="Reference"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value.toUpperCase() })} className="w-40" /></Field>
          <Button onClick={receive} loading={busy} disabled={!pay.amount}>Record payment</Button>
          <span className="text-xs text-slate-400">Applied to oldest unpaid sales first.</span>
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "history", label: "Purchases" }, { value: "statement", label: "Statement" }, { value: "prices", label: "Special prices" }]} />
      {tab === "history" && (
        <Table loading={history.loading} rows={history.data} columns={[
          { key: "number", label: "Sale" }, { key: "created_at", label: "Date", render: (r) => date(r.created_at) },
          { key: "sale_type", label: "Type" }, { key: "payment_status", label: "Status", render: (r) => <StatusBadge status={r.payment_status} /> },
          { key: "due_date", label: "Due", render: (r) => Number(r.balance) > 0 ? date(r.due_date) : "" },
          { key: "total", label: "Total", align: "right", render: (r) => money(r.total) },
          { key: "balance", label: "Balance", align: "right", render: (r) => Number(r.balance) ? money(r.balance) : "—" },
        ]} />
      )}
      {tab === "statement" && statement.data && <Statement party={statement.data.customer} rows={statement.data.rows} />}
      {tab === "prices" && <SpecialPrices customer={c} data={prices.data?.results} reload={prices.reload} />}
    </Modal>
  );
}

function SpecialPrices({ customer, data, reload }) {
  const { can } = useAuth();
  const [product, setProduct] = useState(null);
  const [price, setPrice] = useState("");
  const add = async () => {
    try { await api("/customer-prices/", { method: "POST", body: { customer: customer.id, product: product.id, price } }); setProduct(null); setPrice(""); reload(); }
    catch (err) { toast(err.message, "red"); }
  };
  return (
    <div>
      {can("products.manage") && (
        <div className="mb-3 flex gap-2">
          <ProductPicker className="flex-1" value={product} onPick={setProduct} />
          <Input type="number" placeholder="Price" className="w-32" value={price} onChange={(e) => setPrice(e.target.value)} />
          <Button onClick={add} disabled={!product || !price}>Add</Button>
        </div>
      )}
      <Table rows={data} empty="No negotiated prices. Standard retail/wholesale pricing applies." columns={[
        { key: "product_name", label: "Product" }, { key: "unit_name", label: "Unit", render: (r) => r.unit_name || "base" },
        { key: "price", label: "Price", align: "right", render: (r) => money(r.price) },
        { key: "x", label: "", render: (r) => can("products.manage") && <button className="text-rose-500" onClick={async () => { await api(`/customer-prices/${r.id}/`, { method: "DELETE" }); reload(); }}><Trash2 className="h-4 w-4" /></button> },
      ]} />
    </div>
  );
}
