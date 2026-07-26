import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { createTargetedQuoteRequest, type SizeQty } from "@/lib/queries/rfqs";

interface ProductQuoteRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    id: string;
    vendorId: string;
    name: string;
    /** Real vendor-listed sizes. Empty means the vendor specified none. */
    sizes: string[];
    /** Real single colour, or null when the vendor specified none. */
    colour: string | null;
    customizationAvailable: boolean;
  };
}

interface Row {
  key: number;
  size: string;
  qty: string;
}

const label = "mb-1.5 block text-sm font-semibold text-gray-800";
const input =
  "w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-[#ef4d62] focus:ring-1 focus:ring-[#ef4d62]";

export default function ProductQuoteRequestModal({
  isOpen,
  onClose,
  product,
}: ProductQuoteRequestModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const fileRef = useRef<HTMLInputElement>(null);

  const hasSizes = product.sizes.length > 0;
  const [rows, setRows] = useState<Row[]>([{ key: 0, size: product.sizes[0] ?? "", qty: "" }]);
  const [totalQty, setTotalQty] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [wantsCustom, setWantsCustom] = useState(false);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Sizes already used, so each row offers only the ones still free.
  const takenSizes = useMemo(() => rows.map((r) => r.size).filter(Boolean), [rows]);
  const canAddRow = hasSizes && takenSizes.length < product.sizes.length;

  const total = hasSizes
    ? rows.reduce((n, r) => n + (Number(r.qty) || 0), 0)
    : Number(totalQty) || 0;

  const isValid = total > 0 && (!wantsCustom || notes.trim().length > 0);

  const addRow = () => {
    const free = product.sizes.find((s) => !takenSizes.includes(s));
    if (!free) return;
    setRows((prev) => [...prev, { key: Date.now(), size: free, qty: "" }]);
  };

  const removeRow = (key: number) => setRows((prev) => prev.filter((r) => r.key !== key));
  const patchRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 5 - files.length);
    if (!next.length) return;
    setFiles((prev) => [...prev, ...next].slice(0, 5));
    setPreviews((prev) => [...prev, ...next.map((f) => URL.createObjectURL(f))].slice(0, 5));
  };

  const removeFile = (i: number) => {
    setFiles((prev) => prev.filter((_, x) => x !== i));
    setPreviews((prev) => prev.filter((_, x) => x !== i));
  };

  const reset = () => {
    setRows([{ key: 0, size: product.sizes[0] ?? "", qty: "" }]);
    setTotalQty(""); setBudgetMin(""); setBudgetMax("");
    setWantsCustom(false); setNotes(""); setFiles([]); setPreviews([]);
  };

  const submit = async () => {
    // Same guard pattern as PostRequirement.tsx.
    if (!user) {
      toast.error("Sign in as a buyer to submit", {
        description: "Use the dev switcher (bottom-left) to sign in as Demo Buyer.",
      });
      return;
    }
    if (!isValid || submitting) return;

    setSubmitting(true);
    try {
      const breakdown: SizeQty[] = hasSizes
        ? rows
            .filter((r) => r.size && Number(r.qty) > 0)
            .map((r) => ({ size: r.size, quantity: Number(r.qty) }))
        : [];

      await createTargetedQuoteRequest(user.id, {
        vendorId: product.vendorId,
        productId: product.id,
        productName: product.name,
        sizesBreakdown: breakdown,
        totalQuantity: total,
        colors: product.colour ? [product.colour] : [],
        budgetMin: budgetMin ? Number(budgetMin) : null,
        budgetMax: budgetMax ? Number(budgetMax) : null,
        customizationRequested: wantsCustom,
        customizationNotes: wantsCustom ? notes.trim() : null,
        customizationFiles: wantsCustom ? files : [],
      });

      toast.success("Quote request sent", {
        description: `${product.name} was sent to this vendor only.`,
      });
      reset();
      onClose();
      navigate("/requirement/my-quotes");
    } catch (e) {
      toast.error("Could not send request", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Request a quotation"
            className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900">Request Quotation</h2>
                <p className="truncate text-xs text-gray-500">{product.name}</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-1 transition-colors hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {/* Quantity, by size when the vendor listed sizes */}
              <div>
                <span className={label}>
                  Quantity <span className="text-[#ef4d62]">*</span>
                </span>

                {hasSizes ? (
                  <div className="space-y-2">
                    {rows.map((r) => (
                      <div key={r.key} className="flex items-center gap-2">
                        <select
                          aria-label="Size"
                          value={r.size}
                          onChange={(e) => patchRow(r.key, { size: e.target.value })}
                          className={cn(input, "w-28 shrink-0")}
                        >
                          {product.sizes
                            .filter((s) => s === r.size || !takenSizes.includes(s))
                            .map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                        <input
                          aria-label={`Quantity for size ${r.size}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          placeholder="Qty"
                          value={r.qty}
                          onChange={(e) => patchRow(r.key, { qty: e.target.value })}
                          className={cn(input, "flex-1")}
                        />
                        {rows.length > 1 && (
                          <button
                            onClick={() => removeRow(r.key)}
                            aria-label={`Remove size ${r.size}`}
                            className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}

                    {canAddRow && (
                      <button
                        onClick={addRow}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#ef4d62] transition-opacity hover:opacity-80"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add size
                      </button>
                    )}

                    <p className="text-xs text-gray-500">Total: {total} pieces</p>
                  </div>
                ) : (
                  <>
                    <input
                      aria-label="Total quantity"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="e.g. 500"
                      value={totalQty}
                      onChange={(e) => setTotalQty(e.target.value)}
                      className={input}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      This vendor has not listed sizes for this product.
                    </p>
                  </>
                )}
              </div>

              {/* Colour: the product's real single colour, confirmed not picked */}
              <div>
                <span className={label}>Colour</span>
                {product.colour ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ef4d62] bg-[#ef4d62]/5 px-3 py-1.5 text-xs font-medium text-[#ef4d62]">
                    {product.colour}
                  </span>
                ) : (
                  <p className="text-xs text-gray-500">
                    The vendor has not listed a colour. Mention it in the notes if it matters.
                  </p>
                )}
              </div>

              {/* Estimated budget → existing budget_min / budget_max */}
              <div>
                <span className={label}>Estimated budget per piece</span>
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Budget minimum"
                    type="number" min={0} inputMode="numeric" placeholder="Min ₹"
                    value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)}
                    className={input}
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input
                    aria-label="Budget maximum"
                    type="number" min={0} inputMode="numeric" placeholder="Max ₹"
                    value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)}
                    className={input}
                  />
                </div>
              </div>

              {/* Customization, only when the vendor offers it */}
              {product.customizationAvailable && (
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-gray-800">Need customization?</span>
                    <div className="flex gap-1.5">
                      {[true, false].map((v) => (
                        <button
                          key={String(v)}
                          onClick={() => setWantsCustom(v)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                            wantsCustom === v
                              ? "border-[#ef4d62] bg-[#ef4d62] text-white"
                              : "border-gray-200 text-gray-600 hover:border-[#ef4d62]/40",
                          )}
                        >
                          {v ? "Yes" : "No"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {wantsCustom && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <span className={label}>
                          What needs to change? <span className="text-[#ef4d62]">*</span>
                        </span>
                        <textarea
                          aria-label="Customization details"
                          rows={3}
                          placeholder="e.g. our logo embroidered on the chest, custom neck label"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className={cn(input, "resize-none")}
                        />
                      </div>

                      <div>
                        <span className={label}>Reference images (optional)</span>
                        <div className="flex flex-wrap gap-2">
                          {previews.map((src, i) => (
                            <div key={src} className="relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200">
                              <img src={src} alt={`Reference ${i + 1}`} className="h-full w-full object-cover" />
                              <button
                                onClick={() => removeFile(i)}
                                aria-label={`Remove reference image ${i + 1}`}
                                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          {files.length < 5 && (
                            <button
                              onClick={() => fileRef.current?.click()}
                              className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition-colors hover:border-[#ef4d62] hover:text-[#ef4d62]"
                            >
                              <Upload className="h-4 w-4" />
                              <span className="text-[10px]">Add</span>
                            </button>
                          )}
                        </div>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-500">
                This request goes to this vendor only, not to the open marketplace.
              </p>
            </div>

            <div className="shrink-0 border-t border-gray-100 px-5 py-4">
              <button
                onClick={submit}
                disabled={!isValid || submitting}
                className="w-full rounded-xl bg-[#ef4d62] py-3 text-sm font-bold text-white transition-colors hover:bg-[#ef4d62]/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send request"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
