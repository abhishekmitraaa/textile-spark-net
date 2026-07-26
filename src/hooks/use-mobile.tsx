import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

const DESKTOP_BREAKPOINT = 1024; // Tailwind's `lg`

/**
 * True from Tailwind's `lg` up. Use it only where the JS side has to agree with
 * the `lg:` classes — e.g. a master-detail page where a row either selects a
 * pane (desktop) or navigates to its own route (mobile). Plain responsive
 * styling should stay in CSS.
 */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth >= DESKTOP_BREAKPOINT,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
