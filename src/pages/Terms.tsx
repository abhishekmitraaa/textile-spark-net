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
import { MarketingOptIn } from "@/components/MarketingOptIn";
import { NO_CHOICE, saveMarketingOptIns, type MarketingChoice } from "@/lib/marketingConsent";

// The "I agree" tick, kept in this tab for this version of the Terms (review L-60): reading the full Terms and coming
// back used to clear it. It is only the box on screen; acceptance is recorded by accept_buyer_terms when Continue is
// pressed.
// It is the account's own (code review: a tick left in the tab must never stand for the next person who signs up in
// it), and it is cleared once the Terms are accepted.
const AGREED_KEY = `cosora.termsTicked.${BUYER_TERMS_VERSION}`;
const readTicked = (uid: string | undefined) => {
  try { return Boolean(uid) && sessionStorage.getItem(AGREED_KEY) === uid; } catch { return false; }
};
const writeTicked = (uid: string | undefined, on: boolean) => {
  try { if (on && uid) sessionStorage.setItem(AGREED_KEY, uid); else sessionStorage.removeItem(AGREED_KEY); } catch { /* private mode */ }
};

const Terms = () => {
  const navigate = useNavigate();
  const back = useStepBack("/auth/interest-preference");
  const { refreshProfile, user } = useAuth();
  const uid = user?.id;
  const [agreed, setAgreedState] = useState(() => readTicked(uid));
  const setAgreed = (on: boolean) => { setAgreedState(on); writeTicked(uid, on); };
  const [saving, setSaving] = useState(false);
  // Offers by WhatsApp and email (Mitra, 2026-11-24): two boxes, never ticked for you, saved with "signup" once the
  // Terms are accepted.
  const [offers, setOffers] = useState<MarketingChoice>(NO_CHOICE);

  // Accepting is the last sign-up step: the database records which Terms were accepted and when, and only then is the
  // account onboarded (accept_buyer_terms; buyer sign-up audit item 5).
  const accept = async () => {
    if (!agreed || saving) return;
    setSaving(true);
    try {
      await acceptBuyerTerms();
      writeTicked(uid, false);
      // The account is finished by now; a refused opt-in mustn't undo that, so it is said and sign-up goes on.
      try {
        await saveMarketingOptIns(offers, "signup");
      } catch {
        toast.error("Couldn't save your choice about offers", { description: "You can switch offers on in Profile › Notifications." });
      }
      await refreshProfile("row"); // only onboarded and terms_version changed (review L-64)
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
          <p className="mt-3 text-xs leading-relaxed text-gray-600" data-no-translate>{TERMS_INTRO}</p>
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

        <MarketingOptIn value={offers} onChange={setOffers} tone="dark" idPrefix="signup-offers" className="mb-4" />

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