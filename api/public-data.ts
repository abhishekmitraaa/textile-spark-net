/**
 * Public data through Vercel's edge cache (speed plan 4.1, 2026-11-27).
 *
 * A signed-out visitor's reads are the same for every signed-out visitor (row level security decides what the anon
 * role sees; nothing here knows who is asking). From India each of them went to the database in Sydney: ~0.4 s on an
 * open connection, ~1.3 s on a new one. The app (src/lib/publicData.ts) now asks this function instead, on cosora.in's
 * own connection, and Vercel's edge keeps the answer for a minute: most reads come from an edge near the visitor.
 *
 *   GET /api/public-data?p=<rest path and query>&b=<json body for an rpc>&acc=object
 *
 * Only the reads listed below pass, with bounded arguments, and only with the public anon key: no visitor token is
 * accepted or forwarded, so nothing signed-in or private can be cached here. Writes and analytics never come here.
 * Search is not listed: its calls feed the trending terms. A change in the database (a moderator's takedown too) shows
 * to signed-out visitors within ~60 s (s-maxage), at most ~3 minutes for an answer nobody asked for in between
 * (stale-while-revalidate=120). Signed-in visitors always read the database directly.
 */

type Req = { method?: string; url?: string };
type Res = {
  setHeader(name: string, value: string): void;
  status(code: number): Res;
  send(body: string): void;
  end(): void;
};

const RPCS = new Set([
  "active_ads",
  "featured_listings_on",
  "sample_vendor_ids",
  "top_vendors",
  "video_closeups_feed",
  "feed_products",
  "related_products",
  "product_review_summary",
  "vendor_review_stats",
]);
const TABLES = new Set([
  "pref_category_map",
  "categories",
  "subscription_plans",
  "attribute_definitions",
  "products",
  "vendor_profiles",
  "product_videos",
  "product_documents",
  "product_reviews",
  "reviews",
  "catalogues",
]);

const MAX_PATH = 6000;
const MAX_BODY = 4000;

/** A small, flat argument object: names like p_limit, values that are plain scalars or short lists of them. */
export function argsOk(body: unknown): boolean {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return false;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length > 16) return false;
  const scalar = (v: unknown) =>
    v === null || typeof v === "boolean" ||
    (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 100000) ||
    (typeof v === "string" && v.length <= 200);
  return entries.every(([k, v]) =>
    /^[a-z][a-z0-9_]{0,40}$/.test(k) &&
    (scalar(v) || (Array.isArray(v) && v.length <= 100 && v.every((x) => scalar(x) && (typeof x !== "string" || x.length <= 100)))));
}

/** "rpc/feed_products?select=id" or "products?select=…&id=eq.…": which kind, and whether it is listed. */
export function classify(path: string): { kind: "rpc" | "table"; name: string } | null {
  if (!path || path.length > MAX_PATH || /[\s#\\]|\.\.|\/\//.test(path)) return null;
  const [route] = path.split("?");
  const rpc = route.match(/^rpc\/([a-z_][a-z0-9_]*)$/);
  if (rpc) return RPCS.has(rpc[1]) ? { kind: "rpc", name: rpc[1] } : null;
  const table = route.match(/^([a-z_][a-z0-9_]*)$/);
  if (table) return TABLES.has(table[1]) ? { kind: "table", name: table[1] } : null;
  return null;
}

export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  const url = (process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? "";
  const params = new URL(req.url ?? "/", "http://local").searchParams;
  const path = params.get("p") ?? "";
  const rawBody = params.get("b");
  const target = classify(path);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!url || !anon || !target) {
    // The app sends the same request to Supabase when it sees this header (src/lib/publicData.ts).
    res.setHeader("X-Public-Data", "refused");
    res.setHeader("Cache-Control", "no-store");
    res.status(target ? 503 : 400).send(JSON.stringify({ message: target ? "not_configured" : "not_allowed" }));
    return;
  }
  let body: string | undefined;
  if (target.kind === "rpc") {
    body = rawBody ?? "{}";
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = undefined; }
    if (body.length > MAX_BODY || !argsOk(parsed)) {
      res.setHeader("X-Public-Data", "refused");
      res.setHeader("Cache-Control", "no-store");
      res.status(400).send(JSON.stringify({ message: "bad_arguments" }));
      return;
    }
  }
  const headers: Record<string, string> = {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    Accept: params.get("acc") === "object" ? "application/vnd.pgrst.object+json" : "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const upstream = await fetch(`${url}/rest/v1/${path}`, {
      method: target.kind === "rpc" ? "POST" : "GET",
      headers,
      body,
    });
    const text = await upstream.text();
    const range = upstream.headers.get("content-range");
    if (range) res.setHeader("Content-Range", range);
    const type = upstream.headers.get("content-type");
    if (type) res.setHeader("Content-Type", type);
    // The browser always asks again (the edge answers fast); the edge keeps a good answer for a minute.
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    if (upstream.ok) res.setHeader("CDN-Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    else res.setHeader("CDN-Cache-Control", "no-store");
    res.status(upstream.status).send(text);
  } catch {
    res.setHeader("X-Public-Data", "refused");
    res.setHeader("Cache-Control", "no-store");
    res.status(502).send(JSON.stringify({ message: "upstream_unreachable" }));
  }
}
