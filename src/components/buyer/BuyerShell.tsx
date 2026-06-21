import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp } from "lucide-react";
import BuyerTopBar from "./BuyerTopBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

interface BuyerShellProps {
  children: ReactNode;
}

/**
 * Page frame for all buyer-side routes.
 *
 * This intentionally does NOT use DashboardLayout / DashboardHeader —
 * those are vendor-branded (vendor logo, vendor sidebar, vendor search
 * copy) and rendering them on buyer pages produced a duplicate top bar
 * (DashboardHeader stacked above BuyerTopBar).
 *
 * BuyerShell owns:
 *  - BuyerTopBar (logo, search, bookmark, drawer) — sticky, one instance
 *  - Page content area with correct top/bottom padding for the fixed
 *    bottom nav on mobile
 *  - MobileBottomNav (already role-aware; reused as-is)
 *  - ToTop button (global pattern per buyer-side documentation Section 1.3:
 *    "appears on all pages when user scrolls down")
 *
 * Desktop has no sidebar in the buyer experience by design — the
 * BuyerTopBar's drawer covers secondary navigation instead, so content
 * gets the full viewport width up to its own max-w containers.
 */
export default function BuyerShell({ children }: BuyerShellProps) {
  return (
    <div className="min-h-screen bg-white">
      <BuyerTopBar />
      <main className="pb-20 lg:pb-10">
        {children}
      </main>
      <MobileBottomNav />
      <ToTopButton />
    </div>
  );
}

function ToTopButton() {
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