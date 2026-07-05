import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Star, MoreVertical, Pencil, Trash2, Store, Package,
  Sparkles, X, MessageSquarePlus,
} from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useMyReviews, useReviewMutations, type MyReviewItem } from "@/lib/queries/reviews";
import { img } from "@/lib/listingProducts";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };
const listContainer = { show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
const listItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.3 } },
};

const CORAL = "#ef4d62";

type ReviewType = "Product" | "Vendor" | "Service";

interface MyReview {
  id: string;
  name: string;
  type: ReviewType;
  subtitle: string;
  image: string;
  rating: number;
  date: string;
  text: string;
}

// A buyer's real review (vendor or product) mapped into this page's display shape.
function mapMyReview(r: MyReviewItem): MyReview {
  return {
    id: r.id,
    name: r.name,
    type: r.kind === "product" ? "Product" : r.kind === "service" ? "Service" : "Vendor",
    subtitle: r.subtitle,
    image: r.image || img(`${r.kind}-${r.id}`, 200, 200),
    rating: r.rating,
    date: new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    text: r.body ?? "",
  };
}

function Stars({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className="w-3.5 h-3.5"
          style={{ color: n <= value ? "#f5a623" : "#e5e7eb" }}
          fill={n <= value ? "#f5a623" : "#e5e7eb"}
        />
      ))}
    </div>
  );
}

const TYPE_META: Record<ReviewType, { icon: typeof Store; tint: string }> = {
  Vendor: { icon: Store, tint: "bg-[#ef4d62]/10 text-[#ef4d62]" },
  Product: { icon: Package, tint: "bg-blue-50 text-blue-600" },
  Service: { icon: Sparkles, tint: "bg-violet-50 text-violet-600" },
};

const FILTERS: ("All" | ReviewType)[] = ["All", "Vendor", "Product", "Service"];

// Interactive star picker used in the edit sheet.
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button"
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)} className="p-0.5">
          <Star className="w-7 h-7 transition-colors"
            style={{ color: n <= (hover || value) ? "#f5a623" : "#d1d5db" }}
            fill={n <= (hover || value) ? "#f5a623" : "#d1d5db"} />
        </button>
      ))}
    </div>
  );
}

const MyReviews = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { data: raw = [] } = useMyReviews();
  const {
    updateReview, removeReview,
    updateProductReview, removeProductReview,
    updateServiceReview, removeServiceReview,
  } = useReviewMutations();
  const [filter, setFilter] = useState<"All" | ReviewType>("All");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<MyReview | null>(null);
  const [draftRating, setDraftRating] = useState(5);
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);

  const reviews = useMemo(() => raw.map(mapMyReview), [raw]);

  const visible = useMemo(
    () => (filter === "All" ? reviews : reviews.filter((r) => r.type === filter)),
    [reviews, filter]
  );

  const avg = reviews.length
    ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1)
    : "0.0";

  const openEdit = (r: MyReview) => {
    setEditing(r);
    setDraftRating(r.rating);
    setDraftText(r.text);
    setMenuFor(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const update =
        editing.type === "Product" ? updateProductReview : editing.type === "Service" ? updateServiceReview : updateReview;
      await update(editing.id, draftRating, draftText);
      setEditing(null);
      toast.success("Review updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update review");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: MyReview) => {
    setMenuFor(null);
    try {
      const del = r.type === "Product" ? removeProductReview : r.type === "Service" ? removeServiceReview : removeReview;
      await del(r.id);
      toast.success("Review deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete review");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" onClick={() => setMenuFor(null)}>
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/profile")} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">My Reviews</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-28">
        {/* Summary */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-center gap-5 mb-4">
          <div className="text-center shrink-0">
            <p className="text-3xl font-extrabold text-gray-900 leading-none">{reviews.length}</p>
            <p className="text-[11px] text-gray-500 mt-1">Reviews written</p>
          </div>
          <div className="w-px self-stretch bg-gray-100" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-extrabold text-gray-900 leading-none">{avg}</span>
              <Stars value={Math.round(Number(avg))} />
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">Average rating you've given to vendors, products & services</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
          {FILTERS.map((f) => {
            const active = filter === f;
            const count = f === "All" ? reviews.length : reviews.filter((r) => r.type === f).length;
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                  active ? "text-white border-transparent" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
                style={active ? { backgroundColor: CORAL } : undefined}>
                {f === "All" ? "All" : `${f}s`} <span className={active ? "opacity-80" : "text-gray-400"}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* List */}
        {visible.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center px-6">
            <div className="w-16 h-16 rounded-full bg-[#ef4d62]/10 flex items-center justify-center mb-4">
              <MessageSquarePlus className="w-7 h-7 text-[#ef4d62]" />
            </div>
            <p className="text-base font-bold text-gray-900">No reviews here yet</p>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              {filter === "All"
                ? "Once you review vendors, products or services, they'll show up here."
                : `You haven't reviewed any ${filter.toLowerCase()}s yet.`}
            </p>
            <button onClick={() => navigate("/home/new-arrivals")}
              className="mt-5 px-5 py-2.5 rounded-xl text-white text-sm font-bold" style={{ backgroundColor: CORAL }}>
              Explore products
            </button>
          </div>
        ) : (
          <motion.div variants={reduced ? {} : listContainer} initial="hidden" animate="show" className="space-y-3">
            <AnimatePresence initial={false}>
              {visible.map((r) => {
                const meta = TYPE_META[r.type];
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={r.id}
                    variants={listItem}
                    layout
                    exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                    className="rounded-2xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-start gap-3">
                      <img src={r.image} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0 bg-gray-100" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-gray-900 truncate">{r.name}</p>
                          <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.tint}`}>
                            <Icon className="w-2.5 h-2.5" /> {r.type}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 truncate">{r.subtitle}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Stars value={r.rating} />
                          <span className="text-[11px] text-gray-400">· {r.date}</span>
                        </div>
                      </div>

                      {/* Kebab menu */}
                      <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}
                          className="p-1.5 -mr-1 text-gray-400 hover:text-gray-700 rounded-lg" aria-label="Options">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        <AnimatePresence>
                          {menuFor === r.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.94, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.94, y: -4 }}
                              transition={{ duration: 0.14, ease: E }}
                              className="absolute right-0 top-8 z-10 w-36 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
                            >
                              <button onClick={() => openEdit(r)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                                <Pencil className="w-4 h-4" /> Edit
                              </button>
                              <button onClick={() => remove(r)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100">
                                <Trash2 className="w-4 h-4" /> Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <p className="text-sm text-gray-600 leading-relaxed mt-3">{r.text}</p>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Edit sheet */}
      <AnimatePresence>
        {editing && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setEditing(null)}
          >
            <motion.div
              className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-5"
              initial={reduced ? { opacity: 0 } : { y: "100%" }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { y: "100%" }}
              transition={{ type: "tween", duration: 0.28, ease: E }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900">Edit review</h2>
                <button onClick={() => setEditing(null)} className="p-1 text-gray-400 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <img src={editing.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{editing.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{editing.subtitle}</p>
                </div>
              </div>

              <p className="text-xs font-semibold text-gray-500 mb-1.5">Your rating</p>
              <StarPicker value={draftRating} onChange={setDraftRating} />

              <p className="text-xs font-semibold text-gray-500 mt-4 mb-1.5">Your review</p>
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-800 focus:outline-none focus:border-[#ef4d62] resize-none"
                placeholder="Share your experience…"
              />

              <div className="flex gap-3 mt-5">
                <button onClick={() => setEditing(null)}
                  className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-bold hover:bg-gray-200 transition-colors">
                  Cancel
                </button>
                <motion.button whileTap={TAP} transition={TAP_T} onClick={saveEdit} disabled={saving}
                  className="flex-1 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-60" style={{ backgroundColor: CORAL }}>
                  {saving ? "Saving…" : "Save changes"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <MobileBottomNav />
    </div>
  );
};

export default MyReviews;
