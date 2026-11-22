const kes = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-KE", { notation: "compact", maximumFractionDigits: 1 });

export const money = (v) => `KSh ${kes.format(Number(v || 0))}`;
export const num = (v) => kes.format(Number(v || 0));
export const short = (v) => compact.format(Number(v || 0));
export const qty = (v) => {
  const n = Number(v || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
};
export const date = (v) => (v ? new Date(v).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const dateTime = (v) =>
  v ? new Date(v).toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export const PAYMENT_LABELS = { cash: "Cash", mpesa: "M-Pesa", card: "Card", bank: "Bank", cheque: "Cheque", credit: "Credit" };
