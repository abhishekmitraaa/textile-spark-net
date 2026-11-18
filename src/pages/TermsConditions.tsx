
import { ArrowLeft } from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { CLARITY_ENABLED } from "@/lib/analytics/clarity";
import { TERMS_ANALYTICS_NOTICE as ANALYTICS_NOTICE, TERMS_EFFECTIVE_DATE as EFFECTIVE_DATE, TERMS_INTRO as INTRO } from "@/data/terms";
import TermsClauses from "@/components/TermsClauses";
import { useStepBack } from "@/hooks/useStepBack";
import { useHomePath } from "@/hooks/useHomePath";

// Cosora Terms & Conditions (buyer-facing, linked from My Profile and the sign-up Terms card).
// The text is src/data/terms.ts; rendered as a readable legal document.

const TermsConditions = () => {
  const homePath = useHomePath();
  const goBack = useStepBack(homePath);

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={goBack} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Terms &amp; Conditions</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-28">
        <p className="text-xs text-gray-400">Effective Date: {EFFECTIVE_DATE}</p>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{INTRO}</p>

        <TermsClauses className="mt-6" />

        <section id="analytics" className="mt-8 border-t border-gray-100 pt-5">
          <h2 className="text-sm font-bold text-gray-900">{ANALYTICS_NOTICE.heading}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{ANALYTICS_NOTICE.events}</p>
          {CLARITY_ENABLED &&
            ANALYTICS_NOTICE.clarity.map((p, i) => (
              <p key={i} className="mt-2 text-sm leading-relaxed text-gray-700">{p}</p>
            ))}
        </section>

        <p className="mt-8 text-sm leading-relaxed text-gray-600 border-t border-gray-100 pt-5">
          By using Cosora, you acknowledge that you have read, understood, and agree to be bound by these Terms &amp; Conditions.
        </p>
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default TermsConditions;
