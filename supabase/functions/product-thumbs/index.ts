// ─────────────────────────────────────────────────────────────
// product-thumbs — makes a listing photo's card thumbnail (buyer review H-12, 2026-11-18; Mitra: "Build server-made").
//
// WHAT: one photo per request. It reads `product-images/<path>`, scales it to 480 px on the longer side and writes a
// JPEG to the public `product-thumbs` bucket at the same path with `.jpg` (`<path without extension>.jpg`). Product
// cards ask for the thumbnail first and fall back to the full photo (src/lib/thumbs.ts), so a photo with no thumbnail
// still shows.
//
// WHY THE SERVER MAKES THEM: a thumbnail uploaded by the seller's browser would be a second file the seller controls,
// shown on every card while review only ever sees the full photo. Only the service role writes `product-thumbs`, and
// only from a photo that belongs to a live (approved) listing; a live listing's stored photo can't be replaced
// (storage_object_in_use), and changing its photos sends it back to review.
//
// WHO CALLS IT: admin.queue_product_thumbs() through pg_net when a listing goes live (trg_products_thumbs), one
// request per photo, with the Vault service_role key. One per request because decoding is CPU work and an edge
// function gets ~2 s of CPU per request (a 1280 × 1600 JPEG takes ~1.2–1.6 s here).
//
// FORMATS: JPEG and PNG (ImageScript). Listing photos are stored as JPEG since 2026-11-18 (Upload, registration);
// an older WebP or HEIC photo is skipped and its card keeps the full photo.
//
// verify_jwt = true (config.toml), and the handler requires the service_role claim on top of it.
// ─────────────────────────────────────────────────────────────
import { decode, Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const SOURCE_BUCKET = "product-images";
const THUMB_BUCKET = "product-thumbs";
const THUMB_SIDE = 480;
const JPEG_QUALITY = 78;
// <owner uuid>/<anything safe>.<jpg|jpeg|png> — the shapes Upload and registration write.
const PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._\/-]{1,200}\.(jpe?g|png)$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Reads the `role` claim WITHOUT verifying the signature. Sound only because config.toml sets verify_jwt = true for
// this function, so the platform has already validated the token before this handler runs.
function jwtRole(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const parts = authHeader.slice(7).split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)))?.role ?? null;
  } catch {
    return null;
  }
}

export function thumbPathFor(path: string): string {
  return path.replace(/\.[A-Za-z0-9]+$/, "") + ".jpg";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (jwtRole(req.headers.get("Authorization")) !== "service_role") return json({ error: "service_role_required" }, 403);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "not_configured" }, 500);
  const auth = { apikey: key, authorization: `Bearer ${key}` };

  let path: string;
  try {
    path = String((await req.json())?.path ?? "");
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!PATH_RE.test(path) || path.includes("..")) return json({ error: "bad_path" }, 400);

  // Only a photo of a live (approved) listing gets a thumbnail.
  const like = encodeURIComponent(`*/${SOURCE_BUCKET}/${path}`);
  const check = await fetch(
    `${url}/rest/v1/product_images?select=product_id,products!inner(status)&products.status=eq.live&url=like.${like}&limit=1`,
    { headers: auth },
  );
  if (!check.ok) return json({ error: "lookup_failed", status: check.status }, 502);
  if (((await check.json()) as unknown[]).length === 0) return json({ skipped: "not_a_live_listing_photo" });

  const source = await fetch(`${url}/storage/v1/object/${SOURCE_BUCKET}/${path}`, { headers: auth });
  if (!source.ok) return json({ error: "source_missing", status: source.status }, 404);
  const bytes = new Uint8Array(await source.arrayBuffer());

  let image: Image;
  try {
    const decoded = await decode(bytes);
    if (!(decoded instanceof Image)) return json({ skipped: "not_a_still_image" });
    image = decoded;
  } catch {
    return json({ skipped: "unsupported_format" }); // WebP / HEIC: the card keeps the full photo
  }
  const scale = THUMB_SIDE / Math.max(image.width, image.height);
  if (scale < 1) image.resize(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
  const jpeg = await image.encodeJPEG(JPEG_QUALITY);

  const thumbPath = thumbPathFor(path);
  const put = await fetch(`${url}/storage/v1/object/${THUMB_BUCKET}/${thumbPath}`, {
    method: "POST",
    headers: { ...auth, "content-type": "image/jpeg", "x-upsert": "true", "cache-control": "max-age=31536000" },
    body: jpeg,
  });
  if (!put.ok) return json({ error: "upload_failed", status: put.status, detail: (await put.text()).slice(0, 200) }, 502);
  return json({ ok: true, thumb: thumbPath, width: image.width, height: image.height, bytes: jpeg.length, source_bytes: bytes.length });
});
