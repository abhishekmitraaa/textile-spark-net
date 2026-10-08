// Shared: send one email through Resend (Help & Support P6, plan A7, 2026-10-01).
//
// Honest by construction: the caller learns exactly what happened, and says "we've
// emailed you" only on "sent".
//   "sent"            Resend accepted it (accepted is not delivered: bounces come later)
//   "not_configured"  no RESEND_API_KEY, so nothing was attempted
//   "send_failed"     Resend refused it, or couldn't be reached; `message` says why
//
// Secrets (project-wide, shared with account-deletion and admin-staff):
//   RESEND_API_KEY  required to send anything.
//   RESEND_FROM     optional; default "Cosora <onboarding@resend.dev>". That shared sender
//                   only delivers to the Resend account owner's own address, so real users
//                   need a verified domain here (ToDo.md, "Set up Resend").
//   RESEND_API_URL  optional; default https://api.resend.com. Only a local or staging mock
//                   changes it (subscriptions P2's local end-to-end run).
//
// Subscriptions P2 (2026-10-08): "sent" carries Resend's message id, which the notification
// outbox keeps; a refusal says whether retrying could help (`permanent`).
//
// account-deletion keeps its own copy of the send for now: it is deployed and working,
// and this plan doesn't touch it (A7).

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendResult =
  | { status: "sent"; id?: string }
  | { status: "not_configured" }
  | { status: "send_failed"; message: string; permanent?: boolean };

export function resendConfigured(): boolean {
  return Boolean(Deno.env.get("RESEND_API_KEY"));
}

export async function sendEmail(email: Email): Promise<SendResult> {
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!key) return { status: "not_configured" };
  try {
    const res = await fetch(`${Deno.env.get("RESEND_API_URL") || "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM") || "Cosora <onboarding@resend.dev>",
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    if (res.ok) {
      let id: string | undefined;
      try { id = (await res.json())?.id ?? undefined; } catch { /* accepted all the same */ }
      return { status: "sent", id };
    }
    let message = `The email provider answered ${res.status}.`;
    try {
      const err = await res.json();
      if (typeof err?.message === "string" && err.message) message = err.message;
    } catch { /* keep the status line */ }
    // 4xx other than rate limiting won't change on a retry (a bad address, an unverified domain).
    return { status: "send_failed", message, permanent: res.status >= 400 && res.status < 500 && res.status !== 429 };
  } catch (e) {
    return { status: "send_failed", message: `The email provider couldn't be reached: ${String(e).slice(0, 120)}` };
  }
}

/** "ananya@gmail.com" -> "a*****@gmail.com": enough to recognise, not to harvest. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "your email";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
