// Supabase Edge Function: notification-dispatch  (verify_jwt = true; service role only)
//
// Sends what the notification outbox has due (subscriptions P2, 2026-10-08). Every minute
// (cron job notification-dispatch, migration 20261008130100, scheduled only with Mitra's
// say-so) it:
//   1. claims due messages (public.notification_claim: FOR UPDATE SKIP LOCKED, so two runs
//      never send the same message; a run that dies mid-send is reclaimed after 5 minutes),
//   2. renders each from its template (_shared/notificationRender.ts) and sends it through
//      its channel's adapter: email (_shared/resend.ts), WhatsApp (_shared/whatsapp.ts),
//      SMS (_shared/sms.ts, no provider yet),
//   3. records the outcome (public.notification_mark): sent with the provider's id;
//      skipped when the channel isn't configured (nothing piles up to go out stale when the
//      keys arrive); failed when a retry can't help; otherwise retried with backoff,
//   4. records the run (public.notification_dispatch_heartbeat), which System Health shows,
//      with which channels this function's secrets configure.
// It keeps claiming while batches come back full, for up to 40 seconds.
//
// Secrets: as the adapters, plus SITE_URL (optional, default https://cosora.in) for the
// links in emails.
//
// Answers { claimed, sent, skipped, retried, failed, configured }.

import { resendConfigured, sendEmail, type SendResult } from "../_shared/resend.ts";
import { sendWhatsAppTemplate, whatsappConfigured } from "../_shared/whatsapp.ts";
import { sendSms, smsConfigured } from "../_shared/sms.ts";
import { renderEmail, renderSms, whatsappParams, type OutboxRow } from "../_shared/notificationRender.ts";

const BATCH = 50;
const CONCURRENCY = 5;
const BUDGET_MS = 40_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Reads the role claim without verifying the signature. Sound only because config.toml
// keeps verify_jwt = true for this function, so the platform validated the token first
// (the same reasoning as generate-embedding and billing-reconcile).
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

async function send(row: OutboxRow, siteUrl: string): Promise<SendResult> {
  if (row.channel === "email") {
    const e = renderEmail(row, siteUrl);
    return sendEmail({ to: row.to_address, subject: e.subject, text: e.text, html: e.html });
  }
  if (row.channel === "whatsapp") {
    if (!row.wa_template || !row.wa_language) return { status: "send_failed", message: "The template has no WhatsApp template name.", permanent: true };
    return sendWhatsAppTemplate({ to: row.to_address, template: row.wa_template, language: row.wa_language, params: whatsappParams(row) });
  }
  return sendSms({ to: row.to_address, text: renderSms(row), dltTemplateId: row.sms_dlt_template_id });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (jwtRole(req.headers.get("authorization")) !== "service_role") return json({ error: "forbidden" }, 403);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);
  const siteUrl = Deno.env.get("SITE_URL") || "https://cosora.in";
  const db = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const rpc = (fn: string, args: Record<string, unknown>) =>
    fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers: db, body: JSON.stringify(args) });

  const configured = { email: resendConfigured(), whatsapp: whatsappConfigured(), sms: smsConfigured() };
  const tally = { claimed: 0, sent: 0, skipped: 0, retried: 0, failed: 0 };
  const started = Date.now();

  while (Date.now() - started < BUDGET_MS) {
    const c = await rpc("notification_claim", { p_limit: BATCH });
    if (!c.ok) {
      console.error("notification-dispatch: claim failed", c.status, (await c.text()).slice(0, 200));
      break;
    }
    const rows = (await c.json()) as OutboxRow[];
    tally.claimed += rows.length;

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(rows.slice(i, i + CONCURRENCY).map(async (row) => {
        let result: SendResult;
        try {
          result = await send(row, siteUrl);
        } catch (e) {
          result = { status: "send_failed", message: String(e).slice(0, 200), permanent: false };
        }
        const outcome = result.status === "sent" ? "sent"
          : result.status === "not_configured" ? "not_configured"
          : result.permanent ? "failed" : "retry";
        const m = await rpc("notification_mark", {
          p_id: row.id, p_outcome: outcome,
          p_provider_id: result.status === "sent" ? result.id ?? null : null,
          p_error: result.status === "send_failed" ? result.message : null,
        });
        const status = m.ok ? ((await m.json()) as string | null) : null;
        if (status === "sent") tally.sent++;
        else if (status === "skipped") tally.skipped++;
        else if (status === "queued") tally.retried++;
        else if (status === "failed") tally.failed++;
      }));
    }
    if (rows.length < BATCH) break;
  }

  const hb = await rpc("notification_dispatch_heartbeat", {
    p_configured: configured, p_claimed: tally.claimed, p_sent: tally.sent, p_failed: tally.failed,
  });
  if (!hb.ok) console.error("notification-dispatch: heartbeat failed", hb.status, (await hb.text()).slice(0, 200));
  return json({ ok: true, ...tally, configured });
});
