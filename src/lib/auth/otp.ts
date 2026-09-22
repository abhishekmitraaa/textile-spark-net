import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// THE ONE SEAM for mobile-number OTP. Sending and verifying a code happen
// here and nowhere else. Login.tsx, Register.tsx and OtpVerify.tsx call
// sendOtp()/verifyOtp(). No other file may call supabase.auth.signInWithOtp or
// supabase.auth.verifyOtp; `grep -rn "auth.signInWithOtp\|auth.verifyOtp" src`
// must only ever find this file.
//
// WHAT IT DOES TODAY (interim, honest stub)
//   Both functions call Supabase's own phone auth: signInWithOtp({ phone }) and
//   verifyOtp({ phone, token, type: "sms" }). That is the mechanism that makes
//   verifyOtp() establish a real Supabase session, so auth.uid(), RLS,
//   handle_new_user() and AuthContext work unchanged. This project has NO SMS
//   provider, so the send is refused with `phone_provider_disabled`. That
//   refusal comes back as { status: "not_live" } and the UI says, in plain
//   words, that no code was sent. Nothing here ever claims a code was sent
//   unless the server accepted the send. The "not live" state is read from the
//   server's answer, not from a flag, so there is no switch for anyone to
//   forget to flip.
//
// TODO(otp-integration): the in-house OTP/verification API plugs in HERE.
//   Decision still open, to be settled on integration day:
//
//   (A) The custom API is only the SMS SENDER.
//       Supabase still generates, stores and verifies the code and issues the
//       session. Configure Auth → Hooks → "Send SMS hook" to call the custom
//       API (an HTTP endpoint, or a Postgres function forwarding to it) and
//       enable the Phone provider. THIS FILE DOES NOT CHANGE: signInWithOtp()
//       starts succeeding and returns { status: "sent" }, and verifyOtp()
//       establishes the session as it already does.
//
//   (B) The custom API generates AND verifies the code itself.
//       Supabase never sees the code, so something trusted must mint the
//       session after the API says "valid". That means an edge function
//       (e.g. `otp-verify`): the client sends { phone, code }, the function
//       checks the code with the custom API server-to-server, then
//       finds/creates the auth.users row for that phone (with the signup
//       metadata, so handle_new_user() still runs) and returns a session. The
//       client applies it with supabase.auth.setSession(). Then sendOtp() calls
//       the custom API's send endpoint (via an edge function, so its secret
//       never reaches the browser), and verifyOtp() calls the `otp-verify`
//       function and then setSession(). The result types below stay the same,
//       so no caller changes.
//
//   Neither is implemented. Do not add a third path. Whichever is chosen
//   replaces the two Supabase calls in this file and nothing else.
// ─────────────────────────────────────────────────────────────

export const OTP_LENGTH = 6;

export type SendOtpResult =
  /** The server accepted the send. Only this state may say "code sent". */
  | { status: "sent" }
  /** No SMS delivery exists yet, so nothing was sent. The UI must say so. */
  | { status: "not_live"; message: string }
  | { status: "error"; message: string };

export type VerifyOtpResult =
  /** A real Supabase session now exists (AuthContext picks it up). */
  | { status: "verified"; user: User; session: Session }
  /** No code was ever sent to this number, so there is nothing to verify. */
  | { status: "not_live"; message: string }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export interface SendOtpOptions {
  /**
   * user_metadata for a NEW account (Register.tsx passes signupMetadata()).
   * handle_new_user() reads full_name / phone / active_role from it, and
   * applyPendingSignupProfile() reads brand_name. Ignored for an existing number.
   */
  signupData?: Record<string, string>;
}

export const OTP_NOT_LIVE_MESSAGE =
  "SMS delivery isn't live yet, so no code has been sent to this number. " +
  "Mobile sign-in will work once it is. For now, continue with Google or explore as a guest.";

/**
 * What the last send for each number actually did. It lets verifyOtp() say
 * "nothing was sent" instead of a misleading "code expired". It is memory
 * only, so after a reload verifyOtp() simply asks the server.
 */
const lastSend = new Map<string, SendOtpResult["status"]>();

/** Send a one-time code to `phone` (E.164, e.g. "+919876543210"). */
export async function sendOtp(phone: string, options: SendOtpOptions = {}): Promise<SendOtpResult> {
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: {
      channel: "sms",
      shouldCreateUser: true,
      // handle_new_user() takes profiles.phone from metadata, not from
      // auth.users.phone, so the number rides along even on a bare Login.
      data: { phone, ...options.signupData },
    },
  });

  let result: SendOtpResult;
  if (!error) result = { status: "sent" };
  else if (error.code === "phone_provider_disabled" || /unsupported phone provider/i.test(error.message)) {
    result = { status: "not_live", message: OTP_NOT_LIVE_MESSAGE };
  } else if (error.code === "over_sms_send_rate_limit" || /rate limit/i.test(error.message)) {
    result = { status: "error", message: "Too many codes requested for this number. Please wait a minute and try again." };
  } else {
    result = { status: "error", message: error.message };
  }
  lastSend.set(phone, result.status);
  return result;
}

/** Check `code` for `phone`. On success a real Supabase session exists. */
export async function verifyOtp(phone: string, code: string): Promise<VerifyOtpResult> {
  if (lastSend.get(phone) === "not_live") {
    return { status: "not_live", message: OTP_NOT_LIVE_MESSAGE };
  }

  const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });

  if (error) {
    if (error.code === "otp_expired" || /expired or is invalid/i.test(error.message)) {
      return { status: "invalid", message: "That code is wrong or has expired. Check it, or request a new one." };
    }
    return { status: "error", message: error.message };
  }
  if (!data.session || !data.user) {
    return { status: "error", message: "The code was accepted but no session was returned. Please try again." };
  }
  return { status: "verified", user: data.user, session: data.session };
}
