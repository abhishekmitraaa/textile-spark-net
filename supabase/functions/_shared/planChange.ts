// ─────────────────────────────────────────────────────────────
// PLAN CHANGES — the payment functions' side (2026-10-02).
//
// What a plan purchase costs and when it starts is decided in the database, in one
// place: admin.subscription_quote (migration 20261002100100). The Subscription FAQ
// promises it: "you can upgrade your plan at any time and the difference will be
// prorated. Downgrades will take effect from your next billing cycle."
//
//   new        no paid plan running: starts now, full price
//   renewal    same plan and cycle: one more period from the current end
//   upgrade    starts now; the unused part of what's paid comes off
//   downgrade  paid now, starts when the current period ends
//
// create-order prices the Razorpay order with subscription_quote_for (the charge,
// before a discount code and GST). verify-payment and the webhook activate with
// subscription_activate, which applies the rule again at that moment and returns the
// period the invoice covers. A browser never sends an amount.
//
// No Deno APIs, so Node can load it (scripts/discount-flow-check.mjs).
// ─────────────────────────────────────────────────────────────

export type ChangeKind = "new" | "renewal" | "upgrade" | "downgrade";

/** The database's answer (subscription_quote_for / subscription_activate). */
export interface PlanChange {
  ok: boolean;
  /** Why not: bad_cycle, unknown_plan, bad_plan, invite_only, zero_amount, already_scheduled. */
  reason?: string;
  kind?: ChangeKind;
  plan_id?: string;
  billing_cycle?: "monthly" | "yearly";
  /** The plan's price for the cycle, whole rupees before GST. */
  list_rupees?: number;
  /** The unused part of what's already paid (upgrades only). */
  credit_rupees?: number;
  /** list − credit: what is charged before a discount code and GST. */
  charge_rupees?: number;
  period_start?: string;
  period_end?: string;
  starts_now?: boolean;
  /** subscription_activate only. */
  subscription_id?: string;
}

async function rpc(url: string, key: string, fn: string, args: Record<string, unknown>): Promise<PlanChange> {
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!r.ok) return { ok: false, reason: "unavailable" };
    return (await r.json()) as PlanChange;
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** What this seller would pay for this plan and cycle now, and when it would start. */
export function quotePlanChange(url: string, key: string, vendorId: string, planId: string, billingCycle: string): Promise<PlanChange> {
  return rpc(url, key, "subscription_quote_for", { p_vendor: vendorId, p_plan: planId, p_cycle: billingCycle });
}

/** A paid order becomes the plan. Returns the period the invoice covers. */
export function activatePlanChange(url: string, key: string, vendorId: string, planId: string, billingCycle: string): Promise<PlanChange> {
  return rpc(url, key, "subscription_activate", { p_vendor: vendorId, p_plan: planId, p_cycle: billingCycle });
}
