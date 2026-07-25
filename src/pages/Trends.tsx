import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useT } from "@/lib/i18n";
import BuyerTopBar from "@/components/buyer/BuyerTopBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronRight,
  MapPin,
  Phone,
  RefreshCw,
  Search as SearchIcon,
  Star,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import { useLiveProducts, sortTrending, type ProductCardData } from "@/lib/queries/products";
import { useCallVendor } from "@/lib/queries/calls";
import { useDragScroll } from "@/hooks/useDragScroll";
import QuickRfqModal from "@/components/buyer/QuickRfqModal";
import SubmitRequirementCard from "@/components/buyer/SubmitRequirementCard";

// Adapt a live product row to the compact card shape used on this page
// (moq gets the "MOQ:" prefix the card renders inline).
function toCompact(p: ProductCardData): CompactProduct {
  return { ...p, moq: `MOQ: ${p.moq}` };
}

// ─────────────────────────────────────────────────────────────
// HELPERS / TYPES
// ─────────────────────────────────────────────────────────────

const img = (seed: string, w = 500, h = 650) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

interface CompactProduct {
  id: string;
  vendorId: string;
  name: string;
  manufacturer: string;
  location: string;
  price: string;
  moq: string;
  soldCount: string;
  enquiries: string;
  rating: number;
  fabric: string;
  gsm: string;
  fitType: string;
  image: string;
  secondaryImage: string;
}

function makeProduct(seed: string, rating: number, enquiries: string): CompactProduct {
  return {
    id: seed,
    vendorId: `v-${seed}`,
    name: "Product name",
    manufacturer: "Manufacturer",
    location: "Bangalore",
    price: "₹499",
    moq: "MOQ: 2",
    soldCount: "800+ sold",
    enquiries,
    rating,
    fabric: "Cotton",
    gsm: "200",
    fitType: "Regular",
    image: img(seed),
    secondaryImage: img(`${seed}-b`),
  };
}

// Six top-selling products for a given brand, seeded so each brand gets distinct imagery.
function brandProducts(brandId: string): CompactProduct[] {
  return Array.from({ length: 6 }, (_, i) =>
    makeProduct(`${brandId}-p${i}`, 4.0 + (i % 3) * 0.1, i % 2 === 0 ? "5.6k" : "1.6k")
  );
}

// ─────────────────────────────────────────────────────────────
// DATA
//
// All "trending" content below (categories, hot keywords, styled trends)
// is mock data. In production these would be refreshed from a trends job
// (e.g. Google Trends) on a schedule, not hardcoded — see the inline
// comments marking each fetch boundary.
// ─────────────────────────────────────────────────────────────

interface Brand {
  id: string;
  name: string;
  logo: string;
  badge?: number;
}

interface TrendCategory {
  id: string;
  label: string;
  hashtag: string;
  thumb: string;
  featured: { image: string; sub: string; moq: string; price: string };
  brands: Brand[];
}

// FETCH BOUNDARY: trending categories — keywords fetched from Google Trends.
const CATEGORIES: TrendCategory[] = [
  {
    id: "denim",
    label: "Denim",
    hashtag: "Denim",
    thumb: img("trend-cat-denim", 80, 80),
    featured: { image: img("trend-feat-denim", 700, 900), sub: "Jeans", moq: "MOQ: 10", price: "$16.22" },
    brands: [
      { id: "blessing", name: "BLESSING", logo: img("brand-blessing", 80, 80) },
      { id: "favor", name: "favor", logo: img("brand-favor", 80, 80) },
      { id: "imhere", name: "imhere", logo: img("brand-imhere", 80, 80) },
      { id: "jholic", name: "J.Holic", logo: img("brand-jholic", 80, 80) },
      { id: "ootj", name: "OOTJ", logo: img("brand-ootj", 80, 80) },
      { id: "denimly", name: "Denimly", logo: img("brand-denimly", 80, 80) },
    ],
  },
  {
    id: "long-dress",
    label: "Long Dress",
    hashtag: "LongDress",
    thumb: img("trend-cat-long", 80, 80),
    featured: { image: img("trend-feat-long", 700, 900), sub: "Maxi Dress", moq: "MOQ: 5", price: "$22.40" },
    brands: [
      { id: "aria", name: "ARIA", logo: img("brand-aria", 80, 80) },
      { id: "lumen", name: "Lumen", logo: img("brand-lumen", 80, 80) },
      { id: "verde", name: "Verde", logo: img("brand-verde", 80, 80) },
      { id: "noor", name: "Noor", logo: img("brand-noor", 80, 80) },
      { id: "elan", name: "Élan", logo: img("brand-elan", 80, 80) },
      { id: "solstice", name: "Solstice", logo: img("brand-solstice", 80, 80) },
    ],
  },
  {
    id: "short-tee",
    label: "Short-sleeved T-shirt",
    hashtag: "Tshirt",
    thumb: img("trend-cat-tee", 80, 80),
    featured: { image: img("trend-feat-tee", 700, 900), sub: "T-shirts/Tops", moq: "MOQ: 10", price: "$10.32" },
    brands: [
      { id: "force", name: "FORCE", logo: img("brand-force", 80, 80) },
      { id: "sinsang", name: "Sinsang", logo: img("brand-sinsang", 80, 80) },
      { id: "theot", name: "THEOT", logo: img("brand-theot", 80, 80) },
      { id: "kept", name: "Kept", logo: img("brand-kept", 80, 80) },
      { id: "basiq", name: "BASIQ", logo: img("brand-basiq", 80, 80) },
      { id: "coreline", name: "Coreline", logo: img("brand-coreline", 80, 80) },
    ],
  },
  {
    id: "pleats",
    label: "Pleats",
    hashtag: "pleats",
    thumb: img("trend-cat-pleats", 80, 80),
    featured: { image: img("trend-feat-pleats", 700, 900), sub: "Pleated Dress", moq: "MOQ: 5", price: "$18.90" },
    brands: [
      { id: "young-pleats", name: "young pleats by...", logo: img("brand-youngpleats", 80, 80) },
      { id: "sono", name: "SONO", logo: img("brand-sono", 80, 80) },
      { id: "thirty30", name: "THIRTY 30", logo: img("brand-thirty30", 80, 80), badge: 19 },
      { id: "hana", name: "Hana", logo: img("brand-hana", 80, 80) },
      { id: "suho", name: "Suho", logo: img("brand-suho", 80, 80) },
      { id: "fold", name: "Fold Atelier", logo: img("brand-fold", 80, 80) },
    ],
  },
  {
    id: "cargo",
    label: "Cargo",
    hashtag: "Cargo",
    thumb: img("trend-cat-cargo", 80, 80),
    featured: { image: img("trend-feat-cargo", 700, 900), sub: "Cargo Pants", moq: "MOQ: 8", price: "$14.88" },
    brands: [
      { id: "utility", name: "Utility Co.", logo: img("brand-utility", 80, 80) },
      { id: "drift", name: "Drift", logo: img("brand-drift", 80, 80) },
      { id: "range", name: "Range", logo: img("brand-range", 80, 80) },
      { id: "fieldgear", name: "Field Gear", logo: img("brand-fieldgear", 80, 80) },
      { id: "trailmark", name: "Trailmark", logo: img("brand-trailmark", 80, 80) },
      { id: "basecamp", name: "Basecamp Co.", logo: img("brand-basecamp", 80, 80) },
    ],
  },
  {
    id: "knitwear",
    label: "Knitwear",
    hashtag: "Knitwear",
    thumb: img("trend-cat-knit", 80, 80),
    featured: { image: img("trend-feat-knit", 700, 900), sub: "Knit Sets", moq: "MOQ: 6", price: "$12.30" },
    brands: [
      { id: "wooly", name: "Wooly", logo: img("brand-wooly", 80, 80) },
      { id: "queens", name: "Queen's Square", logo: img("brand-queens", 80, 80) },
      { id: "loom", name: "Loom", logo: img("brand-loom", 80, 80) },
      { id: "purl", name: "Purl & Co.", logo: img("brand-purl", 80, 80) },
      { id: "cableknit", name: "Cableknit", logo: img("brand-cableknit", 80, 80) },
      { id: "merino", name: "Merino House", logo: img("brand-merino", 80, 80) },
    ],
  },
];

interface StyledTrend {
  id: string;
  image: string;
  title: string;
  tags: string[];
  moq: string;
  suggestions: CompactProduct[];
}

// FETCH BOUNDARY: "Hot Trends, Styled for You" — refreshed via "View More Styles".
const STYLED_TRENDS: StyledTrend[] = [
  {
    id: "st1",
    image: img("styled-tee-gray", 800, 1000),
    title: "T-shirts/Tops",
    tags: ["#Screen printing", "#Gray"],
    moq: "MOQ: 10",
    suggestions: brandProducts("styled-1").slice(0, 3),
  },
  {
    id: "st2",
    image: img("styled-dress-floral", 800, 1000),
    title: "Floral Midi Dress",
    tags: ["#Summer", "#Linen"],
    moq: "MOQ: 5",
    suggestions: brandProducts("styled-2").slice(0, 3),
  },
  {
    id: "st3",
    image: img("styled-denim-wide", 800, 1000),
    title: "Wide-Leg Denim",
    tags: ["#Vintage wash", "#Relaxed"],
    moq: "MOQ: 8",
    suggestions: brandProducts("styled-3").slice(0, 3),
  },
];

// FETCH BOUNDARY: "Hot Keywords" — trend deltas fetched from Google Trends.
const APPAREL_GROUPS = ["Women's Apparel/Simple", "Men's Apparel/Casual", "Kids/Everyday", "Accessories/Trending"];

interface HotKeyword {
  label: string;
  delta?: string;
  thumb: string;
}

const HOT_KEYWORDS: Record<string, HotKeyword[]> = {
  "Women's Apparel/Simple": [
    { label: "rugby tee", delta: "↑ 800%", thumb: img("hk-rugby", 80, 80) },
    { label: "V-neck T-shirt", thumb: img("hk-vneck", 80, 80) },
    { label: "pinafore", thumb: img("hk-pinafore", 80, 80) },
    { label: "boat neck", delta: "↑ 220%", thumb: img("hk-boatneck", 80, 80) },
  ],
  "Men's Apparel/Casual": [
    { label: "camp collar", delta: "↑ 540%", thumb: img("hk-camp", 80, 80) },
    { label: "linen shirt", thumb: img("hk-linen", 80, 80) },
    { label: "oversized tee", delta: "↑ 310%", thumb: img("hk-oversized", 80, 80) },
  ],
  "Kids/Everyday": [
    { label: "co-ord set", delta: "↑ 400%", thumb: img("hk-coord", 80, 80) },
    { label: "dungarees", thumb: img("hk-dungaree", 80, 80) },
  ],
  "Accessories/Trending": [
    { label: "bucket hat", delta: "↑ 600%", thumb: img("hk-bucket", 80, 80) },
    { label: "canvas tote", thumb: img("hk-tote", 80, 80) },
  ],
};

const HOME_TABS = [
  { label: "NEW ARRIVALS", href: "/home/new-arrivals" },
  { label: "TRENDS", href: "/home/trends" },
  { label: "SALE", href: "/home/sale" },
  { label: "FOR YOU", href: "/home/for-you" },
  { label: "FOLLOWINGS", href: "/home/followings" },
];

// ─────────────────────────────────────────────────────────────
// COMPACT PRODUCT CARD — matches the listing card used across buyer pages
// ─────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: CompactProduct }) {
  const callVendor = useCallVendor();
  const savedState = useSaved();
  const saved = Boolean(savedState.products[product.id]);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="rounded-xl border border-gray-200 overflow-hidden bg-white"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to={`/product/${product.id}`} className="relative aspect-[4/5] block bg-gray-100">
        <img
          src={product.image}
          alt={product.name}
          className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", hovered ? "opacity-0" : "opacity-100")}
        />
        <img
          src={product.secondaryImage}
          alt=""
          className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", hovered ? "opacity-100" : "opacity-0")}
        />
        <div className="absolute bottom-1.5 right-1.5 lg:bottom-2 lg:right-2 text-[8px] lg:text-[10px] font-semibold text-white/70 bg-black/30 px-1.5 lg:px-2 py-0.5 rounded">COSORA</div>

        <button
          onClick={(e) => { e.preventDefault(); openSaveModal(product); }}
          className="absolute top-2 lg:top-3 right-2 lg:right-3 w-7 lg:w-9 h-7 lg:h-9 bg-white/90 rounded-full flex items-center justify-center shadow-sm"
          aria-label={saved ? "Edit saved folders" : "Save product"}
        >
          {saved ? <BookmarkCheck className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-gray-500" />}
        </button>

        <div className="absolute bottom-2 lg:bottom-3 left-2 lg:left-3 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 lg:px-2 py-0.5 lg:py-1">
          <Star className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-yellow-400 fill-yellow-400" />
          <span className="text-[9px] lg:text-xs font-bold text-gray-800">{product.rating.toFixed(1)}</span>
          <span className="text-[9px] lg:text-xs text-gray-400">| {product.enquiries}</span>
        </div>
      </Link>

      <div className="p-2 lg:p-3.5">
        <p className="text-xs lg:text-sm font-bold text-[#ef4d62] leading-snug">
          {product.price} | {product.moq} | {product.soldCount}
        </p>
        <p className="text-[10px] lg:text-xs text-gray-600 mt-1 lg:mt-1.5 truncate">
          {product.name} | <Link to={`/vendor/${product.vendorId}`} className="font-bold hover:underline">{product.manufacturer}</Link>
        </p>
        <div className="flex items-center gap-0.5 mt-1 lg:mt-1.5">
          <MapPin className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-gray-500 shrink-0" />
          <span className="text-[10px] lg:text-xs font-bold text-gray-700">{product.location}</span>
        </div>
        <p className="text-[10px] lg:text-xs text-gray-500 mt-1 lg:mt-1.5">Fabric: {product.fabric} | GSM: {product.gsm}</p>
        <p className="text-[10px] lg:text-xs text-gray-500 mt-0.5">Fit Type: {product.fitType}</p>

        <button
          onClick={() => callVendor(product.vendorId, product.name)}
          className="mt-2 lg:mt-3 w-full flex items-center justify-center gap-1.5 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-xs lg:text-sm font-bold py-2 lg:py-2.5 rounded-lg transition-colors"
        >
          <Phone className="w-3 lg:w-3.5 h-3 lg:h-3.5" /> Call Now
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const Trends = () => {
  const navigate = useNavigate();
  const t = useT();

  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [brandId, setBrandId] = useState(CATEGORIES[0].brands[0].id);
  const [styledIndex, setStyledIndex] = useState(0);
  const [styledSpin, setStyledSpin] = useState(false);
  const [apparelGroup, setApparelGroup] = useState(APPAREL_GROUPS[0]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [hotKeyword, setHotKeyword] = useState(HOT_KEYWORDS[APPAREL_GROUPS[0]][0].label);
  const [feedBatches, setFeedBatches] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [quickRfqOpen, setQuickRfqOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const savedState = useSaved();
  const categoryChipsDrag = useDragScroll<HTMLDivElement>();

  // Real catalogue, trending-sorted. The product-card grids below render these;
  // the trend chrome (categories / keywords / styled heroes) stays curated.
  const { data: live } = useLiveProducts();
  const trending = useMemo(() => (live && live.length ? sortTrending(live) : []), [live]);
  const hasLive = trending.length > 0;

  const category = useMemo(() => CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0], [categoryId]);
  const selectedBrand = useMemo(
    () => category.brands.find((b) => b.id === brandId) ?? category.brands[0],
    [category, brandId]
  );
  const styled = STYLED_TRENDS[styledIndex];
  const keywords = HOT_KEYWORDS[apparelGroup] ?? [];

  const selectCategory = (id: string) => {
    const next = CATEGORIES.find((c) => c.id === id);
    if (!next) return;
    setCategoryId(id);
    setBrandId(next.brands[0].id); // reset brand selection to the first brand of the new category
  };

  const selectGroup = (group: string) => {
    setApparelGroup(group);
    setGroupOpen(false);
    setHotKeyword(HOT_KEYWORDS[group]?.[0]?.label ?? "");
  };

  const refreshStyles = () => {
    setStyledSpin(true);
    setStyledIndex((i) => (i + 1) % STYLED_TRENDS.length);
    window.setTimeout(() => setStyledSpin(false), 500);
  };

  // Bottom feed: keyword seeds the imagery so switching Hot Keywords visibly
  // changes the products. Infinite scroll appends batches.
  const feedProducts = useMemo(() => {
    // Real catalogue paginates by batch; fall back to seeded imagery only until it loads.
    if (hasLive) return trending.slice(0, feedBatches * 6).map(toCompact);
    const slug = hotKeyword.replace(/\s+/g, "-").toLowerCase();
    return Array.from({ length: feedBatches }, (_, b) =>
      Array.from({ length: 4 }, (_, i) => makeProduct(`feed-${slug}-${b}-${i}`, 3.8 + (i % 3) * 0.15, i % 2 === 0 ? "5.6k" : "1.6k"))
    ).flat();
  }, [hasLive, trending, hotKeyword, feedBatches]);

  // Interleave a Submit Requirement card every 5 rows, different per breakpoint:
  // every 10 products on mobile (2-col) and every 20 on desktop (4-col). Cards at
  // a multiple of 20 show on both; the in-between multiples of 10 are mobile-only
  // (`lg:hidden`, collapsing out of the desktop grid). Must live in ONE grid.
  const feedNodes: JSX.Element[] = [];
  feedProducts.forEach((product, i) => {
    feedNodes.push(<ProductCard key={product.id} product={product} />);
    const n = i + 1;
    if (n >= feedProducts.length) return;
    if (n % 20 === 0) {
      feedNodes.push(
        <div key={`req-${i}`} className="col-span-full lg:max-w-4xl lg:mx-auto my-2 lg:my-4">
          <SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} />
        </div>
      );
    } else if (n % 10 === 0) {
      feedNodes.push(
        <div key={`req-m-${i}`} className="col-span-full lg:hidden my-2">
          <SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} />
        </div>
      );
    }
  });

  // Reset the feed back to one batch whenever the hot keyword changes.
  useEffect(() => {
    setFeedBatches(1);
  }, [hotKeyword]);

  // Infinite scroll observer.
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          setLoadingMore(true);
          window.setTimeout(() => {
            setFeedBatches((c) => c + 1);
            setLoadingMore(false);
          }, 300);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadingMore]);

  return (
    <div className="min-h-screen bg-white">
      <BuyerTopBar />

      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-3">
        {/* ── Home tabs ── */}
        <div className="flex justify-start lg:justify-center gap-4 lg:gap-7 overflow-x-auto pb-2 mb-3 border-b border-gray-100 scrollbar-hide">
          {HOME_TABS.map((tab) => (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                "text-xs lg:text-sm font-bold whitespace-nowrap pb-2 border-b-2 transition-colors shrink-0",
                tab.href === "/home/trends"
                  ? "text-[#ef4d62] border-[#ef4d62]"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              )}
            >
              {tab.href === "/home/new-arrivals" && "✦ "}{t(tab.label)}
            </Link>
          ))}
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pb-24 space-y-6 lg:space-y-10">

        {/* ── NEW TREND INSIGHTS ── */}
        <div className="text-center pt-1 lg:pt-2">
          <h1 className="text-base lg:text-4xl font-extrabold tracking-tight text-gray-900">NEW TREND INSIGHTS</h1>
          <p className="text-xs lg:text-lg text-gray-500 mt-0.5 lg:mt-2">Discover Trending Arrivals for You</p>
        </div>

        {/* ── Trending category chips (slides horizontally; keywords from Google Trends) ──
             Outer div is the actual scroll viewport; inner row gets lg:w-max lg:mx-auto so
             it centers on desktop when it fits (same pattern as the New Arrivals categories
             slider) instead of hugging the left edge. Chips are also sized up for desktop. */}
        <div
          ref={categoryChipsDrag.ref}
          className={cn("overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1", categoryChipsDrag.className)}
          onMouseDown={categoryChipsDrag.onMouseDown}
          onMouseMove={categoryChipsDrag.onMouseMove}
          onMouseUp={categoryChipsDrag.onMouseUp}
          onMouseLeave={categoryChipsDrag.onMouseLeave}
          onClickCapture={categoryChipsDrag.onClickCapture}
        >
          <div className="flex gap-2.5 lg:gap-3.5 lg:w-max lg:mx-auto">
            {CATEGORIES.map((cat) => {
              const active = cat.id === categoryId;
              return (
                <button
                  key={cat.id}
                  onClick={() => selectCategory(cat.id)}
                  className={cn(
                    "flex items-center gap-2 lg:gap-2.5 shrink-0 rounded-full pl-1 pr-3.5 py-1 lg:pl-1.5 lg:pr-5 lg:py-1.5 border transition-colors",
                    active ? "bg-gray-900 border-gray-900 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  )}
                >
                  <img src={cat.thumb} alt="" className="w-6 h-6 lg:w-8 lg:h-8 rounded-full object-cover" />
                  <span className="text-xs lg:text-sm font-semibold whitespace-nowrap">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Featured category image → search results for this category ──
             On desktop this becomes a 3-up row instead of one huge full-width
             photo: the real featured card plus two more "trending look" cards
             (same category, different seeded imagery) — smaller each, more of
             them. Mobile is untouched — a single full-width card exactly as
             before (the extra two are `hidden lg:block`). */}
        <div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
            <Link
              to={`/search/results?q=${encodeURIComponent(category.label)}`}
              className="relative block aspect-[4/5] sm:aspect-[3/4] lg:aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100"
            >
              <img src={category.featured.image} alt={category.label} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  openSaveModal({
                    id: `featured-${category.id}`,
                    name: category.featured.sub,
                    category: category.label,
                    price: category.featured.price,
                    moq: category.featured.moq,
                    image: category.featured.image,
                  });
                }}
                className="absolute top-3 right-3 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow-sm"
                aria-label={savedState.products[`featured-${category.id}`] ? "Edit saved folders" : "Save"}
              >
                {savedState.products[`featured-${category.id}`] ? <BookmarkCheck className="w-4 h-4 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="w-4 h-4 text-gray-600" />}
              </button>
              <div className="absolute bottom-3 left-3 text-white drop-shadow">
                <p className="text-sm font-bold">{category.featured.sub}</p>
                <p className="text-xs font-semibold">{category.featured.moq} · {category.featured.price}</p>
              </div>
            </Link>

            {["More Looks", "Also Trending"].map((label, n) => (
              <Link
                key={label}
                to={`/search/results?q=${encodeURIComponent(category.label)}`}
                className="hidden lg:block relative aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100"
              >
                <img src={img(`trend-feat-${category.id}-${n + 2}`, 700, 900)} alt={category.label} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 text-white drop-shadow">
                  <p className="text-sm font-bold">{label}</p>
                  <p className="text-xs font-semibold">{category.label}</p>
                </div>
              </Link>
            ))}
          </div>

          <button
            onClick={() => navigate(`/search/results?q=${encodeURIComponent(category.label)}`)}
            className="mt-3 w-full flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors"
          >
            View More {category.label}
            <SearchIcon className="w-4 h-4" />
          </button>
        </div>

        {/* ── Top Brands for #hashtag — selecting a brand shows its top products ── */}
        <div>
          <h2 className="text-sm lg:text-lg font-bold text-gray-900 mb-3">
            Top Brands for <span className="text-[#ef4d62]">#{category.hashtag}</span>
          </h2>

          <div className="flex gap-4 lg:gap-6 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {category.brands.map((brand) => {
              const active = brand.id === brandId;
              return (
                <button
                  key={brand.id}
                  onClick={() => setBrandId(brand.id)}
                  className="flex flex-col items-center gap-1.5 lg:gap-2 shrink-0 w-16 lg:w-24"
                >
                  <span className="relative">
                    <span
                      className={cn(
                        "block w-14 h-14 lg:w-24 lg:h-24 rounded-full overflow-hidden border-2 transition-colors",
                        active ? "border-[#ef4d62]" : "border-transparent"
                      )}
                    >
                      <img src={brand.logo} alt={brand.name} className="w-full h-full object-cover" />
                    </span>
                    {brand.badge ? (
                      <span className="absolute -top-1 -right-1 min-w-5 h-5 lg:min-w-6 lg:h-6 px-1 rounded-full bg-[#ef4d62] text-white text-[10px] lg:text-xs font-bold flex items-center justify-center">
                        {brand.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className={cn("text-[10px] lg:text-sm leading-tight text-center truncate w-full", active ? "font-bold text-gray-900" : "text-gray-600")}>
                    {brand.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected brand's top-selling products */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:gap-5 mt-4">
            {(hasLive ? trending.slice(0, 3).map(toCompact) : brandProducts(selectedBrand.id).slice(0, 3)).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          <button
            onClick={() => navigate(`/vendor/${selectedBrand.id}`)}
            className="mt-3 w-full flex items-center justify-center gap-1 border border-gray-200 rounded-xl py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors"
          >
            Visit Brand <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* ── Hot Trends, Styled for You ── */}
        <div>
          <h2 className="text-base lg:text-xl font-bold text-gray-900 mb-3">Hot Trends, Styled for You</h2>

          <Link to={`/product/${styled.id}`} className="relative block aspect-[4/5] sm:aspect-[3/4] lg:aspect-[16/10] rounded-2xl overflow-hidden bg-gray-100">
            <img src={styled.image} alt={styled.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <button
              onClick={(e) => {
                e.preventDefault();
                openSaveModal({
                  id: styled.id,
                  name: styled.title,
                  moq: styled.moq,
                  image: styled.image,
                });
              }}
              className="absolute top-3 right-3 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow-sm"
              aria-label={savedState.products[styled.id] ? "Edit saved folders" : "Save"}
            >
              {savedState.products[styled.id] ? <BookmarkCheck className="w-4 h-4 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="w-4 h-4 text-gray-600" />}
            </button>
            <div className="absolute bottom-3 left-3 right-3 text-white drop-shadow">
              <p className="text-base font-bold">{styled.title}</p>
              <p className="text-xs font-medium opacity-90">{styled.tags.join("  ")}</p>
              <p className="text-xs font-semibold mt-0.5">{styled.moq}</p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold mt-1">
                View Item <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:gap-5 mt-4">
            {(hasLive ? trending.slice(3, 6).map(toCompact) : styled.suggestions).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {/* Refreshes just the styled image + suggestions */}
          <button
            onClick={refreshStyles}
            className="mt-3 w-full flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors"
          >
            View More Styles
            <RefreshCw className={cn("w-4 h-4 transition-transform", styledSpin && "animate-spin")} />
          </button>
        </div>

        {/* ── Apparel group dropdown + Hot Keywords + infinite product feed ── */}
        <div>
          {/* Group dropdown */}
          <div className="relative inline-block">
            <button
              onClick={() => setGroupOpen((o) => !o)}
              className="flex items-center gap-1 text-sm font-bold text-gray-900"
            >
              {apparelGroup}
              <ChevronDown className={cn("w-4 h-4 text-gray-500 transition-transform", groupOpen && "rotate-180")} />
            </button>
            {groupOpen && (
              <div className="absolute left-0 top-full mt-1 z-20 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                {APPAREL_GROUPS.map((group) => (
                  <button
                    key={group}
                    onClick={() => selectGroup(group)}
                    className={cn(
                      "w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors",
                      group === apparelGroup ? "text-[#ef4d62] font-semibold" : "text-gray-700"
                    )}
                  >
                    {group}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hot Keywords */}
          <div className="mt-3">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-4 h-4 text-[#ef4d62]" />
              <p className="text-sm font-bold text-gray-900">Hot Keywords</p>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
              {keywords.map((kw) => {
                const active = kw.label === hotKeyword;
                return (
                  <button
                    key={kw.label}
                    onClick={() => setHotKeyword(kw.label)}
                    className={cn(
                      "flex items-center gap-2 shrink-0 rounded-full pl-1 pr-3 py-1 border transition-colors",
                      active ? "bg-gray-900 border-gray-900 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                    )}
                  >
                    <img src={kw.thumb} alt="" className="w-6 h-6 rounded-full object-cover" />
                    <span className="text-xs font-semibold whitespace-nowrap">{kw.label}</span>
                    {kw.delta && (
                      <span className={cn("text-[10px] font-bold whitespace-nowrap", active ? "text-[#ff9bab]" : "text-[#ef4d62]")}>
                        {kw.delta}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product feed (infinite scroll) — one continuous grid so the
              mobile-only (`lg:hidden`) requirement cards collapse out on desktop. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 mt-4">
            {feedNodes}
          </div>

          <div ref={loadMoreRef} className="py-6 text-center text-xs lg:text-sm text-gray-400">
            {loadingMore ? "Loading more products..." : "Scroll for more"}
          </div>

          {/* Submit Requirement — same card + Quick RFQ modal as New Arrivals */}
          <div className="mt-2 lg:max-w-4xl lg:mx-auto">
            <SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} />
          </div>
        </div>
      </div>

      <QuickRfqModal isOpen={quickRfqOpen} onClose={() => setQuickRfqOpen(false)} />

      {/* Bottom nav retracts on scroll-down, returns on scroll-up */}
      <MobileBottomNav autoHide />
    </div>
  );
};

export default Trends;
