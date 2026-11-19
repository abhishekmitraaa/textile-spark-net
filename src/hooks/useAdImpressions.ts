import { useCallback, useEffect, useRef } from "react";
import { logAdImpression } from "@/lib/queries/ads";

/** Half the card on screen counts as seen (review M-33). */
const SEEN_RATIO = 0.5;

type TrackRef = (el: Element | null) => void;

/**
 * Counts an ad's impression once it is on screen, never on mount (review M-33): an ad below the fold, or a carousel
 * slide off to the side, was counted the moment the page rendered it. Give each ad card `ref={track(ad.adId)}`.
 *
 * Once per ad per mount of the component (a re-render or a scroll back doesn't count again). Visibility is the
 * viewport's, clipped by scrolling parents, so a rail's hidden cards wait until they are scrolled in. Without
 * IntersectionObserver (very old browsers) a card counts when it mounts, as before.
 */
export function useAdImpressions(): (adId: string) => TrackRef {
  const logged = useRef(new Set<string>());
  const idOf = useRef(new Map<Element, string>());
  const elOf = useRef(new Map<string, Element>());
  const refs = useRef(new Map<string, TrackRef>());
  const observer = useRef<IntersectionObserver | null>(null);

  const seen = useCallback((adId: string) => {
    if (logged.current.has(adId)) return;
    logged.current.add(adId);
    logAdImpression(adId);
  }, []);

  const getObserver = useCallback((): IntersectionObserver | null => {
    if (observer.current) return observer.current;
    if (typeof IntersectionObserver === "undefined") return null;
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < SEEN_RATIO) continue;
          const adId = idOf.current.get(e.target);
          observer.current?.unobserve(e.target);
          if (adId) seen(adId);
        }
      },
      { threshold: SEEN_RATIO },
    );
    return observer.current;
  }, [seen]);

  useEffect(() => () => {
    observer.current?.disconnect();
    observer.current = null;
  }, []);

  return useCallback(
    (adId: string) => {
      let ref = refs.current.get(adId);
      if (ref) return ref;
      ref = (el: Element | null) => {
        const prev = elOf.current.get(adId);
        if (prev && prev !== el) {
          observer.current?.unobserve(prev);
          idOf.current.delete(prev);
          elOf.current.delete(adId);
        }
        if (!el || logged.current.has(adId)) return;
        const io = getObserver();
        if (!io) {
          seen(adId);
          return;
        }
        idOf.current.set(el, adId);
        elOf.current.set(adId, el);
        io.observe(el);
      };
      refs.current.set(adId, ref);
      return ref;
    },
    [getObserver, seen],
  );
}
