import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const KEY = "cosoraOverlay";

/**
 * True while an overlay holds the current history entry (useBackCloses below). A link out of the overlay then
 * replaces that entry, so back from where it leads returns to the page with the overlay closed.
 */
export function isOverOverlay(): boolean {
  const st = typeof window !== "undefined" ? (window.history.state as { usr?: Record<string, unknown> } | null) : null;
  return Boolean(st?.usr?.[KEY]);
}

/**
 * Makes the browser's (or the phone's) back button close an overlay instead of
 * leaving the page under it.
 *
 * An overlay drawn over a page has no history entry, so back used to skip it
 * and go to whatever came before the page. While the overlay is open this
 * keeps one extra entry for the same URL, marked in its state: back pops that
 * entry and the overlay closes; closing the overlay any other way pops it too.
 */
export function useBackCloses(isOpen: boolean, onClose: () => void, enabled = true): void {
  const navigate = useNavigate();
  const location = useLocation();
  const marked = Boolean((location.state as Record<string, unknown> | null)?.[KEY]);
  const phase = useRef<"idle" | "pushing" | "open">("idle");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    if (!enabled) return;
    if (isOpen) {
      if (phase.current === "idle") {
        if (marked) {
          phase.current = "open";
        } else {
          phase.current = "pushing";
          const { pathname, search, hash, state } = locationRef.current;
          navigate({ pathname, search, hash }, { state: { ...((state as object | null) ?? {}), [KEY]: true } });
        }
      } else if (phase.current === "pushing" && marked) {
        phase.current = "open";
      } else if (phase.current === "open" && !marked) {
        // Back was pressed: the entry is gone, so close what it stood for.
        phase.current = "idle";
        onCloseRef.current();
      }
      return;
    }
    // Closed (by its own button, or the page came back with the overlay shut):
    // drop the entry so the next back press isn't spent on it.
    phase.current = "idle";
    if (marked) navigate(-1);
  }, [enabled, isOpen, marked, navigate]);
}
