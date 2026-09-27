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
// DUMMY OTP (2026-09-27, Mitra: "just typing any otp for now should let me log
//   in"). When the send is refused as above, sendOtp() asks the
//   `otp-dev-verify` edge function whether test mode is on. If it is, the send
//   returns { status: "test_mode" }, the code screen says no SMS was sent and
//   any 6 digits work, and verifyOtp() gets the session from that function
//   instead of Supabase's verify. It is a sign-in bypass by design, logged in
//   documentation/securityflags.md; turning it off (OTP_DEV_BYPASS=off) brings
//   back "not_live". Once real SMS is live the send succeeds, this branch is
//   never reached, and the function should be deleted.
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
  /** Nothing was sent, and the dummy OTP is on: any 6 digits sign in. The UI must say so. */
  | { status: "test_mode"; message: string }
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

export const OTP_TEST_MODE_MESSAGE =
  "SMS delivery isn't live yet, so no code was sent. For now, type any 6 digits to continue.";

const DUMMY_OTP_FUNCTION = "otp-dev-verify";

/** Whether the dummy OTP is switched on (the function answers, not a flag here). */
async function dummyOtpEnabled(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke(DUMMY_OTP_FUNCTION, { body: { action: "status" } });
  return !error && data?.enabled === true;
}

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
    result = (await dummyOtpEnabled())
      ? { status: "test_mode", message: OTP_TEST_MODE_MESSAGE }
      : { status: "not_live", message: OTP_NOT_LIVE_MESSAGE };
  } else if (error.code === "over_sms_send_rate_limit" || /rate limit/i.test(error.message)) {
    result = { status: "error", message: "Too many codes requested for this number. Please wait a minute and try again." };
  } else {
    result = { status: "error", message: error.message };
  }
  lastSend.set(phone, result.status);
  return result;
}

export interface VerifyOtpOptions {
  /**
   * What the send did, from the code screen's state (which survives a reload,
   * unlike `lastSend`).
   */
  delivery?: SendOtpResult["status"];
  /** Signup metadata, for a new account created by the dummy OTP. */
  signupData?: Record<string, string>;
}

/** Check `code` for `phone`. On success a real Supabase session exists. */
export async function verifyOtp(phone: string, code: string, options: VerifyOtpOptions = {}): Promise<VerifyOtpResult> {
  const delivery = options.delivery ?? lastSend.get(phone);
  if (delivery === "not_live") {
    return { status: "not_live", message: OTP_NOT_LIVE_MESSAGE };
  }
  if (delivery === "test_mode") return verifyDummyOtp(phone, code, options.signupData);

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

/** The dummy OTP: the edge function accepts any 6 digits and returns a session. */
async function verifyDummyOtp(phone: string, code: string, signupData?: Record<string, string>): Promise<VerifyOtpResult> {
  const { data, error } = await supabase.functions.invoke(DUMMY_OTP_FUNCTION, {
    body: { action: "verify", phone, code, data: signupData },
  });
  if (error) {
    // A refusal carries its reason in the response body.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    if (body?.status === "disabled") return { status: "not_live", message: OTP_NOT_LIVE_MESSAGE };
    if (body?.status === "invalid") return { status: "invalid", message: body.message };
    return { status: "error", message: body?.message ?? "Couldn't sign you in. Please try again." };
  }
  if (data?.status !== "verified" || !data.access_token || !data.refresh_token) {
    return { status: "error", message: "Couldn't sign you in. Please try again." };
  }
  const { data: set, error: setError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (setError || !set.session || !set.user) {
    return { status: "error", message: setError?.message ?? "Couldn't sign you in. Please try again." };
  }
  return { status: "verified", user: set.user, session: set.session };
}
