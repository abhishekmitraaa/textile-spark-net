import { createClient } from "@supabase/supabase-js";

/**
 * GET /sitemap.xml  (rewritten to /api/sitemap in vercel.json)
 *
 * Emits the buyer app's public marketing routes plus every live blog post from
 * the shared Supabase project. The blog itself is a separate app (cosora-blogs)
 * reverse-proxied at /blogs, so it cannot publish its own sitemap on this
 * origin — the URLs have to be assembled here.
 *
 * Runs on Vercel's Node runtime. `VITE_SUPABASE_*` are the same project env vars
 * the Vite build already uses; at runtime a function reads them from process.env.
 * Anon key only — RLS on blog_posts already limits reads to published, past-dated
 * rows, so there is nothing here a crawler could not see anyway.
 */

/** Minimal structural types so this file needs no @vercel/node dependency. */
type Req = { method?: string };
type Res = {
  setHeader(name: string, value: string): void;
  status(code: number): Res;
  send(body: string): void;
  end(): void;
};

/** Canonical origin. Must match PUBLIC_BASE_URL in the cosora-blogs repo exactly. */
const ORIGIN = "https://www.cosora.in";

/**
 * Public, unauthenticated routes, taken from src/App.tsx rather than assumed.
 *
 * Deliberately excluded: auth and onboarding (/login, /register, /auth/*),
 * anything account- or transaction-scoped (/profile/*, /chats, /leads, /quotes,
 * /subscription, /my-payments, /saved, /recently-viewed, /requirement/*, /kyc,
 * /settings, /upload, /analytics, /my-store, /dashboard, /seller-home), and
 * /products, which is the vendor's own "My Products" screen, not a catalogue.
 * /search is omitted as a thin, query-dependent surface.
 *
 * Note: the brief mentioned /who-we-are and /contact — neither route exists in
 * this router. /blogs/about is the closest equivalent and is included.
 *
 * /blogs/about is served by the Journal app, not this one, but it is the same
 * origin and this is the origin's only sitemap, so it belongs here. The bare
 * /about that used to live in this router now 308s to it (see vercel.json) and
 * is deliberately absent: a sitemap should list destinations, not redirects.
 */
const STATIC_ROUTES: { path: string; priority: string; changefreq: string }[] = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/blogs/about", priority: "0.7", changefreq: "monthly" },
  { path: "/seller", priority: "0.9", changefreq: "weekly" },
  { path: "/categories", priority: "0.8", changefreq: "weekly" },
  { path: "/services", priority: "0.8", changefreq: "weekly" },
  { path: "/freelancers", priority: "0.8", changefreq: "weekly" },
  { path: "/cosora-studio", priority: "0.7", changefreq: "weekly" },
  { path: "/video-closeups", priority: "0.7", changefreq: "daily" },
  { path: "/help", priority: "0.5", changefreq: "monthly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
];

/** XML-escape. Slugs are URL-safe today, but a stray & would break the document. */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, lastmod?: string, changefreq?: string, priority?: string): string {
  return [
    "  <url>",
    `    <loc>${xml(loc)}</loc>`,
    lastmod ? `    <lastmod>${xml(lastmod)}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

type BlogRow = {
  slug: string;
  updated_at: string | null;
  published_at: string | null;
  category: { slug: string } | { slug: string }[] | null;
};

type BlogData = { posts: BlogRow[]; categories: { slug: string; lastmod?: string }[] };

async function fetchBlog(): Promise<BlogData> {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { posts: [], categories: [] };

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 'scheduled' is included because a scheduled post goes live the moment its
  // published_at passes; the RLS policy exposes it without any status flip.
  const [postsRes, catsRes] = await Promise.all([
    supabase
      .from("blog_posts")
      .select("slug,updated_at,published_at,category:blog_categories(slug)")
      .in("status", ["published", "scheduled"])
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false }),
    supabase.from("blog_categories").select("slug").order("sort_order"),
  ]);

  if (postsRes.error) throw new Error(postsRes.error.message);
  if (catsRes.error) throw new Error(catsRes.error.message);

  const posts = (postsRes.data ?? []) as BlogRow[];

  // A category page's lastmod is the newest post in it, so a crawler is told to
  // recheck the listing when its contents actually change.
  const newest = new Map<string, string>();
  for (const p of posts) {
    const cat = Array.isArray(p.category) ? p.category[0] : p.category;
    const when = p.updated_at ?? p.published_at;
    if (!cat?.slug || !when) continue;
    if (!newest.has(cat.slug) || when > (newest.get(cat.slug) as string)) {
      newest.set(cat.slug, when);
    }
  }

  const categories = ((catsRes.data ?? []) as { slug: string }[]).map((c) => ({
    slug: c.slug,
    lastmod: newest.get(c.slug),
  }));

  return { posts, categories };
}

export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  let posts: BlogRow[] = [];
  let categories: { slug: string; lastmod?: string }[] = [];
  let degraded = false;
  try {
    ({ posts, categories } = await fetchBlog());
  } catch {
    // A sitemap missing its blog section still beats a 500: crawlers keep the
    // static routes, and the short s-maxage means the next crawl retries.
    degraded = true;
  }

  const entries = [
    ...STATIC_ROUTES.map((r) =>
      urlEntry(`${ORIGIN}${r.path === "/" ? "/" : r.path}`, undefined, r.changefreq, r.priority),
    ),
    // The blog index itself, then each category listing. Paginated pages
    // (/blogs/page/N) stay out on purpose: they are near-duplicate listings.
    ...(posts.length
      ? [
          urlEntry(
            `${ORIGIN}/blogs`,
            posts
              .map((p) => p.updated_at ?? p.published_at ?? "")
              .sort()
              .pop() || undefined,
            "daily",
            "0.9",
          ),
        ]
      : []),
    ...categories.map((c) =>
      urlEntry(`${ORIGIN}/blogs/category/${c.slug}`, c.lastmod, "weekly", "0.6"),
    ),
    // Full ISO-8601 rather than a date: a same-day correction is otherwise
    // invisible to a crawler that already fetched the page today.
    ...posts.map((p) =>
      urlEntry(
        `${ORIGIN}/blogs/${p.slug}`,
        p.updated_at ?? p.published_at ?? undefined,
        "weekly",
        "0.8",
      ),
    ),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
  ].join("\n");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  // Short shared cache so new posts surface quickly without hitting Supabase on
  // every crawl; stale-while-revalidate keeps the edge warm during a refresh.
  res.setHeader(
    "Cache-Control",
    degraded
      ? "public, s-maxage=60, stale-while-revalidate=300"
      : "public, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.status(200).send(body);
}
