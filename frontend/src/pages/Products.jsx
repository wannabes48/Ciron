import { useEffect, useRef, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Pager, Select, Table, Textarea, toast, useApi } from "../components/ui";
import { api, download } from "../lib/api";
import { useAuth } from "../lib/auth";
import { money, qty } from "../lib/format";

const EMPTY = {
  name: "", description: "", sku: "", barcode: "", category: "", brand: "", unit: "", cost_price: "", retail_price: "",
  wholesale_price: "", min_price: "", wholesale_min_qty: "0", tax_type: "standard", reorder_level: "0", reorder_quantity: "0",
  track_stock: true, track_batches: false, is_active: true, units: [], price_tiers: [], opening_stock: "", expiry_date: "", batch_number: "",
};

export default function Products() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [stockStatus, setStockStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const params = { search, category, stock_status: stockStatus, page, is_active: stockStatus === "inactive" ? false : undefined };
  const { data, loading, reload } = useApi("/products/", params);
  const cats = useApi("/categories/");
  const fileRef = useRef(null);

  useEffect(() => setPage(1), [search, category, stockStatus]);

  const importCsv = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api("/products/import_csv/", { method: "POST", body: fd });
      toast(`Imported: ${r.created} new, ${r.updated} updated`);
      reload();
    } catch (err) {
      const rows = err.data?.errors;
      toast(rows ? `Import failed — ${rows.slice(0, 3).map((e) => `line ${e.line}: ${e.error}`).join("; ")}` : err.message, "red");
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Products" subtitle="Your catalog, prices and stock levels at this branch."
        actions={<>
          <Button variant="secondary" onClick={() => download("/products/export_csv/", { search, category }, "products.csv")}><Download className="h-4 w-4" />Export</Button>
          {can("products.manage") && <>
            <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files[0] && importCsv(e.target.files[0])} />
            <Button variant="secondary" onClick={() => fileRef.current.click()} title="Columns: name, sku, barcode, category, brand, unit, cost_price, retail_price, wholesale_price, min_price, wholesale_min_qty, reorder_level, tax_type, is_active, stock"><Upload className="h-4 w-4" />Import CSV</Button>
            <Button onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4" />Add product</Button>
          </>}
        </>} />
      <Card bodyClass="p-0">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <Input placeholder="Search name, SKU or barcode…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories" className="max-w-[200px]"
            options={(cats.data || []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select value={stockStatus} onChange={(e) => setStockStatus(e.target.value)} placeholder="All stock" className="max-w-[180px]"
            options={[{ value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" }, { value: "inactive", label: "Inactive" }]} />
        </div>
        <Table loading={loading} rows={data?.results} onRowClick={(r) => can("products.manage") && setEditing(r)} columns={[
          { key: "name", label: "Product", render: (r) => (
            <div className="flex items-center gap-3">
              {r.image ? <img src={r.image} alt="" className="h-9 w-9 rounded object-cover" /> : <div className="h-9 w-9 rounded bg-slate-100" />}
              <div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-400">{r.sku} · {r.barcode}</div></div>
            </div>) },
          { key: "category_name", label: "Category", render: (r) => r.category_name || "—" },
          { key: "retail_price", label: "Retail", align: "right", render: (r) => money(r.retail_price) },
          { key: "wholesale_price", label: "Wholesale", align: "right", render: (r) => r.wholesale_price ? money(r.wholesale_price) : "—" },
          { key: "cost_price", label: "Cost", align: "right", render: (r) => money(r.cost_price) },
          { key: "units", label: "Packs", render: (r) => r.units.map((u) => <Badge key={u.id} className="mr-1">{u.name}</Badge>) },
          { key: "stock", label: "Stock", align: "right", render: (r) => {
            if (!r.track_stock) return <span className="text-slate-400">—</span>;
            const s = Number(r.stock);
            return <span className={s <= 0 ? "font-medium text-rose-600" : s <= Number(r.reorder_level) ? "font-medium text-amber-700" : ""}>{qty(r.stock)} {r.unit_abbr}</span>;
          } },
          { key: "is_active", label: "", render: (r) => !r.is_active && <Badge>inactive</Badge> },
        ]} />
        <Pager data={data} page={page} setPage={setPage} />
      </Card>
      {editing && <ProductForm product={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); cats.reload(); }} />}
    </div>
  );
}

function ProductForm({ product, onClose, onSaved }) {
  const isNew = !product.id;
  const [f, setF] = useState(() => ({ ...EMPTY, ...product, category: product.category || "", brand: product.brand || "",
    wholesale_price: product.wholesale_price ?? "", min_price: product.min_price ?? "" }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState(null);
  const cats = useApi("/categories/");
  const brands = useApi("/brands/");
  const units = useApi("/units/");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  useEffect(() => {
    if (isNew && !f.unit && units.data?.length) setF((x) => ({ ...x, unit: units.data[0].id }));
  }, [units.data]); // eslint-disable-line

  const quickAdd = async (path, label, key, reload) => {
    const name = window.prompt(`New ${label} name`);
    if (!name) return;
    try {
      const row = await api(path, { method: "POST", body: { name } });
      reload();
      setF((x) => ({ ...x, [key]: row.id }));
    } catch (err) { toast(err.message, "red"); }
  };

  const save = async () => {
    setBusy(true);
    setError("");
    const nul = (v) => (v === "" || v === undefined ? null : v);
    const body = {
      ...f, category: nul(f.category), brand: nul(f.brand), wholesale_price: nul(f.wholesale_price), min_price: nul(f.min_price),
      units: f.units.map((u) => ({ ...u, retail_price: nul(u.retail_price), wholesale_price: nul(u.wholesale_price) })),
      price_tiers: f.price_tiers.map((t) => ({ ...t, unit_name: t.unit_name || null })),
    };
    delete body.image;
    if (!isNew) delete body.opening_stock;
    try {
      const saved = await api(isNew ? "/products/" : `/products/${f.id}/`, { method: isNew ? "POST" : "PATCH", body });
      if (image) {
        const fd = new FormData();
        fd.append("image", image);
        await api(`/products/${saved.id}/upload_image/`, { method: "POST", body: fd });
      }
      toast(isNew ? "Product added" : "Product saved");
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${f.name}? Products with sales history are deactivated instead.`)) return;
    try { await api(`/products/${f.id}/`, { method: "DELETE" }); onSaved(); } catch (err) { setError(err.message); }
  };

  const baseUnit = units.data?.find((u) => u.id === Number(f.unit));

  return (
    <Modal open onClose={onClose} title={isNew ? "Add product" : `Edit ${product.name}`} size="lg"
      footer={<>
        {!isNew && <Button variant="ghost" className="mr-auto text-rose-600" onClick={remove}><Trash2 className="h-4 w-4" />Delete</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>Save product</Button>
      </>}>
      <div className="space-y-5">
        <Alert>{error}</Alert>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Product name" className="sm:col-span-2"><Input value={f.name} onChange={set("name")} autoFocus /></Field>
          <Field label="SKU" hint="Leave blank to auto-generate"><Input value={f.sku} onChange={set("sku")} /></Field>
          <Field label="Barcode" hint="Scan it, or leave blank to generate an in-store EAN-13"><Input value={f.barcode} onChange={set("barcode")} /></Field>
          <Field label={<span className="flex justify-between">Category <button type="button" className="text-brand-700" onClick={() => quickAdd("/categories/", "category", "category", cats.reload)}>+ new</button></span>}>
            <Select value={f.category} onChange={set("category")} placeholder="—" options={(cats.data || []).map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label={<span className="flex justify-between">Brand <button type="button" className="text-brand-700" onClick={() => quickAdd("/brands/", "brand", "brand", brands.reload)}>+ new</button></span>}>
            <Select value={f.brand} onChange={set("brand")} placeholder="—" options={(brands.data || []).map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Base unit (stock is counted in this)">
            <Select value={f.unit} onChange={set("unit")} options={(units.data || []).map((u) => ({ value: u.id, label: `${u.name} (${u.abbreviation})` }))} />
          </Field>
          <Field label="Tax">
            <Select value={f.tax_type} onChange={set("tax_type")} options={[{ value: "standard", label: "Standard VAT" }, { value: "zero", label: "Zero-rated" }, { value: "exempt", label: "Exempt" }]} />
          </Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={set("description")} rows={2} /></Field>
          <Field label="Image"><input type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0])} className="text-sm" /></Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Pricing per {baseUnit?.abbreviation || "unit"}</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Purchase cost"><Input type="number" step="0.01" value={f.cost_price} onChange={set("cost_price")} /></Field>
            <Field label="Retail price"><Input type="number" step="0.01" value={f.retail_price} onChange={set("retail_price")} /></Field>
            <Field label="Wholesale price"><Input type="number" step="0.01" value={f.wholesale_price} onChange={set("wholesale_price")} /></Field>
            <Field label="Minimum price" hint="Cashiers can’t sell below this"><Input type="number" step="0.01" value={f.min_price} onChange={set("min_price")} /></Field>
            <Field label="Auto-wholesale from qty" hint="0 = wholesale customers only" className="sm:col-span-2">
              <Input type="number" value={f.wholesale_min_qty} onChange={set("wholesale_min_qty")} />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Packs & multiple units</legend>
          <p className="mb-2 text-xs text-slate-500">e.g. Carton = 12 {baseUnit?.abbreviation || "pcs"}. Selling 1 carton deducts 12 from stock. Leave prices blank to use base price × quantity.</p>
          {f.units.map((u, i) => (
            <div key={i} className="mb-2 grid grid-cols-12 gap-2">
              <Input className="col-span-3" placeholder="Name (Carton)" value={u.name} onChange={(e) => setF({ ...f, units: f.units.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />
              <Input className="col-span-2" type="number" placeholder={`= ${baseUnit?.abbreviation || "pcs"}`} value={u.factor} onChange={(e) => setF({ ...f, units: f.units.map((x, j) => j === i ? { ...x, factor: e.target.value } : x) })} />
              <Input className="col-span-2" placeholder="Retail" type="number" value={u.retail_price ?? ""} onChange={(e) => setF({ ...f, units: f.units.map((x, j) => j === i ? { ...x, retail_price: e.target.value } : x) })} />
              <Input className="col-span-2" placeholder="Wholesale" type="number" value={u.wholesale_price ?? ""} onChange={(e) => setF({ ...f, units: f.units.map((x, j) => j === i ? { ...x, wholesale_price: e.target.value } : x) })} />
              <Input className="col-span-2" placeholder="Barcode" value={u.barcode || ""} onChange={(e) => setF({ ...f, units: f.units.map((x, j) => j === i ? { ...x, barcode: e.target.value } : x) })} />
              <button className="col-span-1 text-rose-500" onClick={() => setF({ ...f, units: f.units.filter((_, j) => j !== i) })}><Trash2 className="mx-auto h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={() => setF({ ...f, units: [...f.units, { name: "", factor: "", retail_price: "", wholesale_price: "", barcode: "" }] })}>+ Add pack</Button>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Bulk (tiered) pricing</legend>
          <p className="mb-2 text-xs text-slate-500">Price per unit once the quantity reaches the minimum. The highest matching tier applies automatically at checkout.</p>
          {f.price_tiers.map((t, i) => (
            <div key={i} className="mb-2 grid grid-cols-12 gap-2">
              <Input className="col-span-3" type="number" placeholder="From qty" value={t.min_quantity} onChange={(e) => setF({ ...f, price_tiers: f.price_tiers.map((x, j) => j === i ? { ...x, min_quantity: e.target.value } : x) })} />
              <Input className="col-span-3" type="number" placeholder="Unit price" value={t.price} onChange={(e) => setF({ ...f, price_tiers: f.price_tiers.map((x, j) => j === i ? { ...x, price: e.target.value } : x) })} />
              <Select className="col-span-3" value={t.unit_name || ""} onChange={(e) => setF({ ...f, price_tiers: f.price_tiers.map((x, j) => j === i ? { ...x, unit_name: e.target.value } : x) })}
                options={[{ value: "", label: `per ${baseUnit?.abbreviation || "unit"}` }, ...f.units.filter((u) => u.name).map((u) => ({ value: u.name, label: `per ${u.name}` }))]} />
              <Select className="col-span-2" value={t.customer_category || ""} onChange={(e) => setF({ ...f, price_tiers: f.price_tiers.map((x, j) => j === i ? { ...x, customer_category: e.target.value } : x) })}
                options={[{ value: "", label: "Everyone" }, { value: "retail", label: "Retail" }, { value: "wholesale", label: "Wholesale" }, { value: "distributor", label: "Distributor" }]} />
              <button className="col-span-1 text-rose-500" onClick={() => setF({ ...f, price_tiers: f.price_tiers.filter((_, j) => j !== i) })}><Trash2 className="mx-auto h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={() => setF({ ...f, price_tiers: [...f.price_tiers, { min_quantity: "", price: "", unit_name: "", customer_category: "" }] })}>+ Add tier</Button>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Stock</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Reorder level"><Input type="number" value={f.reorder_level} onChange={set("reorder_level")} /></Field>
            <Field label="Reorder quantity"><Input type="number" value={f.reorder_quantity} onChange={set("reorder_quantity")} /></Field>
            {isNew && <Field label="Opening stock"><Input type="number" value={f.opening_stock} onChange={set("opening_stock")} /></Field>}
            {isNew && f.track_batches && <>
              <Field label="Batch number"><Input value={f.batch_number} onChange={set("batch_number")} /></Field>
              <Field label="Expiry date"><Input type="date" value={f.expiry_date} onChange={set("expiry_date")} /></Field>
            </>}
          </div>
          <div className="mt-3 flex flex-wrap gap-5">
            <Checkbox label="Track stock" checked={f.track_stock} onChange={set("track_stock")} />
            <Checkbox label="Track batches & expiry" checked={f.track_batches} onChange={set("track_batches")} />
            <Checkbox label="Active" checked={f.is_active} onChange={set("is_active")} />
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
