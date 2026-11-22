import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Alert, Button, Card, Field, Input, Modal, PageHeader, Pager, Select, StatusBadge, Table, toast, useApi } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, daysAgo, money, today } from "../lib/format";

export default function Expenses() {
  const { can } = useAuth();
  const [range, setRange] = useState({ from: daysAgo(29), to: today() });
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const cats = useApi("/expense-categories/");
  const filters = { date__gte: range.from, date__lte: range.to, category };
  const { data, loading, reload } = useApi("/expenses/", { ...filters, page });
  const summary = useApi("/expenses/summary/", { ...filters, period: "monthly" });
  const decide = async (id, action) => {
    try { await api(`/expenses/${id}/${action}/`, { method: "POST" }); reload(); summary.reload(); } catch (err) { toast(err.message, "red"); }
  };
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Expenses" subtitle="Rent, power, transport, salaries and other running costs."
        actions={can("expenses.manage") && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Record expense</Button>} />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Approved in period">
          <div className="text-2xl font-semibold">{money(summary.data?.total)}</div>
          <ul className="mt-3 space-y-1 text-sm">
            {summary.data?.by_category.map((c) => <li key={c.category} className="flex justify-between"><span className="text-slate-600">{c.category}</span><span className="tabular">{money(c.total)}</span></li>)}
          </ul>
        </Card>
        <Card className="lg:col-span-2" bodyClass="p-0">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="max-w-[160px]" />
            <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="max-w-[160px]" />
            <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories" className="max-w-[200px]" options={(cats.data || []).map((c) => ({ value: c.id, label: c.name }))} />
          </div>
          <Table loading={loading} rows={data?.results} columns={[
            { key: "date", label: "Date", render: (r) => date(r.date) }, { key: "category_name", label: "Category" },
            { key: "description", label: "Description", render: (r) => <>{r.description}{r.recurrence && <span className="ml-1 text-xs text-slate-400">({r.recurrence})</span>}{r.receipt && <a href={r.receipt} target="_blank" rel="noreferrer" className="ml-1 text-xs text-brand-700">receipt</a>}</> },
            { key: "payment_method", label: "Paid via" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
            { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
            { key: "act", label: "", render: (r) => can("expenses.approve") && r.status === "pending" && (
              <div className="flex gap-1"><Button size="sm" onClick={() => decide(r.id, "approve")}><Check className="h-3.5 w-3.5" /></Button><Button size="sm" variant="secondary" onClick={() => decide(r.id, "reject")}><X className="h-3.5 w-3.5" /></Button></div>) },
          ]} />
          <Pager data={data} page={page} setPage={setPage} />
        </Card>
      </div>
      {open && <ExpenseForm categories={cats.data || []} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); summary.reload(); }} />}
    </div>
  );
}

function ExpenseForm({ categories, onClose, onSaved }) {
  const [f, setF] = useState({ category: categories[0]?.id || "", description: "", amount: "", date: today(), payment_method: "cash", reference: "", recurrence: "" });
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append("receipt", file);
    try { await api("/expenses/", { method: "POST", body: fd }); onSaved(); } catch (err) { setError(err.message); }
  };
  return (
    <Modal open onClose={onClose} title="Record expense" footer={<Button onClick={save}>Save</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Alert>{error}</Alert></div>
        <Field label="Category"><Select value={f.category} onChange={set("category")} options={categories.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Amount (KSh)"><Input type="number" value={f.amount} onChange={set("amount")} autoFocus /></Field>
        <Field label="Description" className="sm:col-span-2"><Input value={f.description} onChange={set("description")} /></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={set("date")} /></Field>
        <Field label="Paid via"><Select value={f.payment_method} onChange={set("payment_method")} options={["cash", "mpesa", "bank", "card", "cheque"].map((m) => ({ value: m, label: m }))} /></Field>
        <Field label="Reference"><Input value={f.reference} onChange={set("reference")} /></Field>
        <Field label="Repeats"><Select value={f.recurrence} onChange={set("recurrence")} options={[{ value: "", label: "One-off" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]} /></Field>
        <Field label="Receipt (photo / PDF)" className="sm:col-span-2"><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0])} className="text-sm" /></Field>
      </div>
    </Modal>
  );
}
