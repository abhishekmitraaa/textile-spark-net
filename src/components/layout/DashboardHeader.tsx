import { Bell, BellRing, Search, Menu, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { RoleSwitcher } from "./RoleSwitcher";
import { useUserRole } from "@/contexts/UserRoleContext";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

interface DashboardHeaderProps {
  onMenuClick: () => void;
}

const buyerTabs = [
  { name: "New Arrivals", href: "/browse", accent: true },
  { name: "Trends", href: "/for-you" },
  { name: "Services", href: "/service-vendors" },
  { name: "Freelancers", href: "/freelancers" },
  { name: "Followings", href: "/for-you" },
];

export const DashboardHeader = ({ onMenuClick }: DashboardHeaderProps) => {
  const { role } = useUserRole();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const homeHref = role === "buyer" ? "/home/new-arrivals" : "/seller-home";

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      {/* Main header row */}
      <div className="flex h-14 items-center justify-between px-4 lg:h-16 lg:px-6">
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          <button
            onClick={onMenuClick}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <Menu size={22} />
          </button>

          {/* Mobile logo + vendor info */}
          {isMobile && (
            <div>
              <button
                type="button"
                onClick={() => navigate(homeHref)}
                aria-label={`Go to ${role === "buyer" ? "buyer" : "seller"} homepage`}
                className="inline-flex items-center rounded-md transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <img
                  src="/cosoravendorlogo.png"
                  alt="Cosora For Sellers"
                  className="block h-8 w-auto object-contain sm:h-9"
                  draggable={false}
                />
              </button>
              {role === "seller" && (
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-foreground leading-none">Kumar Textiles</span>
                  <span className="text-xs text-muted-foreground">• Mumbai</span>
                </div>
              )}
            </div>
          )}

          {/* Desktop Role Switcher */}
          <div className="hidden lg:block">
            <RoleSwitcher variant="desktop" />
          </div>

          {/* Search - hidden on mobile, shown on tablet+ */}
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={role === "buyer" ? "Search for items or brands..." : "Search products, leads..."}
              readOnly
              onClick={() => navigate("/search")}
              aria-label={role === "buyer" ? "Search for items or brands" : "Search products or leads"}
              className="w-48 cursor-pointer pl-10 md:w-64"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile search */}
          <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:hidden">
            <Search size={20} />
          </button>

          {/* Bookmark / save icon */}
          {isMobile && role === "buyer" && (
            <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z" />
              </svg>
            </button>
          )}

          {/* Hamburger / grid for mobile buyer */}
          {isMobile && role === "buyer" && (
            <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          {/* Seller CTA */}
          {role === "seller" && (
            <Link to="/upload">
              <Button variant="gold" size="sm" className="hidden sm:inline-flex bg-[#256fef] text-white hover:bg-[#256fef]/90 shadow-none">
                New Product
              </Button>
            </Link>
          )}

          {/* Alert bell for seller */}
          {role === "seller" && (
            <button className="relative rounded-lg p-2 text-amber-500 transition-colors hover:bg-secondary">
              <BellRing size={20} />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
            </button>
          )}

          <button className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Bell size={20} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />
          </button>
        </div>
      </div>

      {/* Buyer mobile horizontal tabs */}
      {role === "buyer" && isMobile && (
        <div className="overflow-x-auto scrollbar-none border-t border-border/40">
          <div className="flex items-center gap-0 px-2 min-w-max">
            {buyerTabs.map((tab) => {
              const isActive = location.pathname === tab.href;
              return (
                <Link
                  key={tab.name}
                  to={tab.href}
                  className={cn(
                    "relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.accent && (
                    <Sparkles className="h-3 w-3 text-accent fill-accent" />
                  )}
                  <span className={cn(tab.accent && isActive ? "text-accent" : "")}>
                    {tab.name}
                  </span>
                  {isActive && (
                    <span
                      className={cn(
                        "absolute bottom-0 left-2 right-2 h-0.5 rounded-full",
                        tab.accent ? "bg-accent" : "bg-foreground"
                      )}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
