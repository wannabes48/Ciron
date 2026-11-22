import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { subdomainFromHost } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Button, Field, Input, Select } from "../components/ui";

function Shell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-full place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-white">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-lg font-bold">C</div>
          <span className="text-2xl font-semibold tracking-tight">Ciron</span>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mb-5 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const hostShop = subdomainFromHost();
  const [form, setForm] = useState({ business: hostShop || localStorage.getItem("ciron.lastShop") || "", username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(form.business.trim().toLowerCase(), form.username, form.password);
      try {
        localStorage.setItem("ciron.lastShop", form.business.trim().toLowerCase());
      } catch {
        /* ignore */
      }
      nav("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Sign in" subtitle="Welcome back. Sign in to your shop.">
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        {!hostShop && (
          <Field label="Shop address">
            <div className="flex items-center rounded-lg border border-slate-300 focus-within:border-brand-500">
              <input
                className="w-full rounded-l-lg px-3 py-2 text-sm outline-none"
                value={form.business}
                onChange={(e) => setForm({ ...form, business: e.target.value })}
                placeholder="yourshop"
                required
              />
              <span className="pr-3 text-sm text-slate-400">.ciron</span>
            </div>
          </Field>
        )}
        <Field label="Username">
          <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus required />
        </Field>
        <Field label="Password">
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </Field>
        <Button className="w-full" size="lg" loading={busy}>Sign in</Button>
        <p className="text-center text-sm text-slate-500">
          New business? <Link to="/register" className="font-medium text-brand-700">Create your shop</Link>
        </p>
      </form>
    </Shell>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ business_name: "", subdomain: "", business_type: "retail_wholesale", owner_name: "", username: "", password: "", phone: "", email: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register(form);
      nav("/settings");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Create your shop" subtitle="Set up Ciron for your retail or wholesale business in a minute.">
      <form onSubmit={submit} className="space-y-3">
        <Alert>{error}</Alert>
        <Field label="Business name">
          <Input
            value={form.business_name}
            onChange={(e) => {
              const name = e.target.value;
              const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
              setForm({ ...form, business_name: name, subdomain: form.subdomain && form._edited ? form.subdomain : slug });
            }}
            required
          />
        </Field>
        <Field label="Shop address" hint="Your staff will sign in at this address.">
          <div className="flex items-center rounded-lg border border-slate-300">
            <input className="w-full rounded-l-lg px-3 py-2 text-sm outline-none" value={form.subdomain}
              onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase(), _edited: true })} required />
            <span className="pr-3 text-sm text-slate-400">.ciron</span>
          </div>
        </Field>
        <Field label="Business type">
          <Select value={form.business_type} onChange={set("business_type")}
            options={[{ value: "retail_wholesale", label: "Retail & wholesale" }, { value: "retail", label: "Retail shop" }, { value: "wholesale", label: "Wholesale" }]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Your name"><Input value={form.owner_name} onChange={set("owner_name")} required /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={set("phone")} placeholder="07…" /></Field>
          <Field label="Username"><Input value={form.username} onChange={set("username")} required /></Field>
          <Field label="Password"><Input type="password" value={form.password} onChange={set("password")} minLength={6} required /></Field>
        </div>
        <Button className="w-full" size="lg" loading={busy}>Create shop</Button>
        <p className="text-center text-sm text-slate-500">
          Already on Ciron? <Link to="/login" className="font-medium text-brand-700">Sign in</Link>
        </p>
      </form>
    </Shell>
  );
}
