import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadVendorGalleryImage } from "@/lib/queries/vendorStore";

// ─────────────────────────────────────────────────────────────
// A seller's premises photos (Mitra, 2026-11-13, D3; migration 20261113100000_vendor_registration_core.sql).
//
// Each photo is a vendor_premises_photos row that Cosora reviews before buyers see it. The seller adds and
// deletes rows; the database starts every new row in review, keeps at most 12 that aren't rejected, and copies
// the approved URLs into vendor_profiles.office_photos for the storefront. A browser can no longer write
// office_photos itself (trg_vendor_profiles_registration_guard).
// ─────────────────────────────────────────────────────────────

export const PREMISES_PHOTO_LIMIT = 12;

export type PremisesPhotoStatus = "under_review" | "live" | "rejected";

export interface PremisesPhoto {
  id: string;
  url: string;
  position: number;
  status: PremisesPhotoStatus;
  /** Cosora's reason, shown only while the photo is rejected. */
  rejectionReason: string | null;
}

interface Row { id: string; url: string; position: number; status: PremisesPhotoStatus; rejection_reason: string | null }

export const premisesPhotosKey = (uid: string | undefined) => ["premises_photos", uid ?? null] as const;

async function fetchMyPremisesPhotos(uid: string): Promise<PremisesPhoto[]> {
  const { data, error } = await supabase
    .from("vendor_premises_photos")
    .select("id, url, position, status, rejection_reason")
    .eq("vendor_id", uid)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id, url: r.url, position: r.position, status: r.status,
    rejectionReason: r.status === "rejected" ? r.rejection_reason : null,
  }));
}

/** The signed-in seller's own photos, every status. */
export function useMyPremisesPhotos(uid: string | undefined) {
  return useQuery({
    queryKey: premisesPhotosKey(uid),
    queryFn: () => fetchMyPremisesPhotos(uid as string),
    enabled: Boolean(uid),
    staleTime: 30_000,
  });
}

/** Photos that count toward the limit: the database counts every one that isn't rejected. */
export const countedPhotos = (photos: PremisesPhoto[]) => photos.filter((p) => p.status !== "rejected").length;

/**
 * Upload the files and send them for review. Uploaded one by one so a refusal (the limit) stops the rest; an
 * object whose row was refused is removed again, so nothing is left in Storage that no row points at.
 */
export async function addPremisesPhotos(uid: string, files: File[], existing: PremisesPhoto[]): Promise<number> {
  let position = existing.reduce((m, p) => Math.max(m, p.position), -1) + 1;
  let added = 0;
  for (const file of files) {
    const url = await uploadVendorGalleryImage(uid, file);
    const { error } = await supabase
      .from("vendor_premises_photos")
      .insert({ vendor_id: uid, url, position: Math.min(position, 100) });
    if (error) {
      await removeObject(url);
      throw error;
    }
    position += 1;
    added += 1;
  }
  return added;
}

/** Delete a photo: the row first, then its file (a row never points at a missing file). */
export async function deletePremisesPhoto(photo: PremisesPhoto): Promise<void> {
  const { error } = await supabase.from("vendor_premises_photos").delete().eq("id", photo.id);
  if (error) throw error;
  await removeObject(photo.url);
}

async function removeObject(url: string) {
  const path = url.match(/\/storage\/v1\/object\/public\/product-images\/(.+)$/)?.[1];
  if (!path) return;
  // Best effort: a file left behind is only storage, and the row that pointed at it is already gone.
  await supabase.storage.from("product-images").remove([decodeURIComponent(path)]);
}
