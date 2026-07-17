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
async function publishOrder(url: string, key: string, orderId: string): Promise<{ ok: boolean; count: number }> {
  const claim = await fetch(`${url}/rest/v1/ad_orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }),
  });
  const claimed = claim.ok ? await claim.json() : [];
  if (!Array.isArray(claimed) || claimed.length === 0) return { ok: true, count: 0 }; // already paid / unknown
  const order = claimed[0];
  const rows = adRows(order.vendor_id, order.spec as AdSpec);
  const ok = await insertAds(url, key, rows);
  if (ok) await grantSeals(url, key, order.vendor_id, order.spec as AdSpec);
  return { ok, count: ok ? rows.length : 0 };
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
    const rows = adRows(vendorId, body.spec);
    const ok = await insertAds(url, serviceKey, rows);
    if (ok) await grantSeals(url, serviceKey, vendorId, body.spec);
    return json({ ok, demo: true, count: ok ? rows.length : 0 });
  }

  // Live mode — verify the signature, then publish the recorded intent.
  const { orderId, paymentId, signature } = body;
  if (!orderId || !paymentId || !signature) return json({ error: "missing_fields" }, 400);
  const expected = await hmacHex(keySecret, `${orderId}|${paymentId}`);
  if (!safeEqual(expected, signature)) return json({ ok: false, error: "bad_signature" }, 200);

  const result = await publishOrder(url, serviceKey, orderId);
  return json(result);
});
