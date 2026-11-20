import { Link, useLocation } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const HOME_TABS = [
  { label: "NEW ARRIVALS", href: "/home/new-arrivals" },
  { label: "TRENDS", href: "/home/trends" },
  { label: "SALE", href: "/home/sale" },
  { label: "FOR YOU", href: "/home/for-you" },
  { label: "FOLLOWING", href: "/home/followings" },
] as const;

export type HomeTabHref = (typeof HOME_TABS)[number]["href"];

/** Other addresses that open a Home tab's page (App.tsx). */
const TAB_ALIASES: Record<string, HomeTabHref> = { "/for-you": "/home/for-you" };

/** The Home tab an address belongs to (a tab's own sub-pages count), or null. */
export function homeTabOf(pathname: string): HomeTabHref | null {
  return TAB_ALIASES[pathname] ?? HOME_TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? null;
}

/**
 * The Home tab strip, the one copy every Home page renders (2026-11-20, review L-02: each page had its own, and the
 * "✦" stayed on NEW ARRIVALS whatever tab was open). For You renders it on every screen it has, its first-run and
 * sign-in screens included (review M-03).
 *
 * - The open tab carries the "✦" and `aria-current="page"`.
 * - A tab tap replaces the history entry (review L-15): switching tabs five times no longer needs five Backs to
 *   leave Home.
 * - The five fit a 360 px phone without being cut ("FOLLOW…", review L-23): 11 px with 8 px gaps below 640 px. The
 *   strip still scrolls on a narrower phone or with a longer translation.
 */
export function HomeTabs({ active }: { active?: HomeTabHref }) {
  const t = useT();
  const { pathname } = useLocation();
  const current = active ?? homeTabOf(pathname);
  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-3">
      <nav aria-label="Home" className="flex justify-start lg:justify-center gap-2 sm:gap-4 lg:gap-7 overflow-x-auto pb-2 mb-3 border-b border-gray-100 scrollbar-hide">
        {HOME_TABS.map((tab) => {
          const isActive = tab.href === current;
          return (
            <Link
              key={tab.href}
              to={tab.href}
              replace
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "text-[11px] sm:text-xs lg:text-sm font-bold whitespace-nowrap pb-2 border-b-2 transition-colors shrink-0",
                isActive ? "text-brand-buyer border-brand-buyer" : "text-gray-400 border-transparent hover:text-gray-600",
              )}
            >
              {isActive && <span aria-hidden="true">✦ </span>}{t(tab.label)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
