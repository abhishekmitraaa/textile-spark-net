/**
 * How to reach Cosora Support without the in-app chat (Help & Support plan P1,
 * documentation/help-feature-plan.md; decisions D-04 and D-18).
 *
 * These are the values public.support_settings and public.support_hours hold, kept
 * here as the fallback: a page shows them before support_status() answers, when it
 * fails, and whenever rollout is off. Change them together with the database, from
 * Cosora-Admin's Support settings.
 */
export const SUPPORT_PHONE = "+918815578226";
export const SUPPORT_PHONE_LABEL = "+91 88155 78226";
export const SUPPORT_EMAIL = "hello@cosora.in";
export const SUPPORT_HOURS_LABEL = "Mon–Fri, 10:00–19:00 IST. Closed on weekends and holidays.";
export const SUPPORT_INSTAGRAM = "https://instagram.com/cosora";

/**
 * A link that starts a support chat about something (plan P3e): the topic, and the
 * item it's about. The chat page checks both and falls back to letting the person
 * choose, so a link to a topic that's switched off still works. `account` means
 * "my account", whichever side the person is on.
 */
export function supportChatHref(opts: { category?: string; entityType?: string; entityId?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (opts.category) q.set("category", opts.category);
  if (opts.entityType && opts.entityId) {
    q.set("entity_type", opts.entityType);
    q.set("entity_id", opts.entityId);
  }
  const s = q.toString();
  return s ? `/help/chat?${s}` : "/help/chat";
}

/** A `mailto:` link with a subject and, optionally, a prefilled body. */
export function supportMailto(subject: string, body?: string): string {
  const q = [`subject=${encodeURIComponent(subject)}`];
  if (body) q.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${SUPPORT_EMAIL}?${q.join("&")}`;
}
