// ─────────────────────────────────────────────────────────────
// Shared: send one WhatsApp template message through Meta's Cloud API (subscriptions P2,
// 2026-10-08). The same call account-deletion makes for its code, generalised to any
// approved template; account-deletion keeps its own copy (deployed and working).
//
// Only Meta-approved templates can start a conversation, so every message here is a
// template: `template` is its name, `language` its language code, and `params` fill its
// body's {{1}}, {{2}}… in order. Meta rejects an empty parameter, so an empty value is sent
// as "-".
//
// Results, as _shared/resend.ts:
//   "sent"            Meta accepted it, with its message id (accepted is not delivered)
//   "not_configured"  WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is missing
//   "send_failed"     refused or unreachable; `permanent` when retrying can't help (a number
//                     that isn't on WhatsApp, a template that doesn't exist, no opt-in session)
//
// Secrets: WHATSAPP_ACCESS_TOKEN (a system-user token), WHATSAPP_PHONE_NUMBER_ID (the sending
// number's id), WHATSAPP_API_VERSION (optional, default v25.0), WHATSAPP_API_URL (optional,
// default https://graph.facebook.com; only a local or staging mock changes it).
// ─────────────────────────────────────────────────────────────

import type { SendResult } from "./resend.ts";

export function whatsappConfigured(): boolean {
  return Boolean(Deno.env.get("WHATSAPP_ACCESS_TOKEN") && Deno.env.get("WHATSAPP_PHONE_NUMBER_ID"));
}

// Meta error codes a retry can fix: rate limits and throughput, and Meta's own outages.
const RETRYABLE_CODES = new Set([4, 80007, 130429, 131000, 131016, 131056, 133004]);

export async function sendWhatsAppTemplate(m: { to: string; template: string; language: string; params: string[] }): Promise<SendResult> {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
  if (!token || !phoneNumberId) return { status: "not_configured" };
  const base = Deno.env.get("WHATSAPP_API_URL") || "https://graph.facebook.com";
  const version = Deno.env.get("WHATSAPP_API_VERSION") || "v25.0";
  try {
    const res = await fetch(`${base}/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: m.to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: m.template,
          language: { code: m.language },
          ...(m.params.length
            ? { components: [{ type: "body", parameters: m.params.map((t) => ({ type: "text", text: t.trim() || "-" })) }] }
            : {}),
        },
      }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) return { status: "sent", id: body?.messages?.[0]?.id ?? undefined };
    const err = body?.error;
    const code = typeof err?.code === "number" ? err.code : null;
    const detail = err?.error_data?.details || err?.message;
    const message = `${typeof detail === "string" && detail ? detail : `WhatsApp answered ${res.status}.`}${code ? ` (${code})` : ""}`;
    const permanent = res.status !== 429 && res.status < 500 && !(code !== null && RETRYABLE_CODES.has(code));
    return { status: "send_failed", message, permanent };
  } catch (e) {
    return { status: "send_failed", message: `WhatsApp couldn't be reached: ${String(e).slice(0, 120)}`, permanent: false };
  }
}
