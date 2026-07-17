import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchInvoiceById, type SubscriptionInvoice } from "@/lib/queries/subscriptions";
import { formatINR } from "@/lib/plan";

// ─────────────────────────────────────────────────────────────
// Printable subscription invoice (/subscription/invoice/:id).
//
// Decision: a well-formatted printable HTML view + the browser's "Save as PDF"
// (window.print), rather than server-side PDF generation. Renders standalone
// (no DashboardLayout) so the print output is clean; a print stylesheet hides
// the on-screen controls. subscription_invoices.pdf_url stays null for now.
// ─────────────────────────────────────────────────────────────

interface BillTo {
  brand_name: string | null; owner_name: string | null; owner_email: string | null;
  address_line: string | null; area: string | null; city: string | null; state: string | null;
  postal_code: string | null; gstin: string | null; pan: string | null;
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<SubscriptionInvoice | null>(null);
  const [billTo, setBillTo] = useState<BillTo | null>(null);
  const [planName, setPlanName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) return;
      const inv = await fetchInvoiceById(id);
      if (!active) return;
      setInvoice(inv);
      if (inv) {
        const [{ data: vp }, { data: plan }] = await Promise.all([
          supabase.from("vendor_profiles")
            .select("brand_name, owner_name, owner_email, address_line, area, city, state, postal_code, gstin, pan")
            .eq("id", inv.vendorId).maybeSingle(),
          inv.planId
            ? supabase.from("subscription_plans").select("name").eq("id", inv.planId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (!active) return;
        setBillTo((vp as BillTo) ?? null);
        setPlanName((plan as { name?: string } | null)?.name ?? inv.planId ?? "Subscription");
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-muted/30"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  }
  if (!invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 p-6 text-center">
        <p className="text-lg font-semibold text-foreground">Invoice not found</p>
        <Link to="/subscription" className="text-sm font-medium text-accent hover:underline">← Back to Subscription</Link>
      </div>
    );
  }

  const gst = invoice.gstAmount ?? 0;
  const total = invoice.amount + gst;
  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const addr = [billTo?.address_line, billTo?.area, billTo?.city, billTo?.state, billTo?.postal_code].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 16mm; } }`}</style>

      {/* Controls (hidden on print) */}
      <div className="no-print mx-auto mb-4 flex max-w-2xl items-center justify-between">
        <Link to="/subscription" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Subscription
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-gold hover:bg-accent/90">
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      {/* Invoice sheet */}
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-border pb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Cosora</h1>
            <p className="text-sm text-muted-foreground">B2B Sourcing Marketplace</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-foreground">TAX INVOICE</p>
            <p className="text-sm text-muted-foreground">{invoice.invoiceNumber ?? `#${invoice.id.slice(0, 8)}`}</p>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${invoice.status === "paid" ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600"}`}>
              {invoice.status.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billed to</p>
            <p className="text-sm font-semibold text-foreground">{billTo?.brand_name ?? billTo?.owner_name ?? "Vendor"}</p>
            {addr && <p className="text-sm text-muted-foreground">{addr}</p>}
            {billTo?.owner_email && <p className="text-sm text-muted-foreground">{billTo.owner_email}</p>}
            {(invoice.gstNumber || billTo?.gstin) && <p className="mt-1 text-sm text-muted-foreground">GSTIN: {invoice.gstNumber ?? billTo?.gstin}</p>}
            {billTo?.pan && <p className="text-sm text-muted-foreground">PAN: {billTo.pan}</p>}
          </div>
          <div className="sm:text-right">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
            <p className="text-sm text-muted-foreground">Issued: <span className="text-foreground">{fmtDate(invoice.createdAt)}</span></p>
            <p className="text-sm text-muted-foreground">Period: <span className="text-foreground">{fmtDate(invoice.billingPeriodStart)} – {fmtDate(invoice.billingPeriodEnd)}</span></p>
            {invoice.razorpayPaymentId && <p className="text-sm text-muted-foreground">Payment: {invoice.razorpayPaymentId}</p>}
          </div>
        </div>

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
              <td className="py-3 text-sm text-foreground">{planName} plan subscription</td>
              <td className="py-3 text-right text-sm text-foreground">{formatINR(invoice.amount)}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-3 text-sm text-muted-foreground">GST (18%)</td>
              <td className="py-3 text-right text-sm text-muted-foreground">{formatINR(gst)}</td>
            </tr>
            {invoice.tdsAmount != null && invoice.tdsAmount > 0 && (
              <tr className="border-b border-border">
                <td className="py-3 text-sm text-muted-foreground">TDS</td>
                <td className="py-3 text-right text-sm text-muted-foreground">−{formatINR(invoice.tdsAmount)}</td>
              </tr>
            )}
            <tr>
              <td className="py-4 text-base font-bold text-foreground">Total</td>
              <td className="py-4 text-right text-base font-bold text-foreground">{formatINR(total - (invoice.tdsAmount ?? 0))}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          This is a computer-generated invoice. Thank you for growing with Cosora.
        </p>
      </div>
    </div>
  );
}
