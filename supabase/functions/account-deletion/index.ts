// Supabase Edge Function: account-deletion
//
// Step 1 of "Delete my account" (Phase 2 of the My Profile brief, 2026-09-23).
// The signed-in buyer asks for a code. The database mints it
// (issue_account_deletion_code, EXECUTE for service_role only) and this function
// sends it: by email through Resend, or, for an account with no usable email and
// a confirmed phone, by WhatsApp through Meta's Cloud API (Phase 18, MPF-6). The
// database picks the channel and records it on the request. The code is never
// returned to the browser: the only way to learn it is the inbox or WhatsApp of
// the confirmed address or number on auth.users. Confirm and cancel are plain
// RPCs from the app (confirm_account_deletion / cancel_account_deletion) and
// need no secret, so they are not here.
//
// Actions (POST JSON). Every business outcome answers 200 with a `status`, because
// supabase.functions.invoke() drops the body of a non-2xx response and the app
// needs the reason:
//   { "action": "status" }  -> { configured: { email, whatsapp } }  (names no secret value)
//   { "action": "request" } -> { status: "sent", channel, to, expires_at }
//                            | { status: "not_configured", channel }  (that channel has no
//                              secrets; nothing minted)
//                            | { status: "send_failed", channel, message }  (code discarded)
//                            | { status: <reason> }  from account_deletion_blocker() /
//                              issue_account_deletion_code(): vendor, admin, suspended,
//                              no_contact, deleted, not_found, already_scheduled,
//                              rate_limited, too_many_codes
//
// Secrets:
//   Email:
//     RESEND_API_KEY   required for the email channel.
//     RESEND_FROM      optional; default "Cosora <onboarding@resend.dev>". That shared
//                      Resend sender only delivers to the Resend account's own
//                      address: real users need a verified domain set here.
//   WhatsApp (both required for the WhatsApp channel):
//     WHATSAPP_ACCESS_TOKEN     a system-user token for the WhatsApp Business account.
//     WHATSAPP_PHONE_NUMBER_ID  the sending number's id (not the number itself).
//     WHATSAPP_TEMPLATE         optional; default "account_deletion_code". An approved
//                               AUTHENTICATION-category template with a copy-code
//                               button. Meta fixes its text: "<code> is your
//                               verification code."
//     WHATSAPP_TEMPLATE_LANG    optional; default "en", the template's language code.
//     WHATSAPP_API_VERSION      optional; default "v25.0", the Graph API version.
//   Platform-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// CONVENTIONS, as bunny-upload-url and the payment functions: no imports, raw
// Deno.serve + fetch against PostgREST with the service-role key, and a manual JWT
// decode that is sound ONLY because supabase/config.toml declares
// `[functions.account-deletion] verify_jwt = true`: the platform checks the
// signature before this code runs, so `sub` is trustworthy.

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

function userIdFromJwt(req: Request): string | null {
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

const REST = (key: string) => ({
  apikey: key,
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
});

// "ananya@gmail.com" -> "a****@gmail.com": enough to recognise, not to harvest.
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "your email";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

// "919876543210" -> "+91 *******210", the same idea for a phone number.
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "your WhatsApp number";
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : "";
  return `${country}${"*".repeat(Math.min(digits.length, 10) - 3)}${digits.slice(-3)}`;
}

function emailBody(code: string) {
  const text =
    `Your Cosora account deletion code is ${code}.\n\n` +
    `It expires in 10 minutes. Entering it schedules your account for deletion in 14 days. ` +
    `You can cancel any time before then from your profile.\n\n` +
    `If you did not ask to delete your account, ignore this email. Nothing happens without the code.`;
  const html =
    `<p>Your Cosora account deletion code is</p>` +
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>` +
    `<p>It expires in 10 minutes. Entering it schedules your account for deletion in 14 days. ` +
    `You can cancel any time before then from your profile.</p>` +
    `<p style="color:#6b7280">If you did not ask to delete your account, ignore this email. ` +
    `Nothing happens without the code.</p>`;
  return { text, html };
}

/** Sends the code by email. Returns why it failed, or null once Resend accepted it. */
async function sendEmail(resendKey: string, to: string, code: string): Promise<string | null> {
  const { text, html } = emailBody(code);
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") || "Cosora <onboarding@resend.dev>",
      to: [to],
      subject: "Your Cosora account deletion code",
      text,
      html,
    }),
  });
  if (sent.ok) return null;
  let message = `The email provider answered ${sent.status}.`;
  try {
    const err = await sent.json();
    if (typeof err?.message === "string" && err.message) message = err.message;
  } catch { /* keep the status line */ }
  return message;
}

/**
 * Sends the code as a WhatsApp authentication template (the copy-code kind).
 * Returns why it failed, or null once Meta accepted it. Accepted is not
 * delivered: a number that isn't on WhatsApp is only reported later, through a
 * webhook this project doesn't have.
 */
async function sendWhatsApp(token: string, phoneNumberId: string, to: string, code: string): Promise<string | null> {
  const version = Deno.env.get("WHATSAPP_API_VERSION") || "v25.0";
  const sent = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      // auth.users.phone is E.164 without the "+"; Meta wants the digits.
      to: to.replace(/\D/g, ""),
      type: "template",
      template: {
        name: Deno.env.get("WHATSAPP_TEMPLATE") || "account_deletion_code",
        language: { code: Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "en" },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          // The copy-code button carries the code too.
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
        ],
      },
    }),
  });
  if (sent.ok) return null;
  let message = `WhatsApp answered ${sent.status}.`;
  try {
    const err = (await sent.json())?.error;
    const detail = err?.error_data?.details || err?.message;
    if (typeof detail === "string" && detail) message = detail;
  } catch { /* keep the status line */ }
  return message;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
  const waPhoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
  const configured = { email: Boolean(resendKey), whatsapp: Boolean(waToken && waPhoneNumberId) };

  if (body.action === "status") return json({ configured });
  if (body.action !== "request") return json({ error: "unknown_action" }, 400);

  // The anon key is a valid JWT too, but it carries no `sub`.
  const userId = userIdFromJwt(req);
  if (!userId) return json({ error: "sign_in_required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  // The database picks the account's channel. When it isn't one of these, it
  // answers not_configured (with the channel) before minting anything: a code
  // that cannot be delivered must not exist.
  const channels = (Object.keys(configured) as (keyof typeof configured)[]).filter((c) => configured[c]);
  const issued = await fetch(`${url}/rest/v1/rpc/issue_account_deletion_code`, {
    method: "POST",
    headers: REST(serviceKey),
    body: JSON.stringify({ p_user: userId, p_channels: channels }),
  });
  if (!issued.ok) {
    return json({ status: "error", message: `Could not start the request (${issued.status}).` });
  }
  const result = await issued.json();
  if (result?.status !== "ok") return json(result); // a reason; the app words it

  const channel = result.channel === "whatsapp" ? "whatsapp" : "email";
  const failure = channel === "whatsapp"
    ? await sendWhatsApp(waToken, waPhoneNumberId, result.destination, result.code)
    : await sendEmail(resendKey, result.destination, result.code);

  if (failure) {
    // Kill the undelivered code and lift the resend cooldown.
    await fetch(`${url}/rest/v1/rpc/discard_account_deletion_code`, {
      method: "POST",
      headers: REST(serviceKey),
      body: JSON.stringify({ p_request: result.request_id }),
    });
    return json({ status: "send_failed", channel, message: failure });
  }

  const to = channel === "whatsapp" ? maskPhone(result.destination) : maskEmail(result.destination);
  return json({ status: "sent", channel, to, expires_at: result.expires_at });
});
