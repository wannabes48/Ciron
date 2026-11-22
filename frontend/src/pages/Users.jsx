import { useState } from "react";
import { Plus } from "lucide-react";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Select, Table, Tabs, useApi } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime } from "../lib/format";

export default function Users() {
  const [tab, setTab] = useState("staff");
  const { data, loading, reload } = useApi("/users/");
  const roles = useApi("/auth/roles/");
  const [editing, setEditing] = useState(null);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Employees" subtitle="Staff accounts, roles and access."
        actions={<Button onClick={() => setEditing({ role: "cashier", is_active: true, extra_permissions: [], revoked_permissions: [], branches: [] })}><Plus className="h-4 w-4" />Add employee</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "staff", label: "Staff" }, { value: "shifts", label: "Shifts" }, { value: "logins", label: "Login history" }, { value: "activity", label: "Activity log" }]} />
      {tab === "staff" && (
        <Card bodyClass="p-0">
          <Table loading={loading} rows={data?.results} onRowClick={setEditing} columns={[
            { key: "full_name", label: "Name", render: (r) => <div><div className="font-medium">{r.full_name || r.username}</div><div className="text-xs text-slate-400">@{r.username}</div></div> },
            { key: "role_display", label: "Role", render: (r) => <Badge color="blue">{r.role_display}</Badge> },
            { key: "phone", label: "Phone" },
            { key: "last_login", label: "Last login", render: (r) => dateTime(r.last_login) },
            { key: "is_active", label: "Status", render: (r) => r.is_active ? <Badge color="green">active</Badge> : <Badge color="red">suspended</Badge> },
          ]} />
        </Card>
      )}
      {tab === "shifts" && <Shifts />}
      {tab === "logins" && <Logins />}
      {tab === "activity" && <Activity />}
      {editing && roles.data && <UserForm user={editing} roles={roles.data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function UserForm({ user, roles, onClose, onSaved }) {
  const { branches } = useAuth();
  const [f, setF] = useState({ ...user, password: "", pos_pin: "" });
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const roleDef = roles.roles.find((r) => r.value === f.role);
  const basePerms = new Set(roleDef?.permissions || []);
  const has = (code) => (basePerms.has(code) && !f.revoked_permissions.includes(code)) || f.extra_permissions.includes(code);
  const toggle = (code) => {
    if (basePerms.has(code)) {
      setF({ ...f, revoked_permissions: has(code) ? [...f.revoked_permissions, code] : f.revoked_permissions.filter((c) => c !== code) });
    } else {
      setF({ ...f, extra_permissions: has(code) ? f.extra_permissions.filter((c) => c !== code) : [...f.extra_permissions, code] });
    }
  };
  const save = async () => {
    const body = { ...f };
    if (!body.password) delete body.password;
    if (!body.pos_pin) delete body.pos_pin;
    delete body.permissions;
    try { await api(f.id ? `/users/${f.id}/` : "/users/", { method: f.id ? "PATCH" : "POST", body }); onSaved(); }
    catch (err) { setError(err.message); }
  };
  return (
    <Modal open onClose={onClose} title={f.id ? `Edit ${f.full_name || f.username}` : "New employee"} size="lg" footer={<Button onClick={save}>Save</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Alert>{error}</Alert></div>
        <Field label="Full name"><Input value={f.full_name || ""} onChange={set("full_name")} autoFocus /></Field>
        <Field label="Username (for login)"><Input value={f.username || ""} onChange={set("username")} /></Field>
        <Field label="Phone"><Input value={f.phone || ""} onChange={set("phone")} /></Field>
        <Field label="Email"><Input value={f.email || ""} onChange={set("email")} /></Field>
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, extra_permissions: [], revoked_permissions: [] })} options={roles.roles.map((r) => ({ value: r.value, label: r.label }))} /></Field>
        <Field label="Default branch"><Select value={f.default_branch || ""} onChange={set("default_branch")} placeholder="—" options={branches.map((b) => ({ value: b.id, label: b.name }))} /></Field>
        <Field label={f.id ? "New password (leave blank to keep)" : "Password"}><Input type="password" value={f.password} onChange={set("password")} /></Field>
        <div className="flex items-end"><Checkbox label="Account active" checked={f.is_active} onChange={set("is_active")} /></div>
      </div>
      <h4 className="mb-2 mt-5 text-sm font-semibold">Permissions <span className="font-normal text-slate-400">— defaults come from the role; tick/untick to customise</span></h4>
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {roles.permissions.map((p) => (
          <Checkbox key={p.code} checked={has(p.code)} onChange={() => toggle(p.code)}
            label={<span>{p.label}{basePerms.has(p.code) !== has(p.code) && <span className="ml-1 text-xs text-amber-600">(custom)</span>}</span>} />
        ))}
      </div>
    </Modal>
  );
}

function Shifts() {
  const { data, loading } = useApi("/shifts/");
  const money = (v) => (v === null || v === undefined ? "—" : `KSh ${Number(v).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`);
  return (
    <Card bodyClass="p-0">
      <Table loading={loading} rows={data?.results} columns={[
        { key: "user_name", label: "Cashier" }, { key: "branch_name", label: "Branch" },
        { key: "opened_at", label: "Opened", render: (r) => dateTime(r.opened_at) },
        { key: "closed_at", label: "Closed", render: (r) => r.closed_at ? dateTime(r.closed_at) : <Badge color="green">open</Badge> },
        { key: "opening_float", label: "Float", align: "right", render: (r) => money(r.opening_float) },
        { key: "expected_cash", label: "Expected", align: "right", render: (r) => money(r.expected_cash) },
        { key: "counted_cash", label: "Counted", align: "right", render: (r) => money(r.counted_cash) },
        { key: "variance", label: "Variance", align: "right", render: (r) => <span className={Number(r.variance) < 0 ? "font-medium text-rose-600" : ""}>{money(r.variance)}</span> },
      ]} />
    </Card>
  );
}

function Logins() {
  const { data, loading } = useApi("/login-history/");
  return (
    <Card bodyClass="p-0">
      <Table loading={loading} rows={data?.results} columns={[
        { key: "created_at", label: "When", render: (r) => dateTime(r.created_at) }, { key: "user_name", label: "User" },
        { key: "event", label: "Event", render: (r) => <Badge color={r.event === "failed" ? "red" : r.event === "login" ? "green" : "slate"}>{r.event}</Badge> },
        { key: "ip_address", label: "IP" }, { key: "user_agent", label: "Device", className: "max-w-xs truncate text-slate-500" },
      ]} />
    </Card>
  );
}

function Activity() {
  const { data, loading } = useApi("/audit-logs/");
  return (
    <Card bodyClass="p-0">
      <Table loading={loading} rows={data?.results} columns={[
        { key: "created_at", label: "When", render: (r) => dateTime(r.created_at) }, { key: "user_name", label: "User" },
        { key: "action", label: "Action" }, { key: "object", label: "Record", render: (r) => r.object_type && `${r.object_type} #${r.object_id}` },
        { key: "details", label: "Details", className: "max-w-md truncate text-xs text-slate-500", render: (r) => Object.entries(r.details || {}).map(([k, v]) => `${k}: ${v}`).join(" · ") },
      ]} />
    </Card>
  );
}
