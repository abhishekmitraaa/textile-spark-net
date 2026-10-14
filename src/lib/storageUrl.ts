/**
 * Whether a URL is a public object in this project's Storage (2026-10-14).
 *
 * For URLs a buyer writes themselves: `rfqs.image`, `images` and `customization_images` could hold
 * any URL, and every vendor who opens the requirement would fetch it (a tracking pixel, or a picture
 * that isn't theirs). The app only ever writes Storage URLs there, so anything else is dropped where
 * those rows are mapped (lib/queries/rfqs.ts). Listing pictures are a vendor's and aren't checked.
 */
const STORAGE_PREFIX = `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/storage/v1/object/public/`;

export function isOwnStorageUrl(src: unknown): src is string {
  return typeof src === "string" && STORAGE_PREFIX.length > 30 && src.startsWith(STORAGE_PREFIX) && !/[\s"'<>]/.test(src);
}

/** The URL if it's one of ours, else null. */
export function ownStorageUrl(src: unknown): string | null {
  return isOwnStorageUrl(src) ? src : null;
}
