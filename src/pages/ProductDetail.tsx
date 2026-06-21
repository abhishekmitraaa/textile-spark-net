import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Bookmark,
  Share2,
  Star,
  MapPin,
  Phone,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  Clock,
  Download,
  Globe,
  ThumbsUp,
  ThumbsDown,
  MoreVertical,
  CheckCircle2,
  Play,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

// === Animation constants (from CLAUDE.md convention) ===
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } } };
const sect = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.36 } } };

// === Color swatch map ===
const COLOR_HEX: Record<string, string> = {
  Beige: "#E8D5B7",
  Navy: "#1B2A4A",
  Olive: "#6B7A3D",
  Black: "#1A1A1A",
  White: "#F5F5F5",
  Grey: "#9E9E9E",
  Red: "#C0392B",
  Green: "#2D6A4F",
  Blue: "#2471A3",
  Charcoal: "#36454F",
  Maroon: "#800000",
  Mustard: "#D4AC0D",
  Teal: "#008080",
};

// === Types ===
interface MediaItem { type: "image" | "video"; url: string }
interface Spec { label: string; value: string }
interface Review { id: number; name: string; rating: number; date: string; comment: string; sizeBought: string; photos: string[]; helpful: number }

interface ProductData {
  id: string;
  productCode: string;
  name: string;
  price: string;
  priceUnit: string;
  moq: string;
  category: string;
  subCategory: string;
  media: MediaItem[];
  rating: number;
  soldCount: string;
  isInAd: boolean;
  vendor: { id: string; initials: string; name: string; location: string; verified: boolean; rating: number; reviews: number; responseTime: string };
  availableColors: string[];
  availableSizes: string[];
  specifications: Spec[];
  customizationAvailable: boolean;
  description: string;
  manufacturing: { country: string; certifications: string[] };
  totalReviews: number;
  ratingBreakdown: Record<number, number>;
  reviews: Review[];
  brandPicks: { id: string; vendorName: string; category: string; price: string; rating: number; soldCount: string; image: string }[];
  youMightLike: { id: string; price: string; moq: string; name: string; manufacturer: string; location: string; fabric: string; gsm: string; fitType: string; rating: number; soldCountBadge: string; image: string }[];
}

// === Mock data ===
const PRODUCTS: Record<string, ProductData> = {
  "1": {
    id: "1",
    productCode: "TF-MDS-0412",
    name: "Premium Cotton Chinos",
    price: "₹499",
    priceUnit: "Piece",
    moq: "500 Pieces",
    category: "Women's",
    subCategory: "Midi Dresses",
    media: [
      { type: "image", url: "https://picsum.photos/seed/chino-front-cosora/600/800" },
      { type: "image", url: "https://picsum.photos/seed/chino-side-cosora/600/800" },
      { type: "image", url: "https://picsum.photos/seed/chino-detail-cosora/600/800" },
      { type: "video", url: "https://picsum.photos/seed/chino-video-cosora/600/800" },
    ],
    rating: 4.1,
    soldCount: "5.6k",
    isInAd: true,
    vendor: { id: "tf-india", initials: "TF", name: "Textile Forge India", location: "Surat, Gujarat", verified: true, rating: 4.8, reviews: 124, responseTime: "Usually responds within 4 hours" },
    availableColors: ["Beige", "Navy", "Olive", "Black"],
    availableSizes: ["28", "30", "32", "34", "36", "38", "40"],
    specifications: [
      { label: "Waist Type", value: "Mid Rise" },
      { label: "Length Type", value: "Full Length" },
      { label: "Fit Type", value: "Slim Fit" },
      { label: "Fabric", value: "100% Cotton Twill" },
      { label: "Pattern", value: "Solid" },
      { label: "GSM", value: "280 GSM" },
      { label: "Occasion", value: "Casual, Semi-Formal" },
      { label: "Wash Care", value: "Machine Wash, Do Not Bleach" },
    ],
    customizationAvailable: true,
    description: "Premium quality cotton chinos made with 100% organic cotton. Perfect for casual and semi-formal occasions. Features a comfortable mid-rise waist with a tailored fit that flatters all body types. Bio-washed for extra softness.",
    manufacturing: { country: "India", certifications: ["GOTS", "OEKO-TEX Standard 100"] },
    totalReviews: 100,
    ratingBreakdown: { 5: 60, 4: 25, 3: 8, 2: 5, 1: 2 },
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
    ],
  },
};

const getDefaultProduct = (id: string): ProductData => {
  if (PRODUCTS[id]) return PRODUCTS[id];
  return { ...PRODUCTS["1"], id };
};

// === StarRow ===
function StarRow({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={cn(cls, s <= Math.round(rating) ? "fill-accent text-accent" : "text-muted-foreground")} />
      ))}
    </div>
  );
}

// === ReviewCard ===
function ReviewCard({ review }: { review: Review }) {
  const [helpfulCount, setHelpfulCount] = useState(review.helpful);
  const [voted, setVoted] = useState<"up" | "down" | null>(null);

  return (
    <div className="border-b border-border/40 pb-4 last:border-0 last:pb-0">
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-foreground">{review.name}</span>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Helpful?</span>
          <button
            onClick={() => { if (voted !== "up") { setHelpfulCount((c) => c + 1); setVoted("up"); } }}
            className={cn("transition-colors", voted === "up" ? "text-accent" : "hover:text-foreground")}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <span>{helpfulCount}</span>
          <button
            onClick={() => setVoted("down")}
            className={cn("transition-colors", voted === "down" ? "text-accent" : "hover:text-foreground")}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
          <button className="hover:text-foreground">
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <Badge className="h-5 gap-0.5 bg-accent px-1.5 text-[10px] font-semibold text-white">
          {review.rating}
          <Star className="h-2.5 w-2.5 fill-white text-white" />
        </Badge>
        <span className="text-xs text-muted-foreground">{review.date}</span>
      </div>

      <p className="mt-1.5 text-xs font-semibold text-foreground">
        Size bought: {review.sizeBought}
      </p>

      {review.comment && (
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{review.comment}</p>
      )}

      {review.photos.length > 0 && (
        <div className="mt-2.5 flex gap-2">
          {review.photos.map((photo, idx) => (
            <div key={idx} className="h-16 w-16 overflow-hidden rounded-lg bg-muted">
              <img src={photo} alt="Review" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// === Main component ===
const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const product = getDefaultProduct(id ?? "1");

  const [currentMedia, setCurrentMedia] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [selectedColor, setSelectedColor] = useState(product.availableColors[0]);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  const media = product.media;

  const avgRating = parseFloat(
    (product.reviews.reduce((s, r) => s + r.rating, 0) / (product.reviews.length || 1)).toFixed(1)
  );

  return (
    <DashboardLayout>
      <motion.div
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
        className="pb-40 lg:pb-24"
      >
        {/* ─── Top bar ─── */}
        <motion.div variants={reduced ? {} : sect} className="mb-4 flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/80 text-foreground transition-colors hover:bg-muted active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="relative flex-1">
            <input
              type="search"
              defaultValue="T-shirts"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <button
            aria-label="Bookmark product"
            onClick={() => setIsBookmarked((b) => !b)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/80 transition-colors hover:bg-muted active:scale-95"
          >
            <Bookmark className={cn("h-5 w-5", isBookmarked ? "fill-accent text-accent" : "text-foreground")} />
          </button>
        </motion.div>

        {/* ─── Desktop 2-col grid ─── */}
        <div className="lg:grid lg:grid-cols-[44%_56%] lg:gap-8 lg:items-start">

          {/* ── LEFT: media carousel (sticky on desktop) ── */}
          <motion.div variants={reduced ? {} : sect} className="lg:sticky lg:top-4">
            {/* Main media frame */}
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted sm:aspect-[3/4] lg:aspect-[4/5]">
              <img
                src={media[currentMedia].url}
                alt={product.name}
                className="h-full w-full object-cover"
              />

              {/* COSORA watermark */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="select-none rotate-[-32deg] text-5xl font-black tracking-widest text-white/8 sm:text-6xl">
                  COSORA
                </span>
              </div>

              {/* Video play overlay */}
              {media[currentMedia].type === "video" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
                    <Play className="h-6 w-6 fill-white text-white" />
                  </div>
                </div>
              )}

              {/* TradeSEAL badge */}
              {product.isInAd && (
                <Badge className="absolute left-3 top-3 bg-accent text-[10px] font-semibold text-white">
                  <BadgeCheck className="mr-1 h-3 w-3" />
                  TradeSEAL
                </Badge>
              )}

              {/* Prev / Next arrows */}
              {media.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentMedia((m) => (m === 0 ? media.length - 1 : m - 1))}
                    className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/85 shadow-sm backdrop-blur-sm transition-transform hover:scale-105 active:scale-95"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-4 w-4 text-foreground" />
                  </button>
                  <button
                    onClick={() => setCurrentMedia((m) => (m === media.length - 1 ? 0 : m + 1))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/85 shadow-sm backdrop-blur-sm transition-transform hover:scale-105 active:scale-95"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-4 w-4 text-foreground" />
                  </button>
                </>
              )}

              {/* Rating + sold count pill */}
              <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                <span className="font-semibold">{product.rating}</span>
                <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                <span className="text-white/60">|</span>
                <span>{product.soldCount}</span>
              </div>

              {/* Dot indicators */}
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
                {media.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentMedia(idx)}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      idx === currentMedia ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/75"
                    )}
                    aria-label={`View image ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Thumbnail strip */}
            {media.length > 1 && (
              <div className="mt-2.5 flex gap-2">
                {media.map((m, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentMedia(idx)}
                    className={cn(
                      "relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition-all",
                      idx === currentMedia
                        ? "border-accent opacity-100"
                        : "border-transparent opacity-45 hover:opacity-80"
                    )}
                    aria-label={`Thumbnail ${idx + 1}`}
                  >
                    <img src={m.url} alt="" className="h-full w-full object-cover" />
                    {m.type === "video" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="h-3 w-3 fill-white text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* ── RIGHT: product info ── */}
          <div className="mt-4 space-y-3 lg:mt-0">

            {/* Breadcrumb */}
            <motion.p variants={reduced ? {} : sect} className="text-xs text-muted-foreground">
              {product.category} &rsaquo; {product.subCategory}
            </motion.p>

            {/* Product header card */}
            <motion.div variants={reduced ? {} : sect} className="rounded-2xl border border-border/50 bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <h1 className="flex-1 text-lg font-semibold leading-snug text-foreground sm:text-xl">
                  {product.name}
                </h1>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => setIsBookmarked((b) => !b)}
                    aria-label="Bookmark"
                    className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted active:scale-95"
                  >
                    <Bookmark className={cn("h-4 w-4", isBookmarked ? "fill-accent text-accent" : "text-muted-foreground")} />
                  </button>
                  <button
                    aria-label="Share"
                    className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted active:scale-95"
                  >
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div className="mt-2.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-accent">{product.price}</span>
                <span className="text-sm text-muted-foreground">/ {product.priceUnit}</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  <span>MOQ {product.moq}</span>
                </div>
                <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">
                  {product.productCode}
                </Badge>
              </div>
            </motion.div>

            {/* Vendor card */}
            <motion.div
              variants={reduced ? {} : sect}
              className="cursor-pointer rounded-2xl border border-border/50 bg-card p-4 transition-shadow hover:shadow-md"
              onClick={() => navigate(`/vendor/${product.vendor.id}`)}
            >
              <div className="flex items-center gap-3">
                {/* Initials avatar */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-accent/35 text-sm font-bold text-foreground">
                  {product.vendor.initials}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">{product.vendor.name}</span>
                    {product.vendor.verified && (
                      <BadgeCheck className="h-4 w-4 shrink-0 text-accent" />
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-accent text-accent" />
                      <span className="font-medium text-foreground">{product.vendor.rating}</span>
                      <span>({product.vendor.reviews} reviews)</span>
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{product.vendor.location}</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 border-accent text-xs text-accent hover:bg-accent/5 active:scale-95"
                  onClick={(e) => { e.stopPropagation(); setIsFollowing((f) => !f); }}
                >
                  {isFollowing ? "Following" : "+ Follow"}
                </Button>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{product.vendor.responseTime}</span>
              </div>

              {product.isInAd && (
                <div className="mt-2">
                  <Badge variant="outline" className="border-green-300 bg-green-50 text-[10px] text-green-700">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Trust Seal Verified
                  </Badge>
                </div>
              )}
            </motion.div>

            {/* Details / Reviews tabs */}
            <motion.div variants={reduced ? {} : sect}>
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-2 rounded-xl">
                  <TabsTrigger value="details" className="rounded-lg text-sm">Details</TabsTrigger>
                  <TabsTrigger value="reviews" className="rounded-lg text-sm">Reviews</TabsTrigger>
                </TabsList>

                {/* ─── DETAILS TAB ─── */}
                <TabsContent value="details" className="mt-3 space-y-3">

                  {/* Available Colors */}
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <h3 className="mb-3 text-sm font-semibold text-foreground">Available Colors</h3>
                    <div className="flex flex-wrap gap-2">
                      {product.availableColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => setSelectedColor(color)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95",
                            selectedColor === color
                              ? "border-accent bg-accent/5 text-accent"
                              : "border-border text-muted-foreground hover:border-accent/50 hover:text-foreground"
                          )}
                        >
                          <span
                            className="h-3.5 w-3.5 rounded-full border border-black/10 shadow-sm"
                            style={{ background: COLOR_HEX[color] ?? "#ccc" }}
                          />
                          {color}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Available Sizes */}
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <h3 className="mb-3 text-sm font-semibold text-foreground">Available Sizes</h3>
                    <div className="flex flex-wrap gap-2">
                      {product.availableSizes.map((size) => (
                        <button
                          key={size}
                          onClick={() => setSelectedSize((s) => (s === size ? null : size))}
                          className={cn(
                            "flex h-9 min-w-[36px] items-center justify-center rounded-lg border px-2 text-sm font-medium transition-all active:scale-95",
                            selectedSize === size
                              ? "border-accent bg-accent text-white"
                              : "border-border text-foreground hover:border-accent/50"
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Product Specifications */}
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <h3 className="mb-3 text-sm font-semibold text-foreground">Product Specifications</h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
                      {product.specifications.map((spec) => (
                        <div key={spec.label}>
                          <p className="text-[11px] text-muted-foreground">{spec.label}</p>
                          <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">{spec.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-4 border-t border-border/40 pt-3">
                      <button className="text-xs text-accent underline underline-offset-2 transition-opacity hover:opacity-75">
                        + Add Fabric
                      </button>
                      <button className="flex items-center gap-1 text-xs text-accent underline underline-offset-2 transition-opacity hover:opacity-75">
                        <Download className="h-3 w-3" />
                        Download PDF
                      </button>
                    </div>
                  </div>

                  {/* Customization Available */}
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Customization Available</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Can this product be customized for buyers?
                        </p>
                      </div>
                      <Badge
                        className={cn(
                          "px-3 py-1 text-xs font-bold shrink-0",
                          product.customizationAvailable
                            ? "bg-green-500 text-white hover:bg-green-500"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {product.customizationAvailable ? "YES" : "NO"}
                      </Badge>
                    </div>
                  </div>

                  {/* Product Description */}
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <div className="mb-2.5 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Product Description</h3>
                      <button className="flex items-center gap-1 text-xs text-accent transition-opacity hover:opacity-75">
                        <Globe className="h-3 w-3" />
                        Translate
                      </button>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {product.description}
                    </p>
                  </div>

                  {/* Manufacturing Details */}
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Manufacturing Details</h3>
                      <button
                        onClick={() => navigate(`/vendor/${product.vendor.id}`)}
                        className="text-xs text-accent underline underline-offset-2 transition-opacity hover:opacity-75"
                      >
                        View Profile
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 text-sm text-foreground">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span>Made in {product.manufacturing.country}</span>
                      </div>
                      {product.manufacturing.certifications.map((cert) => (
                        <Badge key={cert} variant="outline" className="border-green-300 bg-green-50 text-[10px] text-green-700">
                          {cert}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* ─── REVIEWS TAB ─── */}
                <TabsContent value="reviews" className="mt-3 space-y-3">

                  {/* Rating summary */}
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <div className="flex items-start gap-5">
                      <div className="shrink-0 text-center">
                        <p className="text-4xl font-bold text-foreground">{avgRating}</p>
                        <StarRow rating={avgRating} size="sm" />
                        <p className="mt-1 text-xs text-muted-foreground">{product.totalReviews} reviews</p>
                      </div>
                      <div className="flex-1 space-y-2">
                        {[5, 4, 3, 2, 1].map((star) => {
                          const count = product.ratingBreakdown[star] ?? 0;
                          const pct = Math.round((count / product.totalReviews) * 100);
                          return (
                            <div key={star} className="flex items-center gap-2">
                              <span className="w-2.5 text-xs text-muted-foreground">{star}</span>
                              <Star className="h-2.5 w-2.5 fill-accent text-accent" />
                              <div className="flex-1 overflow-hidden rounded-full bg-muted" style={{ height: 6 }}>
                                <div
                                  className="h-full rounded-full bg-accent transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Reviews list */}
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Customer Reviews</h3>
                      <button className="text-xs text-accent underline underline-offset-2 transition-opacity hover:opacity-75">
                        Write a Review
                      </button>
                    </div>
                    {product.reviews.length > 0 ? (
                      <div className="space-y-4">
                        {product.reviews.map((review) => (
                          <ReviewCard key={review.id} review={review} />
                        ))}
                      </div>
                    ) : (
                      <p className="py-6 text-center text-sm text-muted-foreground">No reviews yet</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          </div>
        </div>

        {/* ─── Brand Picks (full width) ─── */}
        <motion.div variants={reduced ? {} : sect} className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-foreground">Brand Picks</h2>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-[10px] italic text-muted-foreground">sponsored</span>
          </div>
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-3">
              {product.brandPicks.map((pick) => (
                <div
                  key={pick.id}
                  className="w-36 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border/50 bg-card transition-shadow hover:shadow-md"
                  onClick={() => navigate(`/product/${pick.id}`)}
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                    <img src={pick.image} alt={pick.category} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
                    <div className="absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                      <span>{pick.rating}</span>
                      <Star className="h-2 w-2 fill-yellow-400 text-yellow-400" />
                      <span className="text-white/60">|</span>
                      <span>{pick.soldCount}</span>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{pick.vendorName}</p>
                    <p className="text-[11px] font-medium text-foreground">{pick.category}</p>
                    <p className="mt-0.5 text-sm font-bold text-foreground">{pick.price}</p>
                    <Button
                      size="sm"
                      className="mt-2 h-7 w-full gap-1 bg-accent text-[11px] font-medium text-white hover:bg-accent/90 active:scale-95"
                      onClick={(e) => { e.stopPropagation(); navigate(`/chats/vendor-${pick.id}`); }}
                    >
                      <Phone className="h-3 w-3" />
                      Call Now
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </motion.div>

        {/* ─── You might also like (full width) ─── */}
        <motion.div variants={reduced ? {} : sect} className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">You might also like</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {product.youMightLike.map((item) => (
              <div
                key={item.id}
                className="cursor-pointer overflow-hidden rounded-xl border border-border/50 bg-card transition-shadow hover:shadow-md"
                onClick={() => navigate(`/product/${item.id}`)}
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
                  <div className="absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    <span>{item.rating}</span>
                    <Star className="h-2 w-2 fill-yellow-400 text-yellow-400" />
                    <span className="text-white/60">|</span>
                    <span>{item.soldCountBadge}</span>
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-sm font-bold text-foreground">{item.price}</p>
                  <p className="text-[11px] text-muted-foreground">{item.moq} | 800+ sold</p>
                  <p className="mt-1 text-[11px] font-semibold text-foreground line-clamp-1">{item.name}</p>
                  <p className="text-[11px] text-accent line-clamp-1">{item.manufacturer}</p>
                  <div className="mt-1 flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                    <span>{item.location}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Fabric: {item.fabric} &bull; {item.gsm} &bull; {item.fitType}
                  </p>
                  <Button
                    size="sm"
                    className="mt-2 h-7 w-full gap-1 bg-accent text-[11px] font-medium text-white hover:bg-accent/90 active:scale-95"
                    onClick={(e) => { e.stopPropagation(); navigate(`/chats/vendor-${item.id}`); }}
                  >
                    <Phone className="h-3 w-3" />
                    Call Now
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* ─── Sticky bottom CTA bar (sits above MobileBottomNav on mobile, true bottom on desktop) ─── */}
      <div className="fixed inset-x-0 bottom-[73px] z-40 border-t border-border bg-card/95 p-3 backdrop-blur-sm lg:bottom-0 lg:left-64 lg:z-50">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button
            variant="outline"
            className="flex-1 gap-2 border-accent text-accent hover:bg-accent/5 active:scale-[0.98]"
            onClick={() => navigate(`/chats/${product.vendor.id}`)}
          >
            <MessageCircle className="h-4 w-4" />
            Chat
          </Button>
          <Button
            className="flex-1 gap-2 bg-accent text-white hover:bg-accent/90 active:scale-[0.98]"
            onClick={() => navigate(`/chats/${product.vendor.id}`)}
          >
            <Phone className="h-4 w-4" />
            Call Now
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProductDetail;
