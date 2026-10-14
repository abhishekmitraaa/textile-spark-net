import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { createRfq, uploadRfqImages, RFQ_MAX_IMAGES } from "@/lib/queries/rfqs";
import { UPLOAD_IMAGE_TYPES } from "@/lib/shrinkImage";
import { errorMessage } from "@/lib/errorMessage";

interface QuickRfqModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Photo { file: File; url: string }

/**
 * Quick Quote: a name, a quantity, photos and a note, posted as an open requirement.
 *
 * Until 2026-10-14 it saved nothing: Submit showed "Quick Quote submitted!" and opened My Quotes,
 * where the requirement wasn't, and its photos were only ever read into the page. It now uploads the
 * photos (lib/queries/rfqs.ts uploadRfqImages) and writes the requirement (createRfq) before it says
 * so. No category is asked for: matching reads the name and notes (semantic leads, RFQ/leads R2).
 */
export default function QuickRfqModal({ isOpen, onClose }: QuickRfqModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isValid = productName.trim().length > 0 && quantity.trim().length > 0;

  // Previews are object URLs: free them when they go, and when the modal goes.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files);
    const usable = picked.filter((f) => f.type.startsWith("image/"));
    if (usable.length < picked.length) toast.error("Only photos can be added.");
    setPhotos((prev) => {
      const room = Math.max(RFQ_MAX_IMAGES - prev.length, 0);
      return [...prev, ...usable.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))];
    });
  };

  const removeImage = (idx: number) =>
    setPhotos((prev) => {
      const gone = prev[idx];
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((_, i) => i !== idx);
    });

  const reset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setProductName(""); setQuantity(""); setNotes(""); setPhotos([]);
  };

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    if (!user) {
      toast.error("Sign in to post a requirement", {
        action: { label: "Sign in", onClick: () => { onClose(); navigate("/login"); } },
      });
      return;
    }
    const name = productName.trim();
    const qtyText = quantity.trim();
    const qty = parseInt(qtyText.replace(/[^\d]/g, ""), 10);
    // The quantity box is free text ("500 pieces"): the number goes in its column, and the words
    // stay with the notes so nothing the buyer typed is lost.
    const description = [`Quantity: ${qtyText}`, notes.trim()].filter(Boolean).join("\n");
    setSubmitting(true);
    try {
      const images = photos.length ? await uploadRfqImages(user.id, photos.map((p) => p.file)) : [];
      await createRfq(user.id, {
        title: name.slice(0, 120),
        productName: name,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : null,
        description,
        images,
      });
      await queryClient.invalidateQueries({ queryKey: ["rfqs"] });
    } catch (e) {
      toast.error("Couldn't post your Quick Quote", { description: errorMessage(e) });
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    toast.success("Quick Quote posted", { description: "Sellers can see it now and send you quotes." });
    reset();
    onClose();
    navigate("/requirement/my-quotes");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand-buyer fill-brand-buyer" />
                <h2 className="text-base font-bold text-gray-900">Quick Quote</h2>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              {/* Product/Service Name */}
              <div>
                <label className="text-sm font-semibold text-gray-800 mb-1.5 block">
                  Product / Service Name <span className="text-brand-buyer">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Cotton T-Shirt, Leather Wallet"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-buyer transition-colors"
                />
              </div>

              {/* Quantity */}
              <div>
                <label className="text-sm font-semibold text-gray-800 mb-1.5 block">
                  Quantity <span className="text-brand-buyer">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., 500 pieces, 1000 units"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-buyer transition-colors"
                />
              </div>

              {/* Reference Images */}
              <div>
                <label className="text-sm font-semibold text-gray-800 mb-1.5 block">
                  Reference Images <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                {photos.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                    className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 flex flex-col items-center gap-2 hover:border-brand-buyer/40 hover:bg-[#fff5f6] transition-colors"
                  >
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-brand-buyer font-medium">Click to upload or drag &amp; drop</span>
                    <span className="text-xs text-gray-400">JPEG, PNG or WebP · up to {RFQ_MAX_IMAGES} photos</span>
                  </button>
                ) : (
                  <>
                    <div className="grid grid-cols-5 gap-2 mb-1.5">
                      {photos.map((p, i) => (
                        <div key={p.url} className="relative aspect-square rounded-lg overflow-hidden border border-gray-100">
                          <img src={p.url} alt={p.file.name} className="w-full h-full object-cover" />
                          <button
                            onClick={() => removeImage(i)}
                            aria-label={`Remove ${p.file.name}`}
                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-brand-buyer rounded-full flex items-center justify-center"
                          >
                            <X className="w-2.5 h-2.5 text-white" />
                          </button>
                        </div>
                      ))}
                      {photos.length < RFQ_MAX_IMAGES && (
                        <button
                          onClick={() => fileRef.current?.click()}
                          className="aspect-square rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center hover:border-brand-buyer/40 transition-colors"
                        >
                          <Upload className="w-4 h-4 text-gray-300" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{photos.length}/{RFQ_MAX_IMAGES} photos · the first is the cover sellers see</p>
                  </>
                )}
                <input
                  ref={fileRef} type="file" accept={UPLOAD_IMAGE_TYPES.join(",")} multiple hidden
                  onChange={e => { handleFiles(e.target.files); e.target.value = ""; }}
                />
              </div>

              {/* Quick Notes */}
              <div>
                <label className="text-sm font-semibold text-gray-800 mb-1.5 block">
                  Quick Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Any specific requirements? Colors, sizes, fabric..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-buyer transition-colors resize-none"
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!isValid || submitting}
                aria-busy={submitting}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3.5 text-sm font-bold rounded-xl transition-colors",
                  isValid
                    ? "bg-brand-buyer hover:bg-brand-buyer/90 disabled:opacity-70 text-white"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                <Zap className="w-4 h-4 fill-white" />
                {submitting ? (photos.length ? "Uploading photos…" : "Posting…") : "Submit Quick Quote"}
              </button>

              <p className="text-center text-xs text-gray-400">
                Need more options?{" "}
                <button
                  onClick={() => { onClose(); navigate("/requirement/post-requirement"); }}
                  className="text-brand-buyer font-semibold hover:underline"
                >
                  Create detailed Quote
                </button>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}