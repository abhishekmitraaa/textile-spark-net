import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DiscountCodeField } from "@/components/vendor/DiscountCodeField";
import { quotePlanDiscount, type PlanQuote } from "@/lib/queries/discounts";
import type { BillingCycle } from "@/lib/queries/subscriptions";
import { formatINR, type Plan } from "@/lib/plan";
import { gstOn } from "@/lib/gst";

/**
 * The step between "Choose Gold" and paying (admin completion Phase 10): the
 * plan, a discount code, GST and the total, before anything is charged.
 *
 * Without a code the GST line comes from src/lib/gst.ts, the browser's copy of
 * the formula the payment function charges with (scripts/gst-check.mjs keeps
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
  onConfirm: (plan: Plan, discountCode?: string) => Promise<string | null>;
}) {
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // A quote is for one plan and one billing cycle.
  useEffect(() => {
    setQuote(null);
    setRefusal(null);
  }, [plan?.id, billingCycle]);

  if (!plan) return null;

  const list = billingCycle === "yearly" ? plan.yearly_price : plan.monthly_price;
  const plain = gstOn(list);
  const lines = quote
    ? { discount: quote.discount, base: quote.base, gst: quote.gst, total: quote.total }
    : { discount: 0, base: list, gst: plain.gst, total: plain.total };

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
      const message = await onConfirm(plan, quote?.code);
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
          <DialogDescription>
            {billingCycle === "yearly"
              ? "Billed yearly. Plan prices are before 18% GST."
              : "Billed monthly. Plan prices are before 18% GST."}
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {billingCycle === "yearly" ? `${plan.name} plan, 1 year` : `${plan.name} plan, 1 month`}
            </dt>
            <dd className="tabular-nums text-foreground">{formatINR(list)}</dd>
          </div>
          {lines.discount > 0 && (
            <>
              <div className="flex justify-between gap-4">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <span>Discount</span>
                  <span className="font-mono text-xs" data-no-translate>{quote?.code}</span>
                </dt>
                <dd className="tabular-nums text-brand-success">−{formatINR(lines.discount)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Price after discount</dt>
                <dd className="tabular-nums text-foreground">{formatINR(lines.base)}</dd>
              </div>
            </>
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

        <DiscountCodeField
          applied={quote ? { code: quote.code, discount: quote.discount } : null}
          onApply={apply}
          onRemove={() => setQuote(null)}
          disabled={busy}
        />
        {refusal && <p role="alert" className="text-sm text-destructive">{refusal}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={pay} disabled={busy}>
            {busy
              ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Processing…</>
              : lines.total > 0 ? `Pay ${formatINR(lines.total)}` : "Activate for free"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
