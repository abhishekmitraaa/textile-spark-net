import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Autopay } from "@/lib/queries/subscriptions";

// ─────────────────────────────────────────────────────────────
// Autopay on /subscription (subscriptions P3, 2026-10-08).
//
// Says what will happen to the plan without the vendor doing anything: it renews by
// itself (on), a renewal payment failed and is being retried (pending), autopay stopped
// after failed payments (halted), or the plan simply ends (off). Turning it on for a plan
// already paid for sets up a Razorpay mandate that starts when the period ends; "Change
// payment method" does the same and replaces the old mandate. Turning it off asks first:
// the plan then ends with the period.
//
// Shown only where autopay is offered to the account (the subscription_autopay switch), or
// where one exists.
// ─────────────────────────────────────────────────────────────

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

const METHOD: Record<string, string> = { card: "card", upi: "UPI", emandate: "bank mandate", nach: "bank mandate", netbanking: "net banking" };

export function AutopayCard({ autopay, hasPaidPlan, periodEnd, busy, onTurnOn, onTurnOff }: {
  autopay: Autopay | undefined;
  /** A paid plan is running, so autopay can be turned on for it. */
  hasPaidPlan: boolean;
  periodEnd: string | null;
  busy: boolean;
  onTurnOn: () => void;
  onTurnOff: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!autopay || (!autopay.available && !autopay.status)) return null;

  const ends = periodEnd ? DAY.format(new Date(periodEnd)) : null;
  const next = autopay.nextChargeAt ? DAY.format(new Date(autopay.nextChargeAt)) : ends;
  const amount = autopay.amountPaise != null ? INR.format(autopay.amountPaise / 100) : null;
  const method = autopay.method ? METHOD[autopay.method] ?? autopay.method : null;
  const state = autopay.status === "pending" ? "pending" : autopay.status === "halted" ? "halted" : autopay.on ? "on" : "off";

  return (
    <section
      data-testid="autopay-card"
      data-state={state}
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-label="Autopay"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-[#256fef]" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {state === "on" ? "Autopay is on" : state === "pending" ? "Autopay payment failed" : state === "halted" ? "Autopay has stopped" : "Autopay is off"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground" data-testid="autopay-detail">
              {state === "on" && (
                amount && next
                  ? (method
                    ? `Your ${autopay.planName ?? "plan"} plan renews at ${amount} on ${next}, by ${method}.`
                    : `Your ${autopay.planName ?? "plan"} plan renews at ${amount} on ${next}.`)
                  : "Your plan renews automatically."
              )}
              {state === "pending" && "Your last renewal payment didn't go through. It will be tried again: check your payment method, and approve the request if your bank or UPI app asks."}
              {state === "halted" && (ends
                ? `Several renewal payments failed, so nothing more will be charged. Your plan runs until ${ends}: renew it, or turn autopay back on.`
                : "Several renewal payments failed, so nothing more will be charged. Renew your plan, or turn autopay back on.")}
              {state === "off" && (hasPaidPlan
                ? (ends ? `Your plan ends on ${ends} unless you renew it. Turn autopay on to renew it automatically.` : "Turn autopay on to renew your plan automatically.")
                : "Choose a plan below and keep \"Renew automatically\" ticked to set up autopay.")}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {(state === "on" || state === "pending") && !confirming && (
            <>
              <Button variant="outline" size="sm" disabled={busy} onClick={onTurnOn}>Change payment method</Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(true)}>Turn off autopay</Button>
            </>
          )}
          {(state === "off" || state === "halted") && hasPaidPlan && (
            <Button size="sm" disabled={busy} onClick={onTurnOn} className="bg-[#256fef] text-white hover:bg-[#1d5ed6]">
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Turn on autopay
            </Button>
          )}
        </div>
      </div>

      {confirming && (
        <div role="alertdialog" aria-label="Turn off autopay" className="mt-4 rounded-lg bg-muted p-3">
          <p className="text-sm text-foreground">
            {ends ? `Turn autopay off? Your plan will end on ${ends} unless you renew it yourself.` : "Turn autopay off? Your plan will end with the period you've paid for."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Keep autopay on</Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => { setConfirming(false); onTurnOff(); }}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Yes, turn it off
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
