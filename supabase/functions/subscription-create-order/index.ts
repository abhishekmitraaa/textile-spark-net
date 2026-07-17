// Supabase Edge Function: subscription-create-order
//
// Creates a plain Razorpay order for a vendor's subscription purchase / upgrade
// / manual renewal and records a payment intent in
// public.subscription_payment_orders (mirrors ad_orders) so verify-payment AND
// the webhook can activate the subscription idempotently. The amount is computed
// SERVER-SIDE from subscription_plans (never trust a client amount); the vendor
// id comes from the caller's JWT.
//
// One-time / renewal charge only — NO Razorpay Subscriptions API, NO autopay.
// Each billing period is its own discrete order the vendor pays explicitly.
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

const GST_RATE = 0.18;

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

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return json({ error: "not_configured" }, 200);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  const vendorId = vendorIdFromJwt(req);
  if (!vendorId) return json({ error: "unauthenticated" }, 401);

  let payload: { planId?: string; billingCycle?: string; gstNumber?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const planId = payload.planId;
  const billingCycle = payload.billingCycle === "yearly" ? "yearly" : "monthly";
  if (!planId || planId === "free") return json({ error: "bad_plan" }, 400);

  const plan = await fetchPlan(url, serviceKey, planId);
  if (!plan) return json({ error: "unknown_plan" }, 400);
  if (plan.is_invite_only) return json({ error: "invite_only" }, 200); // VIP: not self-serve

  const base = billingCycle === "yearly" ? plan.yearly_price : plan.monthly_price;
  if (!base || base <= 0) return json({ error: "zero_amount" }, 400);
  const gst = Math.round(base * GST_RATE);
  const amount = (base + gst) * 100; // paise

  // 1) Create the Razorpay order.
  let orderId: string;
  try {
    const resp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "content-type": "application/json" },
      body: JSON.stringify({
        amount, currency: "INR", receipt: `sub_${Date.now()}`,
        notes: { kind: "subscription", vendor: vendorId, plan: planId, cycle: billingCycle },
      }),
    });
    if (!resp.ok) return json({ error: "order_failed", detail: (await resp.text()).slice(0, 300) }, 200);
    orderId = (await resp.json()).id;
  } catch (e) {
    return json({ error: "request_failed", detail: String(e) }, 200);
  }

  // 2) Record the intent (service role) so activation is driven server-side.
  await fetch(`${url}/rest/v1/subscription_payment_orders`, {
    method: "POST",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      order_id: orderId, vendor_id: vendorId, plan_id: planId, billing_cycle: billingCycle,
      amount, gst_number: payload.gstNumber ?? null, status: "created",
    }),
  });

  return json({ configured: true, orderId, amount, currency: "INR", keyId, base, gst, planId, billingCycle });
});
