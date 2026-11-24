import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** Which ends of a horizontal scroller still have content past them. */
function useScrollEdges() {
  const ref = useRef<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft < max - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);
  return { ref, edges };
}

/**
 * The Home tab strip, the one copy every Home page renders (2026-11-20, review L-02: each page had its own, and the
 * "✦" stayed on NEW ARRIVALS whatever tab was open). For You renders it on every screen it has, its first-run and
 * sign-in screens included (review M-03).
 *
 * - The open tab carries the "✦" and `aria-current="page"`.
 * - A tab tap replaces the history entry (review L-15): switching tabs five times no longer needs five Backs to
 *   leave Home.
 * - On a phone the strip is a swipeable row (Mitra, 2026-11-25: it was squeezed to 11 px, flush left, and cut
 *   "FOLLOWING" with no sign it scrolled). Tabs keep a readable 14 px and snap as they slide; the strip runs to the
 *   screen's edges, the open tab is scrolled into view, and a fade marks whichever end has more. Where all five fit
 *   (a tablet, a laptop) the row is centred.
 */
export function HomeTabs({ active }: { active?: HomeTabHref }) {
  const t = useT();
  const { pathname } = useLocation();
  const current = active ?? homeTabOf(pathname);
  const { ref, edges } = useScrollEdges();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // Bring the open tab into view (centred) without moving the page vertically.
  useLayoutEffect(() => {
    const nav = ref.current;
    const tab = activeRef.current;
    if (!nav || !tab || nav.scrollWidth <= nav.clientWidth) return;
    const left = tab.offsetLeft - (nav.clientWidth - tab.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [current, ref]);

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-3">
      <div className="relative -mx-4 lg:mx-0 mb-3 border-b border-gray-100">
        <nav
          ref={ref}
          aria-label="Home"
          className="relative overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory scroll-px-4 lg:scroll-px-0"
        >
          <div className="flex w-max min-w-full justify-center gap-6 sm:gap-8 lg:gap-7 px-4 lg:px-0">
            {HOME_TABS.map((tab) => {
              const isActive = tab.href === current;
              return (
                <Link
                  key={tab.href}
                  ref={isActive ? activeRef : undefined}
                  to={tab.href}
                  replace
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "snap-start shrink-0 whitespace-nowrap py-2.5 text-sm font-bold tracking-wide border-b-2 transition-colors",
                    isActive ? "text-brand-buyer border-brand-buyer" : "text-gray-400 border-transparent hover:text-gray-600",
                  )}
                >
                  {isActive && <span aria-hidden="true">✦ </span>}{t(tab.label)}
                </Link>
              );
            })}
          </div>
        </nav>
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent transition-opacity lg:hidden",
            edges.start ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent transition-opacity lg:hidden",
            edges.end ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}
