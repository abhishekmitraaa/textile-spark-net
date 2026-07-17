import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import VideoCloseUpsViewer from "@/components/buyer/VideoCloseUpsViewer";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import { useVendorProfile } from "@/lib/queries/vendor";
import { useVendorCatalogues } from "@/lib/queries/catalogues";
import { useVendorReviews, useReviewMutations } from "@/lib/queries/reviews";
import { useFollowing } from "@/lib/queries/follows";
import { useCallVendor } from "@/lib/queries/calls";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, MoreVertical, MapPin, Phone, MessageCircle, X, Check,
  Bookmark, BookmarkCheck, Star, ChevronDown, Users, Mail, Globe,
  Search, ArrowUpDown, Filter, Grid2X2, Grid3X3, Play, Factory, Send,
  FileText, ExternalLink,
} from "lucide-react";
import trustedSeal from "@/assets/Trustedseal.png";
import brandChuu from "@/assets/brands/chuu-fashion.png";
import brandCherry from "@/assets/brands/cherrykoko.png";
import brandBrandi from "@/assets/brands/brandi.png";
import brandStyleNanda from "@/assets/brands/style-nanda.png";
import brandStyleOnMe from "@/assets/brands/styleonme.png";
import brandHotPing from "@/assets/brands/hotping.png";

// === Animation constants (project convention) ===
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };
const page = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };
const listContainer = { show: { transition: { staggerChildren: 0.05 } } };
const listItem = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } } };

// ─────────────────────────────────────────────────────────────
// DATA (demo vendor — mirrors the vendor-side profile, view only)
// ─────────────────────────────────────────────────────────────
const BANNER = "/vendorregistration1banner.png";
const BRAND = "CARAMEL";

const brandCategories = [
  { label: "T-Shirt", src: brandChuu },
  { label: "Denim", src: brandCherry },
  { label: "Printing", src: brandBrandi },
  { label: "Manufacturing", src: brandStyleNanda },
  { label: "Embroidery", src: brandStyleOnMe },
  { label: "Finishing", src: brandHotPing },
];

const capacityOptions = [
  { key: "Small-batch", desc: "Small-batch manufacturers (10–200 pcs per design)" },
  { key: "Medium", desc: "Medium-scale manufacturers (200–5,000 pcs)" },
  { key: "Large", desc: "Large-scale mass manufacturers (5,000–1 lakh+)" },
  { key: "Export-grade", desc: "Export-grade manufacturers (international compliance)" },
];
// Which tiers this vendor operates at (read-only for buyers)
const vendorCapacity = ["Medium", "Export-grade"];

const detailRows = [
  { label: "Business Type", value: "Apparel Manufacturer" },
  { label: "Company MD", value: "Mr. K.S. Tomar" },
  { label: "Total Number of Employees", value: "11 to 25 People" },
  { label: "Year of Establishment", value: "2019" },
  { label: "Cosora Member Since", value: "1 Year" },
  { label: "Annual Turnover", value: "Rs. 50 Lakh - 1 Crore" },
  { label: "GST", value: "07AABCS1077Q1ZV" },
  { label: "PAN", value: "ABNCS1077Q" },
];

const sells = [
  "Men's T-Shirts", "Women's Kurtis", "Denim Jackets", "Custom Printing",
  "Hospital Uniforms", "Men's Sweaters", "Corporate Wear", "Private Label Manufacturing",
];

const ratingBreakdown = [
  { stars: 5, percent: 90 },
  { stars: 4, percent: 5 },
  { stars: 3, percent: 0 },
  { stars: 2, percent: 0 },
  { stars: 1, percent: 15 },
];

type Gender = "Men" | "Women" | "Unisex";

// ─────────────────────────────────────────────────────────────
// Write a Review modal
// ─────────────────────────────────────────────────────────────
function WriteReviewModal({
  open,
  onClose,
  brandName,
  initialRating = 0,
  initialText = "",
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  brandName: string;
  initialRating?: number;
  initialText?: string;
  onSubmit: (rating: number, text: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setRating(initialRating); setHover(0); setText(initialText); setSaving(false); } }, [open, initialRating, initialText]);

  const submit = async () => {
    if (rating === 0) { toast.error("Please pick a star rating"); return; }
    setSaving(true);
    try {
      await onSubmit(rating, text);
      toast.success(initialRating ? "Your review has been updated" : "Thanks! Your review has been submitted");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit your review");
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Write a Review</h3>
              <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-2">Rate your experience with {brandName}</p>
            <div className="flex items-center gap-1.5 mb-4">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)} onClick={() => setRating(s)} aria-label={`${s} star`}>
                  <Star className={cn("w-8 h-8 transition-colors", (hover || rating) >= s ? "text-yellow-400 fill-yellow-400" : "text-gray-300")} />
                </button>
              ))}
            </div>
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Share details about product quality, communication, delivery…"
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]" />
            <button onClick={submit} disabled={saving} className="mt-3 w-full rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 disabled:opacity-60 text-white py-3 text-sm font-bold transition-colors">
              {saving ? "Submitting…" : initialRating ? "Update Review" : "Submit Review"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
const VendorProfile = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const reduced = useReducedMotion();
  const saved = useSaved();

  const [detailsOpen, setDetailsOpen] = useState(true);
  const [gridCols, setGridCols] = useState<2 | 3>(2);
  const [videoViewerOpen, setVideoViewerOpen] = useState(false);
  const [videoStartIndex, setVideoStartIndex] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<"" | Gender>("");
  const [sortKey, setSortKey] = useState<"" | "sold" | "rating">("");
  const [stuck, setStuck] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pageSaved, setPageSaved] = useState(false);

  const vendorId = id ?? "1";
  const chatHref = `/chats/${vendorId}`;

  // Real vendor identity + catalogue + reels.
  const { data: vendor } = useVendorProfile(id);
  const { data: catalogues = [] } = useVendorCatalogues(id);
  const { data: reviewData } = useVendorReviews(id);
  const { submit: submitReview } = useReviewMutations();
  const [showAllReviews, setShowAllReviews] = useState(false);
  const { brands, follow, unfollow } = useFollowing();
  const callVendor = useCallVendor();
  const following = brands.find((b) => b.id === vendorId)?.isFollowing ?? false;
  const toggleFollow = () => (following ? unfollow(vendorId) : follow(vendorId));

  const brandName = vendor?.brandName ?? BRAND;
  const vendorLocation = vendor ? [vendor.city, vendor.country].filter(Boolean).join(", ") : "Gwalior, Madhya Pradesh · India";
  const aboutText =
    vendor?.about ??
    `${brandName} — retail trader & manufacturer of Men's T-Shirts, Sweaters and Hospital Uniforms. Trusted for consistent quality, on-time delivery and flexible order volumes.`;
  const fmtCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

  // Real store banner (managed by the vendor) with the demo fallback.
  const bannerSrc = vendor?.bannerUrl || BANNER;

  // Real contact details, falling back to the demo values when a field is empty
  // so vendors mid-onboarding still render a complete-looking card.
  const contactAddress =
    vendor && [vendor.addressLine, vendor.area, vendor.city, vendor.state, vendor.postalCode].some(Boolean)
      ? [vendor.addressLine, vendor.area, vendor.city, vendor.state, vendor.postalCode].filter(Boolean).join(", ")
      : "2nd Floor, Malviya Nagar, Gwalior, Madhya Pradesh, India";
  const contactRows = [
    { Icon: Users, value: vendor?.ownerName || "Mr. K.S. Tomar" },
    { Icon: MapPin, value: contactAddress },
    { Icon: Phone, value: vendor?.phone || "+91 90110 60851" },
    { Icon: Mail, value: vendor?.ownerEmail || "contact@caramel.in" },
    { Icon: Globe, value: vendor?.website || "www.caramel.in" },
  ];

  // Real detailed information, with the demo values as fallbacks.
  const detailRowsResolved = vendor
    ? [
        { label: "Business Type", value: vendor.businessType || "Apparel Manufacturer" },
        { label: "Company MD", value: vendor.ownerName || "Mr. K.S. Tomar" },
        ...detailRows.slice(2, 6),
        { label: "GST", value: vendor.gstin || "07AABCS1077Q1ZV" },
        { label: "PAN", value: vendor.pan || "ABNCS1077Q" },
      ]
    : detailRows;
  const websiteValue = vendor?.website || "www.caramel.in";

  // Real reviews. Until a vendor has any, fall back to the vendor_profiles
  // aggregate + demo breakdown so the section still looks alive.
  const hasRealReviews = (reviewData?.count ?? 0) > 0;
  const reviewAvg = hasRealReviews ? reviewData!.avg : vendor?.ratingAvg ?? 4.5;
  const reviewCount = hasRealReviews ? reviewData!.count : vendor?.reviewsCount ?? 26;
  const reviewBreakdown = hasRealReviews
    ? reviewData!.breakdown.map((b) => ({ stars: b.stars, percent: b.percent }))
    : ratingBreakdown;
  const reviewList = reviewData?.reviews ?? [];
  const visibleReviews = showAllReviews ? reviewList : reviewList.slice(0, 3);
  const fmtReviewDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  // Vendor's real live products mapped to this page's compact card shape.
  const vpProducts = useMemo(
    () =>
      (vendor?.products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        moq: p.moq,
        sold: `${p.soldCountNum}+`,
        location: p.location,
        fabric: p.fabric,
        gsm: p.gsm,
        fit: p.fitType,
        rating: p.rating,
        reviews: p.enquiries,
        gender: (p.gender as Gender),
        latest: false,
        image: p.image,
      })),
    [vendor],
  );
  const recommendationsList = useMemo(() => vpProducts.slice(0, 6), [vpProducts]);
  const vendorVideos = vendor?.videos ?? [];

  // Scroll-aware sticky header (appears after the hero scrolls away)
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 220);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const filteredProducts = useMemo(() => {
    let list = vpProducts.filter((p) => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()));
    if (genderFilter) list = list.filter((p) => p.gender === genderFilter);
    if (sortKey === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    else if (sortKey === "sold") list = [...list].sort((a, b) => parseInt(b.reviews) - parseInt(a.reviews));
    return list;
  }, [vpProducts, productSearch, genderFilter, sortKey]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Scroll-aware sticky header ── */}
      <AnimatePresence>
        {stuck && (
          <motion.div
            initial={{ y: -48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -48, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed top-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100"
          >
            <div className="max-w-2xl lg:max-w-3xl mx-auto flex items-center gap-3 px-4 py-2.5">
              <button onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft className="w-5 h-5 text-gray-700" /></button>
              <h2 className="flex-1 text-base font-extrabold tracking-wide text-gray-900 truncate">{brandName}</h2>
              <button onClick={() => setPageSaved((s) => !s)} aria-label="Save vendor" className="p-1">
                {pageSaved ? <BookmarkCheck className="w-5 h-5 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="w-5 h-5 text-gray-500" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="max-w-2xl lg:max-w-3xl mx-auto px-3 pt-3 pb-24 space-y-3"
        variants={reduced ? {} : page} initial="hidden" animate="show"
      >
        {/* ══ HERO ══ */}
        <motion.section variants={section} className="rounded-2xl overflow-hidden relative">
          <div className="relative h-52 sm:h-60">
            <img src={bannerSrc} alt={`${brandName} banner`} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/20" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <span className="text-5xl sm:text-6xl font-extrabold tracking-[0.3em] text-white/20 uppercase">{brandName}</span>
            </div>

            {/* Back button — top left */}
            <button onClick={() => navigate(-1)} aria-label="Back"
              className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/45 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>

            {/* TrustedSEAL image — top right (verified vendors only) */}
            {(vendor?.isVerified ?? true) && (
              <img src={trustedSeal} alt="TrustedSEAL" className="absolute top-3 right-3 z-10 h-9 w-auto drop-shadow" />
            )}
            {/* 3-dot menu */}
            <button aria-label="More" className="absolute right-3 top-14 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors">
              <MoreVertical className="h-4 w-4" />
            </button>

            {/* Info — bottom left */}
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 z-10">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide leading-tight">{brandName}</h1>
              <div className="flex items-center gap-1 mt-0.5 mb-2">
                <MapPin className="h-3 w-3 text-white/80 shrink-0" />
                <span className="text-xs text-white/80">{vendorLocation}</span>
              </div>
              <div className="flex items-center gap-6 mb-1">
                <div>
                  <p className="text-[10px] text-white/70 uppercase tracking-wider leading-none">Followers</p>
                  <p className="text-lg font-bold text-white leading-tight">{vendor ? fmtCount(vendor.followers) : "7,333"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/70 uppercase tracking-wider leading-none">All Items</p>
                  <p className="text-lg font-bold text-white leading-tight">{vendor ? vpProducts.length : "3,538"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-white/80 font-medium">{vendor?.businessType ?? "Manufacturer"}</p>
                {vendor?.international && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                    <Globe className="h-3 w-3" /> International-ready
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons (Follow / Chat / Call) — per note, chat added */}
          <div className="bg-white px-3 py-3 grid grid-cols-3 gap-2">
            <motion.button whileTap={TAP} transition={TAP_T} onClick={toggleFollow}
              className={cn("flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-colors",
                following ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-[#ef4d62]/10 text-[#ef4d62] hover:bg-[#ef4d62]/15")}>
              {following ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {following ? "Unfollow" : "Follow"}
            </motion.button>
            <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate(chatHref)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-700 hover:border-gray-300 transition-colors">
              <MessageCircle className="h-4 w-4" /> Chat
            </motion.button>
            <motion.button whileTap={TAP} transition={TAP_T} onClick={() => callVendor(vendorId, brandName)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#ef4d62] py-2.5 text-sm font-bold text-white hover:bg-[#ef4d62]/90 transition-colors">
              <Phone className="h-4 w-4" /> Call Now
            </motion.button>
          </div>
        </motion.section>

        {/* ══ ABOUT US ══ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-2">About Us</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{aboutText}</p>
        </motion.section>

        {/* ══ CONTACT DETAILS ══ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Contact Details</h2>
          <div className="divide-y divide-gray-100">
            {contactRows.map(({ Icon, value }, i) => (
              <div key={i} className={cn("flex items-start gap-3", i === 0 ? "pb-3" : "py-3 last:pb-0")}>
                <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700">{value}</span>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ══ REVIEWS & RATINGS ══ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">Reviews and Ratings</h2>
            <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setReviewOpen(true)}
              className="rounded-full bg-[#ef4d62] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#ef4d62]/90 transition-colors">
              Write a Review
            </motion.button>
          </div>

          <div className="flex items-center gap-4 mb-5">
            <div className="text-center">
              <span className="text-4xl font-extrabold text-gray-900">{reviewAvg.toFixed(1)}</span>
              <span className="text-base text-gray-400">/5</span>
            </div>
            <div>
              <div className="flex items-center gap-0.5 mb-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className={cn("h-5 w-5", i <= Math.round(reviewAvg) ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200")} />
                ))}
              </div>
              <p className="text-xs text-gray-400">Reviewed by {reviewCount.toLocaleString("en-IN")} {reviewCount === 1 ? "User" : "Users"}</p>
            </div>
          </div>

          <motion.div variants={listContainer} className="space-y-2.5">
            {reviewBreakdown.map((row) => (
              <motion.div variants={listItem} key={row.stars} className="flex items-center gap-3">
                <span className="w-12 text-xs text-gray-500 shrink-0 text-right">{row.stars} Star</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div className="h-full rounded-full bg-[#ef4d62]"
                    initial={reduced ? false : { width: 0 }} whileInView={{ width: `${row.percent}%` }} viewport={{ once: true }} transition={{ duration: 0.6, ease: E }} />
                </div>
                <span className="w-8 text-right text-xs text-gray-500 shrink-0">{row.percent}%</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Real review list */}
          {reviewList.length > 0 && (
            <div className="mt-5 space-y-3 border-t border-gray-100 pt-4">
              {visibleReviews.map((r) => (
                <div key={r.id} className="rounded-xl bg-gray-50/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ef4d62]/10 text-[11px] font-bold text-[#ef4d62]">
                        {r.reviewerName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900">{r.reviewerName}</p>
                        {r.reviewerCompany && <p className="truncate text-[11px] text-gray-400">{r.reviewerCompany}</p>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star key={i} className={cn("h-3 w-3", i <= r.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200")} />
                        ))}
                      </div>
                      <span className="text-[10px] text-gray-400">{fmtReviewDate(r.createdAt)}</span>
                    </div>
                  </div>
                  {r.body && <p className="mt-2 text-sm leading-relaxed text-gray-600">{r.body}</p>}
                  {r.replyBody && (
                    <div className="mt-2.5 rounded-lg border-l-2 border-[#ef4d62] bg-white p-2.5">
                      <p className="mb-0.5 text-[11px] font-bold text-[#ef4d62]">Reply from {brandName}</p>
                      <p className="text-xs leading-relaxed text-gray-600">{r.replyBody}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {reviewList.length > 3 && (
            <button onClick={() => setShowAllReviews((s) => !s)} className="mt-4 w-full text-center text-xs font-semibold text-[#ef4d62]">
              {showAllReviews ? "Show fewer reviews" : `View all ${reviewList.length} reviews`}
            </button>
          )}
        </motion.section>

        {/* ══ DETAILED INFORMATION ══ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setDetailsOpen((p) => !p)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left">
            <h2 className="text-sm font-bold text-gray-900">Detailed information</h2>
            <ChevronDown className={cn("h-4 w-4 text-gray-500 transition-transform duration-200", detailsOpen && "rotate-180")} />
          </motion.button>

          <AnimatePresence initial={false}>
            {detailsOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: E }} className="overflow-hidden">
                <div className="border-t border-gray-100 px-4 py-4 space-y-5">
                  {/* Detail rows */}
                  <div className="divide-y divide-gray-50">
                    {detailRowsResolved.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-4 text-sm py-2.5 first:pt-0">
                        <span className="text-gray-500">{row.label}</span>
                        <span className="font-semibold text-gray-800 text-right">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Capacity — only if manufacturer (read-only) */}
                  <div>
                    <p className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-900 mb-0.5">
                      <Factory className="w-4 h-4 text-[#ef4d62]" /> Capacity
                    </p>
                    <p className="text-xs text-gray-400 mb-3">Manufacturing scale this vendor operates at</p>
                    <div className="space-y-2">
                      {capacityOptions.map((opt) => {
                        const on = vendorCapacity.includes(opt.key);
                        return (
                          <div key={opt.key}
                            className={cn("flex items-start gap-3 rounded-xl border px-3 py-2.5", on ? "border-[#ef4d62]/40 bg-[#ef4d62]/5" : "border-gray-100 bg-gray-50/50")}>
                            <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full", on ? "bg-[#ef4d62]" : "bg-gray-200")}>
                              {on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                            </span>
                            <span className={cn("text-xs leading-relaxed", on ? "font-medium text-gray-800" : "text-gray-400")}>{opt.desc}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sells */}
                  <div>
                    <p className="text-sm font-bold text-gray-900 mb-2">Sells</p>
                    <div className="flex flex-wrap gap-2">
                      {sells.map((s) => (
                        <span key={s} className="rounded-full bg-[#ef4d62]/5 border border-[#ef4d62]/20 px-3 py-1 text-xs font-medium text-[#ef4d62]">{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* Website */}
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-gray-500">Website Address</span>
                    <a
                      href={websiteValue.startsWith("http") ? websiteValue : `https://${websiteValue}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#ef4d62] text-right truncate"
                    >
                      {websiteValue}
                    </a>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* ══ BRAND'S CATEGORIES (horizontal scroll) ══ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Brand's Categories</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {brandCategories.map((cat) => (
              <div key={cat.label} className="flex-shrink-0 text-center">
                <div className="h-20 w-20 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                  <img src={cat.src} alt={cat.label} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <p className="mt-1.5 text-xs font-medium text-gray-700 truncate w-20">{cat.label}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ══ BRAND'S RECOMMENDATIONS (top enquired items) ══ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Brand's Recommendations</h2>
          <motion.div variants={listContainer} className="grid grid-cols-3 gap-2">
            {recommendationsList.map((product) => {
              const isSaved = Boolean(saved.products[product.id]);
              return (
                <motion.div variants={listItem} key={product.id} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                  <div className="relative aspect-[3/4] bg-gray-100">
                    <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                    <button onClick={() => openSaveModal({ ...product, moq: `MOQ: ${product.moq}`, manufacturer: brandName })}
                      aria-label="Save" className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm">
                      {isSaved ? <BookmarkCheck className="h-3 w-3 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="h-3 w-3 text-gray-500" />}
                    </button>
                    <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 py-0.5">
                      <Star className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />
                      <span className="text-[9px] font-bold text-gray-800">{product.rating}</span>
                      <span className="text-[9px] text-gray-400">| {product.reviews}</span>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <p className="text-[10px] font-bold text-[#ef4d62]">{product.price} | MOQ: {product.moq} | {product.sold} sold</p>
                    <p className="text-[9px] text-gray-500 truncate">{product.name} | <span className="font-bold">{brandName}</span></p>
                  </div>
                </motion.div>
              );
            })}
            {recommendationsList.length === 0 && (
              <p className="col-span-3 py-6 text-center text-xs text-gray-400">No recommendations yet.</p>
            )}
          </motion.div>
        </motion.section>

        {/* ══ BRAND PRODUCT VIDEOS ══ */}
        {vendorVideos.length > 0 && (
          <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Brand Product Videos</h2>
            <motion.div variants={listContainer} className="grid grid-cols-3 gap-2">
              {vendorVideos.map((video, index) => (
                <motion.button variants={listItem} whileTap={TAP} transition={TAP_T} key={video.id}
                  onClick={() => { setVideoStartIndex(index); setVideoViewerOpen(true); }}
                  className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gray-100">
                  <img src={video.thumbnail} alt={video.brandLine} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-black/25" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80">
                      <Play className="h-4 w-4 text-[#ef4d62] fill-[#ef4d62]" />
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 py-2">
                    <p className="text-[9px] font-bold text-white truncate">{video.brandLine}</p>
                    <p className="text-[9px] text-white/85">{video.price}</p>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          </motion.section>
        )}

        {/* ══ CATALOGUES / LOOKBOOKS ══ */}
        {catalogues.length > 0 && (
          <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-[#ef4d62]" />
              <h2 className="text-sm font-bold text-gray-900">Catalogues & Lookbooks</h2>
            </div>
            <p className="text-xs text-gray-400 mb-3">Browse this brand's full product range as PDF catalogues</p>
            <motion.div variants={listContainer} className="grid grid-cols-2 gap-3">
              {catalogues.map((cat) => (
                <motion.a
                  variants={listItem}
                  whileTap={TAP}
                  transition={TAP_T}
                  key={cat.id}
                  href={cat.fileUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col rounded-xl border border-gray-200 overflow-hidden bg-white hover:border-[#ef4d62]/40 transition-colors"
                >
                  <div className="relative aspect-[3/4] bg-gray-50">
                    {cat.coverUrl ? (
                      <img src={cat.coverUrl} alt={cat.title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#ef4d62]/5 to-gray-50">
                        <FileText className="h-9 w-9 text-[#ef4d62]/40" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">PDF</span>
                      </div>
                    )}
                    {cat.pageCount != null && (
                      <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur">
                        {cat.pageCount} pages
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-2.5">
                    <p className="text-xs font-bold text-gray-900 line-clamp-1">{cat.title}</p>
                    {cat.description && <p className="mt-0.5 text-[10px] text-gray-500 line-clamp-2">{cat.description}</p>}
                    <span className="mt-auto pt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#ef4d62]">
                      View catalogue <ExternalLink className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </motion.a>
              ))}
            </motion.div>
          </motion.section>
        )}

        {/* ══ ALL PRODUCTS ══ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">{brandName}</h2>
            <button onClick={() => setPageSaved((p) => !p)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200">
              {pageSaved ? <BookmarkCheck className="h-4 w-4 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="h-4 w-4 text-gray-500" />}
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 mb-3">
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search items" className="flex-1 text-sm text-gray-700 placeholder-gray-400 focus:outline-none bg-transparent" />
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="relative">
              <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value as "" | Gender)}
                className="appearance-none rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-700 font-semibold focus:outline-none pr-6">
                <option value="">GENDER</option>
                <option value="Men">Men</option><option value="Women">Women</option><option value="Unisex">Unisex</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
            </div>
            <div className="relative">
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as "" | "sold" | "rating")}
                className="appearance-none rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-700 font-semibold focus:outline-none pr-6">
                <option value="">SORT</option>
                <option value="sold">Most Enquired</option><option value="rating">Top Rated</option>
              </select>
              <ArrowUpDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
            </div>
            <button className="flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700">
              <Filter className="h-3 w-3" /> FILTER
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setGridCols(2)} aria-label="2 columns"
                className={cn("flex h-7 w-7 items-center justify-center rounded-full border transition-colors", gridCols === 2 ? "border-[#ef4d62] text-[#ef4d62]" : "border-gray-200 text-gray-400")}>
                <Grid2X2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setGridCols(3)} aria-label="3 columns"
                className={cn("flex h-7 w-7 items-center justify-center rounded-full border transition-colors", gridCols === 3 ? "border-[#ef4d62] text-[#ef4d62]" : "border-gray-200 text-gray-400")}>
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <p className="text-sm font-semibold text-gray-700 mb-3">Product <span className="text-[#ef4d62]">{vpProducts.length}</span></p>

          {/* Product grid */}
          <div className={cn("grid", gridCols === 2 ? "grid-cols-2 gap-3" : "grid-cols-3 gap-2")}>
            {filteredProducts.map((product) => {
              const isSaved = Boolean(saved.products[product.id]);
              return (
                <div key={product.id} className="rounded-xl border border-gray-200 overflow-hidden bg-white flex flex-col">
                  <div className="relative aspect-[3/4] bg-gray-100 shrink-0">
                    <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                    <button onClick={() => openSaveModal({ ...product, moq: `MOQ: ${product.moq}`, manufacturer: brandName, location: product.location })}
                      aria-label="Save" className={cn("absolute top-2 right-2 flex items-center justify-center rounded-full bg-white/90 shadow", gridCols === 2 ? "h-7 w-7" : "h-6 w-6")}>
                      {isSaved ? <BookmarkCheck className={cn("text-[#ef4d62] fill-[#ef4d62]/15", gridCols === 2 ? "h-3.5 w-3.5" : "h-3 w-3")} /> : <Bookmark className={cn("text-gray-500", gridCols === 2 ? "h-3.5 w-3.5" : "h-3 w-3")} />}
                    </button>
                    <div className="absolute bottom-2 left-2 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 py-0.5">
                      <Star className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />
                      <span className="text-[9px] font-bold text-gray-800">{product.rating}</span>
                      <span className="text-[9px] text-gray-400">| {product.reviews}</span>
                    </div>
                  </div>
                  <div className={cn("flex flex-col flex-1", gridCols === 2 ? "p-2" : "p-1.5")}>
                    {gridCols === 2 && (
                      <div className="h-5 mb-0.5">
                        {product.latest && <span className="inline-block rounded-full bg-[#ef4d62]/10 px-2 py-0.5 text-[9px] font-semibold text-[#ef4d62]">Latest Products</span>}
                      </div>
                    )}
                    <p className={cn("font-bold text-[#ef4d62] leading-tight", gridCols === 2 ? "text-xs" : "text-[9px] truncate")}>
                      {product.price} | MOQ: {product.moq} | {product.sold} sold
                    </p>
                    <p className={cn("text-gray-600 mt-0.5", gridCols === 2 ? "text-[10px]" : "text-[8px] truncate")}>
                      {product.name} | <span className="font-bold">{brandName}</span>
                    </p>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <MapPin className={cn("text-gray-500 shrink-0", gridCols === 2 ? "h-2.5 w-2.5" : "h-2 w-2")} />
                      <span className={cn("font-bold text-gray-700 truncate", gridCols === 2 ? "text-[10px]" : "text-[8px]")}>{product.location}</span>
                    </div>
                    <p className={cn("text-gray-500 mt-0.5", gridCols === 2 ? "text-[10px]" : "text-[8px] truncate")}>Fabric: {product.fabric} | GSM: {product.gsm}</p>
                    <p className={cn("text-gray-500", gridCols === 2 ? "text-[10px]" : "text-[8px] truncate")}>Fit Type: {product.fit}</p>
                    <button onClick={() => callVendor(vendorId, product.name)}
                      className={cn("mt-auto pt-2 w-full flex items-center justify-center gap-1.5 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white font-bold rounded-lg transition-colors", gridCols === 2 ? "text-xs py-2" : "text-[9px] py-1.5")}>
                      <Phone className={gridCols === 2 ? "h-3 w-3" : "h-2.5 w-2.5"} /> Call Now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="py-12 text-center">
              <Send className="w-9 h-9 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No products found</p>
            </div>
          )}
        </motion.section>
      </motion.div>

      {/* Full-screen reel viewer for the vendor's product videos */}
      <VideoCloseUpsViewer
        videos={vendorVideos}
        initialIndex={videoStartIndex}
        isOpen={videoViewerOpen}
        onClose={() => setVideoViewerOpen(false)}
      />

      <WriteReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        brandName={brandName}
        onSubmit={(rating, text) => submitReview(vendorId, rating, text)}
      />
      <MobileBottomNav />
    </div>
  );
};

export default VendorProfile;
