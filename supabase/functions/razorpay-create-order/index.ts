// Supabase Edge Function: razorpay-create-order
//
// Creates a Razorpay order for a vendor ad purchase and records a payment
// intent (vendor + full spec + amount) in public.ad_orders so verify-payment
// AND the webhook can publish the campaigns idempotently. The amount is
// computed SERVER-SIDE from the spec (never trust a client amount). The vendor
// id comes from the caller's JWT.
//
// DISCOUNT CODES (admin completion Phase 10, 2026-09-29). `discountCode` is
// optional. The order is split into its certificate line and everything else
// (orderLineRupees); a "certificate" code comes off the first, an
// "ad_purchase" code off the second. The database checks the code before
// anything is created, then one use is reserved against the Razorpay order id
// under the code's lock, and ad_orders stores what was taken off
// (discount_paise), the code and the redemption. `amount` stays what is
// charged. A code that takes the order to ₹0 makes no Razorpay order: the id is
// free_<uuid> and razorpay-verify-payment fulfils it.
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (+ platform SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY). Returns { error:"not_configured" } until the
// Razorpay keys are set, so the client falls back to the simulated checkout
// (which applies a code itself: razorpay-verify-payment, demo mode).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

// Price table and amount formula moved to ../_shared/adPricing.ts on
// 2026-09-14. They used to be copy-pasted here, into razorpay-verify-payment
// and into razorpay-webhook, with no way to prove the three agreed — and the
// browser's copy in src/pages/Advertisements.tsx made four.
// scripts/ad-pricing-check.mjs now asserts the one remaining duplicate (the
// browser's, in src/lib/adPricing.ts) matches this one across 4000 generated
// orders, because a drift here quotes the vendor one price and charges another.
import type { AdSpec } from "../_shared/adPricing.ts";
import { adAmounts, checkDiscount, normaliseCode, releaseDiscount, reserveDiscount } from "../_shared/discounts.ts";
import { adReach } from "../_shared/adReach.ts";

function vendorIdFromJwt(req: Request): string | null {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return json({ error: "not_configured" }, 200);

  // Checked up front, not at write time: without the service role we cannot
  // record the payment intent, and an order created without one is a charge we
  // can never fulfil. Bail before touching Razorpay.
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  const vendorId = vendorIdFromJwt(req);
  if (!vendorId) return json({ error: "unauthenticated" }, 401);

  let payload: { spec?: AdSpec; discountCode?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const asked = payload.spec;
  if (!asked || !Array.isArray(asked.placementIds) || asked.placementIds.length === 0 || !Array.isArray(asked.items) || asked.items.length === 0) {
    return json({ error: "bad_spec" }, 400);
  }

  // What the vendor's plan lets this ad reach, before any money moves (subscriptions P5):
  // refused with a reason the vendor can act on. The stored intent carries the targeting
  // as the plan allows it (a one-state plan that named none gets the vendor's own state).
  const reach = await adReach(url, serviceKey, vendorId, asked, true);
  if (!reach.ok) return json({ error: "ad_reach", reason: reach.reason ?? "unavailable", message: reach.message }, 200);
  const spec = reach.spec;

  const lines = adAmounts(spec);
  if (lines.gross <= 0) return json({ error: "zero_amount" }, 400);

  // 0) The code, if any, before anything exists that it could leave behind.
  const code = normaliseCode(payload.discountCode);
  const amounts = { adRupees: lines.ads, certificateRupees: lines.certificate };
  let discount = 0;
  if (code) {
    const check = await checkDiscount(url, serviceKey, code, vendorId, "ad", amounts);
    if (!check.ok) return json({ error: "discount", reason: check.reason ?? "unavailable" }, 200);
    discount = check.discount_rupees ?? 0;
  }
  const money = adAmounts(spec, discount);
  const amount = money.paise;
  const free = amount === 0;

  // 1) Create the Razorpay order: none when the code took the total to ₹0.
  let orderId: string;
  if (free) {
    orderId = `free_${crypto.randomUUID()}`;
  } else {
    try {
      const resp = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "content-type": "application/json" },
        body: JSON.stringify({
          amount, currency: "INR", receipt: `ad_${Date.now()}`,
          notes: { kind: "ad_campaign", vendor: vendorId, ...(code ? { discount_code: code } : {}) },
        }),
      });
      if (!resp.ok) return json({ error: "order_failed", detail: (await resp.text()).slice(0, 300) }, 200);
      orderId = (await resp.json()).id;
    } catch (e) {
      return json({ error: "request_failed", detail: String(e) }, 200);
    }
  }

  // 2) Hold the code's use for this order. Refused here means another vendor
  //    took the last use (or an admin changed the code) since step 0.
  let redemptionId: string | null = null;
  let heldCode: string | null = null;
  if (code) {
    const held = await reserveDiscount(url, serviceKey, code, vendorId, "ad", orderId, discount, amounts);
    if (!held.ok || !held.redemption_id) return json({ error: "discount", reason: held.reason ?? "unavailable" }, 200);
    redemptionId = held.redemption_id;
    heldCode = held.code ?? code;
  }

  // 3) Record the intent (service role) so publish is driven server-side.
  //
  // This MUST succeed before the client is allowed to open Checkout. Both
  // fulfilment paths (verify-payment and the webhook) publish by claiming this
  // row; with no row, a completed payment finds nothing to fulfil and
  // publishOrder's "already paid / unknown" branch reports ok:true / count:0 —
  // i.e. the vendor is charged, gets no campaign, and the UI says it worked.
  // Failing here instead leaves only an unpaid orphan order at Razorpay, which
  // costs nothing and simply expires.
  const ins = await fetch(`${url}/rest/v1/ad_orders`, {
    method: "POST",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      order_id: orderId, vendor_id: vendorId, spec, amount, status: "created",
      discount_paise: money.discount * 100, discount_code: heldCode, discount_redemption_id: redemptionId,
    }),
  });
  if (!ins.ok) {
    // Nobody can pay an order with no intent, so its use goes back.
    if (redemptionId) await releaseDiscount(url, serviceKey, redemptionId, orderId);
    return json({ error: "intent_failed", detail: (await ins.text()).slice(0, 300) }, 200);
  }

  return json({
    configured: true, orderId, amount, currency: "INR", keyId,
    gross: money.gross, discount: money.discount, discountCode: heldCode, free,
  });
});
