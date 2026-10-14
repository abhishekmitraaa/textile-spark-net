import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// SITE CONFIG (admin completion Phase 9, 2026-09-29): the site theme and the vendor
// dashboard's banners. Both are edited on Cosora-Admin's Content page (super admins,
// through the admin_site_* RPCs) and only read here. Schema:
// supabase/migrations/20260928195051_site_content.sql.
//
// READ PATH, as FAQs (lib/queries/faqs.ts): site-config/site.json on the Storage CDN
// first, rebuilt by the `site-config-snapshot` edge function after every committed write
// and hourly; the tables second, on any failure (network, timeout, non-200, bad JSON,
// wrong shape). An edit reaches new page loads within about a minute (Smart CDN); a tab
// already open keeps what it has for SITE_CONFIG_STALE_TIME_MS.
//
// EVERYTHING IS CHECKED AGAIN HERE, because it becomes CSS and links: colours must be
// #rrggbb, fonts must be in THEME_FONTS, banner links must be paths on this site and
// images must be in the banner folder. A bad theme is ignored (the index.css defaults
// stay) and a bad banner is dropped.
// ─────────────────────────────────────────────────────────────

export interface SiteTheme {
  vendor_accent: string;
  buyer_accent: string;
  success: string;
  border: string;
  ink: string;
  heading_font: string;
  body_font: string;
}

export interface SiteBanner {
  id: string;
  title: string;
  subtitle: string | null;
  cta_label: string | null;
  link_path: string | null;
  image_path: string | null;
  position: number;
  starts_at: string | null;
  ends_at: string | null;
}

export interface SiteConfig {
  theme: SiteTheme | null;
  banners: SiteBanner[];
  /** Category pictures set in Cosora-Admin, by slot (lib/categoryImageSlots.ts). A slot that
   *  isn't here shows the app's default. Paths in the site-content bucket. */
  categoryImages: Record<string, string>;
}

/**
 * The fonts a theme may use, with the weights Google serves for each. Keep in step with
 * admin.site_theme_fonts(), which refuses anything else.
 */
export const THEME_FONTS: Record<string, string> = {
  "Open Sans": "wght@300;400;500;600;700;800",
  Roboto: "wght@300;400;500;700;900",
  Inter: "wght@300;400;500;600;700",
  Poppins: "wght@300;400;500;600;700",
  Mukta: "wght@300;400;500;600;700",
  "Noto Sans": "wght@300;400;500;600;700",
  "DM Sans": "wght@300;400;500;600;700",
  "Work Sans": "wght@300;400;500;600;700",
  Lato: "wght@300;400;700",
  Montserrat: "wght@300;400;500;600;700",
};

/** Loaded by index.html already. */
const PRELOADED_FONTS = new Set(["Open Sans", "Roboto", "DM Sans"]);

/** What the app shipped before Phase 9, and the index.css defaults. */
export const DEFAULT_THEME: SiteTheme = {
  vendor_accent: "#256fef",
  buyer_accent: "#ef4d62",
  success: "#14ae5c",
  border: "#d0d4dc",
  ink: "#363636",
  heading_font: "Roboto",
  body_font: "Open Sans",
};

export const SITE_CONFIG_BUCKET = "site-config";
/** The file's Cache-Control max-age. Keep in step with MAX_AGE in supabase/functions/site-config-snapshot. */
export const SITE_CONFIG_MAX_AGE_S = 300;
/** How long a loaded config counts as fresh in this tab. */
export const SITE_CONFIG_STALE_TIME_MS = 10 * 60_000;
const SNAPSHOT_TIMEOUT_MS = 3_000;

const HEX = /^#[0-9a-f]{6}$/;
const IMAGE_PATH = /^banners\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/;
const CATEGORY_IMAGE_PATH = /^categories\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/;
/** SLOT_PATTERN in lib/categoryImageSlots.ts, copied: this file loads at start-up and that one pulls in the whole
 *  category list. The table's CHECK is the same rule. */
const SLOT_PATTERN = /^(new-arrivals|categories)\/[a-z0-9-]+(\/[a-z0-9-]+)?$/;

/** A path on this site: one leading "/", never "//" or "/\", no spaces, quotes or angle brackets. */
export function isInternalPath(p: unknown): p is string {
  return typeof p === "string" && p.length <= 200 && /^\/[^/\\]/.test(p) && !/[\s<>"'`\u0000-\u001f]/.test(p);
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() !== "" && v.length <= max ? v : null;

export function parseTheme(t: unknown): SiteTheme | null {
  if (!t || typeof t !== "object") return null;
  const r = t as Record<string, unknown>;
  const colours = ["vendor_accent", "buyer_accent", "success", "border", "ink"] as const;
  for (const k of colours) {
    if (typeof r[k] !== "string" || !HEX.test(r[k] as string)) return null;
  }
  if (typeof r.heading_font !== "string" || !(r.heading_font in THEME_FONTS)) return null;
  if (typeof r.body_font !== "string" || !(r.body_font in THEME_FONTS)) return null;
  return {
    vendor_accent: r.vendor_accent as string,
    buyer_accent: r.buyer_accent as string,
    success: r.success as string,
    border: r.border as string,
    ink: r.ink as string,
    heading_font: r.heading_font,
    body_font: r.body_font,
  };
}

export function parseBanner(b: unknown): SiteBanner | null {
  if (!b || typeof b !== "object") return null;
  const r = b as Record<string, unknown>;
  const title = str(r.title, 80);
  if (typeof r.id !== "string" || !title || typeof r.position !== "number" || !Number.isFinite(r.position)) return null;
  const link = r.link_path == null ? null : isInternalPath(r.link_path) ? r.link_path : undefined;
  const image = r.image_path == null ? null : typeof r.image_path === "string" && IMAGE_PATH.test(r.image_path) ? r.image_path : undefined;
  if (link === undefined || image === undefined) return null;
  const time = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
  return {
    id: r.id,
    title,
    subtitle: str(r.subtitle, 160),
    cta_label: link ? str(r.cta_label, 30) : null,
    link_path: link,
    image_path: image,
    position: r.position,
    starts_at: time(r.starts_at),
    ends_at: time(r.ends_at),
  };
}

/** Slot → picture path. Anything that isn't a known slot shape and a category picture is dropped. */
export function parseCategoryImages(m: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!m || typeof m !== "object" || Array.isArray(m)) return out;
  for (const [slot, path] of Object.entries(m as Record<string, unknown>)) {
    if (SLOT_PATTERN.test(slot) && typeof path === "string" && CATEGORY_IMAGE_PATH.test(path)) out[slot] = path;
  }
  return out;
}

/** A version-1 snapshot, or null ("use the tables"). Bad banners and pictures are dropped, not fatal.
 *  A file written before category pictures existed has no map: none are set. */
export function parseSiteConfig(doc: unknown): SiteConfig | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as { version?: unknown; theme?: unknown; banners?: unknown; category_images?: unknown };
  if (d.version !== 1 || !Array.isArray(d.banners)) return null;
  return {
    theme: d.theme == null ? null : parseTheme(d.theme),
    banners: d.banners.map(parseBanner).filter((b): b is SiteBanner => b !== null),
    categoryImages: parseCategoryImages(d.category_images),
  };
}

async function fromSnapshot(): Promise<SiteConfig | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SNAPSHOT_TIMEOUT_MS);
  try {
    const url = supabase.storage.from(SITE_CONFIG_BUCKET).getPublicUrl("site.json").data.publicUrl;
    // "no-cache" revalidates with the CDN, never the database (see faqs.ts).
    const res = await fetch(url, { cache: "no-cache", signal: ctrl.signal });
    if (!res.ok) return null;
    return parseSiteConfig(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The tables, which RLS limits to the theme, the active banners that haven't ended and the set pictures. */
async function fromTables(): Promise<SiteConfig> {
  const [theme, banners, pictures] = await Promise.all([
    supabase
      .from("site_theme")
      .select("vendor_accent, buyer_accent, success, border, ink, heading_font, body_font")
      .maybeSingle(),
    supabase
      .from("site_banners")
      .select("id, title, subtitle, cta_label, link_path, image_path, position, starts_at, ends_at")
      .order("position", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("category_images").select("id, image_path").not("image_path", "is", null),
  ]);
  if (theme.error) throw theme.error;
  if (banners.error) throw banners.error;
  return {
    theme: theme.data ? parseTheme(theme.data) : null,
    banners: (banners.data ?? []).map(parseBanner).filter((b): b is SiteBanner => b !== null),
    // A failed picture read keeps the defaults rather than failing the theme and banners.
    categoryImages: pictures.error
      ? {}
      : parseCategoryImages(Object.fromEntries((pictures.data ?? []).map((r) => [r.id, r.image_path]))),
  };
}

export function useSiteConfig() {
  return useQuery({
    queryKey: ["site-config"],
    queryFn: async (): Promise<SiteConfig> => (await fromSnapshot()) ?? (await fromTables()),
    staleTime: SITE_CONFIG_STALE_TIME_MS,
    gcTime: 3 * SITE_CONFIG_STALE_TIME_MS,
    retry: 1,
  });
}

/** Shown now: inside its schedule. (Inactive and ended banners never reach the client.) */
export function isBannerLive(b: SiteBanner, now = Date.now()): boolean {
  return (!b.starts_at || Date.parse(b.starts_at) <= now) && (!b.ends_at || Date.parse(b.ends_at) > now);
}

export function bannerImageUrl(path: string): string {
  return supabase.storage.from("site-content").getPublicUrl(path).data.publicUrl;
}

// ── Category pictures (2026-10-14) ────────────────────────────────────────────

/** The last map this browser saw, so a returning visitor's tiles open on the right picture. */
const CATEGORY_IMAGES_CACHE_KEY = "cosora_category_images_v1";

function readCachedCategoryImages(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(CATEGORY_IMAGES_CACHE_KEY);
    return raw ? parseCategoryImages(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * Category pictures, and whether the map can be trusted yet. `ready` is false only on a
 * first visit while the config loads: the tiles then wait instead of showing the default
 * and swapping it a moment later. A failed load counts as ready with no pictures set.
 */
export function useCategoryImages(): { images: Record<string, string>; ready: boolean } {
  const q = useSiteConfig();
  const cached = useMemo(readCachedCategoryImages, []);
  const fresh = q.data?.categoryImages;
  useEffect(() => {
    if (!fresh) return;
    try {
      localStorage.setItem(CATEGORY_IMAGES_CACHE_KEY, JSON.stringify(fresh));
    } catch {
      // private mode or full storage: the next visit just waits for the config
    }
  }, [fresh]);
  if (fresh) return { images: fresh, ready: true };
  if (cached) return { images: cached, ready: true };
  return { images: {}, ready: !q.isLoading };
}

/** The picture for a slot: the one set in Cosora-Admin, else the app's own. */
export function categoryImageUrl(images: Record<string, string>, slot: string, fallback: string): string {
  const path = images[slot];
  return path ? supabase.storage.from("site-content").getPublicUrl(path).data.publicUrl : fallback;
}

// ── Applying a theme ──────────────────────────────────────────────────────────

/** "#256fef" → "37 111 239", the form index.css and tailwind.config.ts use. */
export function hexChannels(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
}

/** Today's stacks stay behind the chosen family, so the defaults give today's stacks exactly. */
export function fontStack(family: string, role: "body" | "heading"): string {
  const rest = role === "body" ? `"Open Sans", Roboto, system-ui, sans-serif` : `"Roboto", "Open Sans", system-ui, sans-serif`;
  const first = role === "body" ? "Open Sans" : "Roboto";
  return family === first ? rest : `"${family}", ${rest}`;
}

export function googleFontUrl(family: string): string | null {
  const weights = THEME_FONTS[family];
  if (!weights || PRELOADED_FONTS.has(family)) return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:${weights}&display=swap`;
}

/** The CSS variables a theme sets on <html>. */
export function themeVariables(t: SiteTheme): Record<string, string> {
  return {
    "--brand-vendor": hexChannels(t.vendor_accent),
    "--brand-buyer": hexChannels(t.buyer_accent),
    "--brand-success": hexChannels(t.success),
    "--brand-border": hexChannels(t.border),
    "--brand-ink": hexChannels(t.ink),
    "--font-body": fontStack(t.body_font, "body"),
    "--font-heading": fontStack(t.heading_font, "heading"),
  };
}

/** Read by the boot script in index.html before the first paint. */
export const THEME_CACHE_KEY = "cosora_site_theme_v1";
