import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fileExt } from "@/lib/fileExt";

// ─────────────────────────────────────────────────────────────
// Vendor catalogues (PDF lookbooks). A vendor uploads a PDF → it enters
// `under_review` and, once approved, is readable by buyers (status='live').
// Files live in the public `catalogues` bucket under the vendor's own folder.
// ─────────────────────────────────────────────────────────────

/** A catalogue address when it is a web address (http or https), else null: the seller writes these addresses, and
 *  a `javascript:` link must never be rendered (the database also refuses one: catalogues_web_urls). */
export function webUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** The file name a downloaded catalogue is saved under: its title, made safe for every OS. */
export function catalogueFileName(title: string | null | undefined): string {
  const base = (title ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "catalogue"}.pdf`;
}

/**
 * Where "Download PDF" points (Mitra, 2026-10-14: a buyer's tap should download the PDF, not open it).
 *
 * A catalogue uploaded through the app lives in the public `catalogues` bucket, and Storage serves it as an
 * attachment, named, when the address asks (`?download=`), so the browser saves it on a phone and a
 * computer alike (an <a download> attribute alone is ignored across origins). An older row holding a web
 * address anywhere else can only be opened, so `download` is false there. Null when there is no web address.
 */
export function catalogueDownload(
  fileUrl: string | null | undefined,
  title: string | null | undefined,
): { href: string; download: boolean } | null {
  const url = webUrl(fileUrl);
  if (!url) return null;
  const prefix = supabase.storage.from("catalogues").getPublicUrl("").data.publicUrl;
  if (!url.startsWith(prefix)) return { href: url, download: false };
  const path = decodeURIComponent(url.slice(prefix.length).split(/[?#]/)[0]);
  if (!path) return null;
  return {
    href: supabase.storage.from("catalogues").getPublicUrl(path, { download: catalogueFileName(title) }).data.publicUrl,
    download: true,
  };
}

export interface MyCatalogueRow {
  id: string;
  title: string;
  description: string | null;
  status: "live" | "under_review" | "rejected" | "draft";
  pageCount: number | null;
  fileUrl: string | null;
  coverUrl: string | null;
  createdAt: string;
  /** Why Cosora didn't approve it (its own catalogues only; null otherwise). */
  rejectionReason?: string | null;
}

interface RawCatalogue {
  id: string; title: string; description: string | null; status: string;
  page_count: number | null; file_url: string | null; cover_url: string | null; created_at: string;
  rejection_reason?: string | null;
}

function mapCatalogue(c: RawCatalogue): MyCatalogueRow {
  return {
    id: c.id, title: c.title, description: c.description,
    status: (c.status as MyCatalogueRow["status"]) ?? "under_review",
    pageCount: c.page_count, fileUrl: c.file_url, coverUrl: c.cover_url,
    createdAt: new Date(c.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }),
    rejectionReason: c.rejection_reason ?? null,
  };
}

async function fetchMyCatalogues(vendorId: string): Promise<MyCatalogueRow[]> {
  const { data, error } = await supabase
    .from("catalogues")
    .select("id, title, description, status, page_count, file_url, cover_url, created_at, rejection_reason")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawCatalogue[]).map(mapCatalogue);
}

export function useMyCatalogues(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["catalogues", "mine", vendorId],
    queryFn: () => fetchMyCatalogues(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

// Buyer-facing: a vendor's live catalogues (for the vendor profile page).
async function fetchVendorCatalogues(vendorId: string): Promise<MyCatalogueRow[]> {
  const { data, error } = await supabase
    .from("catalogues")
    .select("id, title, description, status, page_count, file_url, cover_url, created_at")
    .eq("vendor_id", vendorId)
    .eq("status", "live")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawCatalogue[]).map(mapCatalogue);
}

export function useVendorCatalogues(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["catalogues", "vendor", vendorId],
    queryFn: () => fetchVendorCatalogues(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

export interface NewCatalogue {
  title: string;
  description?: string | null;
  file: File;
  cover?: File | null;
}

export async function createCatalogue(vendorId: string, c: NewCatalogue): Promise<void> {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fpath = `${vendorId}/${key}.pdf`;
  const { error: fe } = await supabase.storage.from("catalogues").upload(fpath, c.file, { upsert: true, contentType: "application/pdf" });
  if (fe) throw fe;
  const file_url = supabase.storage.from("catalogues").getPublicUrl(fpath).data.publicUrl;

  let cover_url: string | null = null;
  if (c.cover) {
    const ext = fileExt(c.cover.name, "jpg");
    const cpath = `${vendorId}/${key}-cover.${ext}`;
    const { error: ce } = await supabase.storage.from("catalogues").upload(cpath, c.cover, { upsert: true });
    if (ce) throw ce;
    cover_url = supabase.storage.from("catalogues").getPublicUrl(cpath).data.publicUrl;
  }

  const { error } = await supabase.from("catalogues").insert({
    vendor_id: vendorId,
    title: c.title,
    description: c.description ?? null,
    file_url,
    cover_url,
    status: "under_review",
  });
  if (error) throw error;
}

export async function deleteCatalogue(id: string): Promise<void> {
  const { error } = await supabase.from("catalogues").delete().eq("id", id);
  if (error) throw error;
}
