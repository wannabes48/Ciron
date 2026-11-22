import { ArrowRight, BarChart3, Boxes, Check, Keyboard, Layers, Store, Users, Wallet } from "lucide-react";
import CheckoutDemo from "./CheckoutDemo";
import { SiteButton } from "./SiteLayout";
import { SITE, TRIAL_DAYS } from "./config";

const FEATURES = [
  { icon: Keyboard, title: "Checkout in seconds", body: "Scan a barcode or type a few letters. Type 12*code to add twelve. Every step has a shortcut, and buttons are big enough for a busy thumb." },
  { icon: Layers, title: "Retail and wholesale on one till", body: "Ciron picks the right price for each customer and quantity: retail, wholesale, a quantity tier or a price you agreed with a regular buyer." },
  { icon: Wallet, title: "Cash, M-Pesa, card and credit", body: "Split one sale across payment methods, record the M-Pesa code, give change, or sell on credit within the limit you set for that customer." },
  { icon: Boxes, title: "Stock that adds up", body: "Every sale, delivery, transfer and write-off is recorded with who did it and when. Sell by the piece, the packet or the carton. Expiry dates are tracked." },
  { icon: Users, title: "Customers who owe you", body: "See who owes what and for how long. Send a statement, record a payment and it clears the oldest unpaid sale first." },
  { icon: BarChart3, title: "Know your numbers tonight", body: "Today's sales, profit, expenses, stock value and best sellers on one screen. Cash-up per cashier so the drawer balances." },
];

const TIERS = [
  ["1 to 9 bottles", "KSh 70.00", "Retail"],
  ["10 to 49 bottles", "KSh 65.00", "Quantity tier"],
  ["50 to 99 bottles", "KSh 60.00", "Quantity tier"],
  ["A crate of 24, wholesale buyer", "KSh 52.08", "Wholesale"],
  ["Kamau Stores, a regular", "KSh 50.00", "Agreed price"],
];

const STEPS = [
  { n: "1", title: "Create your shop", body: `Pick your shop address, like mamanjeri.${SITE.domain}. It takes two minutes and your ${TRIAL_DAYS}-day trial starts straight away.` },
  { n: "2", title: "Add your products", body: "Type them in or import a spreadsheet. Set retail and wholesale prices, cartons and packets, and opening stock." },
  { n: "3", title: "Start selling", body: "Open the till on a laptop, tablet or phone. Plug in a USB barcode scanner and receipt printer if you have them." },
];

const SHOPS = ["Dukas and mini-marts", "Wholesalers and distributors", "Hardware stores", "Agrovets", "Cosmetics and beauty", "Electronics and phones"];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-c-border bg-c-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-c-subtle px-3 py-1 text-sm font-medium text-c-subtle-text">
              <span className="h-2 w-2 rounded-full bg-c-accent" aria-hidden="true" />Built for Kenyan shops
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-5xl">
              Run your shop from one till.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-7 text-c-text2">
              Ciron is the point of sale and stock book for retail and wholesale shops. Sell by the piece or the carton, take M-Pesa and credit, and see today's profit before you close.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <SiteButton to="/register" size="lg">Start {TRIAL_DAYS}-day free trial<ArrowRight size={18} /></SiteButton>
              <SiteButton to="/pricing" size="lg" variant="secondary">See pricing</SiteButton>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-c-muted">
              {["No card needed", "Works on laptop, tablet and phone", "Your own shop address"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5"><Check size={16} className="text-c-success" aria-hidden="true" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="flex justify-center lg:justify-end">
            <CheckoutDemo />
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="border-b border-c-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-6 text-sm text-c-muted sm:px-6">
          <span className="inline-flex items-center gap-2 font-medium text-c-text"><Store size={18} aria-hidden="true" />Made for</span>
          {SHOPS.map((s) => <span key={s}>{s}</span>)}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-[28px] font-semibold leading-[34px] tracking-[-0.01em]">Everything the counter and the back office need</h2>
            <p className="mt-3 text-base leading-6 text-c-text2">The cashier gets a fast, simple till. You get the stock, credit and profit picture, from anywhere.</p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-[14px] border border-c-border bg-c-surface p-5">
                <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-c-subtle text-c-subtle-text"><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span>
                <h3 className="mt-4 text-lg font-semibold leading-6">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-c-text2">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing engine example */}
      <section className="border-y border-c-border bg-c-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div>
            <h2 className="text-[28px] font-semibold leading-[34px] tracking-[-0.01em]">The right price, without the cashier doing maths</h2>
            <p className="mt-3 text-base leading-6 text-c-text2">
              Set your prices once. When a customer buys more, or a wholesale buyer walks in, Ciron charges the price you set for them. Nobody can sell below your minimum price without a manager.
            </p>
            <ul className="mt-6 space-y-3 text-base">
              {["Retail, wholesale and quantity tiers", "Prices agreed with individual customers", "Cartons, packets and dozens with their own prices", "VAT included or added, as your shop is registered"].map((t) => (
                <li key={t} className="flex gap-2.5"><Check size={20} className="mt-0.5 shrink-0 text-c-success" aria-hidden="true" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[14px] border border-c-border bg-c-bg p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-base font-semibold">Soda 500ml</h3>
              <span className="font-mono text-xs text-c-muted">SKU P000005</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-c-border text-left text-c-text2"><th className="py-2 font-medium">Customer buys</th><th className="py-2 text-right font-medium">Price per bottle</th><th className="py-2 pl-4 text-right font-medium">Rule</th></tr>
              </thead>
              <tbody>
                {TIERS.map(([a, b, c]) => (
                  <tr key={a} className="border-b border-c-border last:border-0">
                    <td className="py-3">{a}</td>
                    <td className="py-3 text-right font-medium tabular-nums">{b}</td>
                    <td className="py-3 pl-4 text-right text-c-muted">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Owner view */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-[28px] font-semibold leading-[34px] tracking-[-0.01em]">Your evening check, in one screen</h2>
            <p className="mt-3 text-base leading-6 text-c-text2">Open Ciron on your phone after closing and see exactly how the day went, branch by branch.</p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[["Sales today", "KSh 48,250", "+12% on last Saturday"], ["Gross profit", "KSh 9,870", "20.5% margin"], ["Customers owe you", "KSh 31,400", "4 overdue"], ["Low stock", "7 products", "Reorder list ready"]].map(([l, v, s]) => (
              <div key={l} className="rounded-[14px] border border-c-border bg-c-surface p-5">
                <div className="text-sm text-c-text2">{l}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div>
                <div className="mt-1 text-xs text-c-muted">{s}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[14px] border border-c-border bg-c-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Retail and wholesale this week</h3>
              <div className="flex gap-4 text-xs text-c-text2">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-c-retail" />Retail</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-c-wholesale" />Wholesale</span>
              </div>
            </div>
            <WeekBars />
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="border-y border-c-border bg-c-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-[28px] font-semibold leading-[34px] tracking-[-0.01em]">Selling by this afternoon</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-c-action text-base font-semibold text-white">{s.n}</span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-c-text2">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

// Static illustration of the dashboard chart: grouped bars per day, 2px gap, rounded tops.
function WeekBars() {
  const days = [["Mon", 31, 18], ["Tue", 28, 22], ["Wed", 35, 15], ["Thu", 30, 26], ["Fri", 42, 30], ["Sat", 48, 37], ["Sun", 22, 9]];
  const max = 50;
  return (
    <div className="mt-5" role="img" aria-label="Example bar chart of retail and wholesale sales for each day of the week, in thousands of shillings. Saturday is highest at 48 thousand retail and 37 thousand wholesale.">
      <div className="flex h-40 items-end gap-3 border-b border-c-border sm:gap-6">
        {days.map(([d, r, w]) => (
          <div key={d} className="flex h-full flex-1 items-end justify-center gap-[2px]">
            <div className="w-full max-w-5 rounded-t-[4px] bg-c-retail" style={{ height: `${(r / max) * 100}%` }} title={`${d} retail KSh ${r},000`} />
            <div className="w-full max-w-5 rounded-t-[4px] bg-c-wholesale" style={{ height: `${(w / max) * 100}%` }} title={`${d} wholesale KSh ${w},000`} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-center text-xs text-c-muted sm:gap-6">
        {days.map(([d]) => <span key={d} className="flex-1">{d}</span>)}
      </div>
    </div>
  );
}

export function CtaBand() {
  return (
    <section className="bg-c-blue">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[28px] font-semibold leading-[34px] tracking-[-0.01em] text-white">Open your shop on Ciron today</h2>
          <p className="mt-2 text-base text-[#E5EDFF]">{TRIAL_DAYS} days free. No card needed. Bring your products over in a spreadsheet.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <SiteButton to="/register" variant="onBlue" size="lg">Start free trial</SiteButton>
          <SiteButton to="/contact?topic=demo" variant="outlineOnBlue" size="lg">Book a demo</SiteButton>
        </div>
      </div>
    </section>
  );
}
