import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DiscountCodeField } from "@/components/vendor/DiscountCodeField";
import { quotePlanDiscount, type PlanQuote } from "@/lib/queries/discounts";
import { usePlanChangePreview, type BillingCycle, type ChangeKind, type PlanChangePreview } from "@/lib/queries/subscriptions";
import { formatINR, type Plan } from "@/lib/plan";
import { gstOn } from "@/lib/gst";

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** One line under the title: what this purchase does and when it starts. */
function whatHappens(p: PlanChangePreview | undefined, billingCycle: BillingCycle): string {
  const start = p?.periodStart ? DAY.format(new Date(p.periodStart)) : "";
  if (p?.ok && p.kind === "upgrade") return "Starts now. What's left of your current plan comes off the price.";
  if (p?.ok && p.kind === "downgrade") return `Starts on ${start}, when your current plan ends. You pay for it now.`;
  if (p?.ok && p.kind === "renewal") {
    return billingCycle === "yearly" ? `Adds a year to your plan, from ${start}.` : `Adds a month to your plan, from ${start}.`;
  }
  return billingCycle === "yearly"
    ? "Billed yearly. Plan prices are before 18% GST."
    : "Billed monthly. Plan prices are before 18% GST.";
}

/**
 * The step between "Choose Gold" and paying (admin completion Phase 10): the plan, a
 * discount code, GST and the total, before anything is charged.
 *
 * Since 2026-10-02 the numbers start from the database's plan-change rule
 * (subscription_change_preview): an upgrade shows its credit for the unused part of
 * the current plan; a downgrade or renewal says when it starts. A code comes off what
 * is left, and GST is charged on the rest, exactly as subscription-create-order
 * charges it. Without a code the GST line comes from src/lib/gst.ts, the browser's
 * copy of the formula the payment function charges with (scripts/gst-check.mjs keeps
 * them equal). With one, every number is the server's quote.
 */
export function PlanCheckoutDialog({
  plan,
  billingCycle,
  onClose,
  onConfirm,
}: {
  /** The plan being bought; the dialog is open while this is set. */
  plan: Plan | null;
  billingCycle: BillingCycle;
  onClose: () => void;
  /** Runs the purchase. Resolves to why the code was refused, or null. */
  onConfirm: (plan: Plan, discountCode?: string, kind?: ChangeKind) => Promise<string | null>;
}) {
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const preview = usePlanChangePreview(plan?.id, billingCycle);

  // A quote is for one plan and one billing cycle.
  useEffect(() => {
    setQuote(null);
    setRefusal(null);
  }, [plan?.id, billingCycle]);

  if (!plan) return null;

  const list = billingCycle === "yearly" ? plan.yearly_price : plan.monthly_price;
  // Before the 2026-10-02 migration the preview doesn't exist: price as before.
  const p = preview.isError ? undefined : preview.data;
  const waiting = preview.isPending && !preview.isError;
  const scheduled = p && !p.ok && p.reason === "already_scheduled";
  const credit = p?.ok ? p.creditRupees : 0;
  const charge = p?.ok ? p.chargeRupees : list;
  const plain = gstOn(charge);
  const lines = quote
    ? { discount: quote.discount, base: quote.base, gst: quote.gst, total: quote.total }
    : { discount: 0, base: charge, gst: plain.gst, total: plain.total };

  const apply = async (code: string) => {
    setRefusal(null);
    const res = await quotePlanDiscount(plan.id, billingCycle, code);
    if (!res.quote) return res.message;
    setQuote(res.quote);
    return null;
  };

  const pay = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      const message = await onConfirm(plan, quote?.code, p?.ok ? p.kind : undefined);
      if (message) {
        // The code was refused at the last step (its last use went, or it changed).
        setQuote(null);
        setRefusal(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{`${plan.name} plan`}</DialogTitle>
          <DialogDescription>{whatHappens(p, billingCycle)}</DialogDescription>
        </DialogHeader>

        {waiting ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : scheduled ? (
          <p role="alert" className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
            You've already paid for your next plan period. You can change plans again once it starts.
          </p>
        ) : (
          <>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  {billingCycle === "yearly" ? `${plan.name} plan, 1 year` : `${plan.name} plan, 1 month`}
                </dt>
                <dd className="tabular-nums text-foreground">{formatINR(list)}</dd>
              </div>
              {credit > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Credit for the unused part of your current plan</dt>
                  <dd className="tabular-nums text-brand-success">−{formatINR(credit)}</dd>
                </div>
              )}
              {lines.discount > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <span>Discount</span>
                    <span className="font-mono text-xs" data-no-translate>{quote?.code}</span>
                  </dt>
                  <dd className="tabular-nums text-brand-success">−{formatINR(lines.discount)}</dd>
                </div>
              )}
              {(credit > 0 || lines.discount > 0) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{lines.discount > 0 ? "Price after discount" : "Price after credit"}</dt>
                  <dd className="tabular-nums text-foreground">{formatINR(lines.base)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">GST (18%)</dt>
                <dd className="tabular-nums text-foreground">{formatINR(lines.gst)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
                <dt className="text-foreground">Total</dt>
                <dd className="tabular-nums text-foreground">{formatINR(lines.total)}</dd>
              </div>
            </dl>

            {charge > 0 && (
              <DiscountCodeField
                applied={quote ? { code: quote.code, discount: quote.discount } : null}
                onApply={apply}
                onRemove={() => setQuote(null)}
                disabled={busy}
              />
            )}
          </>
        )}
        {refusal && <p role="alert" className="text-sm text-destructive">{refusal}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={pay} disabled={busy || waiting || Boolean(scheduled)}>
            {busy
              ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Processing…</>
              : lines.total > 0 ? `Pay ${formatINR(lines.total)}` : "Activate for free"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
