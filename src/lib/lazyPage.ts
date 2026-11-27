import { lazy, type ComponentType } from "react";

// Pages load as their own files (review M-34): the first visit downloaded every page in one script before anything
// showed. A page file that a deploy replaced is reloaded once by RouteErrorBoundary (src/lib/newDeploy.ts).

type Loader = () => Promise<unknown>;
export type WarmSide = "buyer" | "seller";
const warmLoaders: Record<WarmSide, Loader[]> = { buyer: [], seller: [] };
let warmScheduled = false;

/**
 * `React.lazy` for a route. `warm: "buyer"` / `"seller"` fetches the file in the background once the first page's own
 * files and data have arrived and the browser is idle, so the page most people on that side open next shows at once.
 * Keep it to about three pages per side (speed plan 1.4): every warmed file is downloaded on every first visit, and on
 * a phone it competed with the page being opened (16 pages, ~100 files, before 2026-11-27).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, opts?: { warm?: WarmSide }) {
  if (opts?.warm) warmLoaders[opts.warm].push(load);
  return lazy(load);
}

/** The seller side's pages (the paths the seller frame draws). Anything else warms the buyer pages. */
const SELLER_PATH =
  /^\/(seller-home|my-store|products|upload|upload-video|upload-catalogue|leads|lead-alerts|overseas-leads|analytics|advertisements|subscription|my-payments|business-profile|business-profile-score|notifications|settings|crm|kyc|quotes|reviews|visibility|onboarding|catalogue|account-manager|competitor-ads|dashboard)(\/|$)/;

export function warmSideFor(pathname: string): WarmSide {
  return SELLER_PATH.test(pathname) ? "seller" : "buyer";
}

type Conn = { saveData?: boolean; effectiveType?: string };

/** Warm only where it costs the visitor nothing they'd notice: no data saver, a 4G-class link, a phone with memory. */
export function canWarm(conn: Conn | undefined, deviceMemory: number | undefined): boolean {
  if (conn?.saveData) return false;
  if (conn?.effectiveType && conn.effectiveType !== "4g") return false;
  if (typeof deviceMemory === "number" && deviceMemory < 4) return false;
  return true;
}

function idle(fn: () => void) {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) ric(fn, { timeout: 4000 });
  else setTimeout(fn, 1500);
}

/** Calls `fn` once the network has been quiet for `quietMs` (no new resource), or after `maxMs` at the latest. */
function whenNetworkQuiet(fn: () => void, quietMs = 2000, maxMs = 15000) {
  const started = performance.now();
  let last = performance.now();
  let obs: PerformanceObserver | null = null;
  try {
    obs = new PerformanceObserver(() => { last = performance.now(); });
    obs.observe({ type: "resource", buffered: false });
  } catch { /* no observer: fall back to the timers alone */ }
  const tick = () => {
    const now = performance.now();
    if (now - last >= quietMs || now - started >= maxMs) {
      obs?.disconnect();
      fn();
    } else setTimeout(tick, 250);
  };
  setTimeout(tick, quietMs);
}

/** One file at a time, each when the browser is idle, after the first page has finished loading its own data. */
export function scheduleWarmPages(): void {
  if (warmScheduled || typeof window === "undefined") return;
  warmScheduled = true;
  const nav = navigator as unknown as { connection?: Conn; deviceMemory?: number };
  if (!canWarm(nav.connection, nav.deviceMemory)) return;
  const start = () =>
    whenNetworkQuiet(() => {
      const queue = [...warmLoaders[warmSideFor(window.location.pathname)]];
      const next = () => {
        const load = queue.shift();
        if (!load) return;
        load().then(() => idle(next), () => idle(next));
      };
      idle(next);
    });
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
