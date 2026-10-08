import type { SubscriptionInvoice } from "@/lib/queries/subscriptions";
import type { BillTo } from "@/lib/queries/vendorStore";

// ─────────────────────────────────────────────────────────────
// The invoice document itself (subscriptions P1, 2026-10-08), as /subscription/invoice/:id
// shows and prints it. ENGLISH ONLY (Mitra, 2026-10-08): it is marked data-no-translate,
// so the language switch leaves it alone, and scripts/i18n-coverage-check.mjs skips this
// file. The PDF (invoice-render) is English too. The page around it (back link, buttons,
// messages) is translated as usual.
//
// It shows what was frozen on the invoice when it was issued (Cosora's billing details,
// the vendor's details, place of supply, the CGST + SGST or IGST split, SAC), never
// today's profile. The title says what the document is: a tax invoice, a payment receipt
// (paid before Cosora's GST details were set), or a test or demo document that took no
// money. Invoices from before 8 Oct 2026 froze nothing, so their "Billed to" is the
// vendor's current details (`legacyBillTo`).
// ─────────────────────────────────────────────────────────────

const TITLES = {
  tax_invoice: "TAX INVOICE",
  receipt: "PAYMENT RECEIPT",
  test: "TEST DOCUMENT",
  demo: "DEMO DOCUMENT",
} as const;

const NOTICES = {
  tax_invoice: null,
  receipt: "Payment receipt. This is not a GST tax invoice.",
  test: "Issued in Razorpay test mode: no money was taken. Not a tax invoice.",
  demo: "Demo checkout: no payment was taken. Not a tax invoice.",
} as const;

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";
// Invoice amounts to the paisa: half of an odd GST rupee is 50 paise.
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (rupees: number) => INR.format(rupees);
const paise = (p: number) => INR.format(p / 100);

export function InvoiceSheet({ invoice, planName, legacyBillTo }: {
  invoice: SubscriptionInvoice;
  planName: string;
  legacyBillTo: BillTo | null;
}) {
  const doc = invoice.documentType ?? "receipt";
  const notice = NOTICES[doc];
  // `amount` is the taxable value, after any discount code and an upgrade's credit for the
  // unused part of the previous plan; the plan's price is that plus both.
  const discount = invoice.discountAmount ?? 0;
  const credit = invoice.creditAmount ?? 0;
  const listPrice = invoice.amount + discount + credit;
  const split = invoice.totalPaise != null;
  const total = split ? invoice.totalPaise! / 100 : invoice.amount + (invoice.gstAmount ?? 0) - (invoice.tdsAmount ?? 0);
  const s = invoice.supplier;
  const r = invoice.recipient;
  const b = legacyBillTo;
  const legacyAddr = [b?.address_line, b?.area, b?.city, b?.state, b?.postal_code].filter(Boolean).join(", ");
  const posLabel = invoice.placeOfSupply
    ? r?.state_code === invoice.placeOfSupply && r?.state ? `${r.state}${r.gst_state_code ? ` (${r.gst_state_code})` : ""}` : invoice.placeOfSupply
    : null;

  return (
    <div
      lang="en"
      data-no-translate
      className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 print:border-0 print:shadow-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#256fef]">Cosora</p>
          <p className="mt-0.5 text-xl font-bold text-foreground" data-testid="invoice-title">{TITLES[doc]}</p>
          {notice && <p className="mt-2 text-sm font-semibold text-amber-700" data-testid="invoice-notice">{notice}</p>}
        </div>
        <div className="text-right">
          <p className="font-mono text-base font-bold text-foreground">{invoice.invoiceNumber ?? `#${invoice.id.slice(0, 8)}`}</p>
          <p className="text-sm text-muted-foreground">Issued: <span className="text-foreground">{fmtDate(invoice.createdAt)}</span></p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${invoice.status === "paid" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"}`}>
            {invoice.status === "paid" ? "Paid" : invoice.status === "refunded" ? "Refunded" : invoice.status === "failed" ? "Failed" : "Pending"}
          </span>
        </div>
      </div>

      <div className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">From</p>
          {s ? (
            <div>
              <p className="text-sm font-semibold text-foreground">{s.legal_name}</p>
              {s.trade_name && s.trade_name !== s.legal_name && <p className="text-sm text-muted-foreground">({s.trade_name})</p>}
              {s.address && <p className="text-sm text-muted-foreground">{s.address}</p>}
              <p className="text-sm text-muted-foreground">{[s.city, s.state_name, s.postal_code].filter(Boolean).join(", ")}</p>
              {s.gstin && <p className="mt-1 text-sm text-muted-foreground">GSTIN: {s.gstin}</p>}
              {s.pan && <p className="text-sm text-muted-foreground">PAN: {s.pan}</p>}
            </div>
          ) : (
            <p className="text-sm font-semibold text-foreground">Cosora</p>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billed to</p>
          {r ? (
            <div data-testid="invoice-recipient">
              <p className="text-sm font-semibold text-foreground">{r.name}</p>
              {r.address && <p className="text-sm text-muted-foreground">{r.address}</p>}
              <p className="text-sm text-muted-foreground">{[r.city, r.state, r.postal_code].filter(Boolean).join(", ")}</p>
              {r.gst_state_code && <p className="text-sm text-muted-foreground">State code: {r.gst_state_code}</p>}
              <p className="mt-1 text-sm text-muted-foreground">GSTIN: {r.gstin ?? "not registered"}</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-foreground">{b?.brand_name ?? b?.owner_name ?? "Vendor"}</p>
              {legacyAddr && <p className="text-sm text-muted-foreground">{legacyAddr}</p>}
              {(invoice.gstNumber || b?.gstin) && <p className="mt-1 text-sm text-muted-foreground">GSTIN: {invoice.gstNumber ?? b?.gstin}</p>}
            </div>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-4 gap-y-1.5 border-t border-border py-4 text-sm">
        {posLabel && (<><dt className="text-muted-foreground">Place of supply</dt><dd className="text-foreground">{posLabel}</dd></>)}
        {doc === "tax_invoice" && (
          <>
            <dt className="text-muted-foreground">Supply</dt>
            <dd className="text-foreground">{invoice.supplyType === "inter" ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}</dd>
            <dt className="text-muted-foreground">Tax payable on reverse charge</dt>
            <dd className="text-foreground">No</dd>
          </>
        )}
        {invoice.sacCode && (<><dt className="text-muted-foreground">SAC</dt><dd className="font-mono text-foreground">{invoice.sacCode}</dd></>)}
        <dt className="text-muted-foreground">Billing period</dt>
        <dd className="text-foreground">{fmtDate(invoice.billingPeriodStart)} – {fmtDate(invoice.billingPeriodEnd)}</dd>
        {invoice.razorpayPaymentId && (<><dt className="text-muted-foreground">Payment reference</dt><dd className="break-all font-mono text-foreground">{invoice.razorpayPaymentId}</dd></>)}
      </dl>

      <table className="w-full border-t border-border">
        <thead>
          <tr className="border-b border-border">
            <th className="py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
            <th className="py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td className="py-3 text-sm text-foreground">
              {invoice.changeKind === "upgrade" ? `${planName} plan subscription (upgrade)`
                : invoice.changeKind === "renewal" ? `${planName} plan subscription (renewal)`
                : `${planName} plan subscription`}
            </td>
            <td className="py-3 text-right text-sm text-foreground">{money(listPrice)}</td>
          </tr>
          {credit > 0 && (
            <tr className="border-b border-border">
              <td className="py-3 text-sm text-muted-foreground">Credit for the unused part of your previous plan</td>
              <td className="py-3 text-right text-sm text-muted-foreground">−{money(credit)}</td>
            </tr>
          )}
          {discount > 0 && (
            <tr className="border-b border-border">
              <td className="py-3 text-sm text-muted-foreground">
                <span>Discount</span>
                {invoice.discountCode && <span className="ml-1.5 font-mono text-xs">{invoice.discountCode}</span>}
              </td>
              <td className="py-3 text-right text-sm text-muted-foreground">−{money(discount)}</td>
            </tr>
          )}
          <tr className="border-b border-border">
            <td className="py-3 text-sm text-foreground">Taxable value</td>
            <td className="py-3 text-right text-sm text-foreground">{money(invoice.amount)}</td>
          </tr>
          {split ? (
            invoice.supplyType === "inter" || (invoice.igstPaise ?? 0) > 0 ? (
              <tr className="border-b border-border" data-testid="invoice-igst">
                <td className="py-3 text-sm text-muted-foreground">IGST (18%)</td>
                <td className="py-3 text-right text-sm text-muted-foreground">{paise(invoice.igstPaise ?? 0)}</td>
              </tr>
            ) : (
              <>
                <tr className="border-b border-border" data-testid="invoice-cgst">
                  <td className="py-3 text-sm text-muted-foreground">CGST (9%)</td>
                  <td className="py-3 text-right text-sm text-muted-foreground">{paise(invoice.cgstPaise ?? 0)}</td>
                </tr>
                <tr className="border-b border-border" data-testid="invoice-sgst">
                  <td className="py-3 text-sm text-muted-foreground">SGST (9%)</td>
                  <td className="py-3 text-right text-sm text-muted-foreground">{paise(invoice.sgstPaise ?? 0)}</td>
                </tr>
              </>
            )
          ) : (
            <>
              <tr className="border-b border-border">
                <td className="py-3 text-sm text-muted-foreground">GST (18%)</td>
                <td className="py-3 text-right text-sm text-muted-foreground">{money(invoice.gstAmount ?? 0)}</td>
              </tr>
              {invoice.tdsAmount != null && invoice.tdsAmount > 0 && (
                <tr className="border-b border-border">
                  <td className="py-3 text-sm text-muted-foreground">TDS</td>
                  <td className="py-3 text-right text-sm text-muted-foreground">−{money(invoice.tdsAmount)}</td>
                </tr>
              )}
            </>
          )}
          <tr>
            <td className="py-4 text-base font-bold text-foreground">Total</td>
            <td className="py-4 text-right text-base font-bold text-foreground" data-testid="invoice-total">{money(total)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
        {doc === "tax_invoice" ? (
          <>
            <span className="block">This is a computer-generated invoice.</span>
            {s?.legal_name && <span className="block">{`For ${s.legal_name}: authorised signatory.`}</span>}
          </>
        ) : notice}
      </p>
    </div>
  );
}
