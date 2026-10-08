// ─────────────────────────────────────────────────────────────
// Shared: send one SMS (subscriptions P2, 2026-10-08). The adapter is built; the provider
// isn't chosen yet (Mitra, 2026-10-08: "a sms provider too but it will be set up later").
//
// Until SMS_PROVIDER names a provider below, every send answers "not_configured" and the
// outbox marks the message skipped, so nothing waits to go out stale.
//
// India: TRAI's DLT rules require every SMS text to be registered with an approved
// template id and a registered sender id (header). A message to an Indian number without
// its template's DLT id is refused here as permanent, never sent.
//
// ADDING A PROVIDER (MSG91, Gupshup, Twilio…): add an entry to PROVIDERS that reads its own
// secrets, sends { to (country code and digits), text, dltTemplateId }, and answers a
// SendResult: "sent" with the provider's message id, or "send_failed" with `permanent`
// true for a refusal a retry can't fix (bad number, unregistered template) and false for
// rate limits and outages. Then set SMS_PROVIDER to its key, plus its secrets.
// ─────────────────────────────────────────────────────────────

import type { SendResult } from "./resend.ts";

export interface Sms {
  /** Country code and digits, e.g. 919876543210. */
  to: string;
  text: string;
  /** The DLT template id the text is registered under (India). */
  dltTemplateId: string | null;
}

type Provider = (m: Sms) => Promise<SendResult>;

const PROVIDERS: Record<string, Provider> = {
  // msg91: (m) => …   (none chosen yet)
};

export function smsProvider(): string | null {
  const p = (Deno.env.get("SMS_PROVIDER") ?? "").trim().toLowerCase();
  return p && PROVIDERS[p] ? p : null;
}

export function smsConfigured(): boolean {
  return smsProvider() !== null;
}

export async function sendSms(m: Sms): Promise<SendResult> {
  const p = smsProvider();
  if (!p) return { status: "not_configured" };
  if (m.to.startsWith("91") && !m.dltTemplateId) {
    return { status: "send_failed", message: "This SMS template has no DLT template id, so it can't be sent to an Indian number.", permanent: true };
  }
  return PROVIDERS[p](m);
}
