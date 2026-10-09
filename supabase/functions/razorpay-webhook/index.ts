// Supabase Edge Function: razorpay-webhook  (deploy with verify_jwt = false)
//
// Server-to-server backstop from Razorpay. If a buyer completes payment but the
// browser closes before verify-payment runs, this still publishes the campaigns.
// Verifies the webhook signature (HMAC-SHA256 of the RAW body with
// RAZORPAY_WEBHOOK_SECRET) and publishes the order's intent idempotently
// (shares the 'created' → 'paid' claim with verify-payment).
//
// Holds the stored spec to the vendor's plan before inserting, identically to
// razorpay-verify-payment (../_shared/adReach.ts, subscriptions P5): an order that
// can't be published on the plan is flagged for refund/admin review and NOT
// published; reach beyond the plan is clamped. (Without this the webhook would be
// an unguarded second publish path — a closed browser must not bypass the check.)
//
// DISCOUNT CODES (admin completion Phase 10, 2026-09-29): a claimed order's
// code use is confirmed here too, since either path may be the one that claims.
//
// Setup: in the Razorpay dashboard add a webhook →
//   URL:    https://<project>.supabase.co/functions/v1/razorpay-webhook
//   events: payment.captured (and optionally order.paid)
//   secret: set the same value as the RAZORPAY_WEBHOOK_SECRET function secret

// Price table, amount formula and campaign-row construction moved to
// ../_shared/adPricing.ts on 2026-09-14. buildAdRows() carries the per-vendor
// billing fix: trustedSeal / verifiedCertificate now produce ONE campaign row
// with product_id = null instead of one per product.
import { buildAdRows, type AdSpec } from "../_shared/adPricing.ts";
import { confirmDiscount } from "../_shared/discounts.ts";
import { adReach } from "../_shared/adReach.ts";


async function flagOrderForRefund(url: string, key: string, orderId: string): Promise<void> {
  await fetch(`${url}/rest/v1/ad_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ status: "refund_review" }),
  });
}

// ── REMOVED 2026-09-14: grantSeals(). ──
//
// This function called grant_ad_verification() directly, here on the PAYMENT
// path, for any trustedSeal / verifiedCertificate placement in the order — so a
// webhook-delivered payment put the verified badge on the vendor's profile and
// every one of their product cards before any human reviewed the campaign.
//
// razorpay-verify-payment had this removed on 2026-09-12 for exactly that
// reason. The webhook did not, and it is the OTHER publish path — the
// server-to-server backstop that fires when the buyer closes the browser before
// verify-payment runs. So the rule "payment is never approval" held on one path
// and not the other, and the one it did not hold on is the one that runs
// unattended.
//
// guard_ad_activation protects the campaign STATUS on both paths, but nothing
// protected the seal grant here: grant_ad_verification is SECURITY DEFINER with
// no internal authorization check, and this function runs as service_role.
//
// The grant now happens only inside approve_ad_campaign(), keyed off the
// campaign's own placement CSV and expiring with its ends_at. A rejected
// campaign therefore never produces a badge, whichever path published it.

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function publishOrder(url: string, key: string, orderId: string): Promise<number> {
  const claim = await fetch(`${url}/rest/v1/ad_orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }),
  });
  const claimed = claim.ok ? await claim.json() : [];
  if (!Array.isArray(claimed) || claimed.length === 0) return 0;
  const order = claimed[0];
  // Charged the discounted price, so the code's use is the vendor's.
  if (order.discount_redemption_id) await confirmDiscount(url, key, order.discount_redemption_id, orderId);
  const decision = await adReach(url, key, order.vendor_id, order.spec as AdSpec);
  if (!decision.ok) {
    // Paid, but nothing can be published on this plan: flag for refund/admin review.
    await flagOrderForRefund(url, key, orderId);
    return 0;
  }
  // Stamp the paying order onto every campaign it produced — same as
  // verify-payment, since either path may be the one that publishes.
  const rows = buildAdRows(order.vendor_id, decision.spec)
    .map((r) => ({ ...r, ad_order_id: orderId }));
  if (rows.length === 0) return 0;
  const ins = await fetch(`${url}/rest/v1/advertisements`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  return ins.ok ? rows.length : 0;
}

function orderIdFromEvent(evt: Record<string, unknown>): string | null {
  const payload = (evt?.payload ?? {}) as Record<string, unknown>;
  const payment = (payload?.payment as Record<string, unknown>)?.entity as Record<string, unknown> | undefined;
  const order = (payload?.order as Record<string, unknown>)?.entity as Record<string, unknown> | undefined;
  return (payment?.order_id as string) || (order?.id as string) || null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return new Response(JSON.stringify({ error: "not_configured" }), { status: 200, headers: { "content-type": "application/json" } });

  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") || "";
  const expected = await hmacHex(secret, raw);
  if (!safeEqual(expected, sig)) return new Response("invalid signature", { status: 400 });

  let evt: Record<string, unknown>;
  try {
    evt = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const event = String(evt?.event ?? "");
  if (event !== "payment.captured" && event !== "order.paid") {
    return new Response(JSON.stringify({ ok: true, ignored: event }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const orderId = orderIdFromEvent(evt);
  if (!orderId) return new Response(JSON.stringify({ ok: true, note: "no_order_id" }), { status: 200, headers: { "content-type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const count = await publishOrder(url, serviceKey, orderId);
  return new Response(JSON.stringify({ ok: true, published: count }), { status: 200, headers: { "content-type": "application/json" } });
});
