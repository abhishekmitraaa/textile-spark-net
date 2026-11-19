import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { isAuthPath, rememberReturnTo } from "@/lib/returnTo";

/**
 * Remembers the page someone was on when a link, a sign-in prompt or the sign-up gate took them into sign-in or
 * sign-up (review M-59). Steps inside the flow never overwrite it. lib/returnTo.ts decides what is worth returning to.
 */
export function ReturnToTracker() {
  const { pathname, search } = useLocation();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = pathname + search;
    if (!before || !isAuthPath(pathname)) return;
    if (isAuthPath(before.split("?")[0])) return;
    rememberReturnTo(before);
  }, [pathname, search]);
  return null;
}
