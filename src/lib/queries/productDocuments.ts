import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// A listing's PDFs: spec sheets, catalogues, test reports (2026-10-17; the product form's "Add PDF" kept only the
// file name). Files in the public `product-files` bucket under <vendor>/<listing>/<random>.pdf, one
// product_documents row each (migration 20261017130000). Buyers see them on a live listing; the vendor and
// Cosora's admins always.
// ─────────────────────────────────────────────────────────────

export const PRODUCT_FILES_BUCKET = "product-files";
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDFS = 3;

export interface ProductDocument {
  id: string;
  name: string;
  sizeBytes: number | null;
  url: string;
}

/** A PDF by its type and its first bytes ("%PDF-"), at most 10 MB. Throws with the reason. */
export async function checkPdf(file: File): Promise<void> {
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) throw new Error(`${file.name} isn't a PDF.`);
  if (file.size > MAX_PDF_BYTES) throw new Error(`${file.name} is over 10 MB.`);
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== "%PDF-") throw new Error(`${file.name} isn't a real PDF.`);
}

/** Uploads the PDFs and records them, in order after `start`. Returns how many were stored. */
export async function uploadProductDocuments(vendorId: string, productId: string, files: File[], start = 0): Promise<number> {
  let stored = 0;
  for (const [i, file] of files.entries()) {
    const path = `${vendorId}/${productId}/${crypto.randomUUID()}.pdf`;
    const up = await supabase.storage.from(PRODUCT_FILES_BUCKET).upload(path, file, { contentType: "application/pdf" });
    if (up.error) throw up.error;
    const { error } = await supabase.from("product_documents").insert({
      product_id: productId,
      path,
      name: file.name.slice(0, 120),
      size_bytes: file.size,
      position: start + i,
    });
    if (error) {
      // Row refused (e.g. the 3-PDF cap): don't leave the file behind.
      await supabase.storage.from(PRODUCT_FILES_BUCKET).remove([path]);
      throw error;
    }
    stored++;
  }
  return stored;
}

export async function fetchProductDocuments(productId: string): Promise<ProductDocument[]> {
  const { data, error } = await supabase
    .from("product_documents")
    .select("id, name, size_bytes, path")
    .eq("product_id", productId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    sizeBytes: d.size_bytes,
    url: supabase.storage.from(PRODUCT_FILES_BUCKET).getPublicUrl(d.path).data.publicUrl,
  }));
}

export function useProductDocuments(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["product_documents", productId],
    queryFn: () => fetchProductDocuments(productId as string),
    enabled: Boolean(productId),
    staleTime: 5 * 60_000,
  });
}

export function fileSizeLabel(bytes: number | null): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
