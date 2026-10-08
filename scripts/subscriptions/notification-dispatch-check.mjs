#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// notification-dispatch, checked in Node (subscriptions P2, 2026-10-08).
//
// The function's real code is bundled with esbuild; Deno.serve / Deno.env are stubbed and
// fetch() answers from a stand-in for PostgREST (claim, mark, heartbeat), Resend and Meta,
// recording every call. The outbox's own rules (claiming, backoff, dedupe, consent) are
// scripts/subscriptions/p2_notification_delivery.sql. This proves the function between them:
//   * service role only; nothing configured → every message skipped, never retried
//   * email: Resend gets the rendered subject, text and HTML, with the button linking to
//     SITE_URL + the template's path; payload values escaped in HTML and encoded in links
//   * WhatsApp: Meta gets the approved template, its language and the parameters in order
//   * SMS: no provider → skipped
//   * outcomes: sent (with the provider id), refused for good → failed, rate limited or
//     unreachable → retried; the run is recorded with the channels configured
//   * a full batch is followed by another claim
//
//   node scripts/subscriptions/notification-dispatch-check.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SB = "https://project.test";
const BASE_ENV = { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "service-key", SITE_URL: "https://cosora.test" };
const ALL = { ...BASE_ENV, RESEND_API_KEY: "re_key", WHATSAPP_ACCESS_TOKEN: "wa_token", WHATSAPP_PHONE_NUMBER_ID: "12345" };

let ENV = ALL;
let handler = null;
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => ENV[k] } };

let S;
function reset(over = {}) {
  S = { calls: [], batches: [], marks: [], heartbeat: null, resend: { status: 200, body: { id: "re_1" } }, meta: { status: 200, body: { messages: [{ id: "wamid.1" }] } }, ...over };
}
const res = (body, status = 200) => new Response(body === undefined ? null : JSON.stringify(body), { status });

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  let body;
  try { body = init.body ? JSON.parse(init.body) : undefined; } catch { body = init.body; }
  S.calls.push({ url, body, headers: init.headers });
  const p = new URL(url).pathname;
  if (p === "/rest/v1/rpc/notification_claim") return res(S.batches.shift() ?? []);
  if (p === "/rest/v1/rpc/notification_mark") {
    S.marks.push(body);
    const status = { sent: "sent", not_configured: "skipped", failed: "failed", retry: "queued" }[body.p_outcome];
    return res(status);
  }
  if (p === "/rest/v1/rpc/notification_dispatch_heartbeat") { S.heartbeat = body; return res(undefined, 204); }
  if (url.startsWith("https://api.resend.com/emails")) {
    if (S.resend === "throw") throw new Error("ECONNRESET");
    return res(S.resend.body, S.resend.status);
  }
  if (url.startsWith("https://graph.facebook.com/")) return res(S.meta.body, S.meta.status);
  return res({ message: `unmocked ${url}` }, 599);
};

const dir = mkdtempSync(path.join(tmpdir(), "cosora-dispatch-"));
const outfile = path.join(dir, "dispatch.mjs");
await build({ entryPoints: ["supabase/functions/notification-dispatch/index.ts"], outfile, format: "esm", platform: "node", bundle: true, logLevel: "silent" });
await import(pathToFileURL(outfile).href);

const token = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.y`;
async function run({ role = "service_role", env = ALL } = {}) {
  ENV = env;
  const r = await handler(new Request(`${SB}/functions/v1/notification-dispatch`, {
    method: "POST", headers: { authorization: `Bearer ${token(role)}`, "content-type": "application/json" }, body: "{}",
  }));
  return { status: r.status, body: await r.json() };
}

const EMAIL = {
  id: "m-email", channel: "email", to_address: "owner@example.com", template_key: "invoice_issued", attempts: 1,
  payload: { name: "Asha <b>& Co</b>", invoice_id: "inv/1?x=2", invoice_number: "INV/2627/000001", total: "₹2,713.00" },
  subject: "Your Cosora invoice {{invoice_number}}", body: "Hello {{name}},\n\nTotal {{total}}.\nThanks.",
  cta_label: "View invoice", cta_path: "/subscription/invoice/{{invoice_id}}",
  wa_template: null, wa_language: null, wa_params: [], sms_dlt_template_id: null,
};
const WA = {
  ...EMAIL, id: "m-wa", channel: "whatsapp", to_address: "919876543210", subject: null, cta_label: null, cta_path: null,
  wa_template: "lead_alert", wa_language: "en", wa_params: ["name", "missing", "total"],
};
const SMS = { ...EMAIL, id: "m-sms", channel: "sms", to_address: "919876543210", subject: null, body: "Hi {{name}}" };

let failures = 0;
const rows = [];
function check(name, ok, detail = "") {
  if (!ok) failures++;
  rows.push({ check: name, verdict: ok ? "PASS" : "*** FAIL ***", detail: String(detail).slice(0, 100) });
}
const markOf = (id) => S.marks.find((m) => m.p_id === id);

// 1. Only the service role.
reset();
let r = await run({ role: "authenticated" });
check("1 a signed-in user's token is refused, nothing claimed", r.status === 403 && S.calls.length === 0, r.status);

// 2. Nothing configured: skipped, never retried.
reset({ batches: [[EMAIL, WA, SMS]] });
r = await run({ env: BASE_ENV });
check("2 nothing configured: every message skipped, no provider called",
  S.marks.every((m) => m.p_outcome === "not_configured") && S.marks.length === 3
  && !S.calls.some((c) => c.url.includes("resend.com") || c.url.includes("facebook.com")), JSON.stringify(S.marks.map((m) => m.p_outcome)));
check("2 the run is recorded with nothing configured",
  S.heartbeat?.p_claimed === 3 && S.heartbeat.p_configured.email === false && S.heartbeat.p_configured.whatsapp === false
  && S.heartbeat.p_configured.sms === false && r.body.skipped === 3, JSON.stringify(S.heartbeat));

// 3. Email rendered and sent.
reset({ batches: [[EMAIL]] });
r = await run();
const sent = S.calls.find((c) => c.url.startsWith("https://api.resend.com"));
check("3 email: Resend gets the subject filled from the payload", sent?.body.subject === "Your Cosora invoice INV/2627/000001" && sent.body.to[0] === "owner@example.com",
  sent?.body.subject);
check("3 email: the button links to SITE_URL + the path, the id URL-encoded",
  sent?.body.html.includes('href="https://cosora.test/subscription/invoice/inv%2F1%3Fx%3D2"') && sent.body.text.includes("View invoice: https://cosora.test/subscription/invoice/inv%2F1%3Fx%3D2"),
  sent?.body.text);
check("3 email: payload values are escaped in the HTML", sent?.body.html.includes("Asha &lt;b&gt;&amp; Co&lt;/b&gt;") && !sent.body.html.includes("<b>& Co"),
  "");
check("3 email: sent, with Resend's message id", markOf("m-email")?.p_outcome === "sent" && markOf("m-email").p_provider_id === "re_1" && r.body.sent === 1,
  JSON.stringify(markOf("m-email")));

// 4. WhatsApp template.
reset({ batches: [[WA]] });
r = await run();
const wa = S.calls.find((c) => c.url.startsWith("https://graph.facebook.com/"));
check("4 WhatsApp: the approved template, its language, parameters in order (empty sent as '-')",
  wa?.url === "https://graph.facebook.com/v25.0/12345/messages" && wa.body.template.name === "lead_alert" && wa.body.template.language.code === "en"
  && JSON.stringify(wa.body.template.components[0].parameters.map((p) => p.text)) === JSON.stringify(["Asha <b>& Co</b>", "-", "₹2,713.00"])
  && wa.body.to === "919876543210", JSON.stringify(wa?.body.template));
check("4 WhatsApp: sent with Meta's message id", markOf("m-wa")?.p_outcome === "sent" && markOf("m-wa").p_provider_id === "wamid.1");

// 5. SMS: no provider yet.
reset({ batches: [[SMS]] });
await run();
check("5 SMS: no provider, so skipped", markOf("m-sms")?.p_outcome === "not_configured");

// 6. Outcomes.
reset({ batches: [[EMAIL]], resend: { status: 422, body: { message: "Invalid `to` field." } } });
await run();
check("6 Resend refuses the address (422): failed, not retried", markOf("m-email")?.p_outcome === "failed" && /Invalid/.test(markOf("m-email").p_error),
  JSON.stringify(markOf("m-email")));
reset({ batches: [[EMAIL]], resend: { status: 429, body: { message: "Too many requests" } } });
await run();
check("6 Resend rate-limits (429): retried", markOf("m-email")?.p_outcome === "retry");
reset({ batches: [[EMAIL]], resend: "throw" });
await run();
check("6 Resend unreachable: retried", markOf("m-email")?.p_outcome === "retry" && /couldn't be reached/.test(markOf("m-email").p_error));
reset({ batches: [[WA]], meta: { status: 400, body: { error: { code: 131026, message: "Message undeliverable" } } } });
await run();
check("6 Meta: not on WhatsApp (131026): failed", markOf("m-wa")?.p_outcome === "failed" && /131026/.test(markOf("m-wa").p_error));
reset({ batches: [[WA]], meta: { status: 400, body: { error: { code: 130429, message: "Rate limit hit" } } } });
await run();
check("6 Meta: throughput limit (130429): retried", markOf("m-wa")?.p_outcome === "retry");

// 7. A full batch is followed by another claim; the run adds up.
const many = Array.from({ length: 50 }, (_, i) => ({ ...EMAIL, id: `b${i}` }));
reset({ batches: [many, [{ ...EMAIL, id: "last" }]] });
r = await run();
check("7 a full batch: claimed again, 51 sent, recorded", S.calls.filter((c) => c.url.endsWith("/rpc/notification_claim")).length === 2
  && r.body.sent === 51 && S.heartbeat?.p_sent === 51 && S.heartbeat.p_configured.email === true, JSON.stringify(r.body));

console.table(rows);
console.log(failures === 0 ? `\nDISPATCH CONSISTENT — ${rows.length} checks` : `\n${failures} CHECK(S) FAILED`);
rmSync(dir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
