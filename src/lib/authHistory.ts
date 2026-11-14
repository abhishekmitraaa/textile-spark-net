import type { NavigateFunction } from "react-router-dom";

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

/** True while finishAuthFlow is going back to the start: the sign-in page it passes through must not redirect. */
export function isFinishingAuth(): boolean {
  try { return Date.now() - Number(sessionStorage.getItem(FINISHING) ?? 0) < 3000; } catch { return false; }
}

/**
 * Ends sign-in or sign-up: goes back to the entry the flow started on and replaces it with `dest`. Without a mark (or
 * when there is nothing to go back over), a plain replace.
 */
export async function finishAuthFlow(navigate: NavigateFunction, dest: string): Promise<void> {
  const mark = takeMark();
  const now = currentIdx();
  if (mark && now !== null && mark.idx < now) {
    // Kept for a moment after the rewind: the sign-in page passed through renders after it.
    try { sessionStorage.setItem(FINISHING, String(Date.now())); } catch { /* private mode */ }
    await new Promise<void>((resolve) => {
      const done = () => { window.removeEventListener("popstate", done); clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 1500);
      window.addEventListener("popstate", done);
      window.history.go(mark.idx - now);
    });
  }
  navigate(dest, { replace: true });
}
