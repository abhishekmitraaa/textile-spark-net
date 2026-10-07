// Supabase Edge Function: discount-quote  (verify_jwt = true)
//
// What a discount code takes off a vendor's order, before they pay: the numbers
// the checkout shows (admin completion Phase 10, 2026-09-29). The order is
// priced exactly as the create-order functions price it (the plan's price; the
// ad spec split into its certificate line and the rest), and the database
// answers (discount_check). Holds nothing: a use is reserved only when the order
// is created, where the same check runs again under the code's lock.
//
// The limit on guessing lives in the database: ten codes that don't exist in an
// hour and the vendor can't try any code until the hour is up, here or at
// checkout. A code that does exist costs one indexed read to quote.
//
// POST { kind: "subscription", planId, billingCycle, code }
//    → { ok: true, code, appliesTo, kind, value, list, discount, base, gst, total }
//    `list` is the charge before the code: the plan's price, less an upgrade's
//    credit (2026-10-02, _shared/planChange.ts).
// POST { kind: "ad", spec, code }
//    → { ok: true, code, appliesTo, kind, value, gross, ads, certificate, discount, total }
// or  { ok: false, reason, appliesTo? }   (reasons: _shared/discounts.ts)
// Whole rupees. The vendor is the JWT's subject.

import type { AdSpec } from "../_shared/adPricing.ts";
import { adAmounts, checkDiscount, normaliseCode, subscriptionAmounts } from "../_shared/discounts.ts";
import { quotePlanChange } from "../_shared/planChange.ts";
import { verifiedUserId } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}


interface PlanRow { monthly_price: number; yearly_price: number; is_invite_only: boolean }
async function fetchPlan(url: string, key: string, planId: string): Promise<PlanRow | null> {
  const r = await fetch(
    `${url}/rest/v1/subscription_plans?id=eq.${encodeURIComponent(planId)}&select=monthly_price,yearly_price,is_invite_only`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] as PlanRow : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  // Confirmed by Auth, not read out of the token (S-5, subscriptions P0).
  const vendorId = await verifiedUserId(req, url, serviceKey);
  if (!vendorId) return json({ error: "unauthenticated" }, 401);

  let body: { kind?: string; planId?: string; billingCycle?: string; spec?: AdSpec; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const code = normaliseCode(body.code);
  if (!code) return json({ ok: false, reason: "invalid" });

  if (body.kind === "subscription") {
    const planId = body.planId;
    const billingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";
    if (!planId || planId === "free") return json({ error: "bad_plan" }, 400);
    const plan = await fetchPlan(url, serviceKey, planId);
    if (!plan) return json({ error: "unknown_plan" }, 400);
    if (plan.is_invite_only) return json({ ok: false, reason: "invite_only" });
    const planPrice = billingCycle === "yearly" ? plan.yearly_price : plan.monthly_price;
    if (!planPrice || planPrice <= 0) return json({ error: "zero_amount" }, 400);
    // The charge this seller would pay (an upgrade's price less its credit), as
    // subscription-create-order prices it (_shared/planChange.ts).
    const change = await quotePlanChange(url, serviceKey, vendorId, planId, billingCycle);
    if (!change.ok) return json({ ok: false, reason: change.reason ?? "unavailable" });
    const list = change.charge_rupees ?? planPrice;
    if (list <= 0) return json({ ok: false, reason: "no_discount" });

    const v = await checkDiscount(url, serviceKey, code, vendorId, "subscription", { planId, planRupees: list });
    if (!v.ok) return json({ ok: false, reason: v.reason ?? "unavailable", appliesTo: v.applies_to ?? null });
    const m = subscriptionAmounts(list, v.discount_rupees ?? 0);
    return json({
      ok: true, code: v.code, appliesTo: v.applies_to, kind: v.kind, value: v.value,
      list: m.list, discount: m.discount, base: m.base, gst: m.gst, total: m.total,
    });
  }

  if (body.kind === "ad") {
    const spec = body.spec;
    if (!spec || !Array.isArray(spec.placementIds) || spec.placementIds.length === 0 || !Array.isArray(spec.items) || spec.items.length === 0) {
      return json({ error: "bad_spec" }, 400);
    }
    const lines = adAmounts(spec);
    if (lines.gross <= 0) return json({ error: "zero_amount" }, 400);

    const v = await checkDiscount(url, serviceKey, code, vendorId, "ad", { adRupees: lines.ads, certificateRupees: lines.certificate });
    if (!v.ok) return json({ ok: false, reason: v.reason ?? "unavailable", appliesTo: v.applies_to ?? null });
    const m = adAmounts(spec, v.discount_rupees ?? 0);
    return json({
      ok: true, code: v.code, appliesTo: v.applies_to, kind: v.kind, value: v.value,
      gross: m.gross, ads: m.ads, certificate: m.certificate, discount: m.discount, total: m.total,
    });
  }

  return json({ error: "bad_kind" }, 400);
});
