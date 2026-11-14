import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errorMessage";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import CosoraLogo from "@/components/CosoraLogo";
import { useStepBack } from "@/hooks/useStepBack";
import TermsClauses from "@/components/TermsClauses";
import { useAuth } from "@/contexts/AuthContext";
import { TERMS_EFFECTIVE_DATE, TERMS_INTRO } from "@/data/terms";
import { acceptBuyerTerms, isStaleTerms } from "@/lib/buyerTerms";

const Terms = () => {
  const navigate = useNavigate();
  const back = useStepBack("/auth/interest-preference");
  const { refreshProfile } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Accepting is the last sign-up step: the database records which Terms were accepted and when, and only then is the
  // account onboarded (accept_buyer_terms; buyer sign-up audit item 5). Welcome replaces this entry, so back from Home
  // never lands here.
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
    navigate("/auth/welcome", { replace: true });
  };

  return (
    <div className="h-[100dvh] bg-[#a4172c] flex flex-col p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 min-h-0 flex flex-col max-w-sm mx-auto w-full"
      >
        {/* Back, and the COSORA wordmark */}
        <div className="relative flex justify-center mb-4">
          <button type="button" onClick={back} aria-label="Back" className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1.5 p-1.5 rounded-full hover:bg-white/10">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <CosoraLogo height={30} variant="white" />
        </div>

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
            {/* Both open the Terms page: Cosora has no separate Privacy Policy yet (ToDo, counsel). */}
            <Link to="/terms" className="underline font-semibold">Terms &amp; Conditions</Link> and{" "}
            <Link to="/terms" className="underline font-semibold">Privacy Policy</Link>
          </span>
        </div>

        <button
          onClick={accept}
          disabled={!agreed || saving}
          className={cn(
            "w-full py-3.5 text-sm font-bold rounded-xl transition-colors",
            agreed && !saving
              ? "bg-white text-[#a4172c] hover:bg-white/90"
              : "bg-white/30 text-white/50 cursor-not-allowed"
          )}
        >
          {saving ? "Saving…" : "NEXT"}
        </button>
      </motion.div>
    </div>
  );
};

export default Terms;