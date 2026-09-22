import { useState, useEffect } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, MessageSquareOff } from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/contexts/UserRoleContext";
import { cn } from "@/lib/utils";
import CosoraLogo from "@/components/CosoraLogo";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/lib/supabase";
import { applyPendingSignupProfile } from "@/lib/queries/signupProfile";
import { maskPhone } from "@/lib/auth/phone";
import { sendOtp, verifyOtp, OTP_LENGTH, type SendOtpResult } from "@/lib/auth/otp";

// ─────────────────────────────────────────────────────────────
// Step 2 of mobile + OTP sign-in / signup: enter the code.
//
// Restored from the pre-email OtpVerify.tsx (same layout: masked number,
// "Not You?", expiry timer, Previous/Next bar lifted above the keyboard). What
// changed is everything that used to be fake:
//   - the old screen accepted ANY six digits and navigated with no session;
//     now the code goes through verifyOtp() in src/lib/auth/otp.ts, and only a
//     real Supabase session moves you on;
//   - it always said "You will receive an OTP", even though nothing was ever
//     sent. Now it shows that line and the expiry timer only when the server
//     accepted the send. Otherwise it says SMS delivery is not live.
//   - with no navigation state it fell back to a hardcoded number; now it goes
//     back to sign-in.
// ─────────────────────────────────────────────────────────────

export interface OtpVerifyState {
  /** National digits as typed, for display. */
  phone: string;
  countryCode: string;
  /** E.164, what the seam is called with. */
  e164: string;
  /** What the send on the previous screen actually did. */
  delivery: SendOtpResult;
  /** Present when this came from Register.tsx: the account being created. */
  signup?: { role: "buyer" | "seller"; data: Record<string, string> };
}

const RESEND_SECONDS = 57;

// Height of the on-screen keyboard (number pad), via the VisualViewport API.
// Lets us lift a fixed bottom action bar above the keyboard so it stays
// visible/tappable while the user is entering the OTP.
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = window.innerHeight - vv.height - vv.offsetTop;
      setInset(kb > 24 ? kb : 0); // ignore tiny deltas (URL bar, etc.)
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

const OtpVerify = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setRole } = useUserRole();
  const state = location.state as OtpVerifyState | null;

  const [delivery, setDelivery] = useState<SendOtpResult | null>(state?.delivery ?? null);
  const [otp, setOtp] = useState("");
  const [timer, setTimer] = useState(state?.delivery.status === "sent" ? RESEND_SECONDS : 0);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyboardInset = useKeyboardInset();

  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer(t => Math.max(t - 1, 0)), 1000);
    return () => clearInterval(id);
  }, [timer]);

  // Arrived without a number (typed the URL, or reloaded and lost the state):
  // there is nothing to verify, so go back and ask for it.
  if (!state?.e164 || !delivery) return <Navigate to="/auth/login" replace />;

  const sent = delivery.status === "sent";
  const isComplete = otp.length === OTP_LENGTH;

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    setError(null);
    const next = await sendOtp(state.e164, { signupData: state.signup?.data });
    setResending(false);
    setDelivery(next);
    setOtp("");
    if (next.status === "sent") {
      setTimer(RESEND_SECONDS);
      toast.success("A new code is on its way");
    } else if (next.status === "error") {
      setError(next.message);
    }
    // not_live: the notice below already says it, and no toast claims otherwise.
  };

  const handleNext = async () => {
    if (!isComplete || verifying) return;
    setVerifying(true);
    setError(null);

    const result = await verifyOtp(state.e164, otp);
    if (result.status !== "verified") {
      setVerifying(false);
      setError(result.message);
      return;
    }

    // A real session exists now. Finish what signup captured (brand name).
    // It is idempotent and never throws, so the same call serves returning
    // users as well.
    await applyPendingSignupProfile(result.user);

    // Route by the profile row, as every other sign-in path does.
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_role, onboarded")
      .eq("id", result.user.id)
      .maybeSingle();
    setVerifying(false);

    const activeRole = profile?.active_role === "seller" ? "seller" : "buyer";
    setRole(activeRole);

    if (!profile?.onboarded) {
      // From Register the role is already chosen (handle_new_user applied it
      // from the signup metadata), so continue where Register used to send a
      // signed-in user. From Login a new number picks its role first.
      if (state.signup) navigate(activeRole === "seller" ? "/onboarding" : "/home/new-arrivals");
      else navigate("/auth/role-selection");
      return;
    }
    navigate(activeRole === "seller" ? "/seller-home" : "/home/new-arrivals");
  };

  const back = state.signup ? "/register" : "/auth/login";

  return (
    <div className="min-h-screen bg-white flex flex-col px-6 pt-10 pb-28">
      {/* COSORA wordmark */}
      <div className="flex justify-center mb-10">
        <CosoraLogo height={30} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col items-center max-w-sm mx-auto w-full text-center"
      >
        {sent ? (
          <p className="text-sm text-gray-600 leading-relaxed">
            You will receive an OTP (One Time Password) on your mobile number
          </p>
        ) : (
          <p className="text-sm text-gray-600 leading-relaxed">Enter the OTP (One Time Password) for</p>
        )}
        <div className="flex items-center justify-center gap-2 mt-2 mb-6">
          <span className="text-sm font-bold text-gray-900">{maskPhone(state.phone, state.countryCode)}</span>
          <button onClick={() => navigate(back)} className="text-sm font-semibold text-[#a4172c] hover:underline">
            Not You?
          </button>
        </div>

        {/* Delivery is not live: say so, before anyone waits for an SMS. */}
        {delivery.status === "not_live" && (
          <div
            data-testid="otp-delivery-not-live"
            className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left"
          >
            <MessageSquareOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs text-gray-700">
              <span className="font-semibold">No code was sent.</span> {delivery.message}
            </p>
          </div>
        )}
        {delivery.status === "error" && !error && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-left">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-xs text-gray-700">We couldn't send a code: {delivery.message}</p>
          </div>
        )}

        {/* OTP boxes */}
        <InputOTP
          maxLength={OTP_LENGTH}
          value={otp}
          onChange={(v) => { setOtp(v.replace(/\D/g, "")); setError(null); }}
          inputMode="numeric"
          autoFocus
          containerClassName="justify-center mb-4"
          aria-label="One-time code"
        >
          <InputOTPGroup className="gap-2">
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className={cn(
                  "w-9 h-11 text-lg font-bold rounded-lg border-0 border-b-2 first:border-l-0 first:rounded-l-lg last:rounded-r-lg",
                  otp[i] ? "border-[#a4172c] text-gray-900" : "border-gray-300 text-gray-400",
                )}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-left">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-xs text-gray-700">{error}</p>
          </div>
        )}

        {/* Timer: only a code that was really sent can expire. */}
        <p className="text-xs text-gray-400 mb-1">
          {sent && timer > 0
            ? <>The OTP will expire in <span className="font-semibold text-gray-600">{timer} seconds</span></>
            : (
              <button onClick={handleResend} disabled={resending} className="font-semibold text-[#a4172c] hover:underline disabled:opacity-60">
                {resending ? "Sending…" : sent ? "Resend OTP" : "Try sending the code again"}
              </button>
            )}
        </p>
      </motion.div>

      {/* Bottom nav buttons — pinned, and lifted above the keyboard when it opens */}
      <div
        data-testid="otp-action-bar"
        className="fixed left-0 right-0 bottom-0 z-30 bg-white/95 backdrop-blur border-t border-gray-100 px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] transition-[transform] duration-150 ease-out"
        style={{ transform: keyboardInset ? `translateY(-${keyboardInset}px)` : undefined }}
      >
        <div className="flex gap-3 max-w-sm mx-auto w-full">
          <button
            onClick={() => navigate(back)}
            className="flex-1 py-3.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl hover:bg-gray-200 transition-colors"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            disabled={!isComplete || verifying}
            className="flex-1 py-3.5 bg-[#a4172c] hover:bg-[#8c1325] disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
            {verifying ? "Verifying…" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OtpVerify;
