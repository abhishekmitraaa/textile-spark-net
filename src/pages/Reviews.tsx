import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Star, QrCode, Share2, Link2, Download, X, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useVendorReviews, useReviewMutations } from "@/lib/queries/reviews";

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

const Reviews = () => {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data: reviewData } = useVendorReviews(user?.id);
  const { reply } = useReviewMutations();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [posting, setPosting] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const reviews = reviewData?.reviews ?? [];
  const rating = reviewData?.avg ?? 0;
  const ratingLabel = getRatingLabel(rating);
  const reviewerCount = reviewData?.count ?? 0;
  const ratingBreakdown: [number, number][] = (reviewData?.breakdown ?? [5, 4, 3, 2, 1].map((s) => ({ stars: s, percent: 0 }))).map(
    (b) => [b.stars, b.percent] as [number, number],
  );

  const postReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    setPosting(true);
    try {
      await reply(reviewId, replyText.trim(), user?.id);
      toast.success("Reply posted successfully!");
      setReplyingTo(null);
      setReplyText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not post reply");
    } finally {
      setPosting(false);
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.origin + "/reviews");
    toast.success("Review link copied!");
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Rate My Business - Cosora", url: window.location.origin + "/reviews" });
      } else {
        await handleCopyLink();
      }
    } catch {
      await handleCopyLink();
    }
  };

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-5 pb-8">

        {/* ── Get Ratings Section ── */}
        <motion.div variants={section}>
          <h2 className="text-base font-bold text-[#256fef] mb-3">Get Ratings</h2>

          <div className="space-y-1 mb-3">
            <p className="text-sm text-gray-600">
              Your current rating is{" "}
              <span className={`font-bold text-sm ${ratingLabel.cls}`}>{ratingLabel.label}</span>
            </p>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900">{rating}/5</span>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i < Math.floor(rating) ? "fill-amber-400 text-amber-400" : "text-gray-300 fill-gray-300"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-500">Reviewed by {reviewerCount} Users</span>
            </div>
          </div>

          {/* Star breakdown bars */}
          <div className="space-y-1.5">
            {ratingBreakdown.map(([stars, pct]) => (
              <div className="flex items-center gap-2" key={stars}>
                <span className="text-xs text-gray-500 w-10">{stars} Star</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-7 text-right">{pct}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Rate My Business / QR Section ── */}
        <motion.div variants={section}>
          <h2 className="text-base font-bold text-gray-900 mb-3">Rate My Business</h2>

          <div className="flex items-center gap-3">
            {/* Small QR thumbnail */}
            <div className="w-14 h-14 bg-white border border-gray-200 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
              <QrCode className="h-8 w-8 text-gray-800" />
            </div>

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

          {reviews.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-24 h-24 mb-4 opacity-40">
                {/* Illustration placeholder */}
                <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="8" y="16" width="64" height="48" rx="6" stroke="#9CA3AF" strokeWidth="3" fill="#F3F4F6"/>
                  <rect x="16" y="26" width="32" height="4" rx="2" fill="#D1D5DB"/>
                  <rect x="16" y="34" width="24" height="4" rx="2" fill="#D1D5DB"/>
                  <rect x="16" y="42" width="28" height="4" rx="2" fill="#D1D5DB"/>
                  <circle cx="72" cy="70" r="16" fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="3"/>
                  <path d="M66 70l4 4 8-8" stroke="#9CA3AF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-sm text-gray-500 max-w-[220px] leading-relaxed">
                No reviews yet! Ask your customers for reviews and boost your business today!
              </p>
            </div>
          ) : (
            <motion.div variants={listContainer} className="space-y-3">
              {reviews.map((review) => (
                <motion.div
                  key={review.id}
                  variants={listItem}
                >
                  <Card className="overflow-hidden border border-gray-200">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#256fef] text-sm font-bold flex-shrink-0">
                            {review.reviewerName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 leading-tight">{review.reviewerCompany || review.reviewerName}</p>
                            <p className="text-xs text-gray-500">{review.reviewerName}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-3.5 w-3.5 ${
                                  i < review.rating ? "fill-amber-400 text-amber-400" : "text-gray-200 fill-gray-200"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-gray-400">{timeAgo(review.createdAt)}</span>
                        </div>
                      </div>

                      {review.body && <p className="text-sm text-gray-600 leading-relaxed">{review.body}</p>}

                      {review.replyBody && (
                        <div className="mt-3 bg-blue-50 rounded-lg p-3 border-l-2 border-[#256fef]">
                          <p className="text-xs font-semibold text-[#256fef] mb-1">Your Reply</p>
                          <p className="text-sm text-gray-600">{review.replyBody}</p>
                        </div>
                      )}

                      <div className="flex gap-2 mt-3 items-center">
                        <button className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                          Report
                        </button>
                        {!review.replyBody && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs ml-auto border-[#256fef] text-[#256fef] hover:bg-blue-50"
                            onClick={() => { setReplyingTo(replyingTo === review.id ? null : review.id); setReplyText(""); }}
                          >
                            {replyingTo === review.id ? "Cancel" : "Reply"}
                          </Button>
                        )}
                      </div>

                      <AnimatePresence>
                        {replyingTo === review.id && (
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
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                rows={3}
                                className="text-sm resize-none"
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => { setReplyingTo(null); setReplyText(""); }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-8 text-xs bg-[#256fef] hover:bg-[#1a5fd4] text-white"
                                  disabled={!replyText.trim() || posting}
                                  onClick={() => postReply(review.id)}
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
                </motion.div>
              ))}
            </motion.div>
          )}
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

              {/* QR card */}
              <div className="bg-gray-50 rounded-2xl p-5 flex flex-col items-center mb-4 border border-gray-100">
                <p className="text-xs text-gray-500 mb-3">Please help us do better</p>

                {/* 5 orange stars */}
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-7 w-7 fill-orange-400 text-orange-400" />
                  ))}
                </div>

                {/* QR code */}
                <div className="w-44 h-44 bg-white rounded-xl border-2 border-gray-200 flex items-center justify-center mb-4 shadow-sm">
                  <QrCode className="h-32 w-32 text-gray-900" />
                </div>

                {/* Business name */}
                <p className="text-sm font-semibold text-gray-900">Fearce</p>
                <p className="text-xs text-gray-500 mt-0.5 mb-3">Delhi</p>

                {/* Copy Link inside card */}
                <div className="w-full border-t border-gray-200 pt-3 flex items-center justify-center gap-2">
                  <Link2 className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500">Copy Link</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2.5">
                <Button
                  variant="outline"
                  className="w-full h-11 gap-2 border-gray-300 text-gray-700 font-medium"
                  onClick={handleCopyLink}
                >
                  <Link2 className="h-4 w-4" />
                  Copy Link
                </Button>
                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    variant="outline"
                    className="h-11 gap-2 border-gray-300 text-gray-700 font-medium text-sm"
                    onClick={() => toast.success("QR code downloaded!")}
                  >
                    <Download className="h-4 w-4" />
                    Download QR Code
                  </Button>
                  <Button
                    className="h-11 gap-2 bg-[#256fef] hover:bg-[#1a5fd4] text-white font-medium text-sm"
                    onClick={handleShare}
                  >
                    <Share2 className="h-4 w-4" />
                    Share QR Code
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
};

export default Reviews;