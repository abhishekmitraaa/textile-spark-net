import { ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useUserRole } from "@/contexts/UserRoleContext";
import { routeSide } from "@/lib/sellerRoutes";
import BuyerTopBar from "./BuyerTopBar";
import ToTopButton from "./ToTopButton";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import BuyerSignupGate from "@/components/auth/BuyerSignupGate";

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
 *  - BuyerSignupGate: an account that hasn't finished buyer sign-up is sent back to it (switch buyer_signup_required)
 *
 * Desktop has no sidebar in the buyer experience by design — the
 * BuyerTopBar's drawer covers secondary navigation instead, so content
 * gets the full viewport width up to its own max-w containers.
 */
export default function BuyerShell({ children }: BuyerShellProps) {
  const { pathname } = useLocation();
  const { role, setRole, vendorRegistered } = useUserRole();

  // The address decides the side (SH-004): a buyer page shows the buyer menu, also after Forward from a seller page.
  // Only for a registered seller, as the switch itself (MPF-22): anyone else would be moved to the buyer side and never
  // moved back, since DashboardLayout claims the seller side for registered sellers only.
  useEffect(() => {
    if (routeSide(pathname) === "buyer" && role === "seller" && vendorRegistered) setRole("buyer");
  }, [pathname, role, vendorRegistered, setRole]);

  return (
    <BuyerSignupGate>
      <div className="min-h-screen bg-white">
        <BuyerTopBar />
        <main className="pb-20 lg:pb-10">
          {children}
        </main>
        <MobileBottomNav />
        <ToTopButton />
      </div>
    </BuyerSignupGate>
  );
}