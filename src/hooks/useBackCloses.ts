import { useCallback, useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const KEY = "cosoraOverlay";

/** React Router's index of the current history entry (0 = the first in this tab). */
function historyIdx(): number {
  const st = typeof window !== "undefined" ? (window.history.state as { idx?: unknown } | null) : null;
  return typeof st?.idx === "number" ? st.idx : 0;
}

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
 * keeps one extra entry for the same URL, marked with this overlay's own id: back pops that
 * entry and the overlay closes; closing the overlay any other way pops it too.
 *
 * Several on one page (2026-11-19, review M-29): the entry names its owner, so a closed overlay never pops another's
 * entry; and only going back below the owner's entry closes it, so an overlay opened on top of another (a menu in a
 * sheet) leaves the one underneath open.
 */
// A close that pops an overlay's entry is asynchronous (history.go). An overlay opened in the same moment (a menu item
// that opens a sheet) must push after that pop lands, or the pop takes the new entry instead (code review 2026-11-19).
let pendingPop: Promise<void> | null = null;
function popOverlayEntry(navigate: (delta: number) => void) {
  pendingPop = new Promise<void>((resolve) => {
    const done = () => { window.removeEventListener("popstate", done); window.clearTimeout(timer); pendingPop = null; resolve(); };
    const timer = window.setTimeout(done, 1500);
    window.addEventListener("popstate", done);
  });
  navigate(-1);
}

export function useBackCloses(isOpen: boolean, onClose: () => void, enabled = true): void {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const location = useLocation();
  const id = useId();
  const owner = (location.state as Record<string, unknown> | null)?.[KEY];
  const mine = owner === id;
  const phase = useRef<"idle" | "pushing" | "open" | "closing">("idle");
  const myIdx = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const locationRef = useRef(location);
  locationRef.current = location;

  // Runs after every render (a pop or push landing re-renders through the location); the phases make it idempotent.
  useEffect(() => {
    if (!enabled) return;
    const idx = historyIdx();
    if (isOpen) {
      if (phase.current === "idle" || phase.current === "closing") {
        if (mine && phase.current === "idle") {
          phase.current = "open";
          myIdx.current = idx;
        } else if (pendingPop) {
          // An entry (this overlay's last one, or another's) is being popped: push once it has gone.
          void pendingPop.then(() => setTick((t) => t + 1));
        } else {
          phase.current = "pushing";
          const { pathname, search, hash, state } = locationRef.current;
          navigate({ pathname, search, hash }, { state: { ...((state as object | null) ?? {}), [KEY]: id } });
        }
      } else if (phase.current === "pushing" && mine) {
        phase.current = "open";
        myIdx.current = idx;
      } else if (phase.current === "open" && myIdx.current !== null && idx < myIdx.current) {
        // Back was pressed past this overlay's entry: close what it stood for.
        phase.current = "idle";
        myIdx.current = null;
        onCloseRef.current();
      }
      return;
    }
    // Closed (by its own button, or the page came back with the overlay shut): drop this overlay's entry, once, so the
    // next back press isn't spent on it.
    myIdx.current = null;
    if (mine) {
      if (phase.current !== "closing") {
        phase.current = "closing";
        popOverlayEntry(navigate);
      }
      return;
    }
    phase.current = "idle";
  });
}

/** useState for an overlay's open flag, with Back closing it (useBackCloses). */
export function useOverlayState(initial = false): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [open, setOpen] = useState(initial);
  useBackCloses(open, useCallback(() => setOpen(false), []));
  return [open, setOpen];
}

/**
 * Runs `apply` now, or, while an overlay's entry is the current one, once that entry is gone: an address change
 * written on the overlay's entry would be lost when the overlay closes and its entry is popped (a filter picked in a
 * menu or a filter sheet).
 */
export function afterOverlay(apply: () => void): void {
  if (!isOverOverlay()) {
    apply();
    return;
  }
  const page = window.location.pathname;
  // Given up when the overlay's entry is left another way (a link out replaces it) or another page is showing: a stale
  // write must never land on an unrelated page (code review 2026-11-19).
  const stop = () => { window.removeEventListener("popstate", done); window.clearTimeout(timer); };
  const timer = window.setTimeout(stop, 10_000);
  const done = () => {
    if (window.location.pathname !== page) { stop(); return; }
    if (isOverOverlay()) return; // a nested overlay closed; the page's entry isn't back yet
    stop();
    setTimeout(apply, 0);
  };
  window.addEventListener("popstate", done);
}
