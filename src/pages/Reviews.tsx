import { useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Star, Share2, X, ChevronDown, AlertCircle, Package } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useVendorReviews, useVendorProductReviews, useReviewMutations } from "@/lib/queries/reviews";
import { ReviewLinkShare } from "@/components/vendor/ReviewLinkShare";
import { ReviewPhotoStrip } from "@/components/reviews/ReviewPhotoStrip";
import { errorMessage } from "@/lib/errorMessage";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};
const listContainer = {
  show: { transition: { staggerChildren: 0.055 } },
};
const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};

const getRatingLabel = (r: number) => {
  if (r < 3) return { label: "POOR", cls: "text-red-500" };
  if (r < 4) return { label: "DECENT", cls: "text-amber-500" };
  if (r < 5) return { label: "GOOD", cls: "text-green-500" };
  return { label: "PERFECT", cls: "text-green-600" };
};

// Relative "time ago" for a review timestamp.
const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const day = 86_400_000;
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))} week${Math.floor(diff / (7 * day)) > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Stars({ value, size = "h-3.5 w-3.5" }: { value: number; size?: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${size} ${i < value ? "fill-amber-400 text-amber-400" : "text-gray-200 fill-gray-200"}`}
        />
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/5 rounded bg-gray-100" />
          <div className="h-2.5 w-1/4 rounded bg-gray-100" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-gray-100" />
        <div className="h-3 w-3/4 rounded bg-gray-100" />
      </div>
    </div>
  );
}

/**
 * One review the vendor can answer: a store review (reply_to_review) or a review
 * of one of their products (reply_to_product_review). A review takes one reply;
 * once it's posted the form goes away, as it always has for store reviews.
 */
function ReplyableReviewCard({
  avatar, title, subtitle, rating, createdAt, body, photos = [], replyBody, onReply,
}: {
  avatar: ReactNode;
  title: string;
  subtitle: string;
  rating: number;
  createdAt: string;
  body: string | null;
  photos?: string[];
  replyBody: string | null;
  onReply: (text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const post = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      await onReply(text.trim());
      toast.success("Reply posted successfully!");
      setOpen(false);
      setText("");
    } catch (e) {
      toast.error(errorMessage(e) || "Could not post reply");
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card className="overflow-hidden border border-gray-200">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2 gap-3">
          <div className="flex gap-3 min-w-0">
            {avatar}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{title}</p>
              <p className="text-xs text-gray-500 truncate">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Stars value={rating} />
            <span className="text-xs text-gray-400">{timeAgo(createdAt)}</span>
          </div>
        </div>

        {body && <p data-no-translate className="text-sm text-gray-600 leading-relaxed">{body}</p>}
        <ReviewPhotoStrip photos={photos} className="mt-2.5" />

        {replyBody ? (
          <div className="mt-3 bg-blue-50 rounded-lg p-3 border-l-2 border-[#256fef]">
            <p className="text-xs font-semibold text-[#256fef] mb-1">Your Reply</p>
            <p data-no-translate className="text-sm text-gray-600">{replyBody}</p>
          </div>
        ) : (
          <div className="flex mt-3">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs ml-auto border-[#256fef] text-[#256fef] hover:bg-blue-50"
              onClick={() => { setOpen(!open); setText(""); }}
            >
              {open ? "Cancel" : "Reply"}
            </Button>
          </div>
        )}

        <AnimatePresence>
          {open && !replyBody && (
            <motion.div
              key="reply"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2">
                <Textarea
                  placeholder="Write a professional reply to this review..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setOpen(false); setText(""); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-[#256fef] hover:bg-[#1a5fd4] text-white"
                    disabled={!text.trim() || posting}
                    onClick={post}
                  >
                    {posting ? "Posting…" : "Post Reply"}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

type Tab = "store" | "products";

const Reviews = () => {
  const reduced = useReducedMotion();
  const { user, loading: authLoading } = useAuth();
  const store = useVendorReviews(user?.id);
  const products = useVendorProductReviews(user?.id);
  const { reply, replyToProduct } = useReviewMutations();
  const [tab, setTab] = useState<Tab>("store");
  const [qrOpen, setQrOpen] = useState(false);

  const storeReviews = store.data?.reviews ?? [];
  const productReviews = products.data ?? [];
  const reviewerCount = store.data?.count ?? 0;
  const hasRating = reviewerCount > 0;
  const rating = store.data?.avg ?? 0;
  const ratingLabel = getRatingLabel(rating);
  const ratingBreakdown = store.data?.breakdown ?? [];

  // Signed out, loading, failed and genuinely empty stay four different states.
  // This page used to render all of them as "No reviews yet" and "0/5 POOR",
  // which made a failed read look like a vendor nobody had reviewed, and gave
  // a vendor with no reviews a rating label nobody had given them.
  const signedOut = !authLoading && !user;
  const active = tab === "store" ? store : products;
  const loading = authLoading || (Boolean(user) && active.isPending);

  const list = () => {
    if (signedOut) {
      return <p className="py-12 text-center text-sm text-gray-500">Sign in to see your reviews</p>;
    }
    if (loading) {
      return (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        </div>
      );
    }
    if (active.isError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
          <p className="text-sm font-semibold text-gray-900">Couldn't load your reviews</p>
          <p className="text-xs text-gray-500 mt-1 max-w-[260px]">{errorMessage(active.error) || "Something went wrong. Please try again."}</p>
          <Button size="sm" className="mt-4 h-8 text-xs bg-[#256fef] hover:bg-[#1a5fd4] text-white" onClick={() => active.refetch()}>
            Retry
          </Button>
        </div>
      );
    }

    if (tab === "store" ? storeReviews.length === 0 : productReviews.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-24 h-24 mb-4 opacity-40">
            <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="8" y="16" width="64" height="48" rx="6" stroke="#9CA3AF" strokeWidth="3" fill="#F3F4F6"/>
              <rect x="16" y="26" width="32" height="4" rx="2" fill="#D1D5DB"/>
              <rect x="16" y="34" width="24" height="4" rx="2" fill="#D1D5DB"/>
              <rect x="16" y="42" width="28" height="4" rx="2" fill="#D1D5DB"/>
              <circle cx="72" cy="70" r="16" fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="3"/>
              <path d="M66 70l4 4 8-8" stroke="#9CA3AF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-sm text-gray-500 max-w-[240px] leading-relaxed">
            {tab === "store"
              ? "No reviews yet! Ask your customers for reviews and boost your business today!"
              : "No reviews on your products yet. Buyers can review any of your live products from its page."}
          </p>
        </div>
      );
    }

    return (
      <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-3">
        {tab === "store"
          ? storeReviews.map((review) => (
              <motion.div key={review.id} variants={listItem}>
                <ReplyableReviewCard
                  avatar={
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#256fef] text-sm font-bold flex-shrink-0">
                      {initials(review.reviewerName)}
                    </div>
                  }
                  title={review.reviewerCompany || review.reviewerName}
                  subtitle={review.reviewerName}
                  rating={review.rating}
                  createdAt={review.createdAt}
                  body={review.body}
                  replyBody={review.replyBody}
                  onReply={(text) => reply(review.id, text, user?.id)}
                />
              </motion.div>
            ))
          : productReviews.map((review) => (
              <motion.div key={review.id} variants={listItem}>
                <ReplyableReviewCard
                  avatar={
                    review.productImage ? (
                      <img src={review.productImage} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Package className="h-4 w-4 text-gray-400" />
                      </div>
                    )
                  }
                  title={review.productName}
                  subtitle={review.reviewerName}
                  rating={review.rating}
                  createdAt={review.createdAt}
                  body={review.body}
                  photos={review.photos}
                  replyBody={review.replyBody}
                  onReply={(text) => replyToProduct(review.id, text)}
                />
              </motion.div>
            ))}
      </motion.div>
    );
  };

  const tabCount = (t: Tab) => {
    const q = t === "store" ? store : products;
    if (!q.data) return null;
    return t === "store" ? storeReviews.length : productReviews.length;
  };

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-5 pb-8">

        {/* ── Get Ratings Section ── */}
        <motion.div variants={section}>
          <h2 className="text-base font-bold text-[#256fef] mb-3">Get Ratings</h2>

          {/* The same four states as the list: a signed-out visitor's query never
              runs (so never stops pending), and a failed read is not "no reviews". */}
          {authLoading || (Boolean(user) && store.isPending) ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3.5 w-1/2 rounded bg-gray-100" />
              <div className="h-6 w-1/3 rounded bg-gray-100" />
            </div>
          ) : store.isError ? (
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-gray-600">Couldn't load your reviews</span>
              <button className="font-semibold text-[#256fef] hover:underline" onClick={() => store.refetch()}>
                Retry
              </button>
            </div>
          ) : hasRating ? (
            <>
              <div className="space-y-1 mb-3">
                <p className="text-sm text-gray-600">
                  Your current rating is{" "}
                  <span className={`font-bold text-sm ${ratingLabel.cls}`}>{ratingLabel.label}</span>
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-gray-900">{rating}/5</span>
                  <Stars value={Math.floor(rating)} size="h-4 w-4" />
                  <span className="text-xs text-gray-500">Reviewed by {reviewerCount} Users</span>
                </div>
              </div>

              {/* Star breakdown bars */}
              <div className="space-y-1.5">
                {ratingBreakdown.map((b) => (
                  <div className="flex items-center gap-2" key={b.stars}>
                    <span className="text-xs text-gray-500 w-10">{b.stars} Star</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${b.percent}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-7 text-right">{b.percent}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            // No reviews (or signed out): no rating and no label, never 0/5.
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900">–</span>
              <span className="text-sm text-gray-500">No reviews yet</span>
            </div>
          )}
        </motion.div>

        {/* ── Rate My Business / QR Section ── */}
        <motion.div variants={section}>
          <h2 className="text-base font-bold text-gray-900 mb-3">Rate My Business</h2>

          <div className="flex items-center gap-3">
            {/* The 56px "QR thumbnail" that used to sit here was the same lucide
                icon as the modal's — a picture of a QR code presented as this
                vendor's. The real, scannable one is one tap away. */}

            {/* Share button */}
            <motion.button
              whileTap={TAP}
              transition={TAP_T}
              className="flex-1 h-11 bg-[#256fef] hover:bg-[#1a5fd4] text-white font-semibold rounded-lg gap-2 flex items-center justify-center"
              onClick={() => setQrOpen(true)}
            >
              <Share2 className="h-4 w-4" />
              Share QR Code
            </motion.button>

            {/* Chevron toggle */}
            <motion.button
              whileTap={TAP}
              transition={TAP_T}
              onClick={() => setQrOpen(true)}
              className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ChevronDown className="h-5 w-5" />
            </motion.button>
          </div>
        </motion.div>

        {/* ── Respond To Reviews ── */}
        <motion.div variants={section}>
          <h2 className="text-base font-bold text-[#256fef] mb-3">Respond To Reviews</h2>

          {/* Store reviews are about the business; product reviews are left on
              one of its listings. Both reach the vendor here, and both take a reply. */}
          <div className="flex gap-2 mb-3" role="tablist">
            {(["store", "products"] as Tab[]).map((t) => {
              const selected = tab === t;
              const count = tabCount(t);
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(t)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                    selected ? "bg-[#256fef] text-white border-transparent" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {t === "store" ? "Store reviews" : "Product reviews"}
                  {count !== null && <span className={selected ? "ml-1 opacity-80" : "ml-1 text-gray-400"}>{count}</span>}
                </button>
              );
            })}
          </div>

          {list()}
        </motion.div>
      </motion.div>

      {/* ── QR Modal Overlay ── */}
      <AnimatePresence>
        {qrOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQrOpen(false)}
            />

            {/* Modal */}
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl px-5 pt-5 pb-8 shadow-2xl max-w-md mx-auto"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-900">Rate My Business</h3>
                <button
                  onClick={() => setQrOpen(false)}
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Real, scannable QR + the vendor's real ratings, shared with
                  the Business Tools "Get Reviews" tile. What was here: a
                  <QrCode> lucide ICON standing in for a QR code, the literal
                  business name "Fearce" in "Delhi" regardless of who was
                  signed in, and a Download button that toasted "QR code
                  downloaded!" without producing a file. */}
              <ReviewLinkShare vendorId={user?.id} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
};

export default Reviews;
