import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/** React Router 6 keeps each entry's position in this app's history in `history.state.idx` (0 for the first page). */
function inAppHistoryIndex(): number {
  const state = window.history.state as { idx?: unknown } | null;
  return typeof state?.idx === "number" ? state.idx : 0;
}

/**
 * Any page's on-screen Back (buyer sign-up audit item 8; Seller Home audit SH-052, SH-070, SH-074). It goes back in history, as the device's back does, so the
 * two agree and no entry is added: the arrows used to push the previous step as a new entry, so the device's back then
 * walked forward again. With nothing to go back to in this app (the page was opened directly, from a new tab, or after
 * a redirect on the first page), it replaces the entry with `fallback` instead of leaving the site.
 *
 * It asks React Router's history index, not the location key (2026-11-18 review, H-09): a `<Navigate replace>` on the
 * first page gives the entry a real key while it is still the first entry, and Back then left Cosora.
 */
export function useStepBack(fallback: string): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    if (inAppHistoryIndex() > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
