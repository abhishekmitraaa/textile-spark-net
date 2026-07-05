import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import BuyerShell from "@/components/buyer/BuyerShell";
import ListingProductCard from "@/components/buyer/ListingProductCard";
import type { ListingProduct } from "@/lib/listingProducts";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import { useProductById } from "@/lib/queries/products";
import { useProductReviews, useReviewMutations } from "@/lib/queries/reviews";
import { useCallVendor } from "@/lib/queries/calls";
import { recordView } from "@/lib/recentlyViewedStore";
import { toast } from "sonner";
import {
  Bookmark, BookmarkCheck, Share2, Star, MapPin, Phone, MessageCircle,
  ChevronDown, BadgeCheck, Clock, Download, Globe, ThumbsUp, ThumbsDown, MoreVertical,
  CheckCircle2, Play, Package, Plus, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import trustedSeal from "@/assets/Trustedseal.png";

// === Animation constants ===
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } } };
const sect = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.36 } } };

const CORAL = "#ef4d62";
const COLOR_HEX: Record<string, string> = {
  Beige: "#E8D5B7", Navy: "#1B2A4A", Olive: "#6B7A3D", Black: "#1A1A1A", White: "#F5F5F5",
  Grey: "#9E9E9E", Red: "#C0392B", Green: "#2D6A4F", Blue: "#2471A3",
};

// === Types ===
interface MediaItem { type: "image" | "video"; url: string; videoUrl?: string }
interface Spec { label: string; value: string }
interface Review { id: number; name: string; rating: number; date: string; comment: string; sizeBought: string; photos: string[]; helpful: number }
interface ProductData {
  id: string; productCode: string; name: string; price: string; priceUnit: string; moq: string;
  category: string; subCategory: string; media: MediaItem[]; rating: number; soldCount: string; isInAd: boolean;
  vendor: { id: string; initials: string; name: string; location: string; verified: boolean; rating: number; reviews: number; responseTime: string };
  availableColors: string[]; availableSizes: string[]; specifications: Spec[]; customizationAvailable: boolean;
  description: string; manufacturing: { country: string; certifications: string[] };
  totalReviews: number; ratingBreakdown: Record<number, number>; reviews: Review[];
  brandPicks: { id: string; vendorName: string; category: string; price: string; rating: number; soldCount: string; image: string }[];
  youMightLike: { id: string; price: string; moq: string; name: string; manufacturer: string; location: string; fabric: string; gsm: string; fitType: string; rating: number; soldCountBadge: string; image: string }[];
}

// === Mock data ===
const PRODUCTS: Record<string, ProductData> = {
  "1": {
    id: "1", productCode: "TF-MDS-0412", name: "Premium Cotton Chinos", price: "₹499", priceUnit: "Piece", moq: "500 Pieces",
    category: "Women's", subCategory: "Midi Dresses",
    media: [
      { type: "image", url: "https://picsum.photos/seed/chino-front-cosora/600/800" },
      { type: "image", url: "https://picsum.photos/seed/chino-side-cosora/600/800" },
      { type: "video", url: "https://picsum.photos/seed/chino-video-cosora/600/800", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4" },
      { type: "image", url: "https://picsum.photos/seed/chino-detail-cosora/600/800" },
    ],
    rating: 4.1, soldCount: "5.6k", isInAd: true,
    vendor: { id: "tf-india", initials: "TF", name: "Textile Forge India", location: "Surat, Gujarat", verified: true, rating: 4.8, reviews: 124, responseTime: "Usually responds within 4 hours" },
    availableColors: ["Beige", "Navy", "Olive", "Black"],
    availableSizes: ["28", "30", "32", "34", "36", "38", "40"],
    specifications: [
      { label: "Waist Type", value: "Mid Rise" }, { label: "Length Type", value: "Full Length" },
      { label: "Fit Type", value: "Slim Fit" }, { label: "Fabric", value: "100% Cotton Twill" },
      { label: "Pattern", value: "Solid" }, { label: "GSM", value: "280 GSM" },
      { label: "Occasion", value: "Casual, Semi-Formal" }, { label: "Wash Care", value: "Machine Wash, Do Not Bleach" },
    ],
    customizationAvailable: true,
    description: "Premium quality cotton chinos made with 100% organic cotton. Perfect for casual and semi-formal occasions. Features a comfortable mid-rise waist with a tailored fit that flatters all body types. Bio-washed for extra softness.",
    manufacturing: { country: "India", certifications: ["GOTS", "OEKO-TEX Standard 100"] },
    totalReviews: 100, ratingBreakdown: { 5: 60, 4: 25, 3: 8, 2: 5, 1: 2 },
    reviews: [
      { id: 1, name: "Vaibhav Tripathi", rating: 5, date: "2 months ago", comment: "Nice", sizeBought: "XXL", photos: [], helpful: 0 },
      { id: 2, name: "Anubhav Kumar", rating: 5, date: "2 months ago", comment: "Like it", sizeBought: "XXL", photos: ["https://picsum.photos/seed/rev-ph-1/200/200", "https://picsum.photos/seed/rev-ph-2/200/200", "https://picsum.photos/seed/rev-ph-3/200/200"], helpful: 0 },
      { id: 3, name: "Ramakant", rating: 5, date: "a month ago", comment: "Nice", sizeBought: "L", photos: [], helpful: 0 },
      { id: 4, name: "Seema", rating: 4, date: "2 months ago", comment: "Comfortable T-shirt, fits as expected. Collar style gives it a different look", sizeBought: "XXL", photos: [], helpful: 0 },
    ],
    brandPicks: [
      { id: "bp1", vendorName: "THEOT / J merino...", category: "Shirts", price: "$27.53", rating: 3.9, soldCount: "1.4k", image: "https://picsum.photos/seed/brand-pick-shirts/300/400" },
      { id: "bp2", vendorName: "Queen's Square /...", category: "Knitwear/Sweaters", price: "$20.09", rating: 4.6, soldCount: "800", image: "https://picsum.photos/seed/brand-pick-knitwear/300/400" },
      { id: "bp3", vendorName: "THEOT / high tou...", category: "Blouses", price: "$17.11", rating: 4.2, soldCount: "650", image: "https://picsum.photos/seed/brand-pick-blouses/300/400" },
    ],
    youMightLike: [
      { id: "ym1", price: "₹499", moq: "MOQ: 2", name: "Printed Cotton Kurta", manufacturer: "Artisan Weaves Co.", location: "Bangalore", fabric: "Cotton", gsm: "GSM: 200", fitType: "Fit Type: Regular", rating: 4.1, soldCountBadge: "5.6k", image: "https://picsum.photos/seed/might-like-1-cosora/300/400" },
      { id: "ym2", price: "₹499", moq: "MOQ: 2", name: "Relaxed Linen Trouser", manufacturer: "SilkThread Mills", location: "Bangalore", fabric: "Cotton", gsm: "GSM: 200", fitType: "Fit Type: Regular", rating: 3.8, soldCountBadge: "1.6k", image: "https://picsum.photos/seed/might-like-2-cosora/300/400" },
      { id: "ym3", price: "₹599", moq: "MOQ: 2", name: "Oversized Crew Tee", manufacturer: "Tiruppur Knitworks", location: "Tirupur", fabric: "Cotton", gsm: "GSM: 240", fitType: "Fit Type: Oversized", rating: 4.3, soldCountBadge: "3.2k", image: "https://picsum.photos/seed/might-like-3-cosora/300/400" },
      { id: "ym4", price: "₹459", moq: "MOQ: 2", name: "Camp Collar Shirt", manufacturer: "Mumbai Linen House", location: "Mumbai", fabric: "Linen", gsm: "GSM: 180", fitType: "Fit Type: Regular", rating: 4.0, soldCountBadge: "1.1k", image: "https://picsum.photos/seed/might-like-4-cosora/300/400" },
    ],
  },
};

const getDefaultProduct = (id: string): ProductData => (PRODUCTS[id] ? PRODUCTS[id] : { ...PRODUCTS["1"], id });

// === Tiled COSORA watermark overlay ===
function Watermark() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 overflow-hidden">
      {[0, 1, 2, 3].map((r) => (
        <span key={r} className="whitespace-nowrap rotate-[-28deg] text-2xl font-black tracking-[0.35em] text-white/15 select-none">
          COSORA&nbsp;&nbsp;COSORA&nbsp;&nbsp;COSORA
        </span>
      ))}
    </div>
  );
}

// === Media carousel (center-peek, swipeable, video autoplay) ===
function MediaCarousel({ media, rating, soldCount, isInAd }: { media: MediaItem[]; rating: number; soldCount: string; isInAd: boolean }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const total = media.length;
  const goNext = () => setActive((i) => (i + 1) % total);
  const goPrev = () => setActive((i) => (i - 1 + total) % total);
  const offsetFor = (i: number) => { let r = i - active; if (r > total / 2) r -= total; if (r < -total / 2) r += total; return r; };

  return (
    <div className="rounded-2xl bg-gray-100 overflow-hidden">
      <motion.div
        className="relative h-[380px] sm:h-[460px] overflow-hidden touch-pan-y select-none"
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.15} dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60 || info.velocity.x < -500) goNext();
          else if (info.offset.x > 60 || info.velocity.x > 500) goPrev();
        }}
      >
        {media.map((m, i) => {
          const off = offsetFor(i);
          const isActive = off === 0;
          const visible = Math.abs(off) <= 1;
          const showVideo = isActive && m.type === "video" && m.videoUrl;
          return (
            <motion.div
              key={i}
              className="absolute top-1/2 left-1/2 h-full aspect-[3/4]"
              animate={{ x: `${-50 + off * 72}%`, y: "-50%", scale: isActive ? 1 : 0.82, opacity: visible ? (isActive ? 1 : 0.45) : 0, zIndex: isActive ? 20 : 10 - Math.abs(off) }}
              transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="relative w-full h-full rounded-2xl overflow-hidden bg-gray-200 shadow-lg">
                {showVideo ? (
                  <video src={m.videoUrl} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <img src={m.url} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                )}
                {m.type === "video" && !showVideo && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
                      <Play className="h-5 w-5 fill-white text-white" />
                    </div>
                  </div>
                )}
                <Watermark />
              </div>
            </motion.div>
          );
        })}

        {isInAd && <img src={trustedSeal} alt="TrustedSEAL verified vendor" className="absolute top-3 left-3 z-30 h-6 w-auto drop-shadow" />}

        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          <span className="font-semibold">{rating.toFixed(1)}</span>
          <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
          <span className="text-white/60">|</span>
          <span>{soldCount}</span>
        </div>
      </motion.div>

      <div className="flex items-center justify-center gap-1.5 py-3">
        {media.map((_, i) => (
          <button key={i} onClick={() => setActive(i)} aria-label={`Slide ${i + 1}`}
            className={cn("h-1.5 rounded-full transition-all", i === active ? "w-5 bg-[#ef4d62]" : "w-1.5 bg-gray-300 hover:bg-gray-400")} />
        ))}
      </div>
    </div>
  );
}

// === Star row ===
function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={cn("h-3.5 w-3.5", s <= Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300")} />
      ))}
    </div>
  );
}

// === Review card ===
function ReviewCard({ review }: { review: Review }) {
  const [helpfulCount, setHelpfulCount] = useState(review.helpful);
  const [voted, setVoted] = useState<"up" | "down" | null>(null);
  return (
    <div className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-gray-900">{review.name}</span>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span>Helpful?</span>
          <button onClick={() => { if (voted !== "up") { setHelpfulCount((c) => c + 1); setVoted("up"); } }} className={cn("transition-colors", voted === "up" ? "text-[#ef4d62]" : "hover:text-gray-700")}><ThumbsUp className="h-3.5 w-3.5" /></button>
          <span>{helpfulCount}</span>
          <button onClick={() => setVoted("down")} className={cn("transition-colors", voted === "down" ? "text-[#ef4d62]" : "hover:text-gray-700")}><ThumbsDown className="h-3.5 w-3.5" /></button>
          <button className="hover:text-gray-700"><MoreVertical className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="inline-flex h-5 items-center gap-0.5 rounded bg-gray-900 px-1.5 text-[10px] font-semibold text-white">{review.rating}<Star className="h-2.5 w-2.5 fill-white text-white" /></span>
        <span className="text-xs text-gray-400">{review.date}</span>
      </div>
      {review.comment && <p className="mt-1.5 text-sm text-gray-700 leading-relaxed">{review.comment}</p>}
      {review.sizeBought && <p className="mt-1.5 inline-block rounded bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">Size bought: {review.sizeBought}</p>}
      {review.photos.length > 0 && (
        <div className="mt-2.5 flex gap-2">
          {review.photos.map((photo, idx) => (
            <div key={idx} className="h-16 w-16 overflow-hidden rounded-lg bg-gray-100"><img src={photo} alt="Review" className="h-full w-full object-cover" /></div>
          ))}
        </div>
      )}
    </div>
  );
}

// === Write a Review modal ===
function WriteReviewModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (rating: number, text: string) => Promise<void> }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setRating(0); setHover(0); setText(""); setSaving(false); } }, [open]);
  const submit = async () => {
    if (rating === 0) { toast.error("Please pick a star rating"); return; }
    setSaving(true);
    try {
      await onSubmit(rating, text);
      toast.success("Thanks! Your review has been submitted");
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
            <div className="flex items-center gap-1.5 mb-4">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)} onClick={() => setRating(s)} aria-label={`${s} star`}>
                  <Star className={cn("w-8 h-8 transition-colors", (hover || rating) >= s ? "text-yellow-400 fill-yellow-400" : "text-gray-300")} />
                </button>
              ))}
            </div>
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Share your experience with this product…"
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]" />
            <button onClick={submit} disabled={saving} className="mt-3 w-full rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 disabled:opacity-60 text-white py-3 text-sm font-bold transition-colors">{saving ? "Submitting…" : "Submit Review"}</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const callVendor = useCallVendor();
  const reduced = useReducedMotion();
  const saved = useSaved();

  // Real product from Supabase (when the id is a real UUID from the live feed).
  // We merge it over the mock template so sections we don't persist yet
  // (reviews, brand picks, "you might also like") still render.
  const { data: row } = useProductById(id);
  const base = getDefaultProduct(id ?? "1");
  const product: ProductData = row
    ? {
        ...base,
        id: row.id,
        name: row.name,
        price: `${row.currency}${Math.round(Number(row.priceValue ?? 0))}`,
        priceUnit: "Piece",
        moq: row.moq ? `${row.moq} Pieces` : base.moq,
        category: row.categoryName ?? base.category,
        subCategory: "",
        media: row.images.length ? row.images.map((u) => ({ type: "image" as const, url: u })) : base.media,
        rating: Number(row.ratingAvg) || base.rating,
        soldCount: row.soldCount >= 1000 ? `${(row.soldCount / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(row.soldCount),
        isInAd: row.vendor?.isVerified ?? false,
        vendor: {
          id: row.vendorId,
          initials: (row.vendor?.brandName ?? "Vendor").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
          name: row.vendor?.brandName ?? "Vendor",
          location: row.location ?? row.vendor?.city ?? "India",
          verified: row.vendor?.isVerified ?? false,
          rating: Number(row.vendor?.ratingAvg) || base.vendor.rating,
          reviews: row.vendor?.reviewsCount ?? base.vendor.reviews,
          responseTime: base.vendor.responseTime,
        },
        availableColors: row.colour ? [row.colour] : base.availableColors,
        specifications: (() => {
          const real = [
            row.fabric && { label: "Fabric", value: row.fabric },
            row.gsm && { label: "GSM", value: row.gsm },
            row.fitType && { label: "Fit Type", value: row.fitType },
            row.gender && { label: "Gender", value: row.gender },
            row.colour && { label: "Colour", value: row.colour },
          ].filter(Boolean) as Spec[];
          return real.length ? real : base.specifications;
        })(),
        description: row.description ?? base.description,
      }
    : base;
  const isSaved = Boolean(saved.products[product.id]);

  const [tab, setTab] = useState<"details" | "reviews">("details");
  const [selectedColor, setSelectedColor] = useState(product.availableColors[0]);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Real product reviews (only queried for a real DB product). Falls back to the
  // mock template so non-DB demo products still render a populated section.
  const { data: productReviews } = useProductReviews(row?.id);
  const { submitProductReview } = useReviewMutations();
  const hasRealReviews = (productReviews?.count ?? 0) > 0;

  const mockAvg = parseFloat((product.reviews.reduce((s, r) => s + r.rating, 0) / (product.reviews.length || 1)).toFixed(1));
  const avgRating = hasRealReviews ? productReviews!.avg : mockAvg;
  const reviewsTotal = hasRealReviews ? productReviews!.count : product.totalReviews;
  const breakdownPct = (star: number) =>
    hasRealReviews
      ? productReviews!.breakdown.find((b) => b.stars === star)?.percent ?? 0
      : Math.round(((product.ratingBreakdown[star] ?? 0) / product.totalReviews) * 100);
  const reviewCards: Review[] = hasRealReviews
    ? productReviews!.reviews.map((r, i) => ({
        id: i,
        name: r.reviewerName,
        rating: r.rating,
        date: new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        comment: r.body ?? "",
        sizeBought: r.sizeBought ?? "",
        photos: r.photos,
        helpful: 0,
      }))
    : product.reviews;

  const saveProduct = () => openSaveModal({
    id: product.id, vendorId: product.vendor.id, name: product.name, manufacturer: product.vendor.name,
    location: product.vendor.location, price: product.price, moq: product.moq, rating: product.rating,
    verified: product.vendor.verified, image: product.media[0]?.url, category: product.category,
  });

  // Record view for Recently Viewed
  useEffect(() => {
    recordView({
      id: product.id, vendorId: product.vendor.id, name: product.name, manufacturer: product.vendor.name,
      location: product.vendor.location, price: product.price, moq: product.moq, rating: product.rating,
      reviews: product.totalReviews, verified: product.vendor.verified, image: product.media[0]?.url, category: product.category,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // "You might also like" → shared listing card
  const likeProducts: ListingProduct[] = product.youMightLike.map((it) => ({
    id: it.id, vendorId: `v-${it.id}`, name: it.name, manufacturer: it.manufacturer, location: it.location,
    price: it.price, priceValue: parseInt(it.price.replace(/[^\d]/g, ""), 10) || 499, moq: it.moq, soldCount: "800+ sold",
    enquiries: it.soldCountBadge, rating: it.rating, fabric: it.fabric, gsm: it.gsm.replace(/^GSM:\s*/, ""),
    fitType: it.fitType.replace(/^Fit Type:\s*/, ""), image: it.image, secondaryImage: it.image, gender: "unisex",
  }));

  const card = "rounded-2xl border border-gray-200 bg-white p-4";

  return (
    <BuyerShell>
      <motion.div className="max-w-2xl mx-auto px-4 pt-3 pb-6 space-y-3" variants={reduced ? {} : page} initial="hidden" animate="show">

        {/* Media */}
        <motion.div variants={sect}>
          <MediaCarousel media={product.media} rating={product.rating} soldCount={product.soldCount} isInAd={product.isInAd} />
        </motion.div>

        {/* Breadcrumb + header */}
        <motion.div variants={sect}>
          <p className="text-xs text-gray-400">{product.category} &rsaquo; {product.subCategory}</p>
          <div className="mt-1 flex items-start justify-between gap-2">
            <h1 className="flex-1 text-lg font-bold leading-snug text-gray-900 sm:text-xl">{product.name}</h1>
            <div className="flex shrink-0 items-center gap-0.5">
              <button onClick={saveProduct} aria-label={isSaved ? "Edit saved folders" : "Save product"} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 active:scale-95">
                {isSaved ? <BookmarkCheck className="h-4 w-4 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="h-4 w-4 text-gray-500" />}
              </button>
              <button aria-label="Share" onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success("Link copied!"); }} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 active:scale-95">
                <Share2 className="h-4 w-4 text-gray-500" />
              </button>
            </div>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-[#ef4d62]">{product.price}</span>
            <span className="text-sm text-gray-500">/ {product.priceUnit}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Package className="h-3.5 w-3.5" /> MOQ {product.moq}</span>
            <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-400">{product.productCode}</span>
          </div>
        </motion.div>

        {/* Vendor card (clickable → profile) */}
        <motion.div variants={sect} onClick={() => navigate(`/vendor/${product.vendor.id}`)}
          className={cn(card, "cursor-pointer transition-shadow hover:shadow-md")}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ef4d62]/15 text-sm font-bold text-[#ef4d62]">{product.vendor.initials}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-bold text-gray-900">{product.vendor.name}</span>
                {product.vendor.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-[#ef4d62]" />}
              </div>
              <div className="mt-0.5 flex items-center gap-0.5 text-xs text-gray-500">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                <span className="font-medium text-gray-800">{product.vendor.rating}</span>
                <span>({product.vendor.reviews} reviews)</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500"><MapPin className="h-3 w-3" /> {product.vendor.location}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setIsFollowing((f) => !f); }}
              className={cn("h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors active:scale-95", isFollowing ? "border-gray-200 text-gray-600" : "border-[#ef4d62] text-[#ef4d62] hover:bg-[#ef4d62]/5")}>
              {isFollowing ? "Following" : "+ Follow"}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500"><Clock className="h-3.5 w-3.5 shrink-0" /> {product.vendor.responseTime}</div>
          {product.isInAd && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
              <CheckCircle2 className="h-3 w-3" /> Trust Seal Verified
            </div>
          )}
        </motion.div>

        {/* Tabs */}
        <motion.div variants={sect} className="flex rounded-xl border border-gray-200 p-1">
          {(["details", "reviews"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="relative flex-1 rounded-lg py-2 text-sm font-semibold capitalize">
              {tab === t && <motion.span layoutId="pd-tab" className="absolute inset-0 rounded-lg bg-[#ef4d62]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span className={cn("relative z-10", tab === t ? "text-white" : "text-gray-500")}>{t}</span>
            </button>
          ))}
        </motion.div>

        {/* ── DETAILS ── */}
        {tab === "details" && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            {/* Colors */}
            <div className={card}>
              <h3 className="mb-3 text-sm font-bold text-gray-900">Available Colors</h3>
              <div className="flex flex-wrap gap-2">
                {product.availableColors.map((c) => (
                  <button key={c} onClick={() => setSelectedColor(c)}
                    className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95",
                      selectedColor === c ? "border-[#ef4d62] bg-[#ef4d62]/5 text-[#ef4d62]" : "border-gray-200 text-gray-600 hover:border-[#ef4d62]/40")}>
                    <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: COLOR_HEX[c] ?? "#ccc" }} />{c}
                  </button>
                ))}
              </div>
            </div>

            {/* Sizes */}
            <div className={card}>
              <h3 className="mb-3 text-sm font-bold text-gray-900">Available Sizes</h3>
              <div className="flex flex-wrap gap-2">
                {product.availableSizes.map((s) => (
                  <button key={s} onClick={() => setSelectedSize((cur) => (cur === s ? null : s))}
                    className={cn("flex h-9 min-w-[38px] items-center justify-center rounded-lg border px-2 text-sm font-medium transition-all active:scale-95",
                      selectedSize === s ? "border-[#ef4d62] bg-[#ef4d62] text-white" : "border-gray-200 text-gray-800 hover:border-[#ef4d62]/40")}>{s}</button>
                ))}
              </div>
            </div>

            {/* Chat + Call Now (inline, per reference) */}
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(`/chats/${product.vendor.id}`)} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white py-3 text-sm font-bold transition-colors active:scale-[0.98]">
                <MessageCircle className="h-4 w-4" /> Chat
              </button>
              <button onClick={() => callVendor(product.vendor.id, product.name)} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-[#ef4d62] text-[#ef4d62] py-3 text-sm font-bold hover:bg-[#ef4d62]/5 transition-colors active:scale-[0.98]">
                <Phone className="h-4 w-4" /> Call Now
              </button>
            </div>

            {/* Specifications (collapsible) */}
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <button onClick={() => setSpecsOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3.5">
                <h3 className="text-sm font-bold text-gray-900">Product Specifications</h3>
                <ChevronDown className={cn("h-4 w-4 text-gray-500 transition-transform", specsOpen && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {specsOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: E }} className="overflow-hidden">
                    <div className="px-4 pb-4">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
                        {product.specifications.map((s) => (
                          <div key={s.label}>
                            <p className="text-[11px] text-gray-400">{s.label}</p>
                            <p className="mt-0.5 text-sm font-medium leading-snug text-gray-900">{s.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center gap-4 border-t border-gray-100 pt-3">
                        <button className="inline-flex items-center gap-1 text-xs font-semibold text-[#ef4d62] underline underline-offset-2"><Plus className="h-3 w-3" /> Add Fabric</button>
                        <button className="inline-flex items-center gap-1 text-xs font-semibold text-[#ef4d62] underline underline-offset-2"><Download className="h-3 w-3" /> Download PDF</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Customization */}
            <div className={cn(card, "flex items-center justify-between gap-3")}>
              <div>
                <p className="text-sm font-bold text-gray-900">Customization Available</p>
                <p className="mt-0.5 text-xs text-gray-500">Can this product be customized for buyers?</p>
              </div>
              <span className={cn("shrink-0 rounded-md px-3 py-1 text-xs font-bold", product.customizationAvailable ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500")}>
                {product.customizationAvailable ? "YES" : "NO"}
              </span>
            </div>

            {/* Description */}
            <div className={card}>
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Product Description</h3>
                <button className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600"><Globe className="h-3 w-3" /> Translate</button>
              </div>
              <p className="text-sm leading-relaxed text-gray-600">{product.description}</p>
            </div>

            {/* Manufacturing */}
            <div className={card}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Manufacturing Details</h3>
                <button onClick={() => navigate(`/vendor/${product.vendor.id}`)} className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-gray-300">View Profile</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-800"><CheckCircle2 className="h-4 w-4 text-green-600" /> Made in {product.manufacturing.country}</span>
                {product.manufacturing.certifications.map((c) => (
                  <span key={c} className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">{c}</span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── REVIEWS ── */}
        {tab === "reviews" && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className={card}>
              <div className="flex items-start gap-5">
                <div className="shrink-0 text-center">
                  <p className="text-4xl font-extrabold text-gray-900">{avgRating}</p>
                  <StarRow rating={avgRating} />
                  <p className="mt-1 text-xs text-gray-400">{reviewsTotal} reviews</p>
                </div>
                <div className="flex-1 space-y-2">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const pct = breakdownPct(star);
                    return (
                      <div key={star} className="flex items-center gap-2">
                        <span className="w-2.5 text-xs text-gray-500">{star}</span>
                        <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                        <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <motion.div className="h-full rounded-full bg-[#ef4d62]" initial={reduced ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: E }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={card}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Customer Reviews</h3>
                <button onClick={() => setReviewOpen(true)} className="rounded-full bg-[#ef4d62] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#ef4d62]/90">Write a Review</button>
              </div>
              {reviewCards.length > 0 ? (
                <div className="space-y-4">{reviewCards.map((r) => <ReviewCard key={r.id} review={r} />)}</div>
              ) : (
                <p className="py-6 text-center text-sm text-gray-400">No reviews yet. Be the first to review this product.</p>
              )}
            </div>
          </motion.div>
        )}

        {/* Brand Picks (sponsored) */}
        <motion.div variants={sect} className="pt-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1 text-sm font-bold text-gray-900">Brand Picks <ChevronDown className="h-4 w-4 -rotate-90 text-gray-400" /></h2>
            <span className="text-[10px] italic text-gray-300">sponsored</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {product.brandPicks.map((pick) => (
              <div key={pick.id} className="w-32 shrink-0 overflow-hidden rounded-xl border border-[#ef4d62]/15 bg-[#ef4d62]/5">
                <Link to={`/product/${pick.id}`} className="relative block aspect-[3/4] bg-gray-100">
                  <img src={pick.image} alt={pick.category} className="h-full w-full object-cover" />
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
                    <span>{pick.rating}</span><Star className="h-2 w-2 fill-yellow-400 text-yellow-400" /><span className="text-white/60">|</span><span>{pick.soldCount}</span>
                  </div>
                </Link>
                <div className="p-1.5">
                  <p className="text-[10px] text-gray-500 truncate">{pick.vendorName}</p>
                  <p className="text-[10px] font-medium text-gray-700">{pick.category}</p>
                  <p className="text-xs font-bold text-gray-900">{pick.price}</p>
                  <button onClick={() => callVendor(`vendor-${pick.id}`, pick.category)} className="mt-1 w-full flex items-center justify-center gap-1 bg-[#ef4d62] text-white text-[9px] font-bold py-1.5 rounded"><Phone className="h-2.5 w-2.5" /> Call Now</button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* You might also like */}
        <motion.div variants={sect} className="pt-2">
          <h2 className="mb-3 text-sm font-bold text-gray-900">You might also like</h2>
          <div className="grid grid-cols-2 gap-3">
            {likeProducts.map((p) => <ListingProductCard key={p.id} product={p} />)}
          </div>
        </motion.div>
      </motion.div>

      <WriteReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onSubmit={(rating, text) => {
          if (!row?.id) throw new Error("Reviews are available on live products only");
          return submitProductReview(row.id, rating, text);
        }}
      />
    </BuyerShell>
  );
};

export default ProductDetail;
