// Supabase Edge Function: otp-dev-verify
//
// DUMMY OTP for mobile sign-in, live on purpose until SMS delivery exists
// (Mitra, 2026-09-27: "just typing any otp for now should let me log in").
// This project has no SMS provider and the in-house OTP API is not integrated,
// so no code can be sent. This function ACCEPTS ANY 6-DIGIT CODE and returns a
// real Supabase session for the typed number, so role selection, onboarding and
// everything after sign-in work end to end.
//
// This is an authentication bypass BY DESIGN: anyone who types a number is
// signed in as that number's account. Logged in documentation/securityflags.md
// (Open Flags, 2026-09-27). Switch it off before real users depend on phone
// accounts:
//   - set the secret OTP_DEV_BYPASS=off (takes effect at once, no redeploy), or
//   - set ENABLED = false below and redeploy, or delete the function.
// When it is off, `status` reports enabled:false and the app goes back to its
// honest "SMS delivery isn't live yet" notice.
//
// Only src/lib/auth/otp.ts calls this, and only after Supabase refused to send
// a real SMS. When real delivery is switched on, the app uses it instead and
// this function stops being called; delete it then.
//
// What it will and won't sign in to:
//   - Each number maps to one account it created itself, keyed by the
//     placeholder email p<digits>@phone.cosora.invalid (`.invalid` is reserved,
//     RFC 2606, so no mail can go there). auth.users.phone is set too, so the
//     same account is the one real SMS sign-in finds later.
//   - It never signs in to an account it did not create. Its accounts carry
//     app_metadata.created_by = "otp-dev-verify", which users cannot write. A
//     Google or email account with this number as its auth phone is refused,
//     and so is an email signup that claimed the placeholder address first.
//   - It never signs in to an admin. The check reads admin.admin_users through
//     admin_status_of() and refuses when that check itself fails.
//   - New accounts take only whitelisted signup metadata; handle_new_user()
//     applies it as for any signup. The placeholder address is then cleared
//     from profiles.email.
//   - The session comes from a magic-link token generated and redeemed here.
//     No email is sent.
//
// CORS stays `*`: the endpoint can be called without a browser anyway, so an
// origin list would not protect it. The kill switch above is the control.
//
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

const ENABLED = true;

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CREATED_BY = "otp-dev-verify";
const E164 = /^\+[1-9]\d{7,14}$/;
const CODE = /^\d{6}$/;
// The only metadata a caller may set. handle_new_user() whitelists active_role
// to buyer/seller itself, and admin status cannot come from metadata at all.
const META_KEYS = ["full_name", "phone", "active_role", "brand_name"] as const;

function enabled(): boolean {
  return ENABLED && (Deno.env.get("OTP_DEV_BYPASS") ?? "").toLowerCase() !== "off";
}

function admin(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function cleanMeta(raw: unknown, phone: string): Record<string, string> {
  const out: Record<string, string> = { phone };
  if (raw && typeof raw === "object") {
    for (const k of META_KEYS) {
      const v = (raw as Record<string, unknown>)[k];
      if (k !== "phone" && typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 120);
    }
  }
  return out;
}

/** True only when admin.admin_users says this account is not an active admin. */
async function confirmedNotAdmin(userId: string): Promise<boolean> {
  const res = await admin("/rest/v1/rpc/admin_status_of", {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId }),
  });
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length === 1 && rows[0]?.is_admin === false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  if (body.action === "status") return json({ enabled: enabled() });
  if (body.action !== "verify") return json({ error: "unknown_action" }, 400);
  if (!enabled()) return json({ status: "disabled" }, 403);

  const phone = typeof body.phone === "string" ? body.phone : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!E164.test(phone)) return json({ status: "error", message: "That phone number isn't valid." }, 400);
  if (!CODE.test(code)) return json({ status: "invalid", message: "Enter the 6-digit code." }, 400);

  const email = `p${phone.slice(1)}@phone.cosora.invalid`;

  // 1. Create the account for a new number. For a number seen before, the
  //    placeholder email already exists (email_exists). phone_exists means the
  //    number belongs to an account this function did not create: refuse.
  const created = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      email_confirm: true,
      phone,
      phone_confirm: true,
      user_metadata: cleanMeta(body.data, phone),
      // app_metadata is not writable by users: it proves this function made it.
      app_metadata: { created_by: CREATED_BY },
    }),
  });
  const isNew = created.ok;
  if (!isNew) {
    const err = await created.json().catch(() => ({}));
    const kind = String(err.error_code ?? err.msg ?? "");
    if (created.status === 422 && /phone_exists|phone.*registered/i.test(kind)) {
      return json({ status: "error", message: "This number is linked to an account that signs in another way." }, 403);
    }
    if (!(created.status === 422 && /email_exists|email.*registered/i.test(kind))) {
      return json({ status: "error", message: `Could not create the account (${created.status}).` }, 502);
    }
  }

  // 2. A one-time token for that account. Generated here, so no email is sent.
  const linkRes = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!linkRes.ok) return json({ status: "error", message: `Could not start the session (${linkRes.status}).` }, 502);
  const link = await linkRes.json();
  const userId: string | undefined = link.id ?? link.user?.id;
  const linkEmail: string | undefined = link.email ?? link.user?.email;
  const tokenHash: string | undefined = link.hashed_token ?? link.properties?.hashed_token;
  const createdBy = (link.app_metadata ?? link.user?.app_metadata)?.created_by;
  if (!userId || !tokenHash || linkEmail !== email) {
    return json({ status: "error", message: "Could not start the session." }, 502);
  }
  // An account holding the placeholder address that this function did not
  // create (e.g. an email signup that claimed it first) is not the number's.
  if (createdBy !== CREATED_BY) {
    return json({ status: "error", message: "This number can't sign in this way." }, 403);
  }

  // 3. Never hand out an admin session through this path. Fails closed.
  if (!(await confirmedNotAdmin(userId))) {
    return json({ status: "error", message: "This number can't sign in this way." }, 403);
  }

  // 4. For a new account, clear the placeholder address from the profile.
  if (isNew) {
    await admin(`/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ email: null }),
    });
  }

  // 5. Redeem the token for a real session, as the anon client would.
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  if (!verifyRes.ok) return json({ status: "error", message: `Could not start the session (${verifyRes.status}).` }, 502);
  const session = await verifyRes.json();
  if (!session.access_token || !session.refresh_token) {
    return json({ status: "error", message: "Could not start the session." }, 502);
  }

  return json({
    status: "verified",
    is_new: isNew,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
});
