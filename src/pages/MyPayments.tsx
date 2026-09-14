import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Award, Download, Loader2, Megaphone, Crown, Truck, Check, AlertTriangle, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { formatINR } from "@/lib/plan";
import {
  CERTIFICATE_STEPS, certificateStepIndex, useVendorCertificates, useVendorPayments,
  type VendorCertificate, type VendorPayment,
} from "@/lib/queries/vendorPayments";

// ─────────────────────────────────────────────────────────────
// /my-payments — every payment the vendor has made to Cosora, the printable
// bill for each, and the delivery state of any physical certificate they
// ordered. Sidebar: Seller Menu → My Payments.
//
// Nothing on this page is invented. Both lists render empty when the vendor has
// paid nothing, which for most accounts today is the true answer — ad_orders
// and subscription_payment_orders are both empty in production, because demo
// mode is the live purchase path.
// ─────────────────────────────────────────────────────────────

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const section = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.32 } } };

type Tab = "payments" | "certificates";

/**
 * Status wording the vendor actually needs. `refund_review` is the one that
 * matters most and the one a raw status string explains least: it means Cosora
 * took the money and then refused to publish the campaign, so it is phrased as
 * an action Cosora owes them rather than a state of a row.
 */
const PAYMENT_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  paid: { label: "Paid", tone: "ok" },
  refunded: { label: "Refunded", tone: "warn" },
  refund_review: { label: "Refund being processed", tone: "warn" },
  pending: { label: "Pending", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
};

function StatusPill({ status }: { status: string }) {
  const s = PAYMENT_STATUS[status] ?? { label: status, tone: "warn" as const };
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-semibold",
        s.tone === "ok" && "border-green-500/30 bg-green-500/10 text-green-700",
        s.tone === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-700",
        s.tone === "bad" && "border-red-500/30 bg-red-500/10 text-red-700",
      )}
    >
      {s.label}
    </Badge>
  );
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function MyPayments() {
  const { user } = useAuth();
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<Tab>("payments");

  const { data: payments = [], isLoading: payLoading, error: payError } = useVendorPayments(user?.id);
  const { data: certificates = [], isLoading: certLoading } = useVendorCertificates(user?.id);

  // Only money that actually left the vendor's account. A refund_review row was
  // charged, so it counts; a failed one never was.
  const totalPaid = useMemo(
    () => payments
      .filter((p) => p.status === "paid" || p.status === "refund_review")
      .reduce((sum, p) => sum + p.amountRupees, 0),
    [payments],
  );
  const openCertificates = certificates.filter(
    (c) => c.status !== "delivered" && c.status !== "cancelled",
  ).length;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground lg:text-3xl">My Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you've paid Cosora, your bills, and the delivery status of any
            certificate you've ordered.
          </p>
        </div>

        {/* Summary */}
        <motion.div variants={section} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-3">
          <SummaryTile
            icon={<Crown className="h-4 w-4" />}
            label="Total paid"
            value={payLoading ? "…" : formatINR(totalPaid)}
            hint={`${payments.length} ${payments.length === 1 ? "transaction" : "transactions"}`}
          />
          <SummaryTile
            icon={<Megaphone className="h-4 w-4" />}
            label="Advertising"
            value={payLoading ? "…" : formatINR(
              payments.filter((p) => p.kind === "ad" && (p.status === "paid" || p.status === "refund_review"))
                .reduce((s, p) => s + p.amountRupees, 0),
            )}
            hint="Campaign purchases"
          />
          <SummaryTile
            icon={<Award className="h-4 w-4" />}
            label="Certificates"
            value={certLoading ? "…" : String(certificates.length)}
            hint={openCertificates > 0 ? `${openCertificates} in progress` : "None in progress"}
          />
        </motion.div>

        {/* Tabs */}
        <div role="tablist" aria-label="My payments" className="flex gap-6 border-b border-border">
          {([["payments", `Payments & bills${payments.length ? ` (${payments.length})` : ""}`],
             ["certificates", `Certificate orders${certificates.length ? ` (${certificates.length})` : ""}`]] as const)
            .map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "relative pb-2.5 text-sm font-bold transition-colors",
                  tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {tab === key && (
                  <motion.span layoutId="mp-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />
                )}
              </button>
            ))}
        </div>

        {tab === "payments" ? (
          <PaymentsTable payments={payments} loading={payLoading} error={payError} reduced={reduced} />
        ) : (
          <CertificateList certificates={certificates} loading={certLoading} />
        )}
      </div>
    </DashboardLayout>
  );
}

function SummaryTile({ icon, label, value, hint }: {
  icon: React.ReactNode; label: string; value: string; hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        </div>
        <p className="mt-1.5 text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function PaymentsTable({ payments, loading, error, reduced }: {
  payments: VendorPayment[]; loading: boolean; error: unknown; reduced: boolean | null;
}) {
  if (error) {
    return (
      <Card><CardContent className="p-6">
        <p className="text-sm font-semibold text-foreground">Couldn't load your payments</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Please try again."}
        </p>
      </CardContent></Card>
    );
  }
  if (loading) {
    return (
      <Card><CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your payments…
      </CardContent></Card>
    );
  }
  if (payments.length === 0) {
    // Empty means empty. No sample rows: a fabricated transaction on a billing
    // screen is the worst possible place for one.
    return (
      <Card><CardContent className="p-10 text-center">
        <p className="text-sm font-semibold text-foreground">No payments yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Subscription and advertising payments appear here as soon as one goes through, each with a
          bill you can print or save as PDF.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/subscription">View plans</Link></Button>
          <Button asChild size="sm"><Link to="/advertisements">Advertise</Link></Button>
        </div>
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payments &amp; bills</CardTitle>
        <CardDescription>Newest first. Every bill opens as a printable page — use Print / Save as PDF.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem]">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">What for</th>
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reference</th>
                <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bill</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <motion.tr
                  key={`${p.kind}-${p.id}`}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="py-3.5 text-sm text-muted-foreground">{fmtDate(p.paidAt ?? p.createdAt)}</td>
                  <td className="py-3.5 pr-4 text-sm text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {p.kind === "ad"
                        ? <Megaphone className="h-3.5 w-3.5 shrink-0 text-accent" />
                        : <Crown className="h-3.5 w-3.5 shrink-0 text-accent" />}
                      {p.description}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4 font-mono text-xs text-muted-foreground">{p.reference}</td>
                  <td className="py-3.5 text-right text-sm font-semibold text-foreground">{formatINR(p.amountRupees)}</td>
                  <td className="py-3.5"><StatusPill status={p.status} /></td>
                  <td className="py-3.5 text-right">
                    {p.documentPath ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link to={p.documentPath}><Download className="mr-1 h-4 w-4" /> Bill</Link>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CertificateList({ certificates, loading }: {
  certificates: VendorCertificate[]; loading: boolean;
}) {
  if (loading) {
    return (
      <Card><CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your certificate orders…
      </CardContent></Card>
    );
  }
  if (certificates.length === 0) {
    return (
      <Card><CardContent className="p-10 text-center">
        <Award className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-semibold text-foreground">No certificate orders</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          The verification certificate is a printed certificate posted to your business address.
          Order one from the Advertise page and track its delivery here.
        </p>
        <Button asChild size="sm" className="mt-4"><Link to="/advertisements">Order a certificate</Link></Button>
      </CardContent></Card>
    );
  }
  return <div className="space-y-4">{certificates.map((c) => <CertificateCard key={c.id} cert={c} />)}</div>;
}

function CertificateCard({ cert: c }: { cert: VendorCertificate }) {
  const stepIndex = certificateStepIndex(c.status);
  const stopped = c.status === "returned" || c.status === "cancelled";
  const address = [c.addressLine, c.area, c.city, c.state, c.postalCode].filter(Boolean).join(", ");
  const stamp: Record<string, string | null> = {
    processing: c.purchasedAt, printed: c.printedAt, dispatched: c.dispatchedAt, delivered: c.deliveredAt,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="h-4 w-4 text-accent" /> Verification certificate
          </CardTitle>
          <span className="font-mono text-xs text-muted-foreground">{c.reference}</span>
        </div>
        <CardDescription>Ordered {fmtDate(c.purchasedAt)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stopped ? (
          <div className={cn(
            "flex gap-2.5 rounded-xl border p-3",
            c.status === "returned" ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/40",
          )}>
            <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", c.status === "returned" ? "text-red-600" : "text-muted-foreground")} />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {c.status === "returned" ? "Came back to us" : "Order cancelled"}
              </p>
              {c.returnReason && <p className="mt-0.5 text-xs text-muted-foreground">{c.returnReason}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                Contact support and we'll sort out the next step.
              </p>
            </div>
          </div>
        ) : (
          /* Forward pipeline. Each step shows the real timestamp it happened at,
             and nothing shows a predicted delivery date — Cosora has no courier
             tracking integration, so an estimate would be a guess the vendor
             would plan around. */
          <ol className="space-y-0">
            {CERTIFICATE_STEPS.map((s, i) => {
              const done = i <= stepIndex;
              const current = i === stepIndex;
              return (
                <li key={s.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                      done ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background text-muted-foreground",
                    )}>
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    {i < CERTIFICATE_STEPS.length - 1 && (
                      <span className={cn("h-8 w-0.5", i < stepIndex ? "bg-accent" : "bg-border")} />
                    )}
                  </div>
                  <div className="pb-2">
                    <p className={cn("text-sm font-semibold", done ? "text-foreground" : "text-muted-foreground")}>
                      {s.label}
                      {done && stamp[s.id] && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{fmtDate(stamp[s.id])}</span>
                      )}
                    </p>
                    {current && <p className="text-xs text-muted-foreground">{s.hint}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {c.courier && c.trackingNumber && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <Truck className="h-4 w-4 shrink-0 text-accent" />
            <span className="text-sm text-foreground">
              <span className="font-semibold">{c.courier}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="font-mono text-xs">{c.trackingNumber}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              Track this number on the courier's own site.
            </span>
          </div>
        )}

        {/* The address is the snapshot taken when the order was placed, so a
            vendor who has since updated their profile is not misled into
            thinking the parcel is going to the new one. */}
        <div className="flex gap-2 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {address || "No delivery address was on your profile when you ordered — please contact support."}
            <span className="mt-0.5 block text-[11px]">
              This is the address as it was when you ordered. Changing your profile now does not
              change a parcel already on its way.
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
