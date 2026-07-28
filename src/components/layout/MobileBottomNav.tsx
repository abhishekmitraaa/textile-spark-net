import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Home,
  LayoutGrid,
  MessageCircle,
  UserCircle,
  Plus,
  Package,
  Upload,
  FileText,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useT } from "@/lib/i18n";

interface MobileBottomNavProps {
  /**
   * When true, the bar slides out of view on scroll-down and slides back
   * in on scroll-up (used by the Trends feed for its infinite scroll).
   * Defaults to false so every existing page keeps the bar permanently fixed.
   */
  autoHide?: boolean;
}

export const MobileBottomNav = ({ autoHide = false }: MobileBottomNavProps = {}) => {
  const location = useLocation();
  const { role } = useUserRole();
  const t = useT();

  const unreadMessages = 3;

  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!autoHide) return;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastY && y > 80) setHidden(true); // scrolling down past the fold
      else if (y < lastY) setHidden(false); // scrolling up
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [autoHide]);

  // Buyer: Home, Categories, Requirement (center), Chats, My Profile
  //
  // "Video Close-Ups" used to sit here. It was removed from the bar to make
  // room for Home; the /video-closeups route and VideoCloseUpsPage are
  // untouched and the feature is still reached from the inline Video
  // Close-Ups rail on the New Arrivals feed.
  const buyerNavItems = [
    { name: "Home", href: "/home/new-arrivals", icon: Home },
    { name: "Categories", href: "/categories", icon: LayoutGrid },
    { name: "Requirement", href: "/requirement", icon: Plus, isCenter: true },
    { name: "Chats", href: "/chats", icon: MessageCircle, badge: unreadMessages },
    { name: "My Profile", href: "/profile", icon: UserCircle },
  ];

  // Seller: Home, Products, Upload (center), Chats, My Profile
  const sellerNavItems = [
    { name: "Home", href: "/seller-home", icon: LayoutGrid },
    { name: "Products", href: "/products", icon: Package },
    { name: "Upload", href: "/upload", icon: Upload, isCenter: true },
    { name: "Chats", href: "/chat", icon: MessageCircle, badge: unreadMessages },
    { name: "My Store", href: "/my-store", icon: Store },
  ];

  const navItems = role === "buyer" ? buyerNavItems : sellerNavItems;

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 lg:hidden transition-transform duration-300 ease-out",
        hidden && "translate-y-full"
      )}
    >
      <div className="absolute inset-0 bg-card/90 backdrop-blur-xl border-t border-border/50" />
      
      <div className="relative flex items-end justify-around px-1 pb-safe" style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
        {navItems.map((item) => {
          const isActive =
            item.href === "/my-store"
              ? location.pathname === "/my-store" || location.pathname.startsWith("/business-profile")
              : location.pathname === item.href;
          const Icon = item.icon;

          if (item.isCenter) {
            return (
              <Link
                key={item.name}
                to={item.href}
                className="relative -mt-4 flex flex-col items-center pb-1"
              >
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300",
                    "bg-accent",
                    "shadow-[0_4px_20px_-2px_hsl(var(--accent)/0.5)]"
                  )}
                >
                  <Icon className="h-6 w-6 text-accent-foreground" />
                </motion.div>
                <span className="mt-1 text-[10px] font-medium text-accent">
                  {t(item.name)}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.name}
              to={item.href}
              className="relative flex flex-col items-center py-2 px-2 min-w-0"
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className="relative"
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300",
                    isActive ? "bg-accent/10" : "hover:bg-muted/50"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-colors duration-200",
                      isActive ? "text-accent" : "text-muted-foreground"
                    )}
                  />
                </div>
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {item.badge}
                  </span>
                )}
              </motion.div>
              <span
                className={cn(
                  "mt-0.5 text-[10px] font-medium transition-colors duration-200 truncate max-w-[52px] text-center",
                  isActive ? "text-accent" : "text-muted-foreground"
                )}
              >
                {t(item.name)}
              </span>
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute bottom-0 h-0.5 w-5 rounded-full bg-accent"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};