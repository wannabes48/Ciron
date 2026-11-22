import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { api } from "../lib/api";

export const cx = (...c) => c.filter(Boolean).join(" ");

const BTN = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  ghost: "text-slate-600 hover:bg-slate-100",
  dark: "bg-slate-800 text-white hover:bg-slate-900",
};

export function Button({ variant = "primary", size = "md", loading, className, children, ...props }) {
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm", lg: "px-5 py-3 text-base", xl: "px-6 py-4 text-lg" };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        BTN[variant],
        sizes[size],
        className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

const INPUT = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export const Input = ({ className, ...p }) => <input className={cx(INPUT, className)} {...p} />;
export const Textarea = ({ className, ...p }) => <textarea className={cx(INPUT, className)} rows={3} {...p} />;
export function Select({ className, options = [], placeholder, ...p }) {
  return (
    <select className={cx(INPUT, className)} {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ label, ...p }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-brand-600" {...p} />
      {label}
    </label>
  );
}

export function Card({ title, actions, className, children, bodyClass = "p-4" }) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const BADGE = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};
export const Badge = ({ color = "slate", children, className }) => (
  <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", BADGE[color], className)}>
    {children}
  </span>
);

const STATUS_COLORS = {
  completed: "green", paid: "green", received: "green", approved: "green", active: "green",
  partial: "amber", pending: "amber", held: "amber", in_transit: "blue", ordered: "blue", quotation: "violet", open: "blue",
  unpaid: "red", voided: "red", rejected: "red", cancelled: "slate", draft: "slate",
};
export const StatusBadge = ({ status }) => <Badge color={STATUS_COLORS[status] || "slate"}>{String(status || "").replace(/_/g, " ")}</Badge>;

export function Modal({ open, onClose, title, children, footer, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8" onMouseDown={onClose}>
      <div className={cx("w-full rounded-xl bg-white shadow-2xl", widths[size])} onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Table({ columns, rows, empty = "Nothing here yet.", onRowClick, rowKey = "id", loading }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th key={c.key || c.label} className={cx("whitespace-nowrap px-3 py-2 font-medium", c.align === "right" && "text-right")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td>
            </tr>
          )}
          {!loading && rows?.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-slate-400">
                {empty}
              </td>
            </tr>
          )}
          {!loading &&
            rows?.map((r, i) => (
              <tr
                key={r[rowKey] ?? i}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx("border-b border-slate-100 last:border-0", onRowClick && "cursor-pointer hover:bg-slate-50")}
              >
                {columns.map((c) => (
                  <td key={c.key || c.label} className={cx("px-3 py-2.5", c.align === "right" && "tabular text-right", c.className)}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            value === t.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Alert({ children, tone = "red" }) {
  if (!children) return null;
  const tones = { red: "bg-rose-50 text-rose-700 border-rose-200", amber: "bg-amber-50 text-amber-800 border-amber-200", green: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  return <div className={cx("rounded-lg border px-3 py-2 text-sm", tones[tone])}>{children}</div>;
}

export function Pager({ data, page, setPage }) {
  if (!data || (!data.next && !data.previous)) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-sm text-slate-500">
      <span>{data.count} records</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={!data.previous} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button size="sm" variant="secondary" disabled={!data.next} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

/** Load a resource, re-fetching when deps change. Returns {data, loading, error, reload}. */
export function useApi(path, params, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const key = JSON.stringify([path, params]);
  const load = useCallback(() => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    api(path, { params })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error: error.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const onToast = (e) => {
      const id = Math.random();
      setItems((x) => [...x, { id, ...e.detail }]);
      setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), e.detail.tone === "red" ? 6000 : 3000);
    };
    window.addEventListener("ciron:toast", onToast);
    return () => window.removeEventListener("ciron:toast", onToast);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            "pointer-events-auto max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg",
            t.tone === "red" ? "bg-rose-600" : t.tone === "amber" ? "bg-amber-600" : "bg-slate-800",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export const toast = (message, tone) => window.dispatchEvent(new CustomEvent("ciron:toast", { detail: { message, tone } }));
