import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import BuyerShell from "@/components/buyer/BuyerShell";
import ListingProductCard from "@/components/buyer/ListingProductCard";
import SponsoredRail from "@/components/buyer/SponsoredRail";
import type { ListingProduct, Gender } from "@/lib/listingProducts";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import {
  useProductById, recordProductView, recordProductEnquiry,
  useYouMightLike, useVendorOtherProducts, type ProductCardData,
  type ProductDetail as ProductRow,
} from "@/lib/queries/products";
import { useProductReviews, useVendorReviews, useReviewMutations } from "@/lib/queries/reviews";
import { WriteReviewModal } from "@/components/reviews/WriteReviewModal";
import { ReviewPhotoStrip } from "@/components/reviews/ReviewPhotoStrip";
import { useAuth } from "@/contexts/AuthContext";
import { useCallVendor } from "@/lib/queries/calls";
import { recordView } from "@/lib/recentlyViewedStore";
import { toast } from "sonner";
import { logEngagement, consumeNavSource } from "@/lib/queries/engagement";
import ProductChatOptionsSheet from "@/components/buyer/ProductChatOptionsSheet";
import ProductQuoteRequestModal from "@/components/buyer/ProductQuoteRequestModal";
import {
  Bookmark, BookmarkCheck, Share2, Star, MapPin, Phone, MessageCircle,
  ChevronDown, BadgeCheck, AlertCircle, ImageOff, Download, Globe, ThumbsUp, ThumbsDown, MoreVertical,
  CheckCircle2, Play, Package, Plus, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import trustedSeal from "@/assets/Trustedseal.png";

// === Animation constants ===
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } } };
const sect = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.36 } } };

// Map a real catalogue row into the shared listing-card shape used by the
// "You might also like" / "Brand Picks" strips.
function cardToListing(p: ProductCardData): ListingProduct {
  return {
    id: p.id, vendorId: p.vendorId, name: p.name, manufacturer: p.manufacturer, location: p.location,
    price: p.price, priceValue: p.priceValue, moq: `MOQ: ${p.moq}`, soldCount: p.soldCount, enquiries: p.enquiries,
    rating: p.rating, fabric: p.fabric, gsm: p.gsm, fitType: p.fitType, image: p.image, secondaryImage: p.secondaryImage,
    gender: (p.gender.toLowerCase() as Gender),
  };
}

const CORAL = "#ef4d62";
const COLOR_HEX: Record<string, string> = {
  Beige: "#E8D5B7", Navy: "#1B2A4A", Olive: "#6B7A3D", Black: "#1A1A1A", White: "#F5F5F5",
  Grey: "#9E9E9E", Red: "#C0392B", Green: "#2D6A4F", Blue: "#2471A3",
};

// === Types ===
interface MediaItem { type: "image" | "video"; url: string; videoUrl?: string }
interface Spec { label: string; value: string }
interface Review { id: number; name: string; rating: number; date: string; comment: string; sizeBought: string; photos: string[]; helpful: number }
/**
 * The product page's view model — built ONLY from the database row.
 *
 * This used to be `{ ...mockChinos, ...realFields }`: a real listing layered
 * over a hardcoded "Premium Cotton Chinos" template, so every field the row did
 * not override was inherited fiction. Every live product claimed GOTS and
 * OEKO-TEX certification, a 4-hour vendor response time and product code
 * TF-MDS-0412; a product with no reviews showed four invented named reviewers
 * and a 100-review breakdown; one with no photos showed the chinos and a Google
 * sample MP4. There is no template now. A field with no real source is null and
 * the page says "not specified", or the section is not rendered.
 */
interface ProductData {
  id: string;
  name: string;
  /** Formatted, or null when the vendor listed no price — rendered as
   *  "Price on request", never as "₹0". */
  price: string | null;
  unit: string | null;
  /** MOQ exactly as listed; the unit is appended only to a bare number. */
  moq: string | null;
  category: string | null;
  media: MediaItem[];
  vendor: { id: string; initials: string; name: string; location: string | null; verified: boolean };
  availableColors: string[];
  availableSizes: string[];
  specifications: Spec[];
  customizationAvailable: boolean;
  description: string | null;
  countryOfOrigin: string | null;
}

// A malformed id can never match a row, and PostgREST answers a non-uuid with
// an ERROR (22P02) rather than an empty result — so without this, a mistyped
// link would render "couldn't load" instead of "not found".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toViewModel(row: ProductRow): ProductData {
  const brand = row.vendor?.brandName?.trim() || null;
  const moq = row.moq?.trim() || null;
  // Multi-value attributes are stored as text[]; join for display and skip
  // empty arrays so a listing that didn't collect one shows no row.
  const list = (v: string[] | null) => (v && v.length ? v.join(", ") : null);
  return {
    id: row.id,
    name: row.name,
    price: row.priceValue != null ? `${row.currency}${Math.round(Number(row.priceValue))}` : null,
    unit: row.unit,
    // Seeded MOQs already carry their unit ("50 pieces"); demo listings are a
    // bare number. The old code appended "Pieces" to both — producing
    // "50 pieces Pieces" — and guessed the unit, since `unit` was never read.
    moq: moq && /^\d+$/.test(moq) && row.unit ? `${moq} ${row.unit}` : moq,
    category: row.categoryName,
    media: row.images.map((url) => ({ type: "image" as const, url })),
    vendor: {
      id: row.vendorId,
      initials: (brand ?? "V").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
      name: brand ?? "Vendor",
      location: row.location ?? row.vendor?.city ?? null,
      // trustSealFromParts() — the same seal buyers see everywhere else.
      verified: row.vendor?.isVerified ?? false,
    },
    // These drive the Request Quotation form, so only what the vendor listed.
    availableColors: row.colour ? [row.colour] : [],
    availableSizes: row.sizes ?? [],
    customizationAvailable: row.customizationAvailable,
    specifications: [
      row.fabric && { label: "Fabric", value: row.fabric },
      row.gsm && { label: "GSM", value: row.gsm },
      list(row.pattern) && { label: "Pattern", value: list(row.pattern) },
      row.fitType && { label: "Fit Type", value: row.fitType },
      row.neckType && { label: "Neck Type", value: row.neckType },
      row.collarType && { label: "Collar Type", value: row.collarType },
      row.sleeveType && { label: "Sleeve Type", value: row.sleeveType },
      list(row.occasion) && { label: "Occasion", value: list(row.occasion) },
      row.gender && { label: "Gender", value: row.gender },
      row.colour && { label: "Colour", value: row.colour },
      list(row.waistSizes) && { label: "Waist Sizes", value: list(row.waistSizes) },
      list(row.lengths) && { label: "Length Options", value: list(row.lengths) },
    ].filter(Boolean) as Spec[],
    description: row.description?.trim() || null,
    countryOfOrigin: row.countryOfOrigin,
  };
}

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
// `rating` is null unless the product has real product_reviews rows, and there
// is no sold-count chip at all: `products.sold_count` has no writer in either
// repo and there is no orders table, so every value in it is seed data.
// `hasTrustSeal` is the vendor's real seal (trustSealFromParts) — it was
// previously named `isInAd`, which described something it never measured.
function MediaCarousel({ media, rating, hasTrustSeal }: { media: MediaItem[]; rating: number | null; hasTrustSeal: boolean }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const total = media.length;
  const goNext = () => setActive((i) => (i + 1) % total);
  const goPrev = () => setActive((i) => (i - 1 + total) % total);
  const offsetFor = (i: number) => { let r = i - active; if (r > total / 2) r -= total; if (r < -total / 2) r += total; return r; };

  return (
    <div className="rounded-2xl bg-gray-100 overflow-hidden">
      <motion.div
        className="relative h-[380px] sm:h-[460px] lg:h-[520px] overflow-hidden touch-pan-y select-none"
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

        {hasTrustSeal && <img src={trustedSeal} alt="TrustedSEAL verified vendor" className="absolute top-3 left-3 z-30 h-6 w-auto drop-shadow" />}

        {rating != null && (
          <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <span className="font-semibold">{rating.toFixed(1)}</span>
            <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
          </div>
        )}
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
      <ReviewPhotoStrip photos={review.photos} className="mt-2.5" />
    </div>
  );
}

// === Not-found state ===
// Deliberately identical for a product that never existed and one that exists but
// is RLS-blocked (rejected / under review / not the viewer's own). The copy leaks
// nothing about which ids are real — it must never branch on the id or its status.
function ProductNotFound() {
  const navigate = useNavigate();
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <Package className="h-8 w-8 text-gray-400" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-gray-900">Product not found</h1>
      <p className="mt-1.5 max-w-xs text-sm text-gray-500">
        This product isn't available. It may have been removed, or the link may be incorrect.
      </p>
      <button
        onClick={() => navigate("/search")}
        className="mt-6 rounded-xl bg-[#ef4d62] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#ef4d62]/90 active:scale-[0.98]"
      >
        Browse products
      </button>
    </div>
  );
}

// === Load-error state ===
// Distinct from not-found on purpose: "this product does not exist" and "we
// could not reach the server" call for different actions, and collapsing them
// is how a network failure passes for a missing listing. Never falls back to
// showing some other product — a failed query is an error, not a cue for fiction.
function ProductLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <AlertCircle className="h-7 w-7 text-red-500" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-gray-900">Couldn't load this product</h1>
      <p className="mt-1.5 max-w-xs text-sm text-gray-500">
        Something went wrong while fetching it. Check your connection and try again.
      </p>
      <button
        onClick={onRetry}
        className="mt-6 rounded-xl bg-[#ef4d62] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#ef4d62]/90 active:scale-[0.98]"
      >
        Retry
      </button>
    </div>
  );
}

// === No-photos state ===
// A listing with no images used to borrow the demo chinos' four photos and a
// Google sample MP4. Now it says there are none.
function NoPhotos() {
  return (
    <div className="flex h-[380px] sm:h-[460px] lg:h-[520px] flex-col items-center justify-center rounded-2xl bg-gray-100 text-center">
      <ImageOff className="h-8 w-8 text-gray-400" />
      <p className="mt-2 text-sm font-medium text-gray-500">No photos yet</p>
      <p className="mt-0.5 text-xs text-gray-400">The vendor hasn't added images for this product.</p>
    </div>
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

  // `row` is null for BOTH a missing id and an RLS-blocked one (non-live / not
  // the viewer's own) — maybeSingle() returns 0 rows either way, so the
  // not-found state below can't reveal which product ids actually exist.
  const validId = id && UUID_RE.test(id) ? id : undefined;
  const { data: row, isPending: rowPending, isError, refetch } = useProductById(validId);
  // A disabled query (invalid id) reports "pending" forever; that is not loading.
  const isPending = Boolean(validId) && rowPending;
  const product = row ? toViewModel(row) : null;
  const isSaved = product ? Boolean(saved.products[product.id]) : false;

  const [tab, setTab] = useState<"details" | "reviews">("details");
  // Undefined until the buyer picks one; the first REAL colour shows as active.
  // This used to be seeded from the mock template on the first render — before
  // the row arrived — and useState never re-reads its initial value, so the
  // page showed "Beige" selected on products that are not beige.
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);
  const activeColor = selectedColor ?? product?.availableColors[0];
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  // Real product reviews — the ONLY source of a product rating on this page.
  // `products.rating_avg` / `reviews_count` are deliberately not used: on 23 of
  // the 26 live listings `reviews_count` is seed data with zero product_reviews
  // rows behind it ("Hand-Embroidered Kurta" claims 480).
  const {
    data: productReviews, isPending: reviewsPending, isError: reviewsError,
  } = useProductReviews(row?.id);
  // Same rule for the vendor: their rating comes from their `reviews` rows, not
  // vendor_profiles.rating_avg / reviews_count. "Lucknow Chikankari Co." carries
  // reviews_count = 4,800 with zero rows in `reviews`.
  const { data: vendorReviews } = useVendorReviews(row?.vendorId);
  const { submitProductReview } = useReviewMutations();
  const { user } = useAuth();
  const reviewCount = productReviews?.count ?? 0;
  const hasReviews = reviewCount > 0;
  const avgRating = hasReviews ? productReviews!.avg : null;
  const vendorReviewCount = vendorReviews?.count ?? 0;
  // product_reviews.product_id is a real FK, so only a live DB product can be
  // reviewed — which, after the guards below, is the only kind rendered.
  const canReview = Boolean(row?.id);
  const myReview = (productReviews?.reviews ?? []).find((r) => r.buyerId && r.buyerId === user?.id);
  const breakdownPct = (star: number) => productReviews?.breakdown.find((b) => b.stars === star)?.percent ?? 0;
  const reviewCards: Review[] = (productReviews?.reviews ?? []).map((r, i) => ({
    id: i,
    name: r.reviewerName,
    rating: r.rating,
    date: new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    comment: r.body ?? "",
    sizeBought: r.sizeBought ?? "",
    photos: r.photos,
    helpful: 0,
  }));

  // Real recommendation strips. "You might also like" = the buyer's preferred
  // categories (fallback: this product's category); "Brand Picks" = the same
  // vendor's other live products. Both exclude the current product and only
  // surface live listings; empty results hide the section (Part 3, no padding).
  const { data: relatedRaw } = useYouMightLike(row?.id);
  const { data: brandPicksRaw } = useVendorOtherProducts(row?.vendorId, row?.id);
  const likeProducts: ListingProduct[] = (relatedRaw ?? []).map(cardToListing);
  const brandPickProducts: ListingProduct[] = (brandPicksRaw ?? []).map(cardToListing);

  // Record view — only for a real, visible product.
  useEffect(() => {
    if (!row || !product) return;
    // Local Recently-Viewed list. No rating or review count is passed: the only
    // honest source is product_reviews, which is not loaded yet at this point,
    // and the denormalised columns on `products` are seed data (see above).
    recordView({
      id: product.id, vendorId: product.vendor.id, name: product.name, manufacturer: product.vendor.name,
      location: product.vendor.location ?? undefined, price: product.price ?? undefined,
      moq: product.moq ?? undefined, verified: product.vendor.verified,
      image: product.media[0]?.url, category: product.category ?? undefined,
    });
    // Real DB views_count — atomic +1, once per browser session per product (a
    // refresh in the same session doesn't recount; a new session does).
    //
    // The engagement_events row is written alongside it under the SAME dedup
    // key, not instead of it: views_count is what the buyer feed sorts on and
    // carries history from before the event log existed, while the event
    // carries the timestamp, viewer and source that make a trend possible.
    // Sharing the dedup key matters — two different dedup rules would make the
    // counter and the event log disagree about the same visit.
    const key = `cosora.viewed.${row.id}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      void recordProductView(row.id).catch(() => {});
      // consumeNavSource() is single-use: whichever surface sent the buyer here
      // left a short-lived marker. 'direct' is the honest answer when nothing
      // did, not a placeholder.
      void logEngagement({
        eventType: "product_view",
        productId: row.id,
        vendorId: product.vendor.id,
        source: consumeNavSource() ?? "direct",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);

  const card = "rounded-2xl border border-gray-200 bg-white p-4";

  // Still resolving the row: brief spinner.
  if (isPending) {
    return (
      <BuyerShell>
        <div className="max-w-2xl mx-auto px-4 py-24 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#ef4d62]" />
        </div>
      </BuyerShell>
    );
  }
  // A genuine failure — network or server — is NOT a missing product, and is
  // never papered over with a different listing.
  if (isError) {
    return (
      <BuyerShell>
        <ProductLoadError onRetry={() => void refetch()} />
      </BuyerShell>
    );
  }
  // Genuine not-found — missing id, malformed id, or RLS-blocked (non-live /
  // not yours). All render the exact same state (see ProductNotFound).
  if (!row || !product) {
    return (
      <BuyerShell>
        <ProductNotFound />
      </BuyerShell>
    );
  }

  // Unchanged direct-chat path, just moved behind the chooser sheet: still
  // records the enquiry, still lands on /chats/:vendorId.
  const openDirectChat = () => {
    setChatOptionsOpen(false);
    void recordProductEnquiry(row.id).catch(() => {});
    // Additive: the button does exactly what it did, and also reports that it
    // was pressed. Until now `calls` was the only CTA in the app with any
    // record of being used.
    void logEngagement({
      eventType: "cta_click", ctaName: "message",
      vendorId: product.vendor.id, productId: row.id,
    });
    navigate(`/chats/${product.vendor.id}`);
  };

  const saveProduct = () => openSaveModal({
    id: product.id, vendorId: product.vendor.id, name: product.name, manufacturer: product.vendor.name,
    location: product.vendor.location ?? undefined, price: product.price ?? undefined,
    moq: product.moq ?? undefined, verified: product.vendor.verified,
    // Real review data only; omitted when there is none rather than a seed value.
    ...(avgRating != null ? { rating: avgRating, reviews: reviewCount } : {}),
    image: product.media[0]?.url, category: product.category ?? undefined,
  });

  return (
    <BuyerShell>
      <motion.div className="mx-auto max-w-2xl lg:max-w-6xl px-4 pt-3 pb-6" variants={reduced ? {} : page} initial="hidden" animate="show">

        {/* Top: media on the left, product info on the right — two columns on desktop */}
        <motion.div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start" variants={reduced ? {} : page} initial="hidden" animate="show">

        {/* Media — sticks alongside the info column on desktop */}
        <motion.div variants={sect} className="lg:sticky lg:top-20">
          {product.media.length > 0 ? (
            <MediaCarousel media={product.media} rating={avgRating} hasTrustSeal={product.vendor.verified} />
          ) : (
            <NoPhotos />
          )}
        </motion.div>

        {/* Product info column */}
        <motion.div className="mt-3 space-y-3 lg:mt-0" variants={reduced ? {} : page} initial="hidden" animate="show">

        {/* Breadcrumb + header */}
        <motion.div variants={sect}>
          {product.category && <p className="text-xs text-gray-400">{product.category}</p>}
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
            {product.price ? (
              <>
                <span className="text-2xl font-extrabold text-[#ef4d62]">{product.price}</span>
                {/* Shown only when the vendor gave a unit — "/ Piece" used to be
                    hardcoded on every listing, whatever it sold in. */}
                {product.unit && <span className="text-sm text-gray-500">/ {product.unit}</span>}
              </>
            ) : (
              <span className="text-base font-bold text-gray-700">Price on request</span>
            )}
          </div>
          {product.moq && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Package className="h-3.5 w-3.5" /> MOQ {product.moq}</span>
            </div>
          )}
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
                {vendorReviews === undefined ? (
                  <span className="h-3 w-24 animate-pulse rounded bg-gray-100" aria-label="Loading vendor rating" />
                ) : vendorReviewCount > 0 ? (
                  <>
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium text-gray-800">{vendorReviews.avg.toFixed(1)}</span>
                    <span>({vendorReviewCount} {vendorReviewCount === 1 ? "review" : "reviews"})</span>
                  </>
                ) : (
                  <span>No vendor reviews yet</span>
                )}
              </div>
              {product.vendor.location && (
                <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500"><MapPin className="h-3 w-3" /> {product.vendor.location}</div>
              )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); setIsFollowing((f) => !f); }}
              className={cn("h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors active:scale-95", isFollowing ? "border-gray-200 text-gray-600" : "border-[#ef4d62] text-[#ef4d62] hover:bg-[#ef4d62]/5")}>
              {isFollowing ? "Following" : "+ Follow"}
            </button>
          </div>
          {/* "Usually responds within 4 hours" was printed here for every
              vendor. Nothing measures response time, so nothing is shown. */}
          {product.vendor.verified && (
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
              {product.availableColors.length === 0 && (
                <p className="text-xs text-gray-500">Not specified by the vendor.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {product.availableColors.map((c) => (
                  <button key={c} onClick={() => setSelectedColor(c)}
                    className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95",
                      activeColor === c ? "border-[#ef4d62] bg-[#ef4d62]/5 text-[#ef4d62]" : "border-gray-200 text-gray-600 hover:border-[#ef4d62]/40")}>
                    <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: COLOR_HEX[c] ?? "#ccc" }} />{c}
                  </button>
                ))}
              </div>
            </div>

            {/* Sizes */}
            <div className={card}>
              <h3 className="mb-3 text-sm font-bold text-gray-900">Available Sizes</h3>
              {product.availableSizes.length === 0 && (
                <p className="text-xs text-gray-500">Not specified by the vendor.</p>
              )}
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
              <button onClick={() => setChatOptionsOpen(true)} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white py-3 text-sm font-bold transition-colors active:scale-[0.98]">
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
                      {product.specifications.length === 0 && (
                        <p className="text-xs text-gray-500">Not specified by the vendor.</p>
                      )}
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
              {product.description
                ? <p className="text-sm leading-relaxed text-gray-600">{product.description}</p>
                : <p className="text-sm text-gray-500">The vendor hasn't added a description.</p>}
            </div>

            {/* Manufacturing */}
            <div className={card}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Manufacturing Details</h3>
                <button onClick={() => navigate(`/vendor/${product.vendor.id}`)} className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-gray-300">View Profile</button>
              </div>
              {/* No certifications are rendered: there is no column for them.
                  "GOTS" and "OEKO-TEX Standard 100" used to be asserted, as fact,
                  on every live listing — inherited from the mock template. */}
              <div className="flex flex-wrap items-center gap-2">
                {product.countryOfOrigin ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-gray-800"><CheckCircle2 className="h-4 w-4 text-green-600" /> Made in {product.countryOfOrigin}</span>
                ) : (
                  <span className="text-sm text-gray-500">Country of origin not specified by the vendor.</span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── REVIEWS ── */}
        {tab === "reviews" && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className={card}>
              {reviewsPending ? (
                <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
              ) : reviewsError ? (
                <p className="py-4 text-center text-sm text-gray-500">Couldn't load ratings for this product.</p>
              ) : !hasReviews ? (
                <p className="py-4 text-center text-sm text-gray-500">No ratings yet.</p>
              ) : (
                <div className="flex items-start gap-5">
                  <div className="shrink-0 text-center">
                    <p className="text-4xl font-extrabold text-gray-900">{avgRating!.toFixed(1)}</p>
                    <StarRow rating={avgRating!} />
                    <p className="mt-1 text-xs text-gray-400">{reviewCount} {reviewCount === 1 ? "review" : "reviews"}</p>
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
              )}
            </div>

            <div className={card}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Customer Reviews</h3>
                {canReview && (
                  <button
                    onClick={() => {
                      void logEngagement({
                        eventType: "cta_click", ctaName: "view_reviews",
                        vendorId: product.vendor.id, productId: row?.id ?? null,
                      });
                      setReviewOpen(true);
                    }}
                    className="rounded-full bg-[#ef4d62] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#ef4d62]/90"
                  >
                    {myReview ? "Edit your Review" : "Write a Review"}
                  </button>
                )}
              </div>
              {reviewsPending ? null : reviewCards.length > 0 ? (
                <div className="space-y-4">{reviewCards.map((r) => <ReviewCard key={r.id} review={r} />)}</div>
              ) : (
                <p className="py-6 text-center text-sm text-gray-400">No reviews yet. Be the first to review this product.</p>
              )}
            </div>
          </motion.div>
        )}
        </motion.div>{/* end product info column */}
        </motion.div>{/* end two-column top */}

        {/* Recommendations — full width below the two-column top */}
        <motion.div className="mt-3 space-y-3 lg:mt-8" variants={reduced ? {} : page} initial="hidden" animate="show">

        {/* Brand Picks — the current vendor's other live products (real; excludes
            this product). Hidden entirely when the vendor has no others. */}
        {brandPickProducts.length > 0 && (
          <motion.div variants={sect} className="pt-2">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-1 text-sm font-bold text-gray-900">Brand Picks <ChevronDown className="h-4 w-4 -rotate-90 text-gray-400" /></h2>
              <span className="text-[10px] text-gray-400">More from {product.vendor.name}</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
              {brandPickProducts.map((p) => (
                <div key={p.id} className="w-40 shrink-0">
                  <ListingProductCard product={p} />
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Real category-targeted sponsored ads (vendor campaigns targeting this
            product's category, plus untargeted campaigns). Renders nothing when
            there are no matching active ads. */}
        {row?.categoryId && (
          <motion.div variants={sect} className="pt-2">
            <SponsoredRail category={row.categoryId} max={10} />
          </motion.div>
        )}

        {/* You might also like — the buyer's preferred categories (or this
            product's category as a fallback), ranked by real engagement. Hidden
            when there are no other live products to show. */}
        {likeProducts.length > 0 && (
          <motion.div variants={sect} className="pt-2">
            <h2 className="mb-3 text-sm font-bold text-gray-900">You might also like</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              {likeProducts.map((p) => <ListingProductCard key={p.id} product={p} />)}
            </div>
          </motion.div>
        )}
        </motion.div>{/* end recommendations */}
      </motion.div>

      <WriteReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        subjectName={product.name}
        allowPhotos
        initialRating={myReview?.rating ?? 0}
        initialBody={myReview?.body ?? ""}
        initialPhotos={myReview?.photos}
        placeholder="Share your experience with this product…"
        onSubmit={(rating, text, photos) => {
          if (!row?.id) throw new Error("Reviews are available on live products only");
          return submitProductReview(row.id, rating, text, photos);
        }}
      />

      <ProductChatOptionsSheet
        isOpen={chatOptionsOpen}
        onClose={() => setChatOptionsOpen(false)}
        onChatDirectly={openDirectChat}
        onRequestQuotation={() => {
          setChatOptionsOpen(false);
          setQuoteOpen(true);
        }}
        vendorName={product.vendor.name}
      />

      {row && (
        <ProductQuoteRequestModal
          isOpen={quoteOpen}
          onClose={() => setQuoteOpen(false)}
          product={{
            id: row.id,
            vendorId: row.vendorId,
            name: row.name,
            sizes: product.availableSizes,
            colour: row.colour,
            customizationAvailable: row.customizationAvailable,
          }}
        />
      )}
    </BuyerShell>
  );
};

export default ProductDetail;
