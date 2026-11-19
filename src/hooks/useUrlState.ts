import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A page control kept in the address (?key=value), so Back to the page brings it back as it was (2026-11-19, review
 * M-30: Sale, Following, Search Results and the seller page reset their filters on Back). Changes replace the entry,
 * never push one: a filter isn't a page, and Back still leaves the page. The fallback is never written.
 */
export function useUrlState<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = raw !== null && (!allowed || (allowed as readonly string[]).includes(raw)) ? (raw as T) : fallback;
  const set = useCallback(
    (next: T) => {
      setParams((prev) => {
        const out = new URLSearchParams(prev);
        if (next === fallback || next === "") out.delete(key);
        else out.set(key, next);
        return out;
      }, { replace: true });
    },
    [key, fallback, setParams],
  );
  return [value, set];
}

/** A yes/no control in the address (?key=1). */
export function useUrlFlag(key: string): [boolean, (next: boolean) => void] {
  const [raw, set] = useUrlState<"" | "1">(key, "", ["", "1"]);
  return [raw === "1", useCallback((next: boolean) => set(next ? "1" : ""), [set])];
}
