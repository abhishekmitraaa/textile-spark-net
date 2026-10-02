import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Admin-editable FAQs (Phase 9, 2026-09-23). Written from Cosora-Admin's FAQs
// page through admin_faq_* RPCs. The apps only ever read them. Signed-out
// visitors read them too: faqs_select_active admits anon for active rows.
// Schema and rules: supabase/migrations/20260923144549_faqs_admin_editable.sql.
//
// READ PATH (Phase 23, 2026-09-24): a static JSON snapshot per surface on the
// Storage CDN first, the table second. The `faqs-snapshot` edge function rebuilds
// the three files after every committed FAQ write and hourly
// (20260924174051_faq_snapshots_cdn_cache.sql), so FAQ page loads stop spending a
// PostgREST request each on content that changes a few times a month. Any failure
// to get a usable snapshot (network, timeout, non-200, bad JSON, wrong shape) falls
// back to the table query, unchanged from before: the page never depends on the
// cache alone.
//
// HOW FRESH: Storage's CDN runs as Smart CDN here (`x-smart-cdn: true`), so a
// rebuilt file invalidates the edge copy. Measured: an admin's edit reaches every
// new page load within ~47 s (the origin file within 2–3 s; Supabase quotes up to
// 60 s). FAQ_SNAPSHOT_MAX_AGE_S is the bound if Smart CDN were off. A page already
// open keeps what it has for FAQ_STALE_TIME_MS.
// ─────────────────────────────────────────────────────────────

// seller_help (Help & Support P5, 2026-10-01): the Help page for sellers. A new surface is
// listed in five places; the migration 20261002104545 names them all.
export type FaqSurface = "buyer_help" | "seller_help" | "seller_registration" | "subscription";

/** Stored translations (P5, 2026-10-01): written in Cosora-Admin, cleared when the English changes. */
export type FaqTranslations = Partial<Record<"hi" | "gu", { question: string; answer: string }>>;

export interface FaqRow {
  id: string;
  category_label: string | null;
  question: string;
  answer: string;
  position: number;
  translations?: FaqTranslations;
}

/**
 * The question and answer in the reader's language. A stored translation wins; without
 * one, the English comes back with `stored: false` and the page translator (AutoTranslate)
 * may still find it in the catalogues, as before P5. Render stored text inside
 * data-no-translate so the translator leaves it alone.
 */
export function faqText(row: FaqRow, lang: string): { question: string; answer: string; stored: boolean } {
  const t = lang === "hi" || lang === "gu" ? row.translations?.[lang] : undefined;
  if (t?.question && t.answer) return { question: t.question, answer: t.answer, stored: true };
  return { question: row.question, answer: row.answer, stored: false };
}

function parseTranslations(v: unknown): FaqTranslations | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: FaqTranslations = {};
  for (const lang of ["hi", "gu"] as const) {
    const t = (v as Record<string, unknown>)[lang] as { question?: unknown; answer?: unknown } | undefined;
    if (t && typeof t.question === "string" && typeof t.answer === "string" && t.question && t.answer) {
      out[lang] = { question: t.question, answer: t.answer };
    }
  }
  return out;
}

export const FAQ_SNAPSHOT_BUCKET = "faq-snapshots";
/** The files' Cache-Control max-age. Keep in step with MAX_AGE in supabase/functions/faqs-snapshot. */
export const FAQ_SNAPSHOT_MAX_AGE_S = 300;
/** How long a loaded FAQ list counts as fresh in this tab. */
export const FAQ_STALE_TIME_MS = 10 * 60_000;
const SNAPSHOT_TIMEOUT_MS = 3_000;

/** The public CDN URL of one surface's snapshot. Built locally; no request. */
export function faqSnapshotUrl(surface: FaqSurface): string {
  return supabase.storage.from(FAQ_SNAPSHOT_BUCKET).getPublicUrl(`${surface}.json`).data.publicUrl;
}

/**
 * A snapshot's rows, or null if `doc` isn't a version-1 snapshot of `surface`
 * whose every row has the fields the pages render. Null means "use the table".
 */
export function parseFaqSnapshot(doc: unknown, surface: FaqSurface): FaqRow[] | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as { version?: unknown; surface?: unknown; count?: unknown; rows?: unknown };
  if (d.version !== 1 || d.surface !== surface || !Array.isArray(d.rows) || d.count !== d.rows.length) return null;
  const rows: FaqRow[] = [];
  for (const r of d.rows as Record<string, unknown>[]) {
    if (
      !r || typeof r.id !== "string" || typeof r.question !== "string" || typeof r.answer !== "string" ||
      typeof r.position !== "number" || !Number.isFinite(r.position) ||
      (r.category_label !== null && typeof r.category_label !== "string")
    ) {
      return null;
    }
    rows.push({
      id: r.id, category_label: r.category_label as string | null, question: r.question, answer: r.answer,
      position: r.position,
      // Optional: files written before P5 have none, and still parse.
      translations: parseTranslations(r.translations),
    });
  }
  return rows;
}

/** The CDN snapshot, or null on any failure. */
async function fromSnapshot(surface: FaqSurface): Promise<FaqRow[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SNAPSHOT_TIMEOUT_MS);
  try {
    // "no-cache" revalidates with the CDN (a 304 or a cached copy, never the
    // database). The CDN sends no Age header, so a browser caching on its own could
    // keep a nearly-expired copy for another full max-age.
    const res = await fetch(faqSnapshotUrl(surface), { cache: "no-cache", signal: ctrl.signal });
    if (!res.ok) return null;
    return parseFaqSnapshot(await res.json(), surface);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The table, as before Phase 23. `active` is filtered explicitly even though the
 * policy already requires it: an admin browsing the app would otherwise be judged
 * by whatever RLS lets them see, not by what buyers get.
 */
async function fromTable(surface: FaqSurface): Promise<FaqRow[]> {
  const query = (columns: string) =>
    supabase
      .from("faqs")
      .select(columns)
      .eq("surface", surface)
      .eq("active", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
  let { data, error } = await query("id, category_label, question, answer, position, translations");
  // 42703: no translations column yet (this build reached users before the P5
  // migration). Read what there is rather than showing no FAQs.
  if (error?.code === "42703") ({ data, error } = await query("id, category_label, question, answer, position"));
  if (error) throw error;
  return ((data ?? []) as unknown as (FaqRow & { translations?: unknown })[]).map((r) => ({
    ...r,
    translations: parseTranslations(r.translations),
  }));
}

/** One surface's active FAQs, in admin order: the CDN snapshot, or the table if that fails. */
export function useFaqs(surface: FaqSurface) {
  return useQuery({
    queryKey: ["faqs", surface],
    queryFn: async (): Promise<FaqRow[]> => (await fromSnapshot(surface)) ?? (await fromTable(surface)),
    staleTime: FAQ_STALE_TIME_MS,
    gcTime: 3 * FAQ_STALE_TIME_MS,
  });
}

export interface FaqGroup {
  label: string;
  faqs: FaqRow[];
}

/**
 * Group rows by category_label. Groups come out in order of their first
 * (smallest-position) row, which is how the admin orders them. Rows without a
 * label fall into "General".
 */
export function groupFaqs(rows: FaqRow[]): FaqGroup[] {
  const groups = new Map<string, FaqRow[]>();
  for (const r of rows) {
    const label = r.category_label?.trim() || "General";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(r);
  }
  return Array.from(groups, ([label, faqs]) => ({ label, faqs }));
}
