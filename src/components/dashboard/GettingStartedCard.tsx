import { Link } from "react-router-dom";
import { AlertCircle, Building2, ChevronRight, Clock, FileSignature, FileText, Package, PauseCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SellerHomeReview } from "@/lib/queries/sellerHome";

interface Row {
  key: string;
  label: string;
  href: string;
  Icon: LucideIcon;
  /** Something the seller has to do, rather than something Cosora is doing. */
  action: boolean;
}

/** What still stands between this seller and selling, in the order it matters. Empty when nothing does. */
export function gettingStartedRows(r: SellerHomeReview): Row[] {
  const rows: Row[] = [];
  const status = r.registrationStatus;
  if (status === "none") rows.push({ key: "finish", label: "Finish your seller registration", href: "/onboarding", Icon: AlertCircle, action: true });
  else if (status === "rejected") rows.push({ key: "rejected", label: "Your seller registration needs changes", href: "/onboarding", Icon: AlertCircle, action: true });
  else if (status === "pending") rows.push({ key: "pending", label: "Your registration is waiting for Cosora's approval", href: "/kyc", Icon: Clock, action: false });
  else if (status === "registered" && !r.contractSigned) rows.push({ key: "sign", label: "Sign the Supplier Agreement", href: "/kyc", Icon: FileSignature, action: true });
  if (r.documentsRejected > 0) rows.push({ key: "doc-rejected", label: "A document needs replacing", href: "/kyc", Icon: AlertCircle, action: true });
  if (r.documentsPending > 0) rows.push({ key: "docs", label: "Your documents are being checked (usually 3–5 days)", href: "/kyc", Icon: FileText, action: false });
  // Sent back or paused, said here with where to deal with it (review L-77: Seller Home showed neither).
  if (r.productsRejected === 1) rows.push({ key: "rejected-listings", label: "1 listing needs changes. See Cosora's reason", href: "/products?status=rejected", Icon: AlertCircle, action: true });
  else if (r.productsRejected > 1) rows.push({ key: "rejected-listings", label: `${r.productsRejected} listings need changes. See Cosora's reasons`, href: "/products?status=rejected", Icon: AlertCircle, action: true });
  // Removed by Cosora: said apart from "needs changes", because editing won't bring it back (code review).
  if (r.productsRemoved === 1) rows.push({ key: "removed-listings", label: "1 listing was removed by Cosora. See why", href: "/products?status=rejected", Icon: AlertCircle, action: false });
  else if (r.productsRemoved > 1) rows.push({ key: "removed-listings", label: `${r.productsRemoved} listings were removed by Cosora. See why`, href: "/products?status=rejected", Icon: AlertCircle, action: false });
  if (r.productsPaused === 1) rows.push({ key: "paused-listings", label: "1 listing is paused: it's over your plan's limit", href: "/products?status=paused", Icon: PauseCircle, action: true });
  else if (r.productsPaused > 1) rows.push({ key: "paused-listings", label: `${r.productsPaused} listings are paused: they're over your plan's limit`, href: "/products?status=paused", Icon: PauseCircle, action: true });
  if (r.productsInReview === 1) rows.push({ key: "listings", label: "1 listing waiting for review (24–48 hours)", href: "/products", Icon: Package, action: false });
  else if (r.productsInReview > 1) rows.push({ key: "listings", label: `${r.productsInReview} listings waiting for review (24–48 hours)`, href: "/products", Icon: Package, action: false });
  if (r.premisesInReview > 0) rows.push({ key: "premises", label: "Premises photos waiting for review", href: "/business-profile?focus=office-pictures", Icon: Building2, action: false });
  return rows;
}

/**
 * The first thing a new seller sees on Seller Home (SH-001, SH-002): what they still have to do (sign the agreement,
 * replace a document, finish registering) and what Cosora is reviewing, each linked to where it's dealt with. The
 * unsigned-agreement prompt lives here and on the publishing pages, not on every seller page (Mitra, 2026-11-15).
 */
export function GettingStartedCard({ review }: { review: SellerHomeReview }) {
  const rows = gettingStartedRows(review);
  if (rows.length === 0) return null;
  return (
    <div data-testid="getting-started" className="rounded-2xl border border-brand-vendor/25 bg-brand-vendor/5 p-4 lg:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Getting started</p>
      <ul className="mt-2 divide-y divide-brand-vendor/10">
        {rows.map(({ key, label, href, Icon, action }) => (
          <li key={key}>
            <Link to={href} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
              <Icon className={`h-4 w-4 shrink-0 ${action ? "text-destructive" : "text-brand-vendor"}`} />
              <span className={`min-w-0 flex-1 ${action ? "font-semibold text-foreground" : "text-foreground"}`}>{label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
