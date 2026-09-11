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

// makeProduct() and brandProducts() lived here. They generated cards named
// literally "Product name" with alternating "5.6k"/"1.6k" figures and a fixed
// "800+ sold", and fed three sections of this page. Deleted — see below.

// ─────────────────────────────────────────────────────────────
// DATA
//
// EDITORIAL, NOT DATA. The categories, looks and suggested searches below are
// chosen by hand. No trends job exists in this codebase (there is no Google
// Trends integration, no search-volume log), so nothing on this page may
// claim to be live, trending or measured — it is labelled "curated". Building
// a real trends pipeline is logged in documentation/ToDo.md as a future
// feature. Product cards on this page come ONLY from the real catalogue.
// ─────────────────────────────────────────────────────────────

interface TrendCategory {
  id: string;
  label: string;
  hashtag: string;
  thumb: string;
  featured: { image: string; sub: string };
}

// EDITORIAL (no trends job exists — see ToDo.md): trending categories — keywords fetched from Google Trends.
const CATEGORIES: TrendCategory[] = [
  {
    id: "denim",
    label: "Denim",
    hashtag: "Denim",
    thumb: img("trend-cat-denim", 80, 80),
    featured: { image: img("trend-feat-denim", 700, 900), sub: "Jeans" },
  },
  {
    id: "long-dress",
    label: "Long Dress",
    hashtag: "LongDress",
    thumb: img("trend-cat-long", 80, 80),
    featured: { image: img("trend-feat-long", 700, 900), sub: "Maxi Dress" },
  },
  {
    id: "short-tee",
    label: "Short-sleeved T-shirt",
    hashtag: "Tshirt",
    thumb: img("trend-cat-tee", 80, 80),
    featured: { image: img("trend-feat-tee", 700, 900), sub: "T-shirts/Tops" },
  },
  {
    id: "pleats",
    label: "Pleats",
    hashtag: "pleats",
    thumb: img("trend-cat-pleats", 80, 80),
    featured: { image: img("trend-feat-pleats", 700, 900), sub: "Pleated Dress" },
  },
  {
    id: "cargo",
    label: "Cargo",
    hashtag: "Cargo",
    thumb: img("trend-cat-cargo", 80, 80),
    featured: { image: img("trend-feat-cargo", 700, 900), sub: "Cargo Pants" },
  },
  {
    id: "knitwear",
    label: "Knitwear",
    hashtag: "Knitwear",
    thumb: img("trend-cat-knit", 80, 80),
    featured: { image: img("trend-feat-knit", 700, 900), sub: "Knit Sets" },
  },
];

interface StyledTrend {
  id: string;
  image: string;
  title: string;
  tags: string[];
}

// EDITORIAL (no trends job exists — see ToDo.md): "Hot Trends, Styled for You" — refreshed via "View More Styles".
const STYLED_TRENDS: StyledTrend[] = [
  {
    id: "st1",
    image: img("styled-tee-gray", 800, 1000),
    title: "T-shirts/Tops",
    tags: ["#Screen printing", "#Gray"],
  },
  {
    id: "st2",
    image: img("styled-dress-floral", 800, 1000),
    title: "Floral Midi Dress",
    tags: ["#Summer", "#Linen"],
  },
  {
    id: "st3",
    image: img("styled-denim-wide", 800, 1000),
    title: "Wide-Leg Denim",
    tags: ["#Vintage wash", "#Relaxed"],
  },
];

// EDITORIAL (no trends job exists — see ToDo.md): "Hot Keywords" — trend deltas fetched from Google Trends.
const APPAREL_GROUPS = ["Women's Apparel/Simple", "Men's Apparel/Casual", "Kids/Everyday", "Accessories"];

interface HotKeyword {
  label: string;
  thumb: string;
}

const HOT_KEYWORDS: Record<string, HotKeyword[]> = {
  "Women's Apparel/Simple": [
    { label: "rugby tee", thumb: img("hk-rugby", 80, 80) },
    { label: "V-neck T-shirt", thumb: img("hk-vneck", 80, 80) },
    { label: "pinafore", thumb: img("hk-pinafore", 80, 80) },
    { label: "boat neck", thumb: img("hk-boatneck", 80, 80) },
  ],
  "Men's Apparel/Casual": [
    { label: "camp collar", thumb: img("hk-camp", 80, 80) },
    { label: "linen shirt", thumb: img("hk-linen", 80, 80) },
    { label: "oversized tee", thumb: img("hk-oversized", 80, 80) },
  ],
  "Kids/Everyday": [
    { label: "co-ord set", thumb: img("hk-coord", 80, 80) },
    { label: "dungarees", thumb: img("hk-dungaree", 80, 80) },
  ],
  "Accessories": [
    { label: "bucket hat", thumb: img("hk-bucket", 80, 80) },
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
  const [styledIndex, setStyledIndex] = useState(0);
  const [styledSpin, setStyledSpin] = useState(false);
  const [apparelGroup, setApparelGroup] = useState(APPAREL_GROUPS[0]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [feedBatches, setFeedBatches] = useState(1);
  const [quickRfqOpen, setQuickRfqOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const categoryChipsDrag = useDragScroll<HTMLDivElement>();

  // Real catalogue, trending-sorted. The product-card grids below render these;
  // the trend chrome (categories / keywords / styled heroes) stays curated.
  const { data: live, isPending: livePending, isError: liveError, refetch: refetchLive } = useLiveProducts();
  const trending = useMemo(() => (live && live.length ? sortTrending(live) : []), [live]);
  const hasLive = trending.length > 0;

  const category = useMemo(() => CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0], [categoryId]);
  const styled = STYLED_TRENDS[styledIndex];
  const keywords = HOT_KEYWORDS[apparelGroup] ?? [];

  const selectCategory = (id: string) => {
    const next = CATEGORIES.find((c) => c.id === id);
    if (!next) return;
    setCategoryId(id);
  };

  const selectGroup = (group: string) => {
    setApparelGroup(group);
    setGroupOpen(false);
  };

  const refreshStyles = () => {
    setStyledSpin(true);
    setStyledIndex((i) => (i + 1) % STYLED_TRENDS.length);
    window.setTimeout(() => setStyledSpin(false), 500);
  };

  // Bottom feed: the real catalogue, trending-sorted, paginated by batch. An
  // empty catalogue is EMPTY — this used to generate cards whenever there was
  // nothing real to show, including during every initial load.
  const feedProducts = useMemo(
    () => trending.slice(0, feedBatches * 6).map(toCompact),
    [trending, feedBatches],
  );

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

  // Infinite scroll observer. The next batch is already in memory
  // (feedProducts slices `trending`, loaded in full), so it is revealed at
  // once. This used to wait 300 ms behind a "Loading more products..." label
  // for data that needed no loading (Master Prompt 8, Phase 7). The observer
  // is re-created per batch, so a sentinel still in view after a batch lands
  // triggers the next one, and it stops once everything is shown.
  const allShown = feedProducts.length >= trending.length;
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || allShown) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setFeedBatches((c) => c + 1);
      },
      { rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [feedBatches, allShown]);

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
          {/* Was "NEW TREND INSIGHTS — Discover Trending Arrivals for You". There is
              no trends pipeline behind this page, so it does not claim one. */}
          <h1 className="text-base lg:text-4xl font-extrabold tracking-tight text-gray-900">CURATED TREND PICKS</h1>
          <p className="text-xs lg:text-lg text-gray-500 mt-0.5 lg:mt-2">Editor-picked looks. Tap one to browse real listings on Cosora.</p>
        </div>

        {/* ── Curated category chips (editorial; no trends data source exists) ──
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
              {/* No Save button and no price or MOQ: this is a curated image, not
                  a product. It used to save itself into the buyer's collections as
                  "featured-denim" at an invented USD price ($16.22). */}
              <div className="absolute bottom-3 left-3 text-white drop-shadow">
                <p className="text-sm font-bold">{category.featured.sub}</p>
                <p className="text-xs font-semibold">Browse {category.label}</p>
              </div>
            </Link>

            {["More Looks", "Explore More"].map((label, n) => (
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

        {/* "Top Brands for #hashtag" was here: six invented brand names per
            category ("BLESSING", "favor", "J.Holic", ...) with picsum logos, none
            of them a vendor on Cosora. With a live catalogue its grid showed the
            SAME three real products whichever invented brand was tapped — real
            listings attributed to brands that do not exist — and "Visit Brand"
            opened /vendor/blessing, which does not exist either. There is no real
            per-trend brand data to wire it to, so the section is removed. */}

        {/* ── Curated looks ── */}
        <div>
          <h2 className="text-base lg:text-xl font-bold text-gray-900 mb-3">Curated looks</h2>

          {/* A curated look, not a product. "View Item" used to link to
              /product/st1 — an id that has never existed — and a Save button
              stored the look in the buyer's collections with an invented MOQ.
              It opens a real search for the look instead. */}
          <Link to={`/search/results?q=${encodeURIComponent(styled.title)}`} className="relative block aspect-[4/5] sm:aspect-[3/4] lg:aspect-[16/10] rounded-2xl overflow-hidden bg-gray-100">
            <img src={styled.image} alt={styled.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 text-white drop-shadow">
              <p className="text-base font-bold">{styled.title}</p>
              <p className="text-xs font-medium opacity-90">{styled.tags.join("  ")}</p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold mt-1">
                Browse similar <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>

          {/* No product grid under the look. It used to show either three
              generated products or the catalogue's trending items 4-6, laid out
              as though they matched this look. Neither was true. */}

          {/* Cycles through the curated looks */}
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
              {/* "Hot Keywords" with "↑ 800%" / "↑ 540%" growth figures sat here.
                  Nothing measures search growth — the figures were invented. These
                  are editorial suggestions and are labelled as such. */}
              <p className="text-sm font-bold text-gray-900">Suggested searches</p>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
              {keywords.map((kw) => (
                // A real search. These used to set local state that only re-seeded
                // the generated fallback cards — with a live catalogue, tapping a
                // chip changed nothing on the page.
                <button
                  key={kw.label}
                  onClick={() => navigate(`/search/results?q=${encodeURIComponent(kw.label)}`)}
                  className="flex items-center gap-2 shrink-0 rounded-full pl-1 pr-3 py-1 border bg-white border-gray-200 text-gray-700 hover:border-gray-300 transition-colors"
                >
                  <img src={kw.thumb} alt="" className="w-6 h-6 rounded-full object-cover" />
                  <span className="text-xs font-semibold whitespace-nowrap">{kw.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Product feed (infinite scroll) — one continuous grid so the
              mobile-only (`lg:hidden`) requirement cards collapse out on desktop. */}
          {/* Loading / error / empty / populated stay four distinct states. An
              empty catalogue used to be filled with generated cards. */}
          {livePending ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 mt-4" aria-label="Loading listings">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="aspect-[4/5] rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : liveError ? (
            <div className="mt-6 flex flex-col items-center text-center py-8">
              <p className="text-sm font-bold text-gray-900">Couldn't load listings</p>
              <p className="text-xs text-gray-500 mt-1">Check your connection and try again.</p>
              <button onClick={() => void refetchLive()} className="mt-3 px-4 py-2 rounded-xl bg-[#ef4d62] text-white text-xs font-bold">
                Retry
              </button>
            </div>
          ) : !hasLive ? (
            <div className="mt-6 flex flex-col items-center text-center py-8">
              <p className="text-sm font-bold text-gray-900">No listings to show yet</p>
              <p className="text-xs text-gray-500 mt-1">When vendors' products go live, they'll appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 mt-4">
              {feedNodes}
            </div>
          )}

          {/* Always mounted: the infinite-scroll observer attaches to it once. */}
          <div ref={loadMoreRef} className="py-6 text-center text-xs lg:text-sm text-gray-400">
            {hasLive && (feedProducts.length >= trending.length
              ? "That's everything listed right now."
              : "Scroll for more")}
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
