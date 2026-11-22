import { dateTime, money, num, qty, PAYMENT_LABELS } from "../lib/format";

/** 80mm thermal receipt / quotation. Wrap in .print-area and call window.print(). */
export default function Receipt({ sale, business, branch }) {
  if (!sale) return null;
  const isQuote = sale.status === "quotation";
  const cashPaid = sale.payments?.filter((p) => p.kind === "sale") || [];
  return (
    <div className="mx-auto w-[300px] bg-white font-mono text-[12px] leading-snug text-black">
      <div className="text-center">
        <div className="text-base font-bold uppercase">{business?.name}</div>
        {branch?.name && <div>{branch.name}{branch.location ? `, ${branch.location}` : ""}</div>}
        {business?.address && <div>{business.address}</div>}
        {business?.phone && <div>Tel: {business.phone}</div>}
        {business?.kra_pin && <div>PIN: {business.kra_pin}</div>}
        {business?.receipt_header && <div className="whitespace-pre-line">{business.receipt_header}</div>}
        <div className="my-1 font-bold">{isQuote ? "QUOTATION" : sale.status === "held" ? "ORDER (NOT PAID)" : "SALES RECEIPT"}</div>
      </div>
      <div className="border-y border-dashed border-black py-1">
        <div className="flex justify-between"><span>No:</span><span>{sale.number}</span></div>
        <div className="flex justify-between"><span>Date:</span><span>{dateTime(sale.completed_at || sale.created_at)}</span></div>
        <div className="flex justify-between"><span>Served by:</span><span>{sale.cashier_name}</span></div>
        {sale.customer_name && <div className="flex justify-between"><span>Customer:</span><span>{sale.customer_name}</span></div>}
        {sale.customer_kra_pin && <div className="flex justify-between"><span>Cust. PIN:</span><span>{sale.customer_kra_pin}</span></div>}
        {sale.sale_type === "wholesale" && <div className="text-center font-bold">WHOLESALE</div>}
      </div>
      <div className="py-1">
        {sale.items?.map((i) => (
          <div key={i.id} className="mb-1">
            <div>{i.product_name}</div>
            <div className="flex justify-between pl-2">
              <span>{qty(i.quantity)} {i.unit_name} x {num(i.unit_price)}</span>
              <span>{num(Number(i.quantity) * Number(i.unit_price))}</span>
            </div>
            {Number(i.discount) > 0 && (
              <div className="flex justify-between pl-2"><span>  discount</span><span>-{num(i.discount)}</span></div>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-black py-1">
        <div className="flex justify-between"><span>Subtotal</span><span>{num(sale.subtotal)}</span></div>
        {Number(sale.discount_total) > 0 && <div className="flex justify-between"><span>Discount</span><span>-{num(sale.discount_total)}</span></div>}
        <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{money(sale.total)}</span></div>
        {Number(sale.tax_total) > 0 && (
          <div className="flex justify-between"><span>VAT incl.</span><span>{num(sale.tax_total)}</span></div>
        )}
      </div>
      {!isQuote && (
        <div className="border-t border-dashed border-black py-1">
          {cashPaid.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span>{PAYMENT_LABELS[p.method]}{p.reference ? ` (${p.reference})` : ""}</span>
              <span>{num(p.amount)}</span>
            </div>
          ))}
          {Number(sale.change_given) > 0 && <div className="flex justify-between"><span>Change</span><span>{num(sale.change_given)}</span></div>}
          {Number(sale.balance) > 0 && (
            <div className="flex justify-between font-bold"><span>BALANCE DUE</span><span>{num(sale.balance)}</span></div>
          )}
          {sale.due_date && Number(sale.balance) > 0 && <div className="flex justify-between"><span>Due</span><span>{sale.due_date}</span></div>}
        </div>
      )}
      {isQuote && sale.valid_until && <div className="py-1 text-center">Valid until {sale.valid_until}</div>}
      <div className="mt-2 whitespace-pre-line border-t border-dashed border-black pt-2 text-center">
        {business?.receipt_footer}
        <div className="mt-1 text-[10px]">Powered by Ciron POS</div>
      </div>
    </div>
  );
}
