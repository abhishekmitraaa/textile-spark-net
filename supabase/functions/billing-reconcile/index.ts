// Supabase Edge Function: billing-reconcile  (verify_jwt = true; service role only)
//
// Catches payments that reached Razorpay but never reached us (subscriptions P1,
// 2026-10-08): the browser closed before verify-payment ran AND the webhook didn't
// arrive or failed. Every 15 minutes (cron job billing-reconcile, migration
// 20261008120100, approved by Mitra on 2026-10-08) it asks the database for unpaid
// live or test plan orders between 15 minutes and 3 days old
// (billing_reconcile_candidates), asks Razorpay for each order's payments, and fulfils
// any order with a captured payment through the same transaction verify-payment uses.
// Each order is then marked so it isn't asked about again for 15 minutes.
//
// A payment Razorpay authorised but didn't capture is left alone and recorded: capture is
// Razorpay's setting, not ours to force.
//
// Answers { checked, fulfilled, already, unpaid, failed }.

import { finishPaymentEvent, fulfilOrder, recordPaymentEvent } from "../_shared/fulfil.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Reads the role claim without verifying the signature. Sound only because config.toml
// keeps verify_jwt = true for this function, so the platform validated the token first
// (the same reasoning as generate-embedding).
function jwtRole(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const parts = authHeader.slice(7).split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)))?.role ?? null;
  } catch {
    return null;
  }
}

interface Candidate { order_id: string; vendor_id: string; payment_mode: string; created_at: string }
interface RazorpayPayment { id: string; status: string; amount: number }

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (jwtRole(req.headers.get("authorization")) !== "service_role") return json({ error: "forbidden" }, 403);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);
  if (!keyId || !keySecret) return json({ ok: true, note: "not_configured", checked: 0 });

  const db = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const c = await fetch(`${url}/rest/v1/rpc/billing_reconcile_candidates`, { method: "POST", headers: db, body: JSON.stringify({ p_limit: 50 }) });
  if (!c.ok) return json({ error: "candidates_failed", detail: (await c.text()).slice(0, 300) }, 500);
  const candidates = (await c.json()) as Candidate[];

  const tally = { checked: 0, fulfilled: 0, already: 0, unpaid: 0, failed: 0 };
  const basic = `Basic ${btoa(`${keyId}:${keySecret}`)}`;
  for (const o of candidates) {
    tally.checked++;
    let payments: RazorpayPayment[] = [];
    try {
      const r = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(o.order_id)}/payments`, { headers: { authorization: basic } });
      if (!r.ok) { tally.failed++; continue; }
      payments = ((await r.json())?.items ?? []) as RazorpayPayment[];
    } catch {
      tally.failed++;
      continue;
    }

    const captured = payments.find((p) => p.status === "captured");
    if (captured) {
      const eventId = `reconcile:${o.order_id}:${captured.id}`;
      const seen = await recordPaymentEvent(url, serviceKey, {
        eventId, event: "reconcile.captured", source: "billing-reconcile", orderRef: o.order_id, paymentRef: captured.id,
      });
      const f = await fulfilOrder(url, serviceKey, o.order_id, captured.id, "reconcile");
      if (f.ok && !f.already) tally.fulfilled++;
      else if (f.ok) tally.already++;
      else tally.failed++;
      if (!seen.duplicate || !seen.outcome) {
        await finishPaymentEvent(url, serviceKey, eventId, f.ok ? (f.already ? "already_fulfilled" : "fulfilled") : `refused:${f.reason}`,
          { invoice_id: f.invoice_id ?? null, incident_id: f.incident_id ?? null });
      }
    } else {
      tally.unpaid++;
      const authorised = payments.find((p) => p.status === "authorized");
      if (authorised) {
        const eventId = `reconcile:${o.order_id}:${authorised.id}:authorized`;
        const seen = await recordPaymentEvent(url, serviceKey, {
          eventId, event: "reconcile.authorized", source: "billing-reconcile", orderRef: o.order_id, paymentRef: authorised.id,
        });
        if (!seen.duplicate) await finishPaymentEvent(url, serviceKey, eventId, "authorized_not_captured", { amount: authorised.amount });
      }
    }
    await fetch(`${url}/rest/v1/rpc/billing_reconcile_mark`, { method: "POST", headers: db, body: JSON.stringify({ p_order_ref: o.order_id }) });
  }
  return json({ ok: true, ...tally });
});
