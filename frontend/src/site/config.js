// Public-site content in one place. Replace the placeholder contact details and the company's
// legal name before launch; plan prices are a starting proposal, not wired to billing yet.

export const SITE = {
  name: "Ciron",
  legalName: "Ciron", // TODO: registered company name, e.g. "Ciron Technologies Limited"
  domain: "ciron.co.ke",
  email: "hello@ciron.co.ke",
  supportEmail: "support@ciron.co.ke",
  privacyEmail: "privacy@ciron.co.ke",
  phone: "+254 700 000 000", // TODO: real sales line
  whatsapp: "254700000000", // TODO: real WhatsApp number, digits only
  address: "Nairobi, Kenya", // TODO: office address
  hours: "Monday to Saturday, 08:00 to 19:00",
  legalUpdated: "22 Nov 2026",
};

export const TRIAL_DAYS = 14;

// Annual billing = 10 months for 12.
export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "One counter, one owner, getting organised.",
    monthly: 1500,
    limits: ["1 branch", "2 staff accounts", "Up to 1,000 products"],
    features: [
      "Fast POS with barcode scanning",
      "Retail and wholesale prices",
      "Cash, M-Pesa and card payments",
      "Stock ledger and low-stock alerts",
      "Printed and on-screen receipts",
      "Daily sales and profit dashboard",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Staff on shifts, customers on credit.",
    monthly: 3500,
    popular: true,
    limits: ["2 branches", "8 staff accounts", "Unlimited products"],
    features: [
      "Everything in Starter",
      "Customer credit, limits and statements",
      "Suppliers, purchase orders and receiving",
      "Expenses and profit and loss",
      "Roles and permissions per employee",
      "Cashier shifts and cash-up",
      "Reports with CSV export",
    ],
  },
  {
    id: "wholesale",
    name: "Wholesale",
    tagline: "Volume pricing and more than one store.",
    monthly: 7500,
    limits: ["5 branches", "Unlimited staff", "Unlimited products"],
    features: [
      "Everything in Growth",
      "Quantity tiers and customer-specific prices",
      "Quotations and carton and pack units",
      "Stock transfers between branches",
      "Batches and expiry dates",
      "Adjustment approvals and stocktakes",
      "Priority phone support",
    ],
  },
];

export const ENTERPRISE = {
  name: "Enterprise",
  tagline: "Chains, distributors and more than five branches.",
  features: ["Unlimited branches", "Data migration from your old system", "Staff training on site", "Agreed support hours"],
};

// Rows for the comparison table: [label, starter, growth, wholesale]. true/false or text.
export const COMPARISON = [
  ["Branches", "1", "2", "5"],
  ["Staff accounts", "2", "8", "Unlimited"],
  ["Products", "1,000", "Unlimited", "Unlimited"],
  ["POS, receipts, hold and resume", true, true, true],
  ["Retail and wholesale prices", true, true, true],
  ["Cash, M-Pesa, card, bank", true, true, true],
  ["Stock ledger and reorder list", true, true, true],
  ["Customer credit and statements", false, true, true],
  ["Suppliers and purchase orders", false, true, true],
  ["Expenses and profit and loss", false, true, true],
  ["Roles and permissions", false, true, true],
  ["Quantity tiers and customer prices", false, false, true],
  ["Branch stock transfers", false, false, true],
  ["Batches and expiry tracking", false, false, true],
  ["M-Pesa STK push (coming soon)", false, true, true],
  ["KRA eTIMS invoicing (coming soon)", false, true, true],
];

export const money = (n) => `KSh ${Number(n).toLocaleString("en-KE")}`;
