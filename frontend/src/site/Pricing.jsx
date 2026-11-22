import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { CtaBand } from "./Home";
import { SiteButton } from "./SiteLayout";
import { COMPARISON, ENTERPRISE, PLANS, TRIAL_DAYS, money } from "./config";

const FAQ = [
  ["How does the free trial work?", `You get ${TRIAL_DAYS} days of the Growth plan with no card needed. At the end, choose a plan and pay by M-Pesa, card or bank transfer. If you do nothing, your shop becomes read-only; your data is kept for 90 days.`],
  ["How do I pay?", "Monthly or yearly, by M-Pesa Paybill, card or bank transfer. You get a receipt by email and SMS. Yearly plans cost the same as 10 months."],
  ["Can I change plans later?", "Yes, at any time from Settings. Upgrades take effect straight away and you only pay the difference for the rest of the month. Downgrades start on your next billing date."],
  ["Is VAT included in these prices?", "Prices shown are what you pay per month, in Kenyan shillings, including VAT."],
  ["Do I need special hardware?", "No. Ciron runs in the browser on any laptop, tablet or phone. USB and Bluetooth barcode scanners and 58 mm or 80 mm receipt printers work without setup."],
  ["What happens to my data if I leave?", "It is yours. Export products, customers, sales and stock to CSV at any time. After you cancel we keep it for 90 days in case you change your mind, then delete it."],
  ["Does Ciron work with KRA eTIMS and M-Pesa STK push?", "Both are on our roadmap for Growth and Wholesale plans. Today you record the M-Pesa code at the till and invoices reserve an eTIMS number. We will tell every customer when each one goes live."],
  ["Is there a setup fee?", "No setup fee for self-service. If you want us to import your products and train your staff on site, ask about the Enterprise plan."],
];

export default function Pricing() {
  const [yearly, setYearly] = useState(false);
  const price = (m) => (yearly ? m * 10 : m);
  return (
    <>
      <section className="border-b border-c-border bg-c-surface">
        <div className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 lg:pt-20">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.02em]">Simple prices in shillings</h1>
            <p className="mt-4 text-lg leading-7 text-c-text2">Every plan includes the POS, stock, receipts and dashboard. Start with {TRIAL_DAYS} days free, no card needed.</p>
            <div className="mt-8 inline-flex rounded-[12px] border border-c-border bg-c-bg p-1" role="radiogroup" aria-label="Billing period">
              {[[false, "Monthly"], [true, "Yearly"]].map(([v, l]) => (
                <button key={l} role="radio" aria-checked={yearly === v} onClick={() => setYearly(v)}
                  className={`h-10 rounded-[10px] px-4 text-sm font-medium ${yearly === v ? "bg-c-surface text-c-text shadow-[var(--c-shadow-md)]" : "text-c-text2 hover:text-c-text"}`}>
                  {l}{v && <span className="ml-1.5 text-c-accent-text">2 months free</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.id} className={`relative flex flex-col rounded-[14px] border bg-c-surface p-6 ${p.popular ? "border-c-action ring-1 ring-c-action" : "border-c-border"}`}>
                {p.popular && (
                  <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-c-action px-3 py-1 text-xs font-medium text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FFB08B]" aria-hidden="true" />Most shops choose this
                  </span>
                )}
                <h2 className="text-xl font-semibold">{p.name}</h2>
                <p className="mt-1 text-sm text-c-text2">{p.tagline}</p>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tabular-nums tracking-[-0.02em]">{money(price(p.monthly))}</span>
                  <span className="text-sm text-c-muted">/{yearly ? "year" : "month"}</span>
                </div>
                <p className="mt-1 h-5 text-xs text-c-muted">{yearly ? `${money(Math.round((p.monthly * 10) / 12))} a month, billed yearly` : "Billed monthly, cancel any time"}</p>
                <SiteButton to="/register" variant={p.popular ? "primary" : "secondary"} className="mt-5 w-full">Start free trial</SiteButton>
                <ul className="mt-6 space-y-1 border-b border-c-border pb-5 text-sm font-medium">
                  {p.limits.map((l) => <li key={l}>{l}</li>)}
                </ul>
                <ul className="mt-5 space-y-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2"><Check size={18} className="shrink-0 text-c-success" aria-hidden="true" /><span className="text-c-text2">{f}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-5 rounded-[14px] border border-c-border bg-c-bg p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">{ENTERPRISE.name}</h2>
              <p className="mt-1 text-sm text-c-text2">{ENTERPRISE.tagline}</p>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-c-text2">
                {ENTERPRISE.features.map((f) => <li key={f} className="inline-flex items-center gap-1.5"><Check size={16} className="text-c-success" aria-hidden="true" />{f}</li>)}
              </ul>
            </div>
            <SiteButton to="/contact?topic=sales" variant="secondary">Talk to sales</SiteButton>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-[28px] font-semibold leading-[34px] tracking-[-0.01em]">Compare plans</h2>
          <div className="mt-6 overflow-x-auto rounded-[14px] border border-c-border bg-c-surface">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-c-border text-left">
                  <th scope="col" className="px-5 py-3 font-medium text-c-text2">Feature</th>
                  {PLANS.map((p) => <th key={p.id} scope="col" className="px-5 py-3 text-center font-semibold">{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, ...vals]) => (
                  <tr key={label} className="border-b border-c-border last:border-0">
                    <th scope="row" className="px-5 py-3 text-left font-normal">{label}</th>
                    {vals.map((v, i) => (
                      <td key={i} className="px-5 py-3 text-center tabular-nums">
                        {v === true ? <><Check size={18} className="mx-auto text-c-success" aria-hidden="true" /><span className="sr-only">Included</span></>
                          : v === false ? <><Minus size={18} className="mx-auto text-c-muted" aria-hidden="true" /><span className="sr-only">Not included</span></>
                            : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-t border-c-border bg-c-surface">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-[28px] font-semibold leading-[34px] tracking-[-0.01em]">Questions shop owners ask</h2>
          <div className="mt-6 divide-y divide-c-border border-y border-c-border">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-1 text-base font-medium">
                  {q}<span className="text-xl leading-none text-c-muted group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-2 text-base leading-6 text-c-text2">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
