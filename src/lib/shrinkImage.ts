/**
 * Shrinks a photo before it's uploaded (2026-10-14, requirement pictures). A phone photo of several
 * megabytes becomes a few hundred kilobytes: every vendor who opens the requirement downloads it, and
 * buyers upload on mobile data. The longest side becomes at most `maxSide`; WebP where the browser can
 * encode it (it keeps a PNG's transparency), JPEG otherwise. A photo already small enough keeps its
 * size and is only re-encoded if that makes it smaller.
 *
 * A picture the browser can't decode (HEIC on most non-Apple browsers) is uploaded as it is, if it's
 * small enough; the bucket serves it either way.
 */

export const UPLOAD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
/** The most an undecodable picture may weigh when it's uploaded as it is. */
const RAW_MAX_BYTES = 8 * 1024 * 1024;

export async function shrinkImage(
  file: File,
  maxSide = 1600,
  /** "jpeg": always a JPEG, on white (2026-10-17: a store banner is a photo, and JPEG renders fastest). */
  format: "auto" | "jpeg" = "auto",
): Promise<{ blob: Blob; ext: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Only pictures can be added (JPEG, PNG or WebP).");
  const raw = () => {
    if (file.size > RAW_MAX_BYTES) throw new Error(`${file.name} is too large. Use a picture under 8 MB.`);
    return { blob: file as Blob, ext: (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg" };
  };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return raw();
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return raw();
  }
  if (format === "jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  let blob = format === "jpeg" ? null : await encode("image/webp");
  let ext = "webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await encode("image/jpeg");
    ext = "jpg";
  }
  if (!blob) return raw();
  // Re-encoding a small, already-compressed photo can make it bigger: keep the original then.
  if (scale === 1 && blob.size >= file.size && file.size <= RAW_MAX_BYTES && (format !== "jpeg" || file.type === "image/jpeg")) return raw();
  return { blob, ext };
}
