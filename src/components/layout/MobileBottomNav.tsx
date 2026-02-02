import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Home,
  MessageCircle,
  UserCircle,
  Plus,
  FileText,
  Package,
  Upload,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/contexts/UserRoleContext";
import { Badge } from "@/components/ui/badge";

export const MobileBottomNav = () => {
  const location = useLocation();
  const { role } = useUserRole();

  // Mock unread count
  const unreadMessages = 3;

  // Buyer navigation items
  const buyerNavItems = [
    { name: "Home", href: "/", icon: Home },
    { name: "For You", href: "/for-you", icon: Sparkles },
    { name: "Post RFQ", href: "/post-requirement", icon: FileText, isCenter: true },
    { name: "Chats", href: "/chat", icon: MessageCircle, badge: unreadMessages },
    { name: "Profile", href: "/profile", icon: UserCircle },
  ];

  // Seller navigation items
  const sellerNavItems = [
    { name: "Home", href: "/", icon: Home },
    { name: "Products", href: "/products", icon: Package },
    { name: "Upload", href: "/upload", icon: Upload, isCenter: true },
    { name: "Chats", href: "/chat", icon: MessageCircle, badge: unreadMessages },
    { name: "Profile", href: "/profile", icon: UserCircle },
  ];

  const navItems = role === "buyer" ? buyerNavItems : sellerNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      {/* Backdrop blur effect */}
      <div className="absolute inset-0 bg-card/80 backdrop-blur-xl border-t border-border/50" />
      
      {/* Navigation items */}
      <div className="relative flex items-end justify-around px-2 pb-safe">
        {navItems.map((item, index) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;

          if (item.isCenter) {
            // Center floating action button
            return (
              <Link
                key={item.name}
                to={item.href}
                className="relative -mt-5 flex flex-col items-center"
              >
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300",
                    "bg-gradient-to-br from-accent via-accent to-accent/80",
                    "shadow-[0_4px_20px_-2px_hsl(var(--accent)/0.5)]",
                    isActive && "shadow-[0_4px_25px_-2px_hsl(var(--accent)/0.6)]"
                  )}
                >
                  {role === "buyer" ? (
                    <Plus className="h-6 w-6 text-accent-foreground" />
                  ) : (
                    <Plus className="h-6 w-6 text-accent-foreground" />
                  )}
                </motion.div>
                <span className="mt-1 text-[10px] font-medium text-accent">
                  {item.name}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.name}
              to={item.href}
              className="relative flex flex-col items-center py-2 px-3"
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className="relative"
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300",
                    isActive
                      ? "bg-accent/10"
                      : "hover:bg-muted/50"
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
                  "mt-0.5 text-[10px] font-medium transition-colors duration-200",
                  isActive ? "text-accent" : "text-muted-foreground"
                )}
              >
                {item.name}
              </span>
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -bottom-0 h-0.5 w-6 rounded-full bg-accent"
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
