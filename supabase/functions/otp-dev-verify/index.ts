// Supabase Edge Function: otp-dev-verify
//
// TEMPORARY TEST-MODE sign-in for mobile + OTP, used only while SMS delivery is
// not live (no SMS provider, and the in-house OTP API is not integrated). It
// ACCEPTS ANY 6-DIGIT CODE and returns a real Supabase session for the typed
// number, so the flow after the code screen (role selection, onboarding, RLS)
// can be used end to end today.
//
// This is an authentication bypass BY DESIGN. While it is on, anyone who types
// a phone number is signed in as that number's account. It is logged as an open
// High flag in documentation/securityflags.md. Turn it off before real users
// depend on phone accounts:
//   - set the secret OTP_DEV_BYPASS=off (takes effect at once, no redeploy), or
//   - set ENABLED = false below and redeploy, or delete the function.
// When it is off, `status` reports enabled:false and the app falls back to its
// honest "SMS delivery isn't live yet" state.
//
// Only src/lib/auth/otp.ts calls this function. The client says "test mode, any
// code is accepted" on the code screen, so nothing claims an SMS was sent.
//
// How a phone number becomes a session:
//   - Each number maps to one auth user, keyed by the placeholder email
//     p<digits>@phone.cosora.invalid. `.invalid` is reserved (RFC 2606), so no
//     mail can ever go there. auth.users.phone is set too.
//   - For a new number, the user is created confirmed. Only whitelisted signup
//     metadata is kept, and handle_new_user() applies it as for any signup. The
//     placeholder address is then cleared from profiles.email.
//   - A magic-link token is generated server-side (no email is sent) and
//     redeemed at once for a session, which goes back to the browser.
//   - It refuses any account with is_admin = true, so this path can never
//     produce an admin session.
//
// This is also the shape of integration option (B) in otp.ts. To wire the
// in-house API that way, replace the "any 6 digits" check with a
// server-to-server check against that API. Everything else stays.
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

const E164 = /^\+[1-9]\d{7,14}$/;
const CODE = /^\d{6}$/;
// The only metadata a caller may set. handle_new_user() whitelists active_role
// to buyer/seller itself. is_admin is not a metadata key and is never read.
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

  // 1. Create the account for a new number. An existing one answers 422.
  const created = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      email_confirm: true,
      phone,
      phone_confirm: true,
      user_metadata: cleanMeta(body.data, phone),
    }),
  });
  const isNew = created.ok;
  if (!created.ok && created.status !== 422) {
    return json({ status: "error", message: `Could not create the account (${created.status}).` }, 502);
  }

  // 2. A one-time token for that account. Generated here, so no email is sent.
  const linkRes = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!linkRes.ok) return json({ status: "error", message: `Could not start the session (${linkRes.status}).` }, 502);
  const link = await linkRes.json();
  const userId: string | undefined = link.id ?? link.user?.id;
  const tokenHash: string | undefined = link.hashed_token ?? link.properties?.hashed_token;
  if (!userId || !tokenHash) return json({ status: "error", message: "Could not start the session." }, 502);

  // 3. Never hand out an admin session through this path.
  const profRes = await admin(`/rest/v1/profiles?id=eq.${userId}&select=is_admin`);
  const prof = profRes.ok ? await profRes.json() : [];
  if (Array.isArray(prof) && prof[0]?.is_admin === true) {
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
