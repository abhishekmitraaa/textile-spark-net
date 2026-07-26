// Supabase Edge Function: razorpay-create-order
//
// Creates a Razorpay order for a vendor ad purchase and records a payment
// intent (vendor + full spec + amount) in public.ad_orders so verify-payment
// AND the webhook can publish the campaigns idempotently. The amount is
// computed SERVER-SIDE from the spec (never trust a client amount). The vendor
// id comes from the caller's JWT.
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (+ platform SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY). Returns { error:"not_configured" } until the
// Razorpay keys are set, so the client falls back to the simulated checkout.

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

const AD_PRICE: Record<string, number> = {
  openListing: 22, searchListing: 35, featuredProduct: 55, storePromotion: 99,
  directBroadcast: 15, wholesalerPick: 59, brandAd: 69, websiteBanner: 89,
  mobileBanner: 99, webMobileCombo: 129, fbInsta: 59, googleProduct: 59,
  socialCombo: 99, trustedSeal: 44, verifiedCertificate: 199,
};
const PER_MSG = new Set(["directBroadcast"]);

interface AdItem { productId: string; title: string; imageUrl: string | null }
interface AdSpec { placementIds: string[]; days: number; items: AdItem[]; campaignLabel?: string }

function computeAmountRupees(spec: AdSpec): number {
  const days = Math.max(1, Math.floor(spec.days || 1));
  const perProduct = (spec.placementIds || []).reduce((sum, id) => {
    const price = AD_PRICE[id];
    return price ? sum + price * (PER_MSG.has(id) ? 1 : days) : sum;
  }, 0);
  return perProduct * Math.max(1, (spec.items || []).length);
}

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

  let payload: { spec?: AdSpec };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const spec = payload.spec;
  if (!spec || !Array.isArray(spec.placementIds) || spec.placementIds.length === 0 || !Array.isArray(spec.items) || spec.items.length === 0) {
    return json({ error: "bad_spec" }, 400);
  }

  const rupees = computeAmountRupees(spec);
  if (rupees <= 0) return json({ error: "zero_amount" }, 400);
  const amount = rupees * 100; // paise

  // 1) Create the Razorpay order.
  let orderId: string;
  try {
    const resp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "content-type": "application/json" },
      body: JSON.stringify({ amount, currency: "INR", receipt: `ad_${Date.now()}`, notes: { kind: "ad_campaign", vendor: vendorId } }),
    });
    if (!resp.ok) return json({ error: "order_failed", detail: (await resp.text()).slice(0, 300) }, 200);
    orderId = (await resp.json()).id;
  } catch (e) {
    return json({ error: "request_failed", detail: String(e) }, 200);
  }

  // 2) Record the intent (service role) so publish is driven server-side.
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
    body: JSON.stringify({ order_id: orderId, vendor_id: vendorId, spec, amount, status: "created" }),
  });
  if (!ins.ok) return json({ error: "intent_failed", detail: (await ins.text()).slice(0, 300) }, 200);

  return json({ configured: true, orderId, amount, currency: "INR", keyId });
});
