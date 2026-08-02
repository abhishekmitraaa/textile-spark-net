import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { X } from "lucide-react";
import { StarPicker } from "./StarRating";
import { ReviewPhotoPicker, type ReviewPhoto } from "./ReviewPhotoPicker";

/**
 * The one Write-a-Review sheet, shared by every review surface.
 *
 * Replaces four near-identical page-local copies (ProductDetail, VendorProfile,
 * ServiceVendorProfile, FreelancerProfile) that had drifted apart in props,
 * copy and star colours. `allowPhotos` is product-only — `photos` exists on
 * product_reviews and on no other review table.
 */
export function WriteReviewModal({
  open,
  onClose,
  subjectName,
  initialRating = 0,
  initialBody = "",
  initialPhotos,
  allowPhotos = false,
  placeholder = "Share your experience…",
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  subjectName?: string;
  initialRating?: number;
  initialBody?: string;
  initialPhotos?: string[];
  allowPhotos?: boolean;
  placeholder?: string;
  onSubmit: (rating: number, body: string, photos: ReviewPhoto[]) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<ReviewPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset to the incoming values each time the sheet opens, so editing an
  // existing review pre-fills and a fresh one starts blank.
  const seedPhotos = initialPhotos?.join("|") ?? "";
  useEffect(() => {
    if (!open) return;
    setRating(initialRating);
    setBody(initialBody);
    setPhotos(initialPhotos ?? []);
    setSaving(false);
    // seedPhotos keeps the effect stable across a new array identity with the same urls
  }, [open, initialRating, initialBody, seedPhotos]); // eslint-disable-line react-hooks/exhaustive-deps

  const isEdit = initialRating > 0;

  const submit = async () => {
    if (rating === 0) {
      toast.error("Please pick a star rating");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(rating, body, photos);
      toast.success(isEdit ? "Your review has been updated" : "Thanks! Your review has been submitted");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit your review");
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">{isEdit ? "Edit your review" : "Write a Review"}</h3>
              <button onClick={onClose} aria-label="Close">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {subjectName && <p className="text-xs text-gray-500 mb-2">Rate your experience with {subjectName}</p>}

            <StarPicker value={rating} onChange={setRating} size="xl" className="mb-4" />

            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={placeholder}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]"
            />

            {allowPhotos && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Add photos (optional)</p>
                <ReviewPhotoPicker photos={photos} onChange={setPhotos} disabled={saving} />
              </div>
            )}

            <button
              onClick={submit}
              disabled={saving}
              className="mt-4 w-full rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 disabled:opacity-60 text-white py-3 text-sm font-bold transition-colors"
            >
              {saving ? "Submitting…" : isEdit ? "Update Review" : "Submit Review"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
