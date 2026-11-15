import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useUserRole } from "@/contexts/UserRoleContext";
import { routeSide } from "@/lib/sellerRoutes";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardHeader } from "./DashboardHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { RegistrationBanner } from "@/components/vendor/RegistrationBanner";

interface DashboardLayoutProps {
  children: ReactNode;
  /**
   * "full-screen" locks the content area to exactly the space under the header,
   * drops the padding, and hides the mobile bottom nav — for pages that own
   * their own scrolling and need to sit flush against the bottom edge (the chat
   * thread, whose composer bar is pinned there). Everything else uses "default".
   */
  variant?: "default" | "full-screen";
  /** The publishing pages (upload, video, catalogue, ads, leads, quotes) show why a seller can't publish yet (SH-002). */
  registrationBanner?: boolean;
}

export const DashboardLayout = ({ children, variant = "default", registrationBanner = false }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fullScreen = variant === "full-screen";
  const { pathname } = useLocation();
  const { role, setRole, vendorRegistered } = useUserRole();

  // The address decides the side (SH-004): Back to a seller page after switching to Buyer shows the seller menu, not
  // this page inside the buyer's. Only for a registered seller (the switch's own rule); shared pages keep the side.
  useEffect(() => {
    if (routeSide(pathname) === "seller" && role === "buyer" && vendorRegistered) setRole("seller");
  }, [pathname, role, vendorRegistered, setRole]);

  // Portalled dialogs live on <body>, outside this shell: give them the vendor colours too (SH-005).
  useEffect(() => {
    document.body.classList.add("vendor-theme");
    return () => document.body.classList.remove("vendor-theme");
  }, []);

  return (
    <div className="vendor-shell min-h-screen bg-background">
      <DashboardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="lg:pl-64">
        <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />
        <main
          className={
            fullScreen
              // -1px accounts for the header's bottom border, so the page is
              // exactly the viewport and nothing scrolls behind the composer.
              ? "h-[calc(100dvh-3.5rem-1px)] overflow-hidden lg:h-[calc(100dvh-4rem-1px)]"
              : "min-h-[calc(100vh-3.5rem)] pb-20 lg:pb-0 p-4 lg:min-h-[calc(100vh-4rem)] lg:p-6"
          }
        >
          {/* Why this seller can't publish yet: on the publishing pages only; Seller Home has Getting started. */}
          {!fullScreen && registrationBanner && <RegistrationBanner />}
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {!fullScreen && <MobileBottomNav />}
    </div>
  );
};
