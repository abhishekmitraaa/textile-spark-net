import { useCallback, useEffect, useState } from "react";

// Recent searches, kept on this device for each account (2026-11-19, review M-17: they were component state and gone
// on every visit). Nothing is sent anywhere: the words someone searched stay in their own browser. At most 8.

const MAX = 8;
const keyFor = (userId: string | null) => `cosora.recent-searches.v1:${userId ?? "guest"}`;

function read(userId: string | null): string[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(userId: string | null, terms: string[]) {
  try {
    if (terms.length) localStorage.setItem(keyFor(userId), JSON.stringify(terms));
    else localStorage.removeItem(keyFor(userId));
  } catch {
    /* storage unavailable (private mode): the list lasts for this visit */
  }
}

export function useRecentSearches(userId: string | null) {
  const [terms, setTerms] = useState<string[]>(() => read(userId));
  useEffect(() => { setTerms(read(userId)); }, [userId]);

  const update = useCallback((next: (prev: string[]) => string[]) => {
    setTerms((prev) => {
      const out = next(prev).slice(0, MAX);
      write(userId, out);
      return out;
    });
  }, [userId]);

  return {
    terms,
    add: useCallback((term: string) => update((prev) => [term, ...prev.filter((k) => k !== term)]), [update]),
    remove: useCallback((term: string) => update((prev) => prev.filter((k) => k !== term)), [update]),
    clear: useCallback(() => update(() => []), [update]),
  };
}
