// ─────────────────────────────────────────────────────────────
// May this account start a plan checkout? (subscriptions P0, 2026-10-08)
//
// The database decides (public.subscription_checkout_gate, service role only):
//   not_vendor          no finished seller registration
//   suspended, deleted  the account's status
//   payments_not_open   the `subscription_checkout` switch is off and the account
//                       isn't on its list. Razorpay is in test mode, and its published
//                       test cards would otherwise give anyone a paid plan, its trust
//                       seal and its search boost (securityflags S-2).
// A failed call refuses: a checkout never starts on an unanswered gate.
// No Deno APIs, so Node can load it (scripts/discount-flow-check.mjs).
// ─────────────────────────────────────────────────────────────

export type CheckoutRefusal = "not_vendor" | "suspended" | "deleted" | "payments_not_open" | "unavailable";

export interface CheckoutGate {
  ok: boolean;
  reason?: CheckoutRefusal;
}

export async function checkoutGate(url: string, key: string, vendorId: string): Promise<CheckoutGate> {
  try {
    const r = await fetch(`${url}/rest/v1/rpc/subscription_checkout_gate`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ p_vendor: vendorId }),
    });
    if (!r.ok) return { ok: false, reason: "unavailable" };
    const g = (await r.json()) as CheckoutGate;
    return g?.ok === true ? { ok: true } : { ok: false, reason: g?.reason ?? "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
