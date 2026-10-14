import { useEffect, type RefObject } from "react";

/**
 * Publishes an element's height as a CSS variable on <html> while it's mounted, so other fixed or
 * sticky things can make room for it:
 *   --bottom-nav-h    the phone's bottom bar (MobileBottomNav); 0 on desktop, where it's hidden
 *   --pinned-bar-h    a page's own bar pinned above it (Post Your Requirement's Continue)
 * The variable is removed on unmount, so `var(--name, 0px)` falls back to nothing.
 */
export function usePublishedHeight(ref: RefObject<HTMLElement>, name: `--${string}`) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(name, `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty(name);
    };
  }, [ref, name]);
}
