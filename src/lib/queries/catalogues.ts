import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Vendor catalogues (PDF lookbooks). A vendor uploads a PDF → it enters
// `under_review` and, once approved, is readable by buyers (status='live').
// Files live in the public `catalogues` bucket under the vendor's own folder.
// ─────────────────────────────────────────────────────────────

export interface MyCatalogueRow {
  id: string;
  title: string;
  description: string | null;
  status: "live" | "under_review" | "rejected" | "draft";
  pageCount: number | null;
  fileUrl: string | null;
  coverUrl: string | null;
  createdAt: string;
}

interface RawCatalogue {
  id: string; title: string; description: string | null; status: string;
  page_count: number | null; file_url: string | null; cover_url: string | null; created_at: string;
}

function mapCatalogue(c: RawCatalogue): MyCatalogueRow {
  return {
    id: c.id, title: c.title, description: c.description,
    status: (c.status as MyCatalogueRow["status"]) ?? "under_review",
    pageCount: c.page_count, fileUrl: c.file_url, coverUrl: c.cover_url,
    createdAt: new Date(c.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }),
  };
}

async function fetchMyCatalogues(vendorId: string): Promise<MyCatalogueRow[]> {
  const { data, error } = await supabase
    .from("catalogues")
    .select("id, title, description, status, page_count, file_url, cover_url, created_at")
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
    const ext = c.cover.name.split(".").pop()?.toLowerCase() || "jpg";
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
