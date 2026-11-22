import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Banknote, CreditCard, Keyboard, Minus, PauseCircle, Percent, Play, Plus, Printer, ScanBarcode, Search,
  Smartphone, Trash2, User, UserX, Wallet,
} from "lucide-react";
import Receipt from "../components/Receipt";
import { Alert, Badge, Button, Field, Input, Modal, cx, toast } from "../components/ui";
import { api, listAll } from "../lib/api";
import { useAuth } from "../lib/auth";
import { money, num, qty, PAYMENT_LABELS } from "../lib/format";

const RULE_BADGE = { wholesale: ["blue", "Wholesale"], tier: ["violet", "Bulk price"], customer: ["amber", "Special"], manual: ["slate", "Manual"] };
const METHOD_ICON = { cash: Banknote, mpesa: Smartphone, card: CreditCard, bank: Wallet, cheque: Wallet };
let keySeq = 0;

const isTyping = (e) => ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);

export default function POS() {
  const { business, branch, user, can } = useAuth();
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [selected, setSelected] = useState(0);
  const [customer, setCustomer] = useState(null);
  const [saleType, setSaleType] = useState(null); // null = automatic (by customer / quantity)
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [resumedSale, setResumedSale] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [modal, setModal] = useState(null); // pay | customer | held | discount | receipt | shift | help
  const [lastSale, setLastSale] = useState(null);
  const [shift, setShift] = useState(undefined);

  const focusSearch = () => setTimeout(() => searchRef.current?.focus(), 0);

  useEffect(() => {
    api("/shifts/current/").then(setShift).catch(() => setShift(null));
    focusSearch();
  }, []);

  // ---- cart operations ---------------------------------------------------
  const addToCart = useCallback((product, { unit = null, quantity = 1 } = {}) => {
    if (product.track_stock && Number(product.stock) <= 0 && !business?.allow_negative_stock) {
      toast(`${product.name} is out of stock`, "amber");
    }
    setCart((c) => {
      const idx = c.findIndex((l) => l.product.id === product.id && l.unit === unit);
      if (idx >= 0) {
        const next = [...c];
        next[idx] = { ...next[idx], quantity: Number(next[idx].quantity) + quantity };
        setSelected(idx);
        return next;
      }
      setSelected(c.length);
      return [...c, { key: ++keySeq, product, unit, quantity, discount: 0 }];
    });
  }, [business]);

  // Tapping a tile: add it, mark the tile with the "just added" dot, keep the scanner input ready.
  const [flash, setFlash] = useState(null);
  const [gridKey, setGridKey] = useState(0);
  const flashTimer = useRef(null);
  const pick = (product, unit = null) => {
    addToCart(product, { unit });
    setFlash(product.id);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1200);
    focusSearch();
  };

  const updateLine = (idx, patch) => setCart((c) => c.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx) => {
    setCart((c) => c.filter((_, i) => i !== idx));
    setSelected((s) => Math.max(0, Math.min(s, cart.length - 2)));
  };
  const changeQty = (idx, delta) => {
    const line = cart[idx];
    if (!line) return;
    const next = Number(line.quantity) + delta;
    if (next <= 0) removeLine(idx);
    else updateLine(idx, { quantity: next });
  };

  const resetSale = () => {
    setCart([]);
    setCustomer(null);
    setSaleType(null);
    setSaleDiscount(0);
    setResumedSale(null);
    setPreview(null);
    setPreviewError("");
    setSelected(0);
    focusSearch();
  };

  // ---- search / barcode --------------------------------------------------
  useEffect(() => {
    const q = query.replace(/^\d+(\.\d+)?\*/, "").trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api("/products/pos_search/", { params: { q } }).then((r) => setResults(r.results || [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const submitSearch = async (e) => {
    e.preventDefault();
    // "12*6161234567890" = add 12 of the scanned item
    const m = query.match(/^(\d+(?:\.\d+)?)\*(.+)$/);
    const multiplier = m ? Number(m[1]) : 1;
    const q = (m ? m[2] : query).trim();
    if (!q) return;
    try {
      const r = await api("/products/pos_search/", { params: { q } });
      const list = r.results || [];
      if (r.exact && list.length >= 1) {
        const p = list[0];
        addToCart(p, { unit: p.scanned_unit || null, quantity: multiplier });
        setQuery("");
        setResults([]);
      } else if (list.length === 1) {
        addToCart(list[0], { quantity: multiplier });
        setQuery("");
        setResults([]);
      } else if (list.length === 0) {
        toast(`No product matches “${q}”`, "amber");
      } else {
        setResults(list);
      }
    } catch (err) {
      toast(err.message, "red");
    }
  };

  // ---- server-side pricing preview ---------------------------------------
  const cartPayload = useMemo(
    () => cart.map((l) => ({ product: l.product.id, unit: l.unit, quantity: l.quantity, discount: l.discount || 0 })),
    [cart],
  );

  useEffect(() => {
    if (!cart.length) {
      setPreview(null);
      setPreviewError("");
      return;
    }
    const t = setTimeout(() => {
      api("/sales/price_preview/", {
        method: "POST",
        body: { items: cartPayload, customer: customer?.id || null, sale_type: saleType, sale_discount: saleDiscount || 0 },
      })
        .then((p) => {
          setPreview(p);
          setPreviewError("");
        })
        .catch((err) => setPreviewError(err.message));
    }, 150);
    return () => clearTimeout(t);
  }, [cartPayload, customer, saleType, saleDiscount, cart.length]);

  const totals = preview?.totals;
  const effectiveType = saleType || preview?.sale_type || "retail";

  // ---- hold / resume -----------------------------------------------------
  const hold = async (action = "hold") => {
    if (!cart.length) return;
    const label = action === "hold" ? window.prompt("Label for this held sale (optional)", customer?.name || "") : "";
    if (label === null) return;
    try {
      const sale = await api("/sales/checkout/", {
        method: "POST",
        body: { action, sale: resumedSale?.id, items: cartPayload, customer: customer?.id || null, sale_type: saleType,
          sale_discount: saleDiscount || 0, hold_label: label || "" },
      });
      if (action === "quotation") {
        setLastSale(sale);
        setModal("receipt");
      } else toast(`Sale held (${sale.number})`);
      resetSale();
    } catch (err) {
      toast(err.message, "red");
    }
  };

  const resume = async (sale) => {
    const products = await Promise.all(sale.items.map((i) => api(`/products/${i.product}/`)));
    setCart(sale.items.map((i, idx) => ({ key: ++keySeq, product: products[idx], unit: i.unit, quantity: Number(i.quantity), discount: Number(i.discount) })));
    setCustomer(sale.customer ? await api(`/customers/${sale.customer}/`) : null);
    setSaleType(sale.sale_type === "wholesale" ? "wholesale" : null);
    setSaleDiscount(Number(sale.sale_discount) || 0);
    setResumedSale(sale);
    setModal(null);
    focusSearch();
  };

  // ---- keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (modal && e.key !== "F9") return;
      const map = {
        F2: () => focusSearch(),
        F3: () => setModal("customer"),
        F4: () => setSaleType((t) => (t === "wholesale" ? "retail" : "wholesale")),
        F6: () => hold("hold"),
        F7: () => setModal("held"),
        F8: () => can("sales.discount") && setModal("discount"),
        F9: () => cart.length && !previewError && setModal("pay"),
        F1: () => setModal("help"),
      };
      if (map[e.key]) {
        e.preventDefault();
        map[e.key]();
        return;
      }
      if (e.key === "Escape") {
        setQuery("");
        setResults([]);
        focusSearch();
        return;
      }
      if (isTyping(e) && !(e.target === searchRef.current && !query && ["+", "-", "ArrowUp", "ArrowDown", "Delete"].includes(e.key))) return;
      if (e.key === "+" ) { e.preventDefault(); changeQty(selected, 1); }
      else if (e.key === "-") { e.preventDefault(); changeQty(selected, -1); }
      else if (e.key === "Delete") { e.preventDefault(); removeLine(selected); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(cart.length - 1, s + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onPaid = (sale) => {
    setLastSale(sale);
    setModal("receipt");
    resetSale();
    setGridKey((k) => k + 1); // refresh stock figures on the tiles
  };

  return (
    <div className="flex h-full flex-col bg-slate-100">
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 bg-slate-900 px-4 text-white">
        <Link to="/" className="rounded p-1.5 hover:bg-slate-800" title="Back"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="font-semibold">{business?.name}</div>
        <span className="text-sm text-slate-400">{branch?.name}</span>
        <div className="flex-1" />
        <button onClick={() => setModal("shift")} className={cx("rounded-md px-2.5 py-1 text-xs", shift ? "bg-emerald-600" : "bg-amber-600")}>
          {shift ? "Shift open" : "No shift"}
        </button>
        <span className="hidden text-sm text-slate-300 sm:inline">Cashier: {user?.full_name || user?.username}</span>
        <button onClick={() => setModal("help")} className="rounded p-1.5 hover:bg-slate-800" title="Shortcuts (F1)"><Keyboard className="h-5 w-5" /></button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        {/* LEFT: search + products */}
        <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-white shadow-sm">
          <form onSubmit={submitSearch} className="border-b border-slate-100 p-3">
            <div className="relative">
              <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Scan barcode or search by name / SKU   (F2)   ·   tip: 12*barcode adds 12"
                className="w-full rounded-xl border-2 border-slate-200 py-3.5 pl-11 pr-4 text-lg outline-none focus:border-brand-500"
                autoComplete="off"
              />
            </div>
          </form>
          {query.trim().length >= 2 && results.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span>{results.length} {results.length === 1 ? "match" : "matches"} for “{query.trim()}”</span>
                <button onClick={() => { setQuery(""); setResults([]); focusSearch(); }} className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-slate-100">Back to products (Esc)</button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {results.map((p) => (
                  <ProductTile key={p.id} product={p} saleType={effectiveType} justAdded={flash === p.id}
                    onAdd={(unit) => { pick(p, unit); setQuery(""); setResults([]); }} />
                ))}
              </div>
            </div>
          ) : (
            <ProductGrid reloadKey={gridKey} saleType={effectiveType} flash={flash} onAdd={pick} />
          )}
        </section>

        {/* RIGHT: cart */}
        <section className="flex min-h-0 w-full flex-col rounded-xl bg-white shadow-sm lg:w-[440px] xl:w-[500px]">
          <div className="flex items-center gap-2 border-b border-slate-100 p-3">
            <button onClick={() => setModal("customer")} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50">
              <User className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{customer ? customer.name : "Walk-in customer"}</div>
                {customer && (
                  <div className="truncate text-xs text-slate-500">
                    {customer.category} · owes {money(customer.balance)}
                  </div>
                )}
              </div>
              <span className="ml-auto text-xs text-slate-400">F3</span>
            </button>
            {customer && (
              <button onClick={() => setCustomer(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" title="Remove customer"><UserX className="h-4 w-4" /></button>
            )}
            <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs font-medium">
              {["retail", "wholesale"].map((t) => (
                <button key={t} onClick={() => setSaleType(saleType === t ? null : t)}
                  className={cx("px-2.5 py-2 capitalize", effectiveType === t ? (t === "wholesale" ? "bg-sky-600 text-white" : "bg-slate-800 text-white") : "hover:bg-slate-50")}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {resumedSale && (
            <div className="bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              Resumed {resumedSale.status === "quotation" ? "quotation" : "held sale"} {resumedSale.number} {resumedSale.hold_label && `· ${resumedSale.hold_label}`}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="grid h-full place-items-center p-8 text-center text-sm text-slate-400">Cart is empty</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cart.map((l, idx) => {
                  const pl = preview?.lines?.[idx];
                  const units = [{ id: null, name: l.product.unit_abbr }, ...(l.product.units || [])];
                  const rule = pl && RULE_BADGE[pl.rule];
                  return (
                    <li key={l.key} onClick={() => setSelected(idx)}
                      className={cx("cursor-pointer px-3 py-2.5", idx === selected && "bg-brand-50/70")}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{l.product.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            {pl ? `${money(pl.unit_price)} / ` : ""}
                            <select value={l.unit ?? ""} onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateLine(idx, { unit: e.target.value ? Number(e.target.value) : null })}
                              className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs">
                              {units.map((u) => <option key={u.id ?? "base"} value={u.id ?? ""}>{u.name}</option>)}
                            </select>
                            {rule && <Badge color={rule[0]}>{rule[1]}</Badge>}
                            {pl && Number(pl.discount) > 0 && <span className="text-rose-600">−{num(pl.discount)}</span>}
                          </div>
                        </div>
                        <div className="tabular text-right text-sm font-semibold">{pl ? num(pl.line_total) : "…"}</div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); changeQty(idx, -1); }} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 hover:bg-slate-100"><Minus className="h-4 w-4" /></button>
                        <input value={l.quantity} onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                          onBlur={(e) => { const v = Number(e.target.value); if (!v || v <= 0) removeLine(idx); else updateLine(idx, { quantity: v }); }}
                          className="tabular h-9 w-20 rounded-lg border border-slate-200 text-center text-sm" inputMode="decimal" />
                        <button onClick={(e) => { e.stopPropagation(); changeQty(idx, 1); }} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 hover:bg-slate-100"><Plus className="h-4 w-4" /></button>
                        {can("sales.discount") && (
                          <button onClick={(e) => { e.stopPropagation(); const d = window.prompt(`Discount amount for ${l.product.name} (KSh)`, l.discount || ""); if (d !== null) updateLine(idx, { discount: Number(d) || 0 }); }}
                            className="ml-1 grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100" title="Line discount"><Percent className="h-4 w-4" /></button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); removeLine(idx); }} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50" title="Remove (Del)"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-200 p-3">
            {previewError && <div className="mb-2"><Alert>{previewError}</Alert></div>}
            <dl className="tabular space-y-1 text-sm">
              <div className="flex justify-between text-slate-500"><dt>Subtotal</dt><dd>{num(totals?.subtotal)}</dd></div>
              {Number(totals?.discount_total) > 0 && <div className="flex justify-between text-rose-600"><dt>Discount</dt><dd>−{num(totals.discount_total)}</dd></div>}
              {Number(totals?.tax_total) > 0 && <div className="flex justify-between text-slate-500"><dt>VAT {business?.prices_include_vat ? "(incl.)" : ""}</dt><dd>{num(totals.tax_total)}</dd></div>}
              <div className="flex items-baseline justify-between pt-1"><dt className="text-base font-semibold">Total</dt><dd className="text-3xl font-bold text-slate-900">{money(totals?.total)}</dd></div>
            </dl>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <Button variant="secondary" onClick={() => hold("hold")} disabled={!cart.length} title="Hold (F6)"><PauseCircle className="h-4 w-4" />Hold</Button>
              <Button variant="secondary" onClick={() => setModal("held")} title="Held sales (F7)"><Play className="h-4 w-4" />Resume</Button>
              <Button variant="secondary" onClick={() => hold("quotation")} disabled={!cart.length} title="Save as quotation">Quote</Button>
              <Button variant="ghost" onClick={() => cart.length && window.confirm("Clear this sale?") && resetSale()} disabled={!cart.length}>Clear</Button>
            </div>
            <Button size="xl" className="mt-2 w-full" disabled={!cart.length || !!previewError || !totals} onClick={() => setModal("pay")}>
              Pay {totals ? money(totals.total) : ""} <span className="text-sm opacity-70">F9</span>
            </Button>
          </div>
        </section>
      </div>

      <PaymentModal open={modal === "pay"} onClose={() => { setModal(null); focusSearch(); }} total={totals?.total}
        customer={customer} business={business} canCredit={can("sales.credit")}
        submit={(payments, extra) => api("/sales/checkout/", {
          method: "POST",
          body: { action: "complete", sale: resumedSale?.id, items: cartPayload, customer: customer?.id || null,
            sale_type: saleType, sale_discount: saleDiscount || 0, payments, ...extra },
        })}
        onDone={onPaid} />
      <CustomerPicker open={modal === "customer"} onClose={() => { setModal(null); focusSearch(); }}
        onPick={(c) => { setCustomer(c); setModal(null); focusSearch(); }} />
      <HeldSales open={modal === "held"} onClose={() => { setModal(null); focusSearch(); }} onResume={resume} />
      <DiscountModal open={modal === "discount"} value={saleDiscount} subtotal={totals?.subtotal}
        onClose={() => { setModal(null); focusSearch(); }} onApply={(v) => { setSaleDiscount(v); setModal(null); focusSearch(); }} />
      <ShiftModal open={modal === "shift"} shift={shift} onClose={() => { setModal(null); focusSearch(); }} onChange={setShift} />
      <ReceiptModal open={modal === "receipt"} sale={lastSale} onClose={() => { setModal(null); focusSearch(); }} />
      <Modal open={modal === "help"} onClose={() => { setModal(null); focusSearch(); }} title="Keyboard shortcuts" size="sm">
        <ul className="space-y-1.5 text-sm">
          {[["F2", "Focus search / scanner"], ["Enter", "Add scanned / first match"], ["F3", "Select customer"], ["F4", "Toggle wholesale pricing"],
            ["F6", "Hold sale"], ["F7", "Resume held sale"], ["F8", "Sale discount"], ["F9", "Pay"], ["+ / −", "Change quantity of selected line"],
            ["↑ / ↓", "Select line"], ["Del", "Remove selected line"], ["Esc", "Clear search / close"], ["12*code", "Add 12 of an item"]].map(([k, v]) => (
            <li key={k} className="flex justify-between"><kbd className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs">{k}</kbd><span>{v}</span></li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

const CATEGORY_PREF = "ciron.pos.category";

/** Browsable product grid, shown whenever the search box is not showing matches. */
function ProductGrid({ reloadKey, saleType, flash, onAdd }) {
  const [category, setCategory] = useState(() => {
    try { return localStorage.getItem(CATEGORY_PREF) || "top"; } catch { return "top"; }
  });
  const [cats, setCats] = useState(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (cat, pg) => {
    setLoading(true);
    setError("");
    try {
      const r = await api("/products/pos_catalog/", { params: { category: cat === "all" ? "" : cat, page: pg } });
      if (r.categories) setCats({ list: r.categories, uncategorised: r.uncategorised });
      // No sales yet in this branch: "Top sellers" would be empty, so show every product instead.
      if (cat === "top" && pg === 1 && r.results.length === 0) { setCategory("all"); return; }
      setRows((prev) => (pg === 1 ? r.results : [...prev, ...r.results]));
      setHasMore(r.has_more);
      setPage(pg);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(category, 1); }, [category, reloadKey, load]);

  const choose = (c) => {
    setCategory(c);
    try { localStorage.setItem(CATEGORY_PREF, c); } catch { /* storage unavailable */ }
  };

  const chips = [
    { id: "top", label: "Top sellers" },
    { id: "all", label: "All products" },
    ...(cats?.list || []).map((c) => ({ id: String(c.id), label: c.name, count: c.count })),
    ...(cats?.uncategorised ? [{ id: "uncategorised", label: "No category", count: cats.uncategorised }] : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-3 py-2.5" role="tablist" aria-label="Product categories">
        {chips.map((c) => (
          <button key={c.id} role="tab" aria-selected={category === c.id} onClick={() => choose(c.id)}
            className={cx("h-11 shrink-0 whitespace-nowrap rounded-[10px] border px-4 text-sm font-medium",
              category === c.id ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400")}>
            {c.label}
            {c.count !== undefined && <span className={cx("ml-1.5 text-xs", category === c.id ? "text-white/80" : "text-slate-400")}>{c.count}</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? (
          <div className="grid h-full place-items-center text-center text-sm text-slate-500">
            <div>
              <p>The products did not load. {error}</p>
              <Button variant="secondary" className="mt-3" onClick={() => load(category, 1)}>Try again</Button>
            </div>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-slate-400">
            <div>
              <Search className="mx-auto mb-2 h-10 w-10" />
              <p>No products in this category yet. Add them on the Products page, or scan a barcode to search.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {rows.map((p) => <ProductTile key={p.id} product={p} saleType={saleType} justAdded={flash === p.id} onAdd={(unit) => onAdd(p, unit)} />)}
              {loading && rows.length === 0 && Array.from({ length: 8 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
            {hasMore && (
              <div className="mt-3 text-center">
                <Button variant="secondary" loading={loading} onClick={() => load(category, page + 1)}>Show more products</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** One product tile: tap to add one base unit; pack chips add a whole pack. */
function ProductTile({ product: p, saleType, justAdded, onAdd }) {
  const out = p.track_stock && Number(p.stock) <= 0;
  const low = p.track_stock && !out && Number(p.stock) <= Number(p.reorder_level);
  const wholesale = saleType === "wholesale" && p.wholesale_price;
  const price = wholesale ? p.wholesale_price : p.retail_price;
  return (
    <div className={cx("relative flex flex-col rounded-xl border transition",
      justAdded ? "border-brand-500 ring-2 ring-brand-500/30" : "border-slate-200 hover:border-brand-500 hover:shadow",
      out ? "bg-slate-50" : "bg-white")}>
      {justAdded && (
        <span className="absolute right-2 top-2 h-2 w-2" aria-hidden="true">
          <span className="dot-ping absolute inset-0 rounded-full bg-[#EB6505]" />
          <span className="absolute inset-0 rounded-full bg-[#EB6505]" />
        </span>
      )}
      <button onClick={() => onAdd(null)} className="flex flex-1 flex-col p-3 text-left" title={`Add 1 ${p.unit_abbr || ""} of ${p.name}`}>
        {p.image && <img src={p.image} alt="" className="mb-2 h-16 w-full rounded-lg object-contain" loading="lazy" />}
        <div className={cx("line-clamp-2 min-h-[2.5rem] text-sm font-medium", out && "text-slate-500")}>{p.name}</div>
        <div className="mt-1 text-base font-semibold tabular-nums text-brand-700">{money(price)}</div>
        <div className="text-xs text-slate-500">
          {wholesale ? `Retail ${money(p.retail_price)}` : p.wholesale_price ? `Wholesale ${money(p.wholesale_price)}` : " "}
        </div>
        <div className={cx("mt-1 text-xs font-medium", out ? "text-rose-600" : low ? "text-amber-700" : "text-slate-400")}>
          {!p.track_stock ? "Not stock-tracked" : out ? "Out of stock" : `${qty(p.stock)} ${p.unit_abbr} in stock${low ? " · low" : ""}`}
        </div>
      </button>
      {p.units?.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-3">
          {p.units.map((u) => (
            <button key={u.id} onClick={() => onAdd(u.id)} title={`Add 1 ${u.name} (${qty(u.factor)} ${p.unit_abbr})`}
              className="h-9 rounded-lg bg-slate-100 px-2.5 text-xs font-medium text-slate-700 hover:bg-brand-100">
              + {u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentModal({ open, onClose, total, customer, business, canCredit, submit, onDone }) {
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstInput = useRef(null);
  const due = Number(total || 0);

  useEffect(() => {
    if (open) {
      setLines([{ method: "cash", amount: due.toFixed(2), reference: "", phone: "" }]);
      setError("");
      setTimeout(() => firstInput.current?.select(), 50);
    }
  }, [open, due]);

  const paid = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const remaining = Math.max(0, +(due - paid).toFixed(2));
  const change = Math.max(0, +(paid - due).toFixed(2));
  const methods = business?.payment_methods?.filter((m) => m !== "credit") || ["cash", "mpesa"];
  const creditAvailable = customer ? Math.max(0, Number(customer.credit_limit) - Number(customer.balance)) : 0;
  const canComplete = remaining === 0 || (customer && canCredit && remaining <= creditAvailable);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addMethod = (method) => setLines((ls) => [...ls, { method, amount: remaining.toFixed(2), reference: "", phone: "" }]);
  const cashQuick = [due, Math.ceil(due / 50) * 50, Math.ceil(due / 100) * 100, Math.ceil(due / 500) * 500, Math.ceil(due / 1000) * 1000]
    .filter((v, i, a) => v > 0 && a.indexOf(v) === i);

  const complete = async () => {
    if (!canComplete) return;
    setBusy(true);
    setError("");
    try {
      const sale = await submit(lines.filter((l) => Number(l.amount) > 0).map((l) => ({ ...l, amount: Number(l.amount).toFixed(2) })));
      onDone(sale);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Take payment" size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button size="lg" onClick={complete} loading={busy} disabled={!canComplete}>
          {remaining > 0 ? `Complete · ${money(remaining)} on credit` : "Complete sale"}
        </Button>
      </>}>
      <div onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName !== "BUTTON") { e.preventDefault(); complete(); } }}>
        <div className="mb-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-slate-100 p-3"><div className="text-xs text-slate-500">Total due</div><div className="text-xl font-bold">{money(due)}</div></div>
          <div className={cx("rounded-lg p-3", remaining > 0 ? "bg-amber-50" : "bg-slate-100")}><div className="text-xs text-slate-500">Remaining</div><div className="text-xl font-bold">{money(remaining)}</div></div>
          <div className={cx("rounded-lg p-3", change > 0 ? "bg-emerald-50" : "bg-slate-100")}><div className="text-xs text-slate-500">Change</div><div className="text-xl font-bold text-emerald-700">{money(change)}</div></div>
        </div>
        <Alert>{error}</Alert>
        <div className="mt-3 space-y-3">
          {lines.map((l, i) => {
            const Icon = METHOD_ICON[l.method] || Wallet;
            return (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-slate-500" />
                  <span className="w-20 text-sm font-medium">{PAYMENT_LABELS[l.method]}</span>
                  <Input ref={i === 0 ? firstInput : undefined} type="number" step="0.01" min="0" value={l.amount}
                    onChange={(e) => setLine(i, { amount: e.target.value })} className="tabular text-right text-lg font-semibold" />
                  {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}
                </div>
                {l.method === "cash" && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {cashQuick.map((v) => <button key={v} onClick={() => setLine(i, { amount: v.toFixed(2) })} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs hover:bg-slate-200">{num(v)}</button>)}
                  </div>
                )}
                {l.method !== "cash" && (
                  <div className="mt-2 grid grid-cols-2 gap-2 pl-7">
                    <Input placeholder={l.method === "mpesa" ? "M-Pesa code e.g. SKD1XYZ9" : "Reference"} value={l.reference}
                      onChange={(e) => setLine(i, { reference: e.target.value.toUpperCase() })} />
                    {l.method === "mpesa" && <Input placeholder="Phone (optional)" value={l.phone} onChange={(e) => setLine(i, { phone: e.target.value })} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {methods.map((m) => (
            <Button key={m} variant="secondary" size="sm" onClick={() => addMethod(m)}>+ {PAYMENT_LABELS[m] || m}</Button>
          ))}
        </div>
        {remaining > 0 && (
          <div className="mt-3 text-sm">
            {!customer ? <Alert tone="amber">Select a customer to sell the remaining balance on credit.</Alert>
              : !canCredit ? <Alert tone="amber">You are not allowed to sell on credit.</Alert>
              : remaining > creditAvailable ? <Alert tone="amber">{customer.name} has only {money(creditAvailable)} credit available.</Alert>
              : <Alert tone="green">{money(remaining)} will be added to {customer.name}’s account (available credit {money(creditAvailable)}).</Alert>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CustomerPicker({ open, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", category: "retail" });
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => listAll("/customers/", { search: q, is_active: true, page_size: 30 }).then(setRows).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q, open]);
  const create = async () => {
    try {
      onPick(await api("/customers/", { method: "POST", body: form }));
      setCreating(false);
      setForm({ name: "", phone: "", category: "retail" });
    } catch (err) {
      toast(err.message, "red");
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Select customer" size="md">
      {creating ? (
        <div className="space-y-3">
          <Field label="Name"><Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Type">
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="retail">Retail</option><option value="wholesale">Wholesale</option><option value="distributor">Distributor</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreating(false)}>Back</Button><Button onClick={create}>Save & select</Button></div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <Input autoFocus placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && rows[0] && onPick(rows[0])} />
            <Button variant="secondary" onClick={() => setCreating(true)}>New</Button>
          </div>
          <ul className="divide-y divide-slate-100">
            {rows.map((c) => (
              <li key={c.id}>
                <button onClick={() => onPick(c)} className="flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-slate-50">
                  <div><div className="text-sm font-medium">{c.name}</div><div className="text-xs text-slate-500">{c.phone} · {c.category}</div></div>
                  <div className="text-right text-xs">
                    {Number(c.balance) > 0 && <div className="text-rose-600">Owes {money(c.balance)}</div>}
                    {Number(c.credit_limit) > 0 && <div className="text-slate-500">Limit {money(c.credit_limit)}</div>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

function HeldSales({ open, onClose, onResume }) {
  const [rows, setRows] = useState([]);
  const load = () => api("/sales/held/").then(setRows).catch(() => {});
  useEffect(() => { if (open) load(); }, [open]);
  const discard = async (s) => {
    if (!window.confirm(`Discard ${s.number}?`)) return;
    try { await api(`/sales/${s.id}/void/`, { method: "POST", body: { reason: "Discarded held sale" } }); load(); }
    catch (err) { toast(err.message, "red"); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Held sales & quotations" size="md">
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No held sales.</p> : (
        <ul className="divide-y divide-slate-100">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{s.number} {s.hold_label && <span className="text-slate-500">· {s.hold_label}</span>}</div>
                <div className="text-xs text-slate-500">{s.customer_name || "Walk-in"} · {s.items.length} items · {s.status}</div>
              </div>
              <div className="tabular text-sm font-semibold">{money(s.total)}</div>
              <Button size="sm" onClick={() => onResume(s)}>Resume</Button>
              <Button size="sm" variant="ghost" onClick={() => discard(s)}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function DiscountModal({ open, value, subtotal, onClose, onApply }) {
  const [v, setV] = useState(value);
  const [mode, setMode] = useState("amount");
  useEffect(() => { if (open) { setV(value || ""); setMode("amount"); } }, [open, value]);
  const amount = mode === "percent" ? (Number(subtotal || 0) * Number(v || 0)) / 100 : Number(v || 0);
  return (
    <Modal open={open} onClose={onClose} title="Discount on whole sale" size="sm"
      footer={<><Button variant="ghost" onClick={() => onApply(0)}>Remove</Button><Button onClick={() => onApply(+amount.toFixed(2))}>Apply {money(amount)}</Button></>}>
      <div className="mb-3 flex gap-2">
        {["amount", "percent"].map((m) => <Button key={m} size="sm" variant={mode === m ? "dark" : "secondary"} onClick={() => setMode(m)}>{m === "amount" ? "KSh" : "%"}</Button>)}
      </div>
      <Input autoFocus type="number" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onApply(+amount.toFixed(2))} />
    </Modal>
  );
}

function ShiftModal({ open, shift, onClose, onChange }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setAmount(""); if (shift) api("/shifts/current/").then(onChange); } }, [open]); // eslint-disable-line
  const act = async (path, body) => {
    setBusy(true);
    try {
      const s = await api(path, { method: "POST", body });
      onChange(s.closed_at ? null : s);
      if (s.closed_at) toast(`Shift closed. Variance ${money(s.variance)}`, Number(s.variance) < 0 ? "amber" : undefined);
      onClose();
    } catch (err) { toast(err.message, "red"); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={shift ? "Close shift" : "Open shift"} size="sm">
      {shift ? (
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span>Opening float</span><span>{money(shift.opening_float)}</span></div>
          {Object.entries(shift.live_totals || {}).map(([m, v]) => <div key={m} className="flex justify-between"><span>{PAYMENT_LABELS[m]}</span><span>{money(v)}</span></div>)}
          <div className="flex justify-between font-semibold"><span>Expected cash in drawer</span><span>{money(shift.live_expected_cash)}</span></div>
          <Field label="Counted cash"><Input autoFocus type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Button className="w-full" variant="danger" loading={busy} onClick={() => act("/shifts/close/", { counted_cash: amount || 0 })}>Close shift</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Opening cash float (KSh)"><Input autoFocus type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Button className="w-full" loading={busy} onClick={() => act("/shifts/open/", { opening_float: amount || 0 })}>Open shift</Button>
        </div>
      )}
    </Modal>
  );
}

export function ReceiptModal({ open, sale, onClose }) {
  const { business, branch } = useAuth();
  const printRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Enter" || e.key === "p") { e.preventDefault(); window.print(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!sale) return null;
  return (
    <Modal open={open} onClose={onClose} title={sale.status === "quotation" ? `Quotation ${sale.number}` : `Sale ${sale.number} complete`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>New sale (Esc)</Button><Button onClick={() => window.print()}><Printer className="h-4 w-4" />Print (Enter)</Button></>}>
      {Number(sale.change_given) > 0 && (
        <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-center">
          <div className="text-xs text-emerald-700">Change due</div>
          <div className="text-3xl font-bold text-emerald-700">{money(sale.change_given)}</div>
        </div>
      )}
      <div ref={printRef} className="print-area rounded border border-slate-200 p-2">
        <Receipt sale={sale} business={business} branch={branch} />
      </div>
    </Modal>
  );
}
