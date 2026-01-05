import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  Megaphone,
  Upload,
  Settings,
  HelpCircle,
  LogOut,
  X,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Products", href: "/products", icon: Package },
  { name: "Upload Product", href: "/upload", icon: Upload },
  { name: "Leads", href: "/leads", icon: Users },
  { name: "Advertisements", href: "/advertisements", icon: Megaphone },
];

const secondaryNav = [
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Help & Support", href: "/help", icon: HelpCircle },
];

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DashboardSidebar = ({ isOpen, onClose }: DashboardSidebarProps) => {
  const location = useLocation();
  const isMobile = useIsMobile();

  // On desktop, sidebar is always visible
  const shouldShow = !isMobile || isOpen;

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobile && isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-foreground/50 backdrop-blur-sm"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen w-72 flex-col bg-sidebar transition-transform duration-300 ease-in-out lg:w-64",
          isMobile
            ? isOpen
              ? "translate-x-0"
              : "-translate-x-full"
            : "translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4 lg:h-16">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <span className="font-display text-lg font-bold text-accent-foreground">F</span>
            </div>
            <span className="font-display text-base font-semibold text-sidebar-foreground lg:text-lg">
              FashionConnect
            </span>
          </div>
          {isMobile && (
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Main navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 lg:p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
            Main Menu
          </p>
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={isMobile ? onClose : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 lg:py-2.5",
                  isActive
                    ? "bg-accent text-accent-foreground shadow-gold"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon size={20} className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Secondary navigation */}
        <div className="border-t border-sidebar-border p-3 lg:p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
            Support
          </p>
          {secondaryNav.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={isMobile ? onClose : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon size={20} className="shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>

        {/* User section */}
        <div className="border-t border-sidebar-border p-3 lg:p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent lg:h-10 lg:w-10">
              <span className="text-xs font-medium text-sidebar-foreground lg:text-sm">TM</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                Textile Manufacturer
              </p>
              <p className="truncate text-xs text-sidebar-foreground/60">
                Premium Member
              </p>
            </div>
            <button className="rounded-lg p-2 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
