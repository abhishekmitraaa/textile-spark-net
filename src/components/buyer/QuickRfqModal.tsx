import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface QuickRfqModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickRfqModal({ isOpen, onClose }: QuickRfqModalProps) {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const isValid = productName.trim().length > 0 && quantity.trim().length > 0;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).slice(0, 5 - images.length);
    next.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => setImages(prev => [...prev, reader.result as string].slice(0, 5));
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = () => {
    if (!isValid) return;
    toast.success("Quick Quote submitted!", { description: "Manufacturers will respond within minutes." });
    setProductName(""); setQuantity(""); setNotes(""); setImages([]);
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
                <Zap className="w-4 h-4 text-[#ef4d62] fill-[#ef4d62]" />
                <h2 className="text-base font-bold text-gray-900">Quick Quote</h2>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              {/* Reference Images */}
              <div>
                <label className="text-sm font-semibold text-gray-800 mb-1.5 block">
                  Reference Images <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                {images.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 flex flex-col items-center gap-2 hover:border-[#ef4d62]/40 hover:bg-[#fff5f6] transition-colors"
                  >
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-[#ef4d62] font-medium">Click to upload or drag &amp; drop</span>
                    <span className="text-xs text-gray-400">PNG, JPG up to 10MB</span>
                  </button>
                ) : (
                  <>
                    <div className="grid grid-cols-5 gap-2 mb-1.5">
                      {images.map((img, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-100">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                          <button
                            onClick={() => removeImage(i)}
                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#ef4d62] rounded-full flex items-center justify-center"
                          >
                            <X className="w-2.5 h-2.5 text-white" />
                          </button>
                        </div>
                      ))}
                      {images.length < 5 && (
                        <button
                          onClick={() => fileRef.current?.click()}
                          className="aspect-square rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center hover:border-[#ef4d62]/40 transition-colors"
                        >
                          <Upload className="w-4 h-4 text-gray-300" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{images.length}/5 images</p>
                  </>
                )}
                <input
                  ref={fileRef} type="file" accept="image/png,image/jpeg" multiple hidden
                  onChange={e => handleFiles(e.target.files)}
                />
              </div>

              {/* Product Name */}
              <div>
                <label className="text-sm font-semibold text-gray-800 mb-1.5 block">
                  Product Name <span className="text-[#ef4d62]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Cotton T-Shirt, Leather Wallet"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#ef4d62] transition-colors"
                />
              </div>

              {/* Quantity */}
              <div>
                <label className="text-sm font-semibold text-gray-800 mb-1.5 block">
                  Quantity <span className="text-[#ef4d62]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., 500 pieces, 1000 units"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#ef4d62] transition-colors"
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
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#ef4d62] transition-colors resize-none"
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!isValid}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3.5 text-sm font-bold rounded-xl transition-colors",
                  isValid
                    ? "bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                <Zap className="w-4 h-4 fill-white" /> Submit Quick Quote
              </button>

              <p className="text-center text-xs text-gray-400">
                Need more options?{" "}
                <button
                  onClick={() => { onClose(); navigate("/requirement/post-requirement"); }}
                  className="text-[#ef4d62] font-semibold hover:underline"
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