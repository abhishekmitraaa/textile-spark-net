import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp } from "lucide-react";

/**
 * Floating "scroll to top" button, shared across buyer surfaces.
 *
 * Lives in BuyerShell (so every shell-wrapped page gets it) AND is dropped
 * directly onto pages that render their own frame instead of BuyerShell —
 * e.g. SearchResults — so the affordance is identical everywhere per the
 * buyer-side pattern ("appears on all pages when the user scrolls down").
 */
export default function ToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
          className="fixed bottom-24 lg:bottom-10 right-4 lg:right-8 z-40 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center hover:shadow-xl hover:border-gray-300 transition-shadow"
        >
          <ChevronUp className="w-5 h-5 lg:w-6 lg:h-6 text-gray-700" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
