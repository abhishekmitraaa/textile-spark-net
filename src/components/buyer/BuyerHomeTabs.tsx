import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const homeTabs = [
  { label: "New Arrivals", href: "/home/new-arrivals" },
  { label: "Trends", href: "/home/trends" },
  { label: "Sale", href: "/home/sale" },
  { label: "For You", href: "/home/for-you" },
  { label: "Followings", href: "/home/followings" },
];

interface BuyerHomeTabsProps {
  className?: string;
}

const BuyerHomeTabs = ({ className }: BuyerHomeTabsProps) => {
  const location = useLocation();
  const t = useT();

  return (
    <div className={cn("-mx-1 mb-4 overflow-x-auto pb-1", className)} role="tablist" aria-label="Buyer home tabs">
      <div className="flex w-max items-center gap-2 px-1" role="row">
        {homeTabs.map((tab) => {
          const isActive =
            location.pathname === tab.href ||
            (tab.href === "/home/followings" && location.pathname.startsWith("/home/followings"));

          return (
            <Link
              key={tab.href}
              to={tab.href}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-accent bg-accent text-accent-foreground shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground"
              )}
            >
              {t(tab.label)}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default BuyerHomeTabs;