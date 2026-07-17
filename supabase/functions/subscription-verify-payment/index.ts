// Supabase Edge Function: subscription-verify-payment
//
// Live mode (RAZORPAY_KEY_SECRET set): verifies the payment signature
// (HMAC-SHA256 of `orderId|paymentId`) then activates the subscription recorded
// in subscription_payment_orders — idempotently (a conditional 'created' →
// 'paid' claim, so the webhook and this call never double-activate). Plan /
// vendor / cycle come from the stored intent, not the client.
//
// Demo mode (no key secret): activates directly from the client-supplied
// planId + billingCycle using the vendor id from the JWT, so the subscription
// flow works before the gateway is wired — exactly like the ad flow's
// simulated checkout. The amount is still computed SERVER-SIDE from the plan.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

const GST_RATE = 0.18;

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

interface ActivateInput {
  vendorId: string; planId: string; billingCycle: "monthly" | "yearly";
  gstNumber: string | null; paymentId: string | null; orderId: string | null;
}

// Shared: upsert the subscription, cache the plan on vendor_profiles, and write
// a paid invoice. The amount is always recomputed from the plan (server-side).
async function activateSubscription(url: string, key: string, input: ActivateInput): Promise<{ ok: boolean; error?: string; planId?: string }> {
  const plan = await fetchPlan(url, key, input.planId);
  if (!plan) return { ok: false, error: "unknown_plan" };
  // Invite-only tiers (VIP) are never self-serve — even in demo/unconfigured
  // mode, where create-order returns not_configured before it can reject them.
  // Admins provision VIP directly; the self-serve activation path must refuse it.
  if (plan.is_invite_only) return { ok: false, error: "invite_only" };
  const base = input.billingCycle === "yearly" ? plan.yearly_price : plan.monthly_price;
  const gst = Math.round(base * GST_RATE);

  const start = new Date();
  const end = new Date(start);
  if (input.billingCycle === "yearly") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // Upsert the one-per-vendor subscription row; get its id back for the invoice.
  const subResp = await fetch(`${url}/rest/v1/vendor_subscriptions?on_conflict=vendor_id`, {
    method: "POST",
    headers: {
      apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      vendor_id: input.vendorId, plan_id: input.planId, billing_cycle: input.billingCycle,
      status: "active", current_period_start: startIso, current_period_end: endIso,
      auto_renew: true, updated_at: startIso,
    }),
  });
  if (!subResp.ok) return { ok: false, error: "subscription_upsert_failed" };
  const subRows = await subResp.json();
  const subscriptionId = Array.isArray(subRows) && subRows.length ? subRows[0].id : null;

  // Cache the plan on vendor_profiles (denormalised, used by buyer-facing reads).
  await fetch(`${url}/rest/v1/vendor_profiles?id=eq.${input.vendorId}`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ plan_id: input.planId, plan_expires_at: endIso }),
  });

  // Invoice number from the DB sequence (RPC).
  let invoiceNumber: string | null = null;
  try {
    const inv = await fetch(`${url}/rest/v1/rpc/next_invoice_number`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: "{}",
    });
    if (inv.ok) invoiceNumber = await inv.json();
  } catch { /* fall through with null */ }

  await fetch(`${url}/rest/v1/subscription_invoices`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      vendor_id: input.vendorId, subscription_id: subscriptionId, plan_id: input.planId,
      amount: base, currency: "INR", gst_amount: gst, gst_number: input.gstNumber, tds_amount: null,
      status: "paid", razorpay_payment_id: input.paymentId, razorpay_order_id: input.orderId,
      invoice_number: invoiceNumber, billing_period_start: startIso, billing_period_end: endIso,
    }),
  });

  return { ok: true, planId: input.planId };
}

// Claim the intent ('created' → 'paid') and activate exactly once.
async function activateFromOrder(url: string, key: string, orderId: string): Promise<{ ok: boolean; planId?: string; already?: boolean }> {
  const claim = await fetch(`${url}/rest/v1/subscription_payment_orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }),
  });
  const claimed = claim.ok ? await claim.json() : [];
  if (!Array.isArray(claimed) || claimed.length === 0) return { ok: true, already: true }; // already paid / unknown
  const o = claimed[0];
  const res = await activateSubscription(url, key, {
    vendorId: o.vendor_id, planId: o.plan_id, billingCycle: o.billing_cycle,
    gstNumber: o.gst_number ?? null, paymentId: null, orderId,
  });
  return { ok: res.ok, planId: res.planId };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ ok: false, error: "server_misconfigured" }, 500);

  let body: { orderId?: string; paymentId?: string; signature?: string; demo?: boolean; planId?: string; billingCycle?: string; gstNumber?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

  // Demo mode — no gateway configured; activate from the client request.
  if (!keySecret) {
    const vendorId = vendorIdFromJwt(req);
    if (!vendorId) return json({ ok: false, error: "unauthenticated" }, 401);
    const planId = body.planId;
    if (!planId || planId === "free") return json({ ok: false, error: "bad_plan" }, 400);
    const billingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";
    const res = await activateSubscription(url, serviceKey, {
      vendorId, planId, billingCycle, gstNumber: body.gstNumber ?? null, paymentId: null, orderId: null,
    });
    return json({ ...res, demo: true });
  }

  // Live mode — verify the signature, then activate the recorded intent.
  const { orderId, paymentId, signature } = body;
  if (!orderId || !paymentId || !signature) return json({ error: "missing_fields" }, 400);
  const expected = await hmacHex(keySecret, `${orderId}|${paymentId}`);
  if (!safeEqual(expected, signature)) return json({ ok: false, error: "bad_signature" }, 200);

  const result = await activateFromOrder(url, serviceKey, orderId);
  return json(result);
});
