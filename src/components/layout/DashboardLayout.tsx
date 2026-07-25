import { ReactNode, useState } from "react";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardHeader } from "./DashboardHeader";
import { MobileBottomNav } from "./MobileBottomNav";

interface DashboardLayoutProps {
  children: ReactNode;
  /**
   * "full-screen" locks the content area to exactly the space under the header,
   * drops the padding, and hides the mobile bottom nav — for pages that own
   * their own scrolling and need to sit flush against the bottom edge (the chat
   * thread, whose composer bar is pinned there). Everything else uses "default".
   */
  variant?: "default" | "full-screen";
}

export const DashboardLayout = ({ children, variant = "default" }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fullScreen = variant === "full-screen";

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
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {!fullScreen && <MobileBottomNav />}
    </div>
  );
};
