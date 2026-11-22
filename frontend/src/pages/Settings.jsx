import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Table, Tabs, Textarea, toast, useApi } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PAYMENT_LABELS } from "../lib/format";

export default function Settings() {
  const [tab, setTab] = useState("business");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" subtitle="Configure Ciron for your business." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "business", label: "Business profile" }, { value: "tax", label: "Tax & sales" }, { value: "receipt", label: "Receipts" }, { value: "branches", label: "Branches" }]} />
      {tab === "branches" ? <Branches /> : <BusinessForm section={tab} />}
    </div>
  );
}

function BusinessForm({ section }) {
  const { setBusiness } = useAuth();
  const { data } = useApi("/settings/");
  const [f, setF] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF({ ...data, enabled_payment_methods: data.payment_methods }); }, [data]);
  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true);
    setError("");
    const body = { ...f };
    delete body.logo;
    try {
      const saved = await api("/settings/", { method: "PATCH", body });
      setBusiness(saved);
      toast("Settings saved");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const uploadLogo = async (file) => {
    const fd = new FormData();
    fd.append("logo", file);
    try { setBusiness(await api("/settings/", { method: "PATCH", body: fd })); toast("Logo updated"); } catch (err) { toast(err.message, "red"); }
  };
  const togglePM = (m) => setF({ ...f, enabled_payment_methods: f.enabled_payment_methods.includes(m) ? f.enabled_payment_methods.filter((x) => x !== m) : [...f.enabled_payment_methods, m] });

  return (
    <Card>
      <div className="space-y-4">
        <Alert>{error}</Alert>
        {section === "business" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name"><Input value={f.name} onChange={set("name")} /></Field>
            <Field label="Shop address" hint="Contact support to change"><Input value={`${f.subdomain}.ciron`} disabled /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Email"><Input value={f.email} onChange={set("email")} /></Field>
            <Field label="Physical address / location" className="sm:col-span-2"><Input value={f.address} onChange={set("address")} /></Field>
            <Field label="KRA PIN"><Input value={f.kra_pin} onChange={set("kra_pin")} placeholder="P051234567X" /></Field>
            <Field label="Currency"><Input value={f.currency} disabled /></Field>
            <Field label="Logo">
              <div className="flex items-center gap-3">{f.logo && <img src={f.logo} alt="" className="h-12 w-12 rounded object-contain" />}
                <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && uploadLogo(e.target.files[0])} className="text-sm" /></div>
            </Field>
          </div>
        )}
        {section === "tax" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 pt-5">
                <Checkbox label="Registered for VAT" checked={f.vat_registered} onChange={set("vat_registered")} />
                <Checkbox label="Selling prices include VAT" checked={f.prices_include_vat} onChange={set("prices_include_vat")} />
              </div>
              <Field label="VAT rate (%)"><Input type="number" value={f.vat_rate} onChange={set("vat_rate")} disabled={!f.vat_registered} /></Field>
            </div>
            <Checkbox label="Allow selling when stock shows zero (negative stock)" checked={f.allow_negative_stock} onChange={set("allow_negative_stock")} />
            <Field label="Loyalty points earned per KSh 100 spent" hint="0 turns loyalty off"><Input type="number" value={f.loyalty_points_per_100} onChange={set("loyalty_points_per_100")} className="max-w-[200px]" /></Field>
            <div>
              <div className="mb-2 text-xs font-medium text-slate-600">Accepted payment methods</div>
              <div className="flex flex-wrap gap-4">
                {["cash", "mpesa", "card", "bank", "cheque"].map((m) => <Checkbox key={m} label={PAYMENT_LABELS[m]} checked={f.enabled_payment_methods.includes(m)} onChange={() => togglePM(m)} />)}
              </div>
            </div>
            <Alert tone="amber">KRA eTIMS electronic invoicing is planned; invoices already reserve an eTIMS number field.</Alert>
          </div>
        )}
        {section === "receipt" && (
          <div className="grid gap-3">
            <Field label="Receipt header (shown under business details)"><Textarea value={f.receipt_header} onChange={set("receipt_header")} /></Field>
            <Field label="Receipt footer"><Textarea value={f.receipt_footer} onChange={set("receipt_footer")} placeholder="Thank you! Goods once sold are not returnable after 7 days." /></Field>
          </div>
        )}
        <div className="flex justify-end"><Button onClick={save} loading={busy}>Save changes</Button></div>
      </div>
    </Card>
  );
}

function Branches() {
  const { refresh } = useAuth();
  const { data, loading, reload } = useApi("/branches/");
  const [editing, setEditing] = useState(null);
  const save = async () => {
    try {
      await api(editing.id ? `/branches/${editing.id}/` : "/branches/", { method: editing.id ? "PATCH" : "POST", body: editing });
      setEditing(null);
      reload();
      refresh();
    } catch (err) { toast(err.message, "red"); }
  };
  return (
    <Card bodyClass="p-0" title="Branches & warehouses" actions={<Button size="sm" onClick={() => setEditing({ name: "", code: "", location: "", phone: "", is_warehouse: false, is_active: true })}><Plus className="h-4 w-4" />Add branch</Button>}>
      <Table loading={loading} rows={data?.results} onRowClick={setEditing} columns={[
        { key: "name", label: "Name", render: (r) => <>{r.name} {r.is_main && <Badge color="green">main</Badge>} {r.is_warehouse && <Badge>warehouse</Badge>}</> },
        { key: "code", label: "Code" }, { key: "location", label: "Location" }, { key: "phone", label: "Phone" },
        { key: "is_active", label: "Status", render: (r) => r.is_active ? "Active" : "Closed" },
      ]} />
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? "Edit branch" : "New branch"} size="sm" footer={<Button onClick={save}>Save</Button>}>
          <div className="space-y-3">
            <Field label="Name"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus /></Field>
            <Field label="Code"><Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></Field>
            <Field label="Location"><Input value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></Field>
            <Field label="Phone"><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
            <Checkbox label="This is a warehouse" checked={editing.is_warehouse} onChange={(e) => setEditing({ ...editing, is_warehouse: e.target.checked })} />
            <Checkbox label="Active" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
          </div>
        </Modal>
      )}
    </Card>
  );
}
