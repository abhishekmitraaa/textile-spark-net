import { lazy, type ComponentType } from "react";

// Pages load as their own files (review M-34): the first visit downloaded every page in one script before anything
// showed. A page file that a deploy replaced is reloaded once by RouteErrorBoundary (src/lib/newDeploy.ts).

type Loader = () => Promise<unknown>;
const warmLoaders: Loader[] = [];
let warmScheduled = false;

/**
 * `React.lazy` for a route. `warm: true` fetches the file in the background once the first page has loaded and the
 * browser is idle, so the pages most people open next show at once.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, opts?: { warm?: boolean }) {
  if (opts?.warm) warmLoaders.push(load);
  return lazy(load);
}

function idle(fn: () => void) {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) ric(fn, { timeout: 4000 });
  else setTimeout(fn, 1500);
}

/** One file at a time, each when the browser is idle; on a data saver connection, none. */
export function scheduleWarmPages(): void {
  if (warmScheduled || typeof window === "undefined") return;
  warmScheduled = true;
  const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g") return;
  const queue = [...warmLoaders];
  const next = () => {
    const load = queue.shift();
    if (!load) return;
    load().then(() => idle(next), () => idle(next));
  };
  const start = () => setTimeout(() => idle(next), 2000);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
