/**
 * A listing photo's card thumbnail (buyer review H-12, 2026-11-18). The edge function `product-thumbs` writes a 480 px
 * JPEG of each approved photo to the public `product-thumbs` bucket at the same path with `.jpg`. This returns that
 * address for a photo in this project's `product-images` bucket, and null for anything else (a photo elsewhere has no
 * thumbnail). A photo whose thumbnail isn't there yet still shows: <CardPhotos> falls back to the full photo.
 */
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
const SOURCE = `${SUPABASE_URL}/storage/v1/object/public/product-images/`;
const THUMBS = `${SUPABASE_URL}/storage/v1/object/public/product-thumbs/`;

export function thumbUrl(photoUrl: string | null | undefined): string | null {
  if (!photoUrl || !SUPABASE_URL || !photoUrl.startsWith(SOURCE)) return null;
  const path = photoUrl.slice(SOURCE.length).split(/[?#]/)[0];
  if (!/\.(jpe?g|png)$/i.test(path)) return null; // WebP / HEIC photos aren't thumbnailed
  // The source path plus ".jpg" (x.png -> x.png.jpg): one thumbnail per photo, never shared (security review, 2026-11-18).
  return THUMBS + path + ".jpg";
}
