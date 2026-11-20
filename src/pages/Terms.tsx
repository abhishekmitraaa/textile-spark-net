import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errorMessage";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import SignupHeader from "@/components/auth/SignupHeader";
import { useStepBack } from "@/hooks/useStepBack";
import TermsClauses from "@/components/TermsClauses";
import { useAuth } from "@/contexts/AuthContext";
import { TERMS_EFFECTIVE_DATE, TERMS_INTRO } from "@/data/terms";
import { acceptBuyerTerms, isStaleTerms, BUYER_TERMS_VERSION } from "@/lib/buyerTerms";
import { finishAuthFlow } from "@/lib/authHistory";

// The "I agree" tick, kept in this tab for this version of the Terms (review L-60): reading the full Terms and coming
// back used to clear it. It is only the box on screen; acceptance is recorded by accept_buyer_terms when Continue is
// pressed.
const AGREED_KEY = `cosora.termsTicked.${BUYER_TERMS_VERSION}`;
const readTicked = () => { try { return sessionStorage.getItem(AGREED_KEY) === "1"; } catch { return false; } };
const writeTicked = (on: boolean) => {
  try { if (on) sessionStorage.setItem(AGREED_KEY, "1"); else sessionStorage.removeItem(AGREED_KEY); } catch { /* private mode */ }
};

const Terms = () => {
  const navigate = useNavigate();
  const back = useStepBack("/auth/interest-preference");
  const { refreshProfile } = useAuth();
  const [agreed, setAgreedState] = useState(readTicked);
  const setAgreed = (on: boolean) => { setAgreedState(on); writeTicked(on); };
  const [saving, setSaving] = useState(false);

  // Accepting is the last sign-up step: the database records which Terms were accepted and when, and only then is the
  // account onboarded (accept_buyer_terms; buyer sign-up audit item 5).
  const accept = async () => {
    if (!agreed || saving) return;
    setSaving(true);
    try {
      await acceptBuyerTerms();
      await refreshProfile();
    } catch (e) {
      setSaving(false);
      if (isStaleTerms(e)) toast.error("These Terms have changed. Reload the page to read the new version.");
      else toast.error("Couldn't finish signing up", { description: errorMessage(e) });
      return;
    }
    // Back to where sign-in started, replaced by Welcome: one back from Home leaves sign-up behind (audit item 8).
    await finishAuthFlow(navigate, "/auth/welcome");
  };

  return (
    <div className="h-[100dvh] bg-brand-buyer-deep flex flex-col p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 min-h-0 flex flex-col max-w-sm mx-auto w-full"
      >
        {/* Back, the COSORA wordmark and the step (review L-57) */}
        <SignupHeader onBack={back} dark className="mb-4" />

        {/* T&C white card */}
        <div className="flex-1 min-h-0 bg-white rounded-2xl p-5 overflow-y-auto mb-4">
          <p className="font-bold text-gray-900 text-base">Terms &amp; Conditions</p>
          <p className="mt-1 text-xs text-gray-400">Effective Date: {TERMS_EFFECTIVE_DATE}</p>
          <p className="mt-3 text-xs leading-relaxed text-gray-600">{TERMS_INTRO}</p>
          <TermsClauses compact className="mt-4" />
        </div>

        {/* Agree checkbox */}
        <div className="flex items-center gap-2.5 mb-4">
          <input
            id="terms-agree"
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            aria-label="I agree to the Terms & Conditions and Privacy Policy"
            className="w-4 h-4 accent-white shrink-0 cursor-pointer"
          />
          <span className="text-sm text-white">
            <label htmlFor="terms-agree" className="cursor-pointer">I agree to</label>{" "}
            <Link to="/terms" className="underline font-semibold">Terms &amp; Conditions</Link> and{" "}
            <Link to="/privacy" className="underline font-semibold">Privacy Policy</Link>
          </span>
        </div>

        <button
          onClick={accept}
          disabled={!agreed || saving}
          className={cn(
            "w-full py-3.5 text-sm font-bold rounded-xl transition-colors",
            agreed && !saving
              ? "bg-white text-brand-buyer-deep hover:bg-white/90"
              : "bg-white/30 text-white/50 cursor-not-allowed"
          )}
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </motion.div>
    </div>
  );
};

export default Terms;