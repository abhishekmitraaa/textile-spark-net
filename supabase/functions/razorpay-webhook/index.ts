// Supabase Edge Function: razorpay-webhook  (deploy with verify_jwt = false)
//
// Server-to-server backstop from Razorpay. If a buyer completes payment but the
// browser closes before verify-payment runs, this still publishes the campaigns.
// Verifies the webhook signature (HMAC-SHA256 of the RAW body with
// RAZORPAY_WEBHOOK_SECRET) and publishes the order's intent idempotently
// (shares the 'created' → 'paid' claim with verify-payment).
//
// Enforces the vendor's ad_location_scope on the stored spec before inserting,
// identically to razorpay-verify-payment: a Free vendor's order is flagged for
// refund/admin review and NOT published; a paid tier's over-limit target-city
// list is clamped to the allowed count. (Without this the webhook would be an
// unguarded second publish path — a closed browser must not bypass the check.)
//
// Setup: in the Razorpay dashboard add a webhook →
//   URL:    https://<project>.supabase.co/functions/v1/razorpay-webhook
//   events: payment.captured (and optionally order.paid)
//   secret: set the same value as the RAZORPAY_WEBHOOK_SECRET function secret

const AD_PRICE: Record<string, number> = {
  openListing: 22, searchListing: 35, featuredProduct: 55, storePromotion: 99,
  directBroadcast: 15, wholesalerPick: 59, brandAd: 69, websiteBanner: 89,
  mobileBanner: 99, webMobileCombo: 129, fbInsta: 59, googleProduct: 59,
  socialCombo: 99, trustedSeal: 44, verifiedCertificate: 199,
};
const PER_MSG = new Set(["directBroadcast"]);

interface AdItem { productId: string; title: string; imageUrl: string | null }
interface AdSpec {
  placementIds: string[]; days: number; items: AdItem[]; campaignLabel?: string;
  targetCategories?: string[]; targetCities?: string[];
}

const SEAL_SOURCES = new Set(["trustedSeal", "verifiedCertificate"]);
function campaignEndIso(spec: AdSpec): string {
  const days = Math.max(1, Math.floor(spec.days || 1));
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function adRows(vendorId: string, spec: AdSpec) {
  const days = Math.max(1, Math.floor(spec.days || 1));
  const perProduct = (spec.placementIds || []).reduce((sum, id) => {
    const price = AD_PRICE[id];
    return price ? sum + price * (PER_MSG.has(id) ? 1 : days) : sum;
  }, 0);
  const dailyBudget = Math.max(1, Math.round(perProduct / days));
  const placement = (spec.placementIds || []).join(",");
  const startsAt = new Date().toISOString();
  const endsAt = campaignEndIso(spec);
  const label = spec.campaignLabel || "Ad";
  const targetCategories = Array.isArray(spec.targetCategories) && spec.targetCategories.length ? spec.targetCategories : null;
  const targetCities = Array.isArray(spec.targetCities) && spec.targetCities.length ? spec.targetCities : null;
  return (spec.items || []).map((it) => ({
    vendor_id: vendorId,
    product_id: it.productId,
    title: it.title ? `${it.title} — ${label}` : label,
    image_url: it.imageUrl ?? null,
    daily_budget: dailyBudget,
    placement,
    status: "active",
    starts_at: startsAt,
    ends_at: endsAt,
    target_categories: targetCategories,
    target_cities: targetCities,
  }));
}

// ── Plan ad-location-scope resolution + enforcement (mirrors verify-payment) ──
function scopeAllowance(scope: string): number | null {
  switch (scope) {
    case "none": return 0;
    case "state_1": return 1;
    case "state_4": return 4;
    default: return null; // pan_india / global — unlimited
  }
}
async function resolveAdScope(url: string, key: string, vendorId: string): Promise<string> {
  const headers = { apikey: key, authorization: `Bearer ${key}` };
  try {
    const sr = await fetch(`${url}/rest/v1/vendor_subscriptions?vendor_id=eq.${vendorId}&select=plan_id,status,current_period_end`, { headers });
    const subs = sr.ok ? await sr.json() : [];
    let planId = "free";
    const s = Array.isArray(subs) && subs.length ? subs[0] : null;
    if (s && s.plan_id && s.status === "active" && s.current_period_end && new Date(s.current_period_end).getTime() > Date.now()) {
      planId = s.plan_id;
    }
    const pr = await fetch(`${url}/rest/v1/subscription_plans?id=eq.${encodeURIComponent(planId)}&select=limits`, { headers });
    const plans = pr.ok ? await pr.json() : [];
    const scope = Array.isArray(plans) && plans.length ? plans[0]?.limits?.ad_location_scope : null;
    return typeof scope === "string" ? scope : "none";
  } catch {
    return "none";
  }
}
interface ScopeDecision { blocked: boolean; spec: AdSpec }
function applyScopeToSpec(spec: AdSpec, scope: string): ScopeDecision {
  if (scope === "none") return { blocked: true, spec };
  const allowance = scopeAllowance(scope);
  const cities = Array.isArray(spec.targetCities) ? spec.targetCities : [];
  if (allowance === null || cities.length <= allowance) return { blocked: false, spec };
  return { blocked: false, spec: { ...spec, targetCities: cities.slice(0, allowance) } };
}
async function flagOrderForRefund(url: string, key: string, orderId: string): Promise<void> {
  await fetch(`${url}/rest/v1/ad_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ status: "refund_review" }),
  });
}

async function grantSeals(url: string, key: string, vendorId: string, spec: AdSpec): Promise<void> {
  const exp = campaignEndIso(spec);
  for (const pid of spec.placementIds || []) {
    if (!SEAL_SOURCES.has(pid)) continue;
    await fetch(`${url}/rest/v1/rpc/grant_ad_verification`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ v: vendorId, src: pid, exp }),
    });
  }
}

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
  const scope = await resolveAdScope(url, key, order.vendor_id);
  const decision = applyScopeToSpec(order.spec as AdSpec, scope);
  if (decision.blocked) {
    // Free vendor paid — don't publish; flag for refund/admin review.
    await flagOrderForRefund(url, key, orderId);
    return 0;
  }
  const rows = adRows(order.vendor_id, decision.spec);
  if (rows.length === 0) return 0;
  const ins = await fetch(`${url}/rest/v1/advertisements`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (ins.ok) await grantSeals(url, key, order.vendor_id, decision.spec);
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
