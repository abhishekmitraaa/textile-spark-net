// Signed-out reads through cosora.in's edge cache (speed plan 4.1, 2026-11-27; the function is api/public-data.ts).
//
// The Supabase client's fetch: a read made with the public anon key (nobody signed in) of a listed function or table
// goes to /api/public-data on the site's own connection, where Vercel's edge answers most of them from a cache near
// the visitor instead of the database in Sydney. Everything else (any signed-in request, writes, analytics, counts,
// search) goes to Supabase exactly as before. If the edge answers with a server error or can't be reached, the same
// request goes to Supabase directly, so a broken cache costs a round trip, never a page.

const RPCS = new Set([
  "active_ads", "featured_listings_on", "sample_vendor_ids", "top_vendors", "video_closeups_feed", "feed_products",
  "related_products", "product_review_summary", "vendor_review_stats",
]);
const TABLES = new Set([
  "pref_category_map", "categories", "subscription_plans", "attribute_definitions", "products", "vendor_profiles",
  "product_videos", "product_documents", "product_reviews", "reviews", "catalogues",
]);

/** Only where the function is deployed with this build: the site itself and Vercel's preview addresses. */
function proxyAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const flag = import.meta.env.VITE_PUBLIC_DATA_PROXY;
  if (flag === "off") return false;
  if (flag === "on") return true; // a local server that also serves /api/public-data (tests)
  const h = window.location.hostname;
  return h === "www.cosora.in" || h === "cosora.in" || h.endsWith(".vercel.app");
}

/** The proxy address for a request, or null when it must go to Supabase. Exported for the check script. */
export function proxiedUrl(
  url: string, method: string, headers: Headers, body: unknown, supabaseUrl: string, anonKey: string,
): string | null {
  const rest = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/`;
  if (!url.startsWith(rest)) return null;
  if (headers.get("authorization") !== `Bearer ${anonKey}`) return null; // someone is signed in
  if (headers.has("prefer") || headers.has("range")) return null; // counts, ranges by header, writes
  const accept = headers.get("accept") ?? "application/json";
  const object = accept.includes("vnd.pgrst.object");
  if (!object && !/^(application\/json|\*\/\*)/.test(accept)) return null;
  const path = url.slice(rest.length);
  const route = path.split("?")[0];
  const rpc = route.match(/^rpc\/([a-z_][a-z0-9_]*)$/);
  let b: string | null = null;
  if (rpc) {
    if (method !== "POST" || !RPCS.has(rpc[1])) return null;
    b = typeof body === "string" ? body : body == null ? "{}" : null;
    if (b === null || b.length > 4000) return null;
  } else {
    if (method !== "GET" || !TABLES.has(route)) return null;
  }
  const q = new URLSearchParams({ p: path });
  if (b !== null) q.set("b", b);
  if (object) q.set("acc", "object");
  const out = `/api/public-data?${q.toString()}`;
  return out.length <= 7000 ? out : null;
}

export function publicDataFetch(supabaseUrl: string, anonKey: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (proxyAvailable() && typeof input === "string") {
        const headers = new Headers(init?.headers);
        const target = proxiedUrl(input, (init?.method ?? "GET").toUpperCase(), headers, init?.body, supabaseUrl, anonKey);
        if (target) {
          try {
            const res = await fetch(target, { method: "GET", signal: init?.signal, credentials: "same-origin" });
            // The function refused it (not listed, too long, arguments it won't pass) or the edge failed: go direct.
            if (res.status < 500 && !res.headers.get("x-public-data")) return res;
          } catch (e) {
            if ((e as { name?: string })?.name === "AbortError") throw e;
          }
        }
      }
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") throw e;
    }
    return fetch(input, init);
  };
}
