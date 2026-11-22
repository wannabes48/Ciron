import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import ReceiptPrinter from "../components/ReceiptPrinter";

const ITEMS = [
  { name: "Soda 500ml crate (24)", qty: "2 @ 1,250.00", amount: 2500, note: "wholesale" },
  { name: "Soda 500ml", qty: "12 btl @ 65.00", amount: 780, note: "10+ price" },
];
const TOTAL = 3280;
const VAT = (TOTAL * 16) / 116;
const fmt = (n) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Row = ({ l, r, bold }) => (
  <div className={`flex justify-between gap-3 ${bold ? "font-semibold" : ""}`}><span>{l}</span><span className="tabular-nums">{r}</span></div>
);
const Rule = () => <div className="my-2.5 border-t border-dashed border-[#8E949E]" />;

/** Landing-page demo: one checkout prints a receipt. Plays once on load; "New sale" runs it again. */
export default function CheckoutDemo() {
  const [stage, setStage] = useState("processing");
  const timers = useRef([]);

  const run = useCallback(() => {
    timers.current.forEach(clearTimeout);
    setStage("processing");
    timers.current = [
      setTimeout(() => setStage("printing"), 1500),
      setTimeout(() => setStage("complete"), 1500 + 1800),
    ];
  }, []);

  useEffect(() => { run(); return () => timers.current.forEach(clearTimeout); }, [run]);

  return (
    <ReceiptPrinter.Root stage={stage} aria-label="Example checkout printing a receipt">
      <ReceiptPrinter.Machine>
        <ReceiptPrinter.Header>
          <img src="/brand/favicon.svg" alt="" className="h-6 w-6" />
          <button onClick={run} disabled={stage !== "complete"}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#05080e] bg-[#3a4558] px-2.5 text-xs font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_0_#05080e] hover:bg-[#465269] active:translate-y-[1px] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] disabled:opacity-50">
            <RotateCcw size={13} aria-hidden="true" />New sale
          </button>
        </ReceiptPrinter.Header>
        <ReceiptPrinter.Screen>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="text-sm leading-5">
                <p className="font-medium">Charge · M-Pesa + cash</p>
                <p className="text-[#A7ADB7]">3 lines · Cashier: Wanjiru</p>
              </div>
              <strong className="text-lg tabular-nums">KSh {fmt(TOTAL)}</strong>
            </div>
            <ReceiptPrinter.Status />
          </div>
        </ReceiptPrinter.Screen>
      </ReceiptPrinter.Machine>

      <ReceiptPrinter.Output height="31rem">
        <ReceiptPrinter.Paper>
          <div className="text-center">
            <p className="text-[13px] font-medium">MAMA NJERI WHOLESALE</p>
            <p>Gikomba Rd, Nairobi · 0712 345 678</p>
            <p>KRA PIN P051234567X</p>
          </div>
          <Rule />
          <Row l="Receipt S-000482" r="15:22" />
          <Row l="22 Nov 2026" r="Till 1" />
          <Rule />
          {ITEMS.map((it, i) => (
            <div key={i} className="mb-1.5">
              <div>{it.name}{it.note ? ` (${it.note})` : ""}</div>
              <Row l={<span className="pl-2">{it.qty}</span>} r={fmt(it.amount)} />
            </div>
          ))}
          <Rule />
          <Row l="TOTAL" r={fmt(TOTAL)} bold />
          <Row l="VAT 16% incl." r={fmt(VAT)} />
          <Row l="M-Pesa SKL4F7H2QX" r={fmt(3000)} />
          <Row l="Cash" r={fmt(1000)} />
          <Row l="Change" r={fmt(720)} bold />
          <Rule />
          <p className="text-center">Thank you. Karibu tena.</p>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#5D626B]">
            powered by <img src="/brand/ciron-logo-horizontal.svg" alt="Ciron" className="h-3 w-auto" />
          </p>
        </ReceiptPrinter.Paper>
      </ReceiptPrinter.Output>
    </ReceiptPrinter.Root>
  );
}
