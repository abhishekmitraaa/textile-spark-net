import type { QueryClient } from "@tanstack/react-query";
import { prefetchProductById, relatedProductsQuery, vendorOtherProductsQuery } from "@/lib/queries/products";
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
      const id = product[1];
      // Everything keyed by the listing's id starts now, together (speed plan 4.2, 2026-11-27): the page used to
      // read the row first and the rest in two more waves. What needs the seller's id starts when the row arrives.
      const rowReady = prefetchProductById(qc, id);
      void qc.prefetchQuery(relatedProductsQuery(id));
      // The page's other reads live in files the product page loads anyway; fetched here only for a product address,
      // so they add nothing to the first script of other pages.
      void Promise.all([
        import("@/lib/queries/videos"),
        import("@/lib/queries/productDocuments"),
        import("@/lib/queries/reviews"),
      ]).then(([videos, documents, reviews]) => {
        void qc.prefetchQuery(videos.listingVideosQuery(id));
        void qc.prefetchQuery(documents.productDocumentsQuery(id));
        void qc.prefetchQuery(reviews.productReviewsQuery(id));
        return rowReady.then(() => {
          const row = qc.getQueryData<{ vendorId?: string | null } | null>(["products", "detail", id]);
          const vendorId = row?.vendorId;
          if (!vendorId) return;
          void qc.prefetchQuery(reviews.vendorReviewStatsQuery(vendorId));
          void qc.prefetchQuery(vendorOtherProductsQuery(vendorId, id));
        });
      }).catch(() => { /* a head start only */ });
      return;
    }
    const store = pathname.match(/^\/vendor\/([^/]+)\/?$/);
    if (store) void prefetchVendorProfile(qc, decodeURIComponent(store[1]));
  } catch {
    // A prefetch is only a head start: the page reads its data itself either way.
  }
}
