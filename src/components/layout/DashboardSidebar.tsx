import { Link, useLocation, useNavigate } from "react-router-dom";
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
  Crown,
  FileText,
  UserCircle,
  ShoppingBag,
  Factory,
  ClipboardList,
  TrendingUp,
  Truck,
  History,
  Building2,
  MessageCircle,
  Sparkles,
  Wrench,
  Briefcase,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUserRole } from "@/contexts/UserRoleContext";
import { RoleSwitcher } from "./RoleSwitcher";

// Buyer navigation (Clothing Brands)
const buyerNavigation = [
  { name: "New Arrivals", href: "/browse", icon: ShoppingBag },
  { name: "For You", href: "/for-you", icon: Sparkles },
  { name: "Service Vendors", href: "/service-vendors", icon: Wrench },
  { name: "Freelancers", href: "/freelancers", icon: Briefcase },
  { name: "Post Requirement", href: "/post-requirement", icon: FileText },
  { name: "Recently Viewed", href: "/recently-viewed", icon: History },
  { name: "Cosora Studio", href: "/cosora-studio", icon: Camera },
  { name: "My Quotes", href: "/quotes", icon: ClipboardList },
  { name: "Messages", href: "/chat", icon: MessageCircle },
];

// Seller navigation (Manufacturers)
const sellerNavigation = [
  { name: "Dashboard", href: "/seller-home", icon: LayoutDashboard },
  { name: "My Products", href: "/products", icon: Package },
  { name: "Upload Product", href: "/upload", icon: Upload },
  { name: "Quote Requests", href: "/quotes", icon: ClipboardList },
  { name: "Messages", href: "/chat", icon: MessageCircle },
  { name: "Leads", href: "/leads", icon: Users },
  { name: "Advertisements", href: "/advertisements", icon: Megaphone },
  { name: "Cosora Studio", href: "/cosora-studio", icon: Camera },
  { name: "Analytics", href: "/analytics", icon: TrendingUp },
  { name: "Subscription", href: "/subscription", icon: Crown },
];

const secondaryNav = [
  { name: "My Profile", href: "/profile", icon: UserCircle },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Help & Support", href: "/help", icon: HelpCircle },
];

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DashboardSidebar = ({ isOpen, onClose }: DashboardSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { role } = useUserRole();

  const handleSignOut = () => {
    navigate("/");
  };

  // Select navigation based on role
  const navigation = role === "buyer" ? buyerNavigation : sellerNavigation;

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
            <span className="text-xl font-bold italic text-accent lg:text-2xl tracking-tight" style={{ fontFamily: "'Heading Now', sans-serif" }}>
              Cosora
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

        {/* Role Switcher */}
        <div className="border-b border-sidebar-border p-3 lg:p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
            Switch Mode
          </p>
          <RoleSwitcher variant="mobile" />
        </div>

        {/* Main navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 lg:p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
            {role === "buyer" ? "Buyer Menu" : "Seller Menu"}
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
              <span className="text-xs font-medium text-sidebar-foreground lg:text-sm">
                {role === "buyer" ? "CB" : "TM"}
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {role === "buyer" ? "Fashion Brand" : "Textile Manufacturer"}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/60">
                {role === "buyer" ? "Verified Buyer" : "Premium Seller"}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className="rounded-lg p-2 text-sidebar-foreground/60 transition-colors hover:bg-accent/20 hover:text-accent"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
