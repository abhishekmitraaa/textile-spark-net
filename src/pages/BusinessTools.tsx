import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChevronLeft, ChevronRight, Tag, MessageSquare, Star, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useVendorReviews } from "@/lib/queries/reviews";
import { ReviewLinkShare } from "@/components/vendor/ReviewLinkShare";

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

// ─────────────────────────────────────────────────────────────
// What changed here, and why:
//
//  • "Reply to Reviews" rendered two INVENTED reviews ("Rajesh Kumar",
//    "Priya Sharma") inline and faked the submit with a toast, while /reviews
//    next door does the same job for real against reviews.reply_body /
//    replied_at. The inline component is gone; the tile routes to /reviews.
//
//  • "Get Reviews" showed a hardcoded "4.2 / 24 Ratings" to every vendor, then
//    collected real customer names and phone numbers and DISCARDED them behind
//    toast.success("Review requests sent!"). There is no SMS pipeline in this
//    repo, so no request was ever sent and the vendor had no way to know. It
//    now shares the vendor's real review link and a real QR code.
//
//  • "Add Offers" and "Reply to Questions" still say "coming soon". There is
//    no offers table and no questions table, and whether to build them (with
//    the buyer-side surface each would need) or drop the tiles is a product
//    call — flagged for a decision rather than made here. They are honest
//    about being unavailable: neither fabricates a success.
// ─────────────────────────────────────────────────────────────

function GetReviewsModal({ isOpen, onClose, vendorId }: { isOpen: boolean; onClose: () => void; vendorId: string | undefined }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-900">Get Reviews</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <ReviewLinkShare vendorId={vendorId} />
        </div>
      </div>
    </div>
  );
}

const BusinessTools = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: reviewData } = useVendorReviews(user?.id);
  const [getReviewsOpen, setGetReviewsOpen] = useState(false);
  const reduced = useReducedMotion();

  // Real count of reviews this vendor has not answered. The tile used to read
  // "18 Pending" for everyone, counting nothing.
  const awaitingReply = (reviewData?.reviews ?? []).filter((r) => !r.replyBody).length;

  const tools = [
    {
      icon: Tag, title: "Add Offers", subtitle: "Not available yet",
      badge: null as string | null, iconBg: "bg-amber-50", iconColor: "text-amber-600",
      action: () => toast.info("Offers aren't available yet", { description: "We'll let you know when this is ready." }),
    },
    {
      icon: MessageSquare, title: "Reply to Reviews", subtitle: "Answer buyers on your storefront",
      badge: awaitingReply > 0 ? `${awaitingReply} to reply` : null,
      iconBg: "bg-green-50", iconColor: "text-green-600",
      action: () => navigate("/reviews"),
    },
    {
      icon: Star, title: "Get Reviews", subtitle: "Share your review link and QR code",
      badge: null, iconBg: "bg-blue-50", iconColor: "text-blue-600",
      action: () => setGetReviewsOpen(true),
    },
    {
      icon: HelpCircle, title: "Reply to Questions", subtitle: "Not available yet",
      badge: null, iconBg: "bg-teal-50", iconColor: "text-teal-600",
      action: () => toast.info("Buyer questions aren't available yet", { description: "We'll let you know when this is ready." }),
    },
  ];

  return (
    <DashboardLayout>
      <motion.div
        className="max-w-2xl mx-auto pb-8 space-y-4"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div variants={section} className="flex items-center gap-3">
          <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </motion.button>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-none">Business Tools</h1>
            <p className="text-xs text-gray-400 mt-0.5">Collect and answer buyer reviews</p>
          </div>
        </motion.div>

        {/* Tools list */}
        <motion.div variants={listContainer} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {tools.map((tool) => (
            <motion.button variants={listItem} whileTap={TAP} transition={TAP_T} key={tool.title} onClick={tool.action}
              className="w-full flex items-center justify-between px-4 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors text-left">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", tool.iconBg)}>
                  <tool.icon className={cn("w-5 h-5", tool.iconColor)} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{tool.title}</span>
                    {tool.badge && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">
                        {tool.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{tool.subtitle}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
            </motion.button>
          ))}
        </motion.div>
      </motion.div>

      <GetReviewsModal isOpen={getReviewsOpen} onClose={() => setGetReviewsOpen(false)} vendorId={user?.id} />
    </DashboardLayout>
  );
};

export default BusinessTools;
