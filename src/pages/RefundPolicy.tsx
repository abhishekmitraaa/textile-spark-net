import { ArrowLeft } from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { LegalFooter } from "@/components/LegalFooter";
import { PolicyBody } from "@/components/PolicyBody";
import { REFUND_INTRO, REFUND_LAST_UPDATED, REFUND_SECTIONS } from "@/data/refundPolicy";
import { useStepBack } from "@/hooks/useStepBack";
import { useHomePath } from "@/hooks/useHomePath";

// /refund-policy (Mitra, 2026-11-24). The text is src/data/refundPolicy.ts.

const RefundPolicy = () => {
  const homePath = useHomePath();
  const goBack = useStepBack(homePath);

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={goBack} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Refund &amp; Cancellation Policy</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-28">
        <p className="text-xs text-gray-400">Last updated: <span data-no-translate>{REFUND_LAST_UPDATED}</span></p>
        <p className="mt-3 text-sm leading-relaxed text-gray-700" data-no-translate>{REFUND_INTRO}</p>
        <PolicyBody sections={REFUND_SECTIONS} />
        <LegalFooter className="mt-10" />
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default RefundPolicy;
