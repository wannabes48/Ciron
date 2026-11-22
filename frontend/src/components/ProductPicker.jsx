import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { qty } from "../lib/format";
import { cx } from "./ui";

/** Async product search box. onPick receives the full product object. */
export default function ProductPicker({ onPick, placeholder = "Search product or scan barcode…", value, className }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef(null);

  useEffect(() => {
    if (q.length < 1) { setRows([]); return; }
    const t = setTimeout(() => api("/products/", { params: { search: q, page_size: 12, is_active: true } }).then((d) => { setRows(d.results); setHi(0); }).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (p) => { onPick(p); setQ(""); setRows([]); setOpen(false); };

  return (
    <div ref={box} className={cx("relative", className)}>
      <input
        value={open ? q : value?.name || q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          if (e.key === "Enter" && rows[hi]) { e.preventDefault(); pick(rows[hi]); }
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      {open && rows.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {rows.map((p, i) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}
                className={cx("flex w-full justify-between px-3 py-2 text-left text-sm", i === hi ? "bg-brand-50" : "hover:bg-slate-50")}>
                <span>{p.name} <span className="text-xs text-slate-400">{p.sku}</span></span>
                <span className="text-xs text-slate-500">{qty(p.stock)} {p.unit_abbr}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
