import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchInvoiceById, invoicePdfLink, type SubscriptionInvoice } from "@/lib/queries/subscriptions";
import { fetchBillTo, type BillTo } from "@/lib/queries/vendorStore";

// ─────────────────────────────────────────────────────────────
// A subscription invoice (/subscription/invoice/:id).
//
// Subscriptions P1 (2026-10-08): the page shows what was frozen on the invoice when it
// was issued (Cosora's billing details, the vendor's details, place of supply, the CGST +
// SGST or IGST split, SAC), never today's profile, so an issued invoice reads the same
// forever. The title says what the document is: a tax invoice, a payment receipt (paid
// before Cosora's GST details were set, which includes every invoice before 8 Oct 2026),
// or a test or demo document that took no money. "Download PDF" fetches the stored PDF
// (invoice-render); printing the page still works.
//
// Invoices from before 8 Oct 2026 froze nothing, so their "Billed to" is the vendor's
// current details, read through my_vendor_private() (the vendor's own row only).
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

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<SubscriptionInvoice | null>(null);
  const [billTo, setBillTo] = useState<BillTo | null>(null);
  const [planName, setPlanName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) return;
      const inv = await fetchInvoiceById(id).catch(() => null);
      if (!active) return;
      setInvoice(inv);
      if (inv) {
        const [vp, { data: plan }] = await Promise.all([
          inv.recipient ? Promise.resolve(null) : fetchBillTo(inv.vendorId).catch(() => null),
          inv.planId
            ? supabase.from("subscription_plans").select("name").eq("id", inv.planId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (!active) return;
        setBillTo(vp);
        setPlanName((plan as { name?: string } | null)?.name ?? inv.planId ?? "Subscription");
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [id]);

  const download = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      const { url, fileName } = await invoicePdfLink(invoice.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-muted/30"><Loader2 className="h-6 w-6 animate-spin text-[#256fef]" /></div>;
  }
  if (!invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 p-6 text-center">
        <p className="text-lg font-semibold text-foreground">Invoice not found</p>
        <Link to="/subscription" className="text-sm font-medium text-[#256fef] hover:underline">← Back to Subscription</Link>
      </div>
    );
  }

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
  const legacyAddr = [billTo?.address_line, billTo?.area, billTo?.city, billTo?.state, billTo?.postal_code].filter(Boolean).join(", ");
  const posLabel = invoice.placeOfSupply
    ? r?.state_code === invoice.placeOfSupply && r?.state ? `${r.state}${r.gst_state_code ? ` (${r.gst_state_code})` : ""}` : invoice.placeOfSupply
    : null;

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 16mm; } }`}</style>

      {/* Controls (hidden on print) */}
      <div className="no-print mx-auto mb-4 flex max-w-2xl flex-wrap items-center justify-between gap-3">
        <Link to="/subscription" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Subscription
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-[#d0d4dc] bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={download}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#256fef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d5ed6] disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
          </button>
        </div>
      </div>

      {/* Invoice sheet */}
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="border-l-4 border-[#256fef] pl-3 text-xl font-bold text-foreground" data-testid="invoice-title">{TITLES[doc]}</p>
            {notice && <p className="mt-2 text-sm font-semibold text-amber-700" data-testid="invoice-notice">{notice}</p>}
          </div>
          <div className="text-right">
            <p className="font-mono text-base font-bold text-foreground" data-no-translate>{invoice.invoiceNumber ?? `#${invoice.id.slice(0, 8)}`}</p>
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
              <div data-no-translate>
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
              <div data-no-translate data-testid="invoice-recipient">
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                {r.address && <p className="text-sm text-muted-foreground">{r.address}</p>}
                <p className="text-sm text-muted-foreground">{[r.city, r.state, r.postal_code].filter(Boolean).join(", ")}</p>
                {r.gst_state_code && <p className="text-sm text-muted-foreground">State code: {r.gst_state_code}</p>}
                <p className="mt-1 text-sm text-muted-foreground">GSTIN: {r.gstin ?? "not registered"}</p>
              </div>
            ) : (
              <div data-no-translate>
                <p className="text-sm font-semibold text-foreground">{billTo?.brand_name ?? billTo?.owner_name ?? "Vendor"}</p>
                {legacyAddr && <p className="text-sm text-muted-foreground">{legacyAddr}</p>}
                {(invoice.gstNumber || billTo?.gstin) && <p className="mt-1 text-sm text-muted-foreground">GSTIN: {invoice.gstNumber ?? billTo?.gstin}</p>}
              </div>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-4 gap-y-1.5 border-t border-border py-4 text-sm">
          {posLabel && (<><dt className="text-muted-foreground">Place of supply</dt><dd className="text-foreground" data-no-translate>{posLabel}</dd></>)}
          {doc === "tax_invoice" && (
            <>
              <dt className="text-muted-foreground">Supply</dt>
              <dd className="text-foreground">{invoice.supplyType === "inter" ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}</dd>
              <dt className="text-muted-foreground">Tax payable on reverse charge</dt>
              <dd className="text-foreground">No</dd>
            </>
          )}
          {invoice.sacCode && (<><dt className="text-muted-foreground">SAC</dt><dd className="font-mono text-foreground" data-no-translate>{invoice.sacCode}</dd></>)}
          <dt className="text-muted-foreground">Billing period</dt>
          <dd className="text-foreground">{fmtDate(invoice.billingPeriodStart)} – {fmtDate(invoice.billingPeriodEnd)}</dd>
          {invoice.razorpayPaymentId && (<><dt className="text-muted-foreground">Payment reference</dt><dd className="break-all font-mono text-foreground" data-no-translate>{invoice.razorpayPaymentId}</dd></>)}
        </dl>

        {/* Line items */}
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
                  {invoice.discountCode && <span className="ml-1.5 font-mono text-xs" data-no-translate>{invoice.discountCode}</span>}
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
    </div>
  );
}
