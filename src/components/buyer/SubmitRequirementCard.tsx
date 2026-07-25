import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { FileText, Zap, ClipboardList, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────
// Shared "Looking for products? → Submit Requirement" card.
// Single source of truth for the design used on Search Results
// (Brand tab / empty state), the New Arrivals feed, For You, etc.
// Visual language = the Search-Results brand section: rounded card
// with coral corner accents, centred heading, full-width coral CTA,
// and a "Get quotes from verified manufacturers" caption.
//
// Pass `onQuickRfq` to also render the quick-action rows
// (Quick RFQ / Create New Requirement / My Previous Quotes).
// ─────────────────────────────────────────────────────────────

export default function SubmitRequirementCard({
  onQuickRfq,
  className,
}: {
  onQuickRfq?: () => void;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const t = useT();

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 text-center lg:p-8", className)}>
      {/* Coral corner accents */}
      <span className="pointer-events-none absolute top-0 left-0 border-t-[28px] border-r-[28px] border-t-[#ef4d62] border-r-transparent" />
      <span className="pointer-events-none absolute top-0 right-0 border-t-[28px] border-l-[28px] border-t-[#ef4d62] border-l-transparent" />

      {/* On desktop the quick-action variant splits into two columns (intro |
          actions) so it fills the width instead of a tall left-aligned stack. */}
      <div className={cn(onQuickRfq && "lg:grid lg:grid-cols-2 lg:items-center lg:gap-8 lg:text-left")}>
        <div className={cn(onQuickRfq && "lg:flex lg:flex-col lg:justify-center")}>
          <h3 className="mt-1 mb-4 text-lg font-bold text-gray-900">{t("Looking for products?")}</h3>

          <Link to="/requirement/post-requirement" className="block">
            <motion.span
              whileTap={reduced ? undefined : { scale: 0.98 }}
              className="block w-full rounded-xl bg-[#ef4d62] py-3 text-center text-sm font-bold text-white transition-colors hover:bg-[#ef4d62]/90"
            >
              {t("Submit Requirement")}
            </motion.span>
          </Link>

          <p className="mt-3 inline-flex items-center gap-1 text-xs text-gray-400 lg:self-start">
            <FileText className="h-3.5 w-3.5" /> {t("Get quotes from verified manufacturers")}
          </p>
        </div>

      {/* Optional quick-action rows (feed contexts) */}
      {onQuickRfq && (
        <div className="mt-4 border-t border-gray-100 pt-1 text-left lg:mt-0 lg:border-t-0 lg:border-l lg:border-gray-100 lg:pl-8 lg:pt-0">
          <button onClick={onQuickRfq} className="flex w-full items-center justify-between border-b border-gray-100 py-2.5 text-left">
            <div className="flex items-center gap-2.5">
              <Zap className="h-4 w-4 shrink-0 fill-[#ef4d62] text-[#ef4d62]" />
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-gray-900">Quick RFQ</p>
                  <span className="rounded bg-[#ef4d62]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ef4d62]">Fast</span>
                </div>
                <p className="text-xs text-gray-400">Just upload an image + quantity. Get quotes in minutes!</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
          </button>

          <Link to="/requirement/post-requirement" className="flex items-center justify-between border-b border-gray-100 py-2.5">
            <div className="flex items-center gap-2.5">
              <ClipboardList className="h-4 w-4 shrink-0 text-blue-500" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Create New Requirement</p>
                <p className="text-xs text-gray-400">Detailed specifications for precise quotes</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
          </Link>

          <Link to="/requirement/my-quotes" className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 shrink-0 text-gray-500" />
              <p className="text-sm font-semibold text-gray-900">My Previous Quotes</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
          </Link>
        </div>
      )}
      </div>
    </div>
  );
}
