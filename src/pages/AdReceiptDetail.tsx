import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAdReceipt, type AdReceipt } from "@/lib/queries/vendorPayments";
import { formatINR } from "@/lib/plan";

// ─────────────────────────────────────────────────────────────
// Printable receipt for an advertising purchase (/my-payments/receipt/:orderId).
//
// Same decision as InvoiceDetail: a well-formatted printable HTML view plus the
// browser's "Save as PDF" (window.print), rather than server-side PDF
// generation. Renders standalone (no DashboardLayout) so the print output is
// clean, and a print stylesheet hides the on-screen controls.
//
// WHY THIS IS A RECEIPT, NOT A TAX INVOICE. Subscriptions have a real invoice
// row — an invoice number, a GST amount, a billing period — written by
// subscription-verify-payment. Advertising has none of that: `ad_orders` stores
// the Razorpay order id, the spec and a single gross amount, and no GST is
// broken out anywhere in the ad purchase path. So this document says "Payment
// receipt" and shows no GST line. Printing a tax invoice with an invented
// invoice number, or a GST figure split out of a total that was never computed
// that way, would be a document a vendor might file with their accountant.
// Logged in ToDo.md as a real gap: ad purchases need GST treatment and an
// invoice series of their own.
// ─────────────────────────────────────────────────────────────

interface BillTo {
  brand_name: string | null; owner_name: string | null; owner_email: string | null;
  address_line: string | null; area: string | null; city: string | null; state: string | null;
  postal_code: string | null; gstin: string | null; pan: string | null;
}

/** Display names for the placement ids stored in the order spec. */
const PLACEMENT_LABELS: Record<string, string> = {
  openListing: "Open Listing", searchListing: "Search Listing",
  featuredProduct: "Featured Product", storePromotion: "Store Promotion",
  directBroadcast: "Direct Broadcast", wholesalerPick: "Wholesaler Pick",
  brandAd: "Brand Ad", websiteBanner: "Website Banner", mobileBanner: "Mobile Banner",
  webMobileCombo: "Web + Mobile Combo", fbInsta: "Facebook / Instagram",
  googleProduct: "Google Product", socialCombo: "Social Combo",
  trustedSeal: "TrustedSEAL", verifiedCertificate: "Verification Certificate",
};

export default function AdReceiptDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const [receipt, setReceipt] = useState<AdReceipt | null>(null);
  const [billTo, setBillTo] = useState<BillTo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!orderId) return;
      // RLS on ad_orders admits only the row's own vendor, so a mistyped or
      // someone else's order id simply comes back empty — the "not found"
      // branch below is the same answer either way, which is the right one.
      const r = await fetchAdReceipt(orderId);
      if (!active) return;
      setReceipt(r);
      if (r && user?.id) {
        const { data: vp } = await supabase.from("vendor_profiles")
          .select("brand_name, owner_name, owner_email, address_line, area, city, state, postal_code, gstin, pan")
          .eq("id", user.id).maybeSingle();
        if (!active) return;
        setBillTo((vp as BillTo) ?? null);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [orderId, user?.id]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-muted/30"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  }
  if (!receipt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 p-6 text-center">
        <p className="text-lg font-semibold text-foreground">Receipt not found</p>
        <Link to="/my-payments" className="text-sm font-medium text-accent hover:underline">← Back to My Payments</Link>
      </div>
    );
  }

  const addr = [billTo?.address_line, billTo?.area, billTo?.city, billTo?.state, billTo?.postal_code].filter(Boolean).join(", ");
  const fmtDate = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "—";
  const placements = receipt.placementIds.length;
  const products = Math.max(1, receipt.itemCount);

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 16mm; } }`}</style>

      <div className="no-print mx-auto mb-4 flex max-w-2xl items-center justify-between">
        <Link to="/my-payments" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to My Payments
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-gold hover:bg-accent/90">
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-border pb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cosora</h1>
            <p className="text-sm text-muted-foreground">B2B Sourcing Marketplace</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-foreground">PAYMENT RECEIPT</p>
            <p className="font-mono text-xs text-muted-foreground">{receipt.orderId}</p>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
              receipt.status === "paid" ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600"}`}>
              {receipt.status.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>
        </div>

        <div className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billed to</p>
            <p className="text-sm font-semibold text-foreground">{billTo?.brand_name ?? billTo?.owner_name ?? "Vendor"}</p>
            {addr && <p className="text-sm text-muted-foreground">{addr}</p>}
            {billTo?.owner_email && <p className="text-sm text-muted-foreground">{billTo.owner_email}</p>}
            {billTo?.gstin && <p className="mt-1 text-sm text-muted-foreground">GSTIN: {billTo.gstin}</p>}
            {billTo?.pan && <p className="text-sm text-muted-foreground">PAN: {billTo.pan}</p>}
          </div>
          <div className="sm:text-right">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
            <p className="text-sm text-muted-foreground">Ordered: <span className="text-foreground">{fmtDate(receipt.createdAt)}</span></p>
            <p className="text-sm text-muted-foreground">Paid: <span className="text-foreground">{fmtDate(receipt.paidAt)}</span></p>
            <p className="text-sm text-muted-foreground">Campaign length: <span className="text-foreground">{receipt.days} day{receipt.days === 1 ? "" : "s"}</span></p>
            {receipt.campaignLabel && (
              <p className="text-sm text-muted-foreground">Campaign: <span className="text-foreground">{receipt.campaignLabel}</span></p>
            )}
          </div>
        </div>

        <table className="w-full border-t border-border">
          <thead>
            <tr className="border-b border-border">
              <th className="py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Placement purchased</th>
              <th className="py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Products</th>
              <th className="py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Days</th>
            </tr>
          </thead>
          <tbody>
            {/* Per-placement amounts are deliberately absent. ad_orders stores a
                single gross total, not a per-line breakdown, and re-deriving one
                here from a price table that may have changed since the purchase
                would put numbers on a financial document that do not come from
                the payment record. The placements, counts and total are all
                read straight off the order. */}
            {receipt.placementIds.map((id) => (
              <tr key={id} className="border-b border-border">
                <td className="py-3 text-sm text-foreground">{PLACEMENT_LABELS[id] ?? id}</td>
                <td className="py-3 text-right text-sm text-muted-foreground">{products}</td>
                <td className="py-3 text-right text-sm text-muted-foreground">{receipt.days}</td>
              </tr>
            ))}
            {placements === 0 && (
              <tr className="border-b border-border">
                <td colSpan={3} className="py-3 text-sm text-muted-foreground">
                  This order recorded no placement details.
                </td>
              </tr>
            )}
            <tr>
              <td className="py-4 text-base font-bold text-foreground" colSpan={2}>Total paid</td>
              <td className="py-4 text-right text-base font-bold text-foreground">{formatINR(receipt.amountRupees)}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          This is a computer-generated payment receipt, not a tax invoice — GST is not broken out on
          advertising purchases. Contact Cosora if you need a GST invoice for this payment.
        </p>
      </div>
    </div>
  );
}
