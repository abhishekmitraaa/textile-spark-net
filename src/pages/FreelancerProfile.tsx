import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { getFreelancer } from "@/lib/freelancersData";
import { placeCall, demoPhone } from "@/lib/queries/calls";
import { useServiceReviews, useReviewMutations } from "@/lib/queries/reviews";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Star, MapPin, Bookmark, BookmarkCheck, Share2,
  MessageCircle, Phone, Clock, Briefcase, GraduationCap, Wallet, Timer, X, ThumbsUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
type Tab = "services" | "portfolio" | "reviews";

function WriteReviewModal({ open, onClose, name, onSubmit }: { open: boolean; onClose: () => void; name: string; onSubmit: (rating: number, text: string) => Promise<void> }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setRating(0); setHover(0); setText(""); setSaving(false); } }, [open]);
  const submit = async () => {
    if (!rating) { toast.error("Please pick a star rating"); return; }
    setSaving(true);
    try { await onSubmit(rating, text); toast.success("Thanks! Your review has been submitted"); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not submit your review"); setSaving(false); }
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 28 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Write a Review</h3>
              <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-2">Rate your experience with {name}</p>
            <div className="flex items-center gap-1.5 mb-4">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)} onClick={() => setRating(s)} aria-label={`${s} star`}>
                  <Star className={cn("w-8 h-8 transition-colors", (hover || rating) >= s ? "text-yellow-400 fill-yellow-400" : "text-gray-300")} />
                </button>
              ))}
            </div>
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Share details about the work quality, communication and delivery…" className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]" />
            <button onClick={submit} disabled={saving} className="mt-3 w-full rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 disabled:opacity-60 text-white py-3 text-sm font-bold transition-colors">{saving ? "Submitting…" : "Submit Review"}</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const FreelancerProfile = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { id } = useParams();
  const f = getFreelancer(id ?? "");

  const [slide, setSlide] = useState(0);
  const [tab, setTab] = useState<Tab>("services");
  const [saved, setSaved] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Real reviews for this freelancer (falls back to the mock aggregate/list).
  const { data: svcReviews } = useServiceReviews("freelancer", id);
  const { submitServiceReview } = useReviewMutations();
  const hasRealReviews = (svcReviews?.count ?? 0) > 0;

  if (!f) {
    return (
      <div className="min-h-screen bg-white grid place-items-center px-6 text-center">
        <div>
          <p className="text-sm text-gray-500">This freelancer no longer exists.</p>
          <button onClick={() => navigate("/freelancers")} className="mt-3 text-sm font-semibold text-[#ef4d62]">Back to Freelancers</button>
        </div>
      </div>
    );
  }

  const chat = () => navigate(`/chats/${f.id}`);
  const card = "rounded-2xl border border-gray-200 bg-white p-4";
  const total = f.cover.length;

  const displayRating = hasRealReviews ? svcReviews!.avg : f.rating;
  const displayCount = hasRealReviews ? svcReviews!.count : f.reviewsCount;
  const reviewCards = hasRealReviews
    ? svcReviews!.reviews.map((r) => ({
        id: r.id, name: r.reviewerName, project: "",
        timeAgo: new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        rating: r.rating, text: r.body ?? "", helpful: 0,
      }))
    : f.reviews.map((r) => ({ id: String(r.id), name: r.client, project: r.project, timeAgo: r.timeAgo, rating: r.rating, text: r.text, helpful: r.helpful }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/freelancers")} className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700">
            <ArrowLeft className="w-4 h-4" /> Back to Freelancers
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setSaved((s) => !s)} aria-label="Save" className="p-1.5 rounded-full hover:bg-gray-100">
              {saved ? <BookmarkCheck className="w-5 h-5 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="w-5 h-5 text-gray-600" />}
            </button>
            <button onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success("Link copied!"); }} aria-label="Share" className="p-1.5 rounded-full hover:bg-gray-100">
              <Share2 className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      <motion.div className="max-w-2xl mx-auto px-4 pt-3 pb-24 space-y-3" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {/* Cover carousel */}
        <div className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-[16/10]">
          <AnimatePresence mode="wait">
            <motion.img key={slide} src={f.cover[slide]} alt="" className="absolute inset-0 w-full h-full object-cover"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
          </AnimatePresence>
          {total > 1 && (
            <>
              <button onClick={() => setSlide((s) => (s - 1 + total) % total)} aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 flex items-center justify-center shadow-sm"><ChevronLeft className="w-4 h-4 text-gray-700" /></button>
              <button onClick={() => setSlide((s) => (s + 1) % total)} aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 flex items-center justify-center shadow-sm"><ChevronRight className="w-4 h-4 text-gray-700" /></button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {f.cover.map((_, i) => <button key={i} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`} className={cn("h-1.5 rounded-full transition-all", i === slide ? "w-5 bg-white" : "w-1.5 bg-white/60")} />)}
              </div>
            </>
          )}
        </div>

        {/* Identity */}
        <div className={card}>
          <div className="flex items-start gap-3">
            <img src={f.avatar} alt={f.name} className="w-14 h-14 rounded-full object-cover" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{f.name}</h1>
              <p className="text-sm text-[#ef4d62] font-medium">{f.title}</p>
              <p className="text-xs text-gray-500">{f.specialty}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" /> <span className="font-bold text-gray-800">{f.rating}</span> <span className="text-gray-400">({f.reviewsCount} reviews)</span></span>
            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {f.location}</span>
          </div>
          {/* Rate cards */}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-[#ef4d62]/5 border border-[#ef4d62]/15 px-3 py-2.5">
              <p className="text-base font-extrabold text-[#ef4d62]">₹{f.hourlyRate.toLocaleString("en-IN")}<span className="text-[11px] font-medium text-gray-400">/hr</span></p>
              <p className="text-[11px] text-gray-500">Hourly Rate</p>
            </div>
            <div className="rounded-xl bg-[#ef4d62]/5 border border-[#ef4d62]/15 px-3 py-2.5">
              <p className="text-base font-extrabold text-[#ef4d62]">{f.projectRate}</p>
              <p className="text-[11px] text-gray-500">Per Project</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-gray-200 p-1">
          {(["services", "portfolio", "reviews"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="relative flex-1 rounded-lg py-2 text-sm font-semibold capitalize">
              {tab === t && <motion.span layoutId="fp-tab" className="absolute inset-0 rounded-lg bg-[#ef4d62]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span className={cn("relative z-10", tab === t ? "text-white" : "text-gray-500")}>{t}</span>
            </button>
          ))}
        </div>

        {/* ── SERVICES ── */}
        {tab === "services" && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 mb-2">About</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{f.about}</p>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Services Offered</h3>
              <div className="space-y-2">
                {f.services.map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                    <span className="inline-flex items-center gap-2 text-sm text-gray-800"><Briefcase className="w-4 h-4 text-[#ef4d62]" /> {s.name}</span>
                    <span className="text-sm font-bold text-[#ef4d62]">{s.price}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Skills &amp; Expertise</h3>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Stat icon={Briefcase} label="Experience" value={`${f.experienceYears} years`} />
                <Stat icon={Timer} label="Turnaround" value={f.turnaround} />
                <Stat icon={Wallet} label="Price Range" value={f.priceRange} />
              </div>
              <div className="flex flex-wrap gap-2">
                {f.skills.map((s) => <span key={s} className="rounded-full bg-[#ef4d62]/5 border border-[#ef4d62]/20 px-3 py-1 text-xs font-medium text-[#ef4d62]">{s}</span>)}
              </div>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Education</h3>
              <div className="space-y-3">
                {f.education.map((e) => (
                  <div key={e.title} className="flex items-start gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 shrink-0"><GraduationCap className="w-4 h-4" /></span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{e.title}</p>
                      <p className="text-xs text-gray-400">{e.org} • {e.year}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── PORTFOLIO ── */}
        {tab === "portfolio" && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="grid grid-cols-2 gap-3">
              {f.portfolio.map((p) => (
                <div key={p.title} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 group">
                  <img src={p.image} alt={p.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-2 left-2.5 right-2.5">
                    <p className="text-xs font-bold text-white leading-tight">{p.title}</p>
                    <p className="text-[10px] text-white/80">{p.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── REVIEWS ── */}
        {tab === "reviews" && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className={cn(card, "flex items-center justify-between")}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-extrabold text-gray-900">{displayRating}</span>
                  <div>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => <Star key={s} className={cn("w-3.5 h-3.5", s <= Math.round(displayRating) ? "text-yellow-400 fill-yellow-400" : "text-gray-300")} />)}
                    </div>
                    <p className="text-[11px] text-gray-400">{displayCount} reviews</p>
                  </div>
                </div>
              </div>
              <button onClick={() => setReviewOpen(true)} className="rounded-full bg-[#ef4d62] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#ef4d62]/90">Write a Review</button>
            </div>
            <div className="space-y-3">
              {reviewCards.map((r) => (
                <div key={r.id} className={card}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">{r.name}</p>
                    <span className="text-[11px] text-gray-400">{r.timeAgo}</span>
                  </div>
                  {r.project && <p className="text-[11px] text-[#ef4d62] font-medium">{r.project}</p>}
                  <div className="flex items-center gap-0.5 mt-1">
                    {[1, 2, 3, 4, 5].map((s) => <Star key={s} className={cn("w-3 h-3", s <= r.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300")} />)}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed mt-1.5">{r.text}</p>
                  {!hasRealReviews && <button className="mt-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"><ThumbsUp className="w-3.5 h-3.5" /> Helpful ({r.helpful})</button>}
                </div>
              ))}
              {reviewCards.length === 0 && <p className="py-6 text-center text-sm text-gray-400">No reviews yet. Be the first to review {f.name}.</p>}
            </div>
          </motion.div>
        )}

        {/* Contact */}
        <div className={card}>
          <div className="flex items-center gap-2">
            <button onClick={chat} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[#ef4d62] text-[#ef4d62] py-3 text-sm font-bold hover:bg-[#ef4d62]/5 transition-colors"><MessageCircle className="w-4 h-4" /> Chat</button>
            <button onClick={() => placeCall(f.name, demoPhone(f.id))} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#ef4d62] text-white py-3 text-sm font-bold hover:bg-[#ef4d62]/90 transition-colors"><Phone className="w-4 h-4" /> Call Now</button>
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-400 inline-flex items-center justify-center gap-1 w-full"><Clock className="w-3 h-3" /> Usually responds within 24 hours</p>
        </div>
      </motion.div>

      <WriteReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        name={f.name}
        onSubmit={(rating, text) => submitServiceReview("freelancer", id ?? "", f.name, rating, text)}
      />
      <MobileBottomNav />
    </div>
  );
};

function Stat({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5 text-center">
      <Icon className="w-4 h-4 text-[#ef4d62] mx-auto mb-1" />
      <p className="text-[11px] font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-[9px] text-gray-400">{label}</p>
    </div>
  );
}

export default FreelancerProfile;
