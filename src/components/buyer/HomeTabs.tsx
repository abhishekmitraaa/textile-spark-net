import { Link } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const HOME_TABS = [
  { label: "NEW ARRIVALS", href: "/home/new-arrivals" },
  { label: "TRENDS", href: "/home/trends" },
  { label: "SALE", href: "/home/sale" },
  { label: "FOR YOU", href: "/home/for-you" },
  { label: "FOLLOWINGS", href: "/home/followings" },
] as const;

/**
 * The Home tab strip. For You renders it on every screen it has, its first-run and sign-in screens included
 * (2026-11-19, review M-03: signed out, For You hid the tabs and the only way on was the browser's Back).
 */
export function HomeTabs({ active }: { active: (typeof HOME_TABS)[number]["href"] }) {
  const t = useT();
  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-3">
      <nav aria-label="Home" className="flex justify-start lg:justify-center gap-4 lg:gap-7 overflow-x-auto pb-2 mb-3 border-b border-gray-100 scrollbar-hide">
        {HOME_TABS.map((tab) => (
          <Link
            key={tab.href}
            to={tab.href}
            aria-current={tab.href === active ? "page" : undefined}
            className={cn(
              "text-xs lg:text-sm font-bold whitespace-nowrap pb-2 border-b-2 transition-colors shrink-0",
              tab.href === active ? "text-brand-buyer border-brand-buyer" : "text-gray-400 border-transparent hover:text-gray-600",
            )}
          >
            {tab.href === "/home/new-arrivals" && "✦ "}{t(tab.label)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
