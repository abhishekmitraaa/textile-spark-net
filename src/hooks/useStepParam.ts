import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { currentState } from "@/hooks/useUrlState";

/**
 * A multi-step page's step, kept in the address (?<key>=<step>) with one history entry per step forward, so the phone's
 * Back walks the steps like the on-screen Back (2026-11-19, review M-43: Post Requirement, My Quotes and Report Fraud
 * left the page). `go` pushes the next step; `back` returns to the step before: through history when this page pushed
 * the entry it is on, else by replacing (opened straight on a later step, there is nothing to go back over);
 * `replace` moves without an entry (a finished form's success screen).
 */
export function useStepParam<T extends string>(key: string, allowed: readonly T[], initial: T) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get(key);
  const step = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : initial;
  const marker = `cosoraStep:${key}`;

  const write = useCallback(
    (next: T, push: boolean, extra?: Record<string, string | null>, dropMarker = false) => {
      const out = new URLSearchParams(window.location.search);
      if (next === initial) out.delete(key);
      else out.set(key, next);
      for (const [k, v] of Object.entries(extra ?? {})) {
        if (v === null) out.delete(k);
        else out.set(k, v);
      }
      const state = { ...((currentState() as Record<string, unknown> | null) ?? {}) };
      if (dropMarker) delete state[marker];
      setParams(out, push ? { state: { ...state, [marker]: true } } : { replace: true, state });
    },
    [initial, key, marker, setParams],
  );

  const go = useCallback((next: T, extra?: Record<string, string | null>) => write(next, true, extra), [write]);
  const replace = useCallback((next: T, extra?: Record<string, string | null>) => write(next, false, extra), [write]);
  const back = useCallback(
    (prev: T, extra?: Record<string, string | null>) => {
      const st = currentState() as Record<string, unknown> | null;
      if (st?.[marker]) navigate(-1);
      else write(prev, false, extra);
    },
    [marker, navigate, write],
  );
  /** The page shows an earlier step than the address (reloaded without what a later step needs): make the address say
   *  so, as a first entry, so Back from here doesn't pop to an entry showing the same screen. */
  const reset = useCallback((to: T) => write(to, false, undefined, true), [write]);
  return { step, go, back, replace, reset };
}
