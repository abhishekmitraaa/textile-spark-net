import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, FileText, MessageCircle, X } from "lucide-react";

interface ProductChatOptionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Existing behaviour: straight into the direct chat thread with the vendor. */
  onChatDirectly: () => void;
  /** Opens the product-scoped Request Quotation form. */
  onRequestQuotation: () => void;
  vendorName: string;
}

const OPTIONS = [
  {
    key: "chat" as const,
    icon: MessageCircle,
    title: "Chat Directly",
    desc: "Open a conversation and ask anything.",
  },
  {
    key: "quote" as const,
    icon: FileText,
    title: "Request Quotation",
    desc: "Send sizes, quantity and budget for this product.",
  },
];

/**
 * Two-way chooser shown when the buyer taps Chat on a product page. Mirrors the
 * overlay/sheet motion of QuickRfqModal so both bottom sheets feel identical.
 */
export default function ProductChatOptionsSheet({
  isOpen,
  onClose,
  onChatDirectly,
  onRequestQuotation,
  vendorName,
}: ProductChatOptionsSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="How would you like to contact this vendor?"
            className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900">Contact vendor</h2>
                <p className="truncate text-xs text-gray-500">{vendorName}</p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1 transition-colors hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-2 px-5 py-5">
              {OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={o.key === "chat" ? onChatDirectly : onRequestQuotation}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3.5 text-left transition-colors hover:border-[#ef4d62]/40 hover:bg-[#ef4d62]/5 active:scale-[0.99]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ef4d62]/10">
                    <o.icon className="h-4 w-4 text-[#ef4d62]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-900">{o.title}</span>
                    <span className="block text-xs text-gray-500">{o.desc}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
