import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Any page's on-screen Back (buyer sign-up audit item 8; Seller Home audit SH-052, SH-070, SH-074). It goes back in history, as the device's back does, so the
 * two agree and no entry is added: the arrows used to push the previous step as a new entry, so the device's back then
 * walked forward again. With nothing to go back to in this app (the step was opened directly, or after a reload of a
 * first page), it replaces the entry with `fallback` instead of leaving the site.
 */
export function useStepBack(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if (location.key !== "default") navigate(-1);
    else navigate(fallback, { replace: true });
  }, [location.key, navigate, fallback]);
}
