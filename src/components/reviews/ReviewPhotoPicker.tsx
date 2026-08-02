import { useEffect, useMemo, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Photo picker for product reviews.
 *
 * Holds a mixed list: `string` entries are photos already uploaded (editing an
 * existing review), `File` entries are newly picked and get uploaded on submit.
 *
 * The 4-photo / 2 MB caps are deliberate, not arbitrary polish. Per CLAUDE.md
 * the Supabase org is on the Free plan, where 5 GB/month of egress is shared
 * across database, auth AND storage org-wide — and review photos are re-read on
 * every product page view, so they are a read-amplified cost. Raise these only
 * alongside a plan upgrade.
 */
export const MAX_REVIEW_PHOTOS = 4;
export const MAX_REVIEW_PHOTO_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export type ReviewPhoto = File | string;

export function ReviewPhotoPicker({
  photos,
  onChange,
  disabled = false,
}: {
  photos: ReviewPhoto[];
  onChange: (next: ReviewPhoto[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URLs for the File entries, revoked when the set changes so a long
  // edit session doesn't leak blobs.
  const previews = useMemo(
    () => photos.map((p) => (typeof p === "string" ? { url: p, revoke: false } : { url: URL.createObjectURL(p), revoke: true })),
    [photos],
  );
  useEffect(() => {
    return () => previews.forEach((p) => p.revoke && URL.revokeObjectURL(p.url));
  }, [previews]);

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_REVIEW_PHOTOS - photos.length;
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_REVIEW_PHOTOS} photos`);
      return;
    }
    const accepted: File[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`${file.name} isn't a JPG, PNG or WebP image`);
        continue;
      }
      if (file.size > MAX_REVIEW_PHOTO_BYTES) {
        toast.error(`${file.name} is over 2 MB`);
        continue;
      }
      accepted.push(file);
    }
    if (files.length > room) toast.info(`Only ${room} more photo${room === 1 ? "" : "s"} could be added`);
    if (accepted.length) onChange([...photos, ...accepted]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAt = (i: number) => onChange(photos.filter((_, n) => n !== i));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {previews.map((p, i) => (
          <div key={p.url} className="relative">
            <img src={p.url} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 bg-gray-100" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              disabled={disabled}
              aria-label="Remove photo"
              className="absolute -top-1.5 -right-1.5 rounded-full bg-gray-900/80 p-0.5 text-white hover:bg-gray-900 disabled:opacity-50"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {photos.length < MAX_REVIEW_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="w-16 h-16 rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:border-[#ef4d62] hover:text-[#ef4d62] transition-colors disabled:opacity-50"
          >
            <ImagePlus className="w-5 h-5" />
            <span className="text-[9px] font-semibold">Add</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        hidden
        onChange={(e) => pick(e.target.files)}
      />
      <p className="mt-1.5 text-[11px] text-gray-400">Up to {MAX_REVIEW_PHOTOS} photos · JPG, PNG or WebP · max 2 MB each</p>
    </div>
  );
}
