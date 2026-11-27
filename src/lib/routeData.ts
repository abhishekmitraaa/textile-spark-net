import type { QueryClient } from "@tanstack/react-query";
import { prefetchProductById } from "@/lib/queries/products";
import { prefetchVendorProfile } from "@/lib/queries/vendor";

// The first page's own data starts with the app, not after the page's file has loaded (speed plan 4.4, 2026-11-27).
// A product or store page loads as its own file; its first read used to begin only once that file had arrived and
// rendered, a round trip or two after the app started. Each entry below starts the same query, under the same key,
// that the page then reads, so nothing is fetched twice. Only pages whose first read depends on the address alone.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function prefetchRouteData(qc: QueryClient, pathname: string): void {
  try {
    const product = pathname.match(/^\/product\/([^/]+)\/?$/);
    if (product && UUID_RE.test(product[1])) {
      void prefetchProductById(qc, product[1]);
      return;
    }
    const store = pathname.match(/^\/vendor\/([^/]+)\/?$/);
    if (store) void prefetchVendorProfile(qc, decodeURIComponent(store[1]));
  } catch {
    // A prefetch is only a head start: the page reads its data itself either way.
  }
}
