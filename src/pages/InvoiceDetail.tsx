import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchInvoiceById, invoicePdfLink, type SubscriptionInvoice } from "@/lib/queries/subscriptions";
import { fetchBillTo, type BillTo } from "@/lib/queries/vendorStore";
import { InvoiceSheet } from "@/components/vendor/InvoiceSheet";

// ─────────────────────────────────────────────────────────────
// A subscription invoice (/subscription/invoice/:id).
//
// The document is InvoiceSheet, English only (Mitra, 2026-10-08): what was frozen on the
// invoice when it was issued, never today's profile. This page around it is translated as
// usual: the back link, Print, and "Download PDF", which fetches the stored PDF
// (invoice-render, subscriptions P1). Printing the page still works.
//
// Invoices from before 8 Oct 2026 froze nothing, so their "Billed to" is the vendor's
// current details, read through my_vendor_private() (the vendor's own row only).
// ─────────────────────────────────────────────────────────────

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

      <InvoiceSheet invoice={invoice} planName={planName} legacyBillTo={billTo} />
    </div>
  );
}
