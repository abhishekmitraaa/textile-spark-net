// What a subscription invoice says, as text: the model invoice-render draws (subscriptions
// P1, 2026-10-08). Kept apart from the drawing so Node can check it
// (scripts/subscriptions/invoice-document-check.mjs).
//
// The invoice is drawn from what was frozen when it was issued (supplier, recipient, place
// of supply, the tax split), never from today's profiles, so a vendor who moves state or
// changes GSTIN doesn't change an issued invoice. Invoices from before 2026-10-08 have no
// frozen parties; they are receipts and show the vendor's name and the GSTIN they gave.
//
// A tax invoice carries what CGST Rules, rule 46 asks for: supplier name, address and
// GSTIN; a consecutive number of at most 16 characters; the date; the recipient's name,
// address and GSTIN; place of supply with its state code; SAC; taxable value and discount;
// the tax rate and amount by CGST/SGST or IGST; the total; reverse charge (No).
//
// No Deno APIs and no imports beyond _shared/gst.ts.

import { GST_RATE } from "../_shared/gst.ts";

export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  created_at: string;
  amount: number;                 // ₹ taxable value
  gst_amount: number | null;      // ₹, legacy rows
  gst_number: string | null;
  discount_amount: number | null; // ₹
  discount_code: string | null;
  credit_rupees: number | null;
  change_kind: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  payment_mode: string;
  document_type: string;
  supplier: Record<string, string | null> | null;
  recipient: Record<string, string | null> | null;
  place_of_supply: string | null;
  supply_type: string | null;
  sac_code: string | null;
  cgst_paise: number | null;
  sgst_paise: number | null;
  igst_paise: number | null;
  total_paise: number | null;
}

export interface DocModel {
  title: string;
  /** Said under the title on anything that isn't a tax invoice. */
  notice: string | null;
  number: string;
  issuedOn: string;
  supplier: string[];
  recipient: string[];
  meta: Array<[string, string]>;
  lines: Array<[string, string]>;
  taxable: string;
  taxes: Array<[string, string]>;
  total: string;
  totalInWords: string;
  footer: string[];
  fileName: string;
}

const IST = "Asia/Kolkata";

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

/** Rs. 1,23,456.00 — "Rs." because the PDF's standard font has no rupee sign. */
export function rupees(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const n = Math.abs(paise) / 100;
  return `${sign}Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
}
function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** Whole rupees in words, Indian system (crore, lakh, thousand). */
export function inWords(rupeesWhole: number): string {
  let n = Math.floor(Math.abs(rupeesWhole));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000); n %= 10_000_000;
  const lakh = Math.floor(n / 100_000); n %= 100_000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${inWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
}

function amountInWords(paise: number): string {
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${inWords(r)}${p ? ` and ${belowHundred(p)} Paise` : ""} only`;
}

const pct = (rate: number) => `${+(rate * 100).toFixed(2)}%`;

const TITLES: Record<string, { title: string; notice: string | null }> = {
  tax_invoice: { title: "TAX INVOICE", notice: null },
  receipt: { title: "PAYMENT RECEIPT", notice: "Payment receipt. This is not a GST tax invoice." },
  test: { title: "TEST DOCUMENT", notice: "Issued in Razorpay test mode: no money was taken. Not a tax invoice." },
  demo: { title: "DEMO DOCUMENT", notice: "Demo checkout: no payment was taken. Not a tax invoice." },
};

const KIND_LABEL: Record<string, string> = {
  new: "", renewal: "Renewal", upgrade: "Upgrade", downgrade: "Plan change",
};

export function invoiceModel(inv: InvoiceRow, planName: string, legacyRecipientName: string | null): DocModel {
  const kind = TITLES[inv.document_type] ?? TITLES.receipt;
  const number = inv.invoice_number ?? inv.id.slice(0, 8).toUpperCase();
  const s = inv.supplier;
  const r = inv.recipient;

  const supplier = s
    ? [s.legal_name ?? "", s.trade_name && s.trade_name !== s.legal_name ? `(${s.trade_name})` : "", s.address ?? "",
       [s.city, s.state_name, s.postal_code].filter(Boolean).join(", "),
       s.gstin ? `GSTIN: ${s.gstin}` : "", s.pan ? `PAN: ${s.pan}` : "",
       [s.email, s.phone].filter(Boolean).join("  ·  ")].filter(Boolean)
    : ["Cosora"];

  const recipient = r
    ? [r.name ?? "", r.address ?? "", [r.city, r.state, r.postal_code].filter(Boolean).join(", "),
       r.gst_state_code ? `State code: ${r.gst_state_code}` : "",
       r.gstin ? `GSTIN: ${r.gstin}` : "GSTIN: not registered"].filter(Boolean)
    : [legacyRecipientName ?? "Vendor", inv.gst_number ? `GSTIN: ${inv.gst_number}` : ""].filter(Boolean);

  const meta: Array<[string, string]> = [];
  if (inv.place_of_supply) {
    const st = r?.state_code === inv.place_of_supply ? r?.state : null;
    const code = r?.state_code === inv.place_of_supply ? r?.gst_state_code : null;
    meta.push(["Place of supply", [st ?? inv.place_of_supply, code ? `(${code})` : ""].filter(Boolean).join(" ")]);
  }
  if (inv.document_type === "tax_invoice") {
    meta.push(["Supply", inv.supply_type === "inter" ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"]);
    meta.push(["Tax payable on reverse charge", "No"]);
  }
  if (inv.sac_code) meta.push(["SAC", inv.sac_code]);
  if (inv.billing_period_start && inv.billing_period_end) {
    meta.push(["Billing period", `${formatDate(inv.billing_period_start)} to ${formatDate(inv.billing_period_end)}`]);
  }
  if (inv.razorpay_payment_id) meta.push(["Payment reference", inv.razorpay_payment_id]);

  const taxablePaise = Math.round(inv.amount * 100);
  const credit = Math.max(inv.credit_rupees ?? 0, 0) * 100;
  const discount = Math.max(inv.discount_amount ?? 0, 0) * 100;
  const kindLabel = KIND_LABEL[inv.change_kind ?? "new"] ?? "";
  const lines: Array<[string, string]> = [
    [`Cosora ${planName} plan subscription${kindLabel ? ` (${kindLabel.toLowerCase()})` : ""}`, rupees(taxablePaise + credit + discount)],
  ];
  if (credit > 0) lines.push(["Less: credit for the unused part of the previous plan", rupees(-credit)]);
  if (discount > 0) lines.push([`Less: discount${inv.discount_code ? ` (code ${inv.discount_code})` : ""}`, rupees(-discount)]);

  const taxes: Array<[string, string]> = [];
  let total: number;
  if (inv.total_paise != null) {
    total = inv.total_paise;
    if ((inv.igst_paise ?? 0) > 0 || inv.supply_type === "inter") {
      taxes.push([`IGST @ ${pct(GST_RATE)}`, rupees(inv.igst_paise ?? 0)]);
    } else {
      taxes.push([`CGST @ ${pct(GST_RATE / 2)}`, rupees(inv.cgst_paise ?? 0)]);
      taxes.push([`SGST @ ${pct(GST_RATE / 2)}`, rupees(inv.sgst_paise ?? 0)]);
    }
  } else {
    // Before 2026-10-08: one GST figure, no split.
    const gst = (inv.gst_amount ?? 0) * 100;
    total = taxablePaise + gst;
    taxes.push([`GST @ ${pct(GST_RATE)}`, rupees(gst)]);
  }

  const footer: string[] = [];
  if (inv.document_type === "tax_invoice") {
    footer.push("This is a computer-generated invoice.");
    if (s?.legal_name) footer.push(`For ${s.legal_name}: authorised signatory`);
  } else if (kind.notice) {
    footer.push(kind.notice);
  }

  return {
    title: kind.title,
    notice: kind.notice,
    number,
    issuedOn: formatDate(inv.created_at),
    supplier,
    recipient,
    meta,
    lines,
    taxable: rupees(taxablePaise),
    taxes,
    total: rupees(total),
    totalInWords: amountInWords(total),
    footer,
    fileName: `${number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`,
  };
}

/** The standard PDF fonts encode WinAnsi only: anything else is replaced, never dropped silently. */
export function winAnsi(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/₹/g, "Rs.")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E -ÿ·]/g, "?");
}
