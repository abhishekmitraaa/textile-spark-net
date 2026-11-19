import type { NavigateFunction } from "react-router-dom";
import { landingFor } from "@/lib/returnTo";

// ─────────────────────────────────────────────────────────────
// Sign-in and sign-up leave no trail in the back button (buyer sign-up audit item 8).
//
// Login, the code screen and every sign-up step are history entries, so after signing in the device's back walked
// back through them: the code screen ("No code was sent"), the steps, Login. Now the app remembers which history entry
// the flow started on (the first sign-in page of this visit), and when the flow ends it goes back to that entry and
// replaces it with where the person lands. One back from Home is then the page they were on before signing in.
//
// The mark is the entry's index in React Router's history state (`history.state.idx`), kept in sessionStorage so a
// reload in the middle of sign-up still rewinds. It is written when the code is sent and used once.
// ─────────────────────────────────────────────────────────────

const KEY = "cosora.authStart";
const FINISHING = "cosora.authFinishing";
// An abandoned attempt's mark is ignored after this long.
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

interface Mark { idx: number; at: number }

function currentIdx(): number | null {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : null;
}

/** The history entry the page is on now: a sign-in page reads it on arrival and passes it to markAuthStart. */
export function historyIndex(): number | null {
  return currentIdx();
}

/** Remembers the entry the flow started on (`idx`, the first sign-in page of this visit). Called when a code is sent. */
export function markAuthStart(idx: number | null): void {
  if (idx === null) return;
  try { sessionStorage.setItem(KEY, JSON.stringify({ idx, at: Date.now() } satisfies Mark)); } catch { /* private mode */ }
}

/** True while a sign-in that started on Login's phone form is still under way in this tab (the mark isn't used up). */
export function hasAuthStart(): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const m = JSON.parse(raw) as Partial<Mark>;
    return typeof m.idx === "number" && typeof m.at === "number" && Date.now() - m.at <= MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** Forgets a started flow (a sign-in that didn't go through these pages, such as Google). */
export function clearAuthStart(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* private mode */ }
}

function takeMark(): Mark | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<Mark>;
    if (typeof m.idx !== "number" || typeof m.at !== "number" || Date.now() - m.at > MAX_AGE_MS) return null;
    return { idx: m.idx, at: m.at };
  } catch {
    return null;
  }
}

/**
 * The destination a rewind left behind, taken once (valid for 10 s). The page the rewind lands on (Login or Register)
 * calls it on arrival and goes there: when that entry belongs to an earlier page load, the browser loads it afresh and
 * the page that started the rewind never gets to navigate. Null when no rewind is under way.
 */
export function takeAuthLanding(): string | null {
  try {
    const raw = sessionStorage.getItem(FINISHING);
    if (!raw) return null;
    sessionStorage.removeItem(FINISHING);
    const v = JSON.parse(raw) as { at?: unknown; dest?: unknown };
    if (typeof v !== "object" || v === null || typeof v.dest !== "string" || typeof v.at !== "number") return null;
    return Date.now() - v.at < 10_000 ? v.dest : null;
  } catch {
    return null;
  }
}

/**
 * Ends sign-in or sign-up: goes back to the entry the flow started on and replaces it with `dest`. Without a mark (or
 * when there is nothing to go back over), a plain replace.
 */
export async function finishAuthFlow(navigate: NavigateFunction, landing: string): Promise<void> {
  // A buyer goes back to the page a prompt or the sign-up gate took them from (review M-59, lib/returnTo.ts).
  const dest = landingFor(landing);
  const mark = takeMark();
  const now = currentIdx();
  if (mark && now !== null && mark.idx < now) {
    try { sessionStorage.setItem(FINISHING, JSON.stringify({ at: Date.now(), dest })); } catch { /* private mode */ }
    let leaving = false;
    const onHide = () => { leaving = true; };
    window.addEventListener("pagehide", onHide);
    await new Promise<void>((resolve) => {
      const done = () => { window.removeEventListener("popstate", done); clearTimeout(timer); resolve(); };
      // popstate comes at once when the entry is in this page load; otherwise the page unloads and the landing page
      // finishes (takeAuthLanding). The timer only covers a traversal that went nowhere.
      const timer = setTimeout(done, 5000);
      window.addEventListener("popstate", done);
      window.history.go(mark.idx - now);
    });
    window.removeEventListener("pagehide", onHide);
    if (leaving) return;
    // The page it landed on may already have taken the destination and gone there.
    if (takeAuthLanding() === null) return;
  }
  navigate(dest, { replace: true });
}
