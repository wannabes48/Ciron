import { createContext, useContext } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";

/**
 * Receipt printer: a printer body with a screen, and a paper receipt that feeds out of the slot.
 * Compound component, used as ReceiptPrinter.Root > Machine (Header, Screen > Status) + Output > Paper.
 *
 * stage:      "processing" (no paper) → "printing" (paper feeds out) → "complete" (paper resting)
 * feedMotion: "stepped" (line by line, like a thermal printer) or "smooth"
 * animate:    false disables every transition. Reduced-motion users never see movement either.
 */

const Ctx = createContext(null);

const STATUS_LABELS = {
  processing: "Processing your order",
  printing: "Printing your receipt",
  complete: "Order complete",
};

// Torn-paper bottom edge: 40 teeth, 4px deep.
const TEETH = 40;
const DEPTH = 4;
const teethPoints = Array.from({ length: TEETH * 2 }, (_, i) => {
  const x = 100 - ((i + 1) * 100) / (TEETH * 2);
  const y = i % 2 === 0 ? "100%" : `calc(100% - ${DEPTH}px)`;
  return `${x}% ${y}`;
}).join(", ");
const PAPER_CLIP = `polygon(0 0, 100% 0, 100% calc(100% - ${DEPTH}px), ${teethPoints})`;

const cx = (...c) => c.filter(Boolean).join(" ");

function usePrinter(name) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error(`${name} must be used inside ReceiptPrinter.Root.`);
  return ctx;
}

function Root({ stage, feedMotion = "stepped", animate = true, className, children, "aria-label": ariaLabel = "Receipt printer", ...props }) {
  return (
    <Ctx.Provider value={{ stage, feedMotion, animate }}>
      <section aria-label={ariaLabel} data-stage={stage} data-feed={feedMotion}
        className={cx("rp-root", !animate && "rp-static", className)} {...props}>
        {children}
      </section>
    </Ctx.Provider>
  );
}

function Machine({ className, children, ...props }) {
  return (
    <div className={cx("rp-machine", className)} {...props}>
      {children}
      <div aria-hidden="true" className="rp-slot" />
    </div>
  );
}

function Header({ className, ...props }) {
  return <div className={cx("rp-header", className)} {...props} />;
}

function Screen({ className, children, ...props }) {
  return (
    <div className={cx("rp-screen", className)} {...props}>
      <div className="rp-screen-inner">{children}</div>
    </div>
  );
}

function Status({ className, children, ...props }) {
  const { stage } = usePrinter("ReceiptPrinter.Status");
  const done = stage === "complete";
  return (
    <div className={cx("rp-status", className)} {...props}>
      <span aria-hidden="true" className="rp-status-icon">
        {done
          ? <CheckCircle2 key="done" size={18} className="rp-status-done rp-status-label" />
          : <LoaderCircle key="work" size={18} strokeWidth={2.25} className="rp-spin" />}
      </span>
      <div role="status" aria-live="polite" className="min-w-0 flex-1 truncate">
        <span key={stage} className="rp-status-label inline-block">{children ?? STATUS_LABELS[stage]}</span>
      </div>
    </div>
  );
}

function Output({ className, children, style, height = "32rem", ...props }) {
  const { stage } = usePrinter("ReceiptPrinter.Output");
  const visible = stage !== "processing";
  return (
    <div className={cx("rp-output", className)} style={{ height, ...style }} {...props}>
      {visible && <div aria-hidden="true" className="rp-output-shade" />}
      {/* key restarts the feed animation each time printing begins */}
      <div key={stage === "printing" ? "feed" : "rest"} className="rp-feed" aria-hidden={stage !== "complete"}>
        {children}
      </div>
    </div>
  );
}

function Paper({ className, style, ...props }) {
  return <article className={cx("rp-paper", className)} style={{ clipPath: PAPER_CLIP, ...style }} {...props} />;
}

export const ReceiptPrinter = { Root, Machine, Header, Screen, Status, Output, Paper };
export default ReceiptPrinter;
