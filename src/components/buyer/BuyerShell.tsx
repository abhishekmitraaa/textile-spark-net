import { ReactNode } from "react";
import BuyerTopBar from "./BuyerTopBar";
import ToTopButton from "./ToTopButton";
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