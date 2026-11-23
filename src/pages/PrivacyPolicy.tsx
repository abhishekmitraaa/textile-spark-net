import { ArrowLeft } from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { LegalFooter } from "@/components/LegalFooter";
import { PolicyBody } from "@/components/PolicyBody";
import { CLARITY_ENABLED } from "@/lib/analytics/clarity";
import { PRIVACY_CLARITY_SECTION, PRIVACY_INTRO, PRIVACY_LAST_UPDATED, PRIVACY_SECTIONS } from "@/data/privacyPolicy";
import { useStepBack } from "@/hooks/useStepBack";
import { useHomePath } from "@/hooks/useHomePath";

// Cosora Privacy Policy. The text is src/data/privacyPolicy.ts (rewritten 2026-11-24 to name the company and how
// Cosora contacts people); every statement must stay true of the code. The Clarity section shows only while Clarity
// runs, after Analytics, as on the Terms page.

const PrivacyPolicy = () => {
  const homePath = useHomePath();
  const goBack = useStepBack(homePath);
  const sections = CLARITY_ENABLED
    ? PRIVACY_SECTIONS.flatMap((s) => (s.id === "analytics" ? [s, PRIVACY_CLARITY_SECTION] : [s]))
    : PRIVACY_SECTIONS;

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={goBack} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Privacy Policy</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-28">
        <p className="text-xs text-gray-400">Last updated: <span data-no-translate>{PRIVACY_LAST_UPDATED}</span></p>
        <p className="mt-3 text-sm leading-relaxed text-gray-700" data-no-translate>{PRIVACY_INTRO}</p>
        <PolicyBody sections={sections} />
        <LegalFooter className="mt-10" />
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default PrivacyPolicy;
