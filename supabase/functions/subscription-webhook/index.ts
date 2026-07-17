// Supabase Edge Function: subscription-webhook  (deploy with verify_jwt = false)
//
// Server-to-server backstop from Razorpay. If a vendor completes payment but the
// browser closes before subscription-verify-payment runs, this still activates
// the subscription. Verifies the webhook signature (HMAC-SHA256 of the RAW body
// with RAZORPAY_WEBHOOK_SECRET) and activates the order's intent idempotently
// (shares the 'created' → 'paid' claim with verify-payment).
//
// No subscription-charged/cancelled events to handle — there is no recurring
// Razorpay subscription object; each period is a plain payment.captured.
//
// Setup: in the Razorpay dashboard add a webhook →
//   URL:    https://<project>.supabase.co/functions/v1/subscription-webhook
//   events: payment.captured (and optionally order.paid)
//   secret: set the same value as the RAZORPAY_WEBHOOK_SECRET function secret

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

interface PlanRow { monthly_price: number; yearly_price: number }
async function fetchPlan(url: string, key: string, planId: string): Promise<PlanRow | null> {
  const r = await fetch(
    `${url}/rest/v1/subscription_plans?id=eq.${encodeURIComponent(planId)}&select=monthly_price,yearly_price`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] as PlanRow : null;
}

async function activateSubscription(url: string, key: string, o: Record<string, unknown>): Promise<boolean> {
  const planId = String(o.plan_id);
  const billingCycle = o.billing_cycle === "yearly" ? "yearly" : "monthly";
  const plan = await fetchPlan(url, key, planId);
  if (!plan) return false;
  const base = billingCycle === "yearly" ? plan.yearly_price : plan.monthly_price;
  const gst = Math.round(base * GST_RATE);

  const start = new Date();
  const end = new Date(start);
  if (billingCycle === "yearly") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const subResp = await fetch(`${url}/rest/v1/vendor_subscriptions?on_conflict=vendor_id`, {
    method: "POST",
    headers: {
      apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      vendor_id: o.vendor_id, plan_id: planId, billing_cycle: billingCycle, status: "active",
      current_period_start: startIso, current_period_end: endIso, auto_renew: true, updated_at: startIso,
    }),
  });
  if (!subResp.ok) return false;
  const subRows = await subResp.json();
  const subscriptionId = Array.isArray(subRows) && subRows.length ? subRows[0].id : null;

  await fetch(`${url}/rest/v1/vendor_profiles?id=eq.${o.vendor_id}`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ plan_id: planId, plan_expires_at: endIso }),
  });

  let invoiceNumber: string | null = null;
  try {
    const inv = await fetch(`${url}/rest/v1/rpc/next_invoice_number`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: "{}",
    });
    if (inv.ok) invoiceNumber = await inv.json();
  } catch { /* null */ }

  await fetch(`${url}/rest/v1/subscription_invoices`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      vendor_id: o.vendor_id, subscription_id: subscriptionId, plan_id: planId, amount: base,
      currency: "INR", gst_amount: gst, gst_number: o.gst_number ?? null, status: "paid",
      razorpay_order_id: o.order_id, invoice_number: invoiceNumber,
      billing_period_start: startIso, billing_period_end: endIso,
    }),
  });
  return true;
}

async function activateFromOrder(url: string, key: string, orderId: string): Promise<boolean> {
  const claim = await fetch(`${url}/rest/v1/subscription_payment_orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }),
  });
  const claimed = claim.ok ? await claim.json() : [];
  if (!Array.isArray(claimed) || claimed.length === 0) return false; // already paid / unknown
  return await activateSubscription(url, key, claimed[0]);
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
  const activated = await activateFromOrder(url, serviceKey, orderId);
  return new Response(JSON.stringify({ ok: true, activated }), { status: 200, headers: { "content-type": "application/json" } });
});
