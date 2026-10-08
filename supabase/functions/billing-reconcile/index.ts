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
// Autopay orders (subscriptions P3) are reconciled their own way: a first order is keyed
// by its Razorpay subscription (sub_…), so Razorpay is asked whether that subscription was
// set up and which payment paid its upfront amount; a renewal order (subchg_<payment id>)
// already names its payment.
//
// Answers { checked, fulfilled, already, unpaid, failed }.

import { finishPaymentEvent, fulfilOrder, recordPaymentEvent } from "../_shared/fulfil.ts";
import { fetchSubscription, firstSubscriptionPayment, orderPayments } from "../_shared/razorpay.ts";
import { mandateEvent, retireMandates } from "../_shared/autopay.ts";

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
  const keys = { keyId, keySecret };
  const mark = (orderRef: string) =>
    fetch(`${url}/rest/v1/rpc/billing_reconcile_mark`, { method: "POST", headers: db, body: JSON.stringify({ p_order_ref: orderRef }) });
  const count = (f: { ok: boolean; already?: boolean }) => {
    if (f.ok && !f.already) tally.fulfilled++;
    else if (f.ok) tally.already++;
    else tally.failed++;
  };
  for (const o of candidates) {
    tally.checked++;

    // Autopay (P3). A renewal order exists only because Razorpay reported its charge, so
    // the payment is known: it is in the order's own id.
    if (o.order_id.startsWith("subchg_")) {
      count(await fulfilOrder(url, serviceKey, o.order_id, o.order_id.slice("subchg_".length), "reconcile"));
      await mark(o.order_id);
      continue;
    }
    // An autopay's first order is keyed by its Razorpay subscription: ask Razorpay whether
    // the subscription was set up, and which payment its upfront amount was.
    if (o.order_id.startsWith("sub_")) {
      const s = await fetchSubscription(keys, o.order_id);
      if (!s.ok || !s.data) { tally.failed++; continue; }
      const status = s.data.status;
      if (status === "authenticated" || status === "active") {
        const ev = await mandateEvent(url, serviceKey, o.order_id, status, s.data.payment_method, s.data.charge_at);
        const paid = await firstSubscriptionPayment(keys, o.order_id);
        if (paid) count(await fulfilOrder(url, serviceKey, o.order_id, paid, "reconcile"));
        else tally.unpaid++;
        if (ev?.replace?.length) await retireMandates(url, serviceKey, keys, ev.replace);
      } else {
        // Not set up: still at checkout (created), or over (cancelled, expired, completed).
        if (status === "cancelled" || status === "expired" || status === "completed") await mandateEvent(url, serviceKey, o.order_id, status);
        tally.unpaid++;
      }
      await mark(o.order_id);
      continue;
    }

    const paid = await orderPayments(keys, o.order_id);
    if (!paid.ok) { tally.failed++; continue; }
    const payments: RazorpayPayment[] = paid.data?.items ?? [];

    const captured = payments.find((p) => p.status === "captured");
    if (captured) {
      const eventId = `reconcile:${o.order_id}:${captured.id}`;
      const seen = await recordPaymentEvent(url, serviceKey, {
        eventId, event: "reconcile.captured", source: "billing-reconcile", orderRef: o.order_id, paymentRef: captured.id,
      });
      const f = await fulfilOrder(url, serviceKey, o.order_id, captured.id, "reconcile");
      count(f);
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
    await mark(o.order_id);
  }
  return json({ ok: true, ...tally });
});
