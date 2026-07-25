// Supabase Edge Function: razorpay-verify-payment
//
// Live mode (RAZORPAY_KEY_SECRET set): verifies the payment signature
// (HMAC-SHA256 of `orderId|paymentId`) then publishes the campaigns recorded
// in ad_orders — idempotently (a conditional 'created' → 'paid' claim, so the
// webhook and this call never double-publish). The spec/vendor come from the
// stored intent, not the client.
//
// Demo mode (no key secret): publishes directly from the client spec using the
// vendor id from the JWT, so the ad flow works before the gateway is wired.
//
// Plan ad-location-scope enforcement (server-side backstop): the publish path
// runs as the service role and must NOT trust the spec's target_cities. Before
// inserting the ad(s) we resolve the vendor's real effective plan and:
//   * Free (ad_location_scope = 'none') — not a publishable state; we do NOT
//     publish and flag the order for refund/admin review (never silently drop).
//   * A paid tier whose spec targets more cities than its scope allows — we
//     CLAMP the list to the allowed count (keep the first N) and publish anyway.
//     Ad pricing doesn't vary by city count, so clamping removes no paid-for
//     line item; failing the whole order over a targeting detail would deny a
//     vendor who legitimately paid. (This is the deliberate choice.)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

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
  targetCategories?: string[]; targetCities?: string[]; // real targeting (persisted)
}

// Ad types that grant a time-bound trust seal when purchased.
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

// ── Plan ad-location-scope resolution + enforcement ──
function scopeAllowance(scope: string): number | null {
  switch (scope) {
    case "none": return 0;      // Free — may not advertise at all
    case "state_1": return 1;
    case "state_4": return 4;
    default: return null;       // pan_india / global — unlimited
  }
}

// Resolve the vendor's effective ad_location_scope server-side. get_vendor_plan()
// is self/admin-guarded (returns null when called for another vendor with the
// service role), so we read the two tables directly — the same effective-plan
// rule the RPC/triggers use: an active subscription whose period hasn't lapsed
// gives its plan, otherwise Free.
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
    return "none"; // fail closed — never over-publish on a lookup error
  }
}

interface ScopeDecision { blocked: boolean; spec: AdSpec; requested: number; allowed: number }
// Free (scope 'none') => blocked. A paid tier over its city allowance => spec
// with target_cities clamped to the first N. Otherwise the spec is unchanged.
function applyScopeToSpec(spec: AdSpec, scope: string): ScopeDecision {
  const cities = Array.isArray(spec.targetCities) ? spec.targetCities : [];
  if (scope === "none") return { blocked: true, spec, requested: cities.length, allowed: 0 };
  const allowance = scopeAllowance(scope);
  if (allowance === null || cities.length <= allowance) {
    return { blocked: false, spec, requested: cities.length, allowed: allowance ?? cities.length };
  }
  return { blocked: false, spec: { ...spec, targetCities: cities.slice(0, allowance) }, requested: cities.length, allowed: allowance };
}

function computeAmountPaise(spec: AdSpec): number {
  const days = Math.max(1, Math.floor(spec.days || 1));
  const perProduct = (spec.placementIds || []).reduce((sum, id) => {
    const price = AD_PRICE[id];
    return price ? sum + price * (PER_MSG.has(id) ? 1 : days) : sum;
  }, 0);
  return perProduct * Math.max(1, (spec.items || []).length) * 100;
}

// Flag a claimed live/webhook order that shouldn't have published (Free vendor)
// for refund / admin review — a durable trace on the order itself, never a
// silent drop. (Ad refunds are a manual admin follow-up; this project has no
// automated ad-refund gateway call, mirroring the manual subscription refund.)
async function flagOrderForRefund(url: string, key: string, orderId: string): Promise<boolean> {
  const r = await fetch(`${url}/rest/v1/ad_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ status: "refund_review" }),
  });
  return r.ok;
}
// Demo mode has no pre-recorded intent, so record the blocked attempt as its own
// 'refund_review' ad_orders row (durable trace) instead of vanishing silently.
// Returns whether the trace actually persisted, so the response never claims a
// flag that didn't happen.
async function recordDemoRefundTrace(url: string, key: string, vendorId: string, spec: AdSpec): Promise<{ ok: boolean; orderId: string }> {
  const orderId = `demo_blocked_${crypto.randomUUID()}`;
  const r = await fetch(`${url}/rest/v1/ad_orders`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ order_id: orderId, vendor_id: vendorId, spec, amount: computeAmountPaise(spec), status: "refund_review" }),
  });
  return { ok: r.ok, orderId };
}

// Grant the time-bound trust seal for any trustedSeal/verifiedCertificate
// placements in the spec (expires with the campaign). Idempotency isn't critical
// — a re-grant just extends the max(expires_at), which publishOrder already
// guards against by only running once per claimed order.
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

async function insertAds(url: string, key: string, rows: unknown[]): Promise<boolean> {
  if (rows.length === 0) return false;
  const r = await fetch(`${url}/rest/v1/advertisements`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  return r.ok;
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
function vendorIdFromJwt(req: Request): string | null {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))).sub ?? null;
  } catch {
    return null;
  }
}

// Claim the intent ('created' → 'paid') and publish its campaigns exactly once.
// Enforces the vendor's ad_location_scope on the stored spec before inserting:
// Free is flagged for refund and not published; a paid tier's over-limit city
// list is clamped.
async function publishOrder(url: string, key: string, orderId: string): Promise<{ ok: boolean; count: number; blocked?: boolean; refundFlagged?: boolean; requested?: number; allowed?: number }> {
  const claim = await fetch(`${url}/rest/v1/ad_orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }),
  });
  const claimed = claim.ok ? await claim.json() : [];
  if (!Array.isArray(claimed) || claimed.length === 0) return { ok: true, count: 0 }; // already paid / unknown
  const order = claimed[0];
  const scope = await resolveAdScope(url, key, order.vendor_id);
  const decision = applyScopeToSpec(order.spec as AdSpec, scope);
  if (decision.blocked) {
    // Free vendor paid — don't publish; flag the order for refund/admin review.
    const flagged = await flagOrderForRefund(url, key, orderId);
    return { ok: false, count: 0, blocked: true, refundFlagged: flagged, requested: decision.requested, allowed: 0 };
  }
  const rows = adRows(order.vendor_id, decision.spec);
  const ok = await insertAds(url, key, rows);
  if (ok) await grantSeals(url, key, order.vendor_id, decision.spec);
  return { ok, count: ok ? rows.length : 0, requested: decision.requested, allowed: decision.allowed };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ ok: false, error: "server_misconfigured" }, 500);

  let body: { orderId?: string; paymentId?: string; signature?: string; spec?: AdSpec; demo?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

  // Demo mode — no gateway configured; publish from the client spec.
  if (!keySecret) {
    const vendorId = vendorIdFromJwt(req);
    if (!vendorId) return json({ ok: false, error: "unauthenticated" }, 401);
    if (!body.spec) return json({ ok: false, error: "missing_spec" }, 400);
    const scope = await resolveAdScope(url, serviceKey, vendorId);
    const decision = applyScopeToSpec(body.spec, scope);
    if (decision.blocked) {
      // Free vendor — advertising isn't part of their plan; don't publish.
      const trace = await recordDemoRefundTrace(url, serviceKey, vendorId, body.spec);
      return json({ ok: false, demo: true, error: "plan_not_eligible", refundFlagged: trace.ok, orderId: trace.orderId, count: 0 });
    }
    const rows = adRows(vendorId, decision.spec);
    const ok = await insertAds(url, serviceKey, rows);
    if (ok) await grantSeals(url, serviceKey, vendorId, decision.spec);
    return json({ ok, demo: true, count: ok ? rows.length : 0, requested: decision.requested, allowed: decision.allowed });
  }

  // Live mode — verify the signature, then publish the recorded intent.
  const { orderId, paymentId, signature } = body;
  if (!orderId || !paymentId || !signature) return json({ error: "missing_fields" }, 400);
  const expected = await hmacHex(keySecret, `${orderId}|${paymentId}`);
  if (!safeEqual(expected, signature)) return json({ ok: false, error: "bad_signature" }, 200);

  const result = await publishOrder(url, serviceKey, orderId);
  return json(result);
});
