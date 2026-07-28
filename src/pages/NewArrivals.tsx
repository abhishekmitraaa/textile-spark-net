import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useT } from "@/lib/i18n";
import BuyerShell from "@/components/buyer/BuyerShell";
import SponsoredRail from "@/components/buyer/SponsoredRail";
import EverydayFashionHero from "@/components/buyer/EverydayFashionHero";
import QuickRfqModal from "@/components/buyer/QuickRfqModal";
import VideoCloseUpsViewer from "@/components/buyer/VideoCloseUpsViewer";
import SubmitRequirementCard from "@/components/buyer/SubmitRequirementCard";
import { BadgeCheck, Bookmark, BookmarkCheck, ChevronRight, Grid2X2, Grid3X3, MapPin, Phone, Play, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import { useLiveProducts } from "@/lib/queries/products";
import { useVideoCloseUps } from "@/lib/queries/videos";
import { useActiveAds, logAdImpression, logAdClick, type ActiveAd } from "@/lib/queries/ads";
import { useTopVendors } from "@/lib/queries/vendor";
import { useCallVendor, placeCall, demoPhone } from "@/lib/queries/calls";
import { useAuth } from "@/contexts/AuthContext";
import { useDragScroll } from "@/hooks/useDragScroll";
import trustedSeal from "@/assets/Trustedseal.png";
import catWomensApparel from "@/assets/categories/womens-apparel.png";
import catMensApparel from "@/assets/categories/mens-apparel.png";
import catMensJeans from "@/assets/categories/mens-jeans.png";
import catMensShirt from "@/assets/categories/mens-shirt.png";
import catAccessories from "@/assets/categories/accessories.png";
import catWomensTrousers from "@/assets/categories/womens-trousers.png";
import catWomensTshirts from "@/assets/categories/womens-tshirts.png";
import catWomensShoes from "@/assets/categories/womens-shoes.png";
import catKidswear from "@/assets/categories/kidswear.png";
import catEthnicWear from "@/assets/categories/ethnic-wear.png";
import catActivewear from "@/assets/categories/activewear.png";
import catWinterWear from "@/assets/categories/winter-wear.png";

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: "Women's Apparel",  image: catWomensApparel },
  { name: "Men's Apparel",    image: catMensApparel },
  { name: "Men's Jeans",      image: catMensJeans },
  { name: "Men's Shirt",      image: catMensShirt },
  { name: "Accessories",      image: catAccessories },
  { name: "Women's Trousers", image: catWomensTrousers },
  { name: "Women's T-shirts", image: catWomensTshirts },
  { name: "Women's Shoes",    image: catWomensShoes },
  { name: "Kidswear",         image: catKidswear },
  { name: "Ethnic Wear",      image: catEthnicWear },
  { name: "Activewear",       image: catActivewear },
  { name: "Winter Wear",      image: catWinterWear },
];

interface Product {
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
  verified?: boolean;
}

const BASE_PRODUCTS: Product[] = [
  { id: "p1", vendorId: "v1", name: "Ribbed Tank Top", manufacturer: "Manufacturer", location: "Bangalore", price: "₹499", moq: "2", soldCount: "800+ sold", enquiries: "5.6k", rating: 4.1, fabric: "Cotton", gsm: "200", fitType: "Regular", image: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=500&h=650&fit=crop", verified: true },
  { id: "p2", vendorId: "v2", name: "Camp Collar Shirt", manufacturer: "Manufacturer", location: "Bangalore", price: "₹499", moq: "2", soldCount: "800+ sold", enquiries: "1.8k", rating: 3.8, fabric: "Cotton", gsm: "200", fitType: "Regular", image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&h=650&fit=crop" },
  { id: "p3", vendorId: "v3", name: "Ribbed Tank Top - Orange", manufacturer: "Manufacturer", location: "Bangalore", price: "₹499", moq: "2", soldCount: "800+ sold", enquiries: "5.6k", rating: 4.1, fabric: "Cotton", gsm: "200", fitType: "Regular", image: "https://images.unsplash.com/photo-1525507119028-3a96ab6b2c5f?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1551488831-1c9c4f0c6c5e?w=500&h=650&fit=crop", verified: true },
  { id: "p4", vendorId: "v4", name: "Graphic Print Tee", manufacturer: "Manufacturer", location: "Bangalore", price: "₹499", moq: "2", soldCount: "800+ sold", enquiries: "1.6k", rating: 3.8, fabric: "Cotton", gsm: "200", fitType: "Regular", image: "https://images.unsplash.com/photo-1622445275576-721325763afe?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=500&h=650&fit=crop" },
];

// NOTE: videoUrl values are freely-licensed public sample clips
// (Google's GCS sample-videos bucket), used here only as stand-ins so
// playback is genuinely testable. Swap for real vendor-uploaded video
// URLs once the catalogue has them — the viewer component already
// falls back to the thumbnail image automatically if videoUrl is
// absent or fails to load, so removing these is also safe.
import { VIDEO_CLOSE_UPS, rankVideoCloseUps } from "@/data/videoCloseUps";

// First 3 are the mobile-visible set (unchanged). The extra 3 only render at
// the lg breakpoint (see `hidden lg:block` on the card below) so desktop's
// 6-column grid fills a complete row without adding anything to mobile's
// existing 3-column/3-item view. Reuses existing images already in this file.
const LOOKING_FOR_THESE = [
  { id: "lft1", name: "Floral Midi Dress",   price: "$499", moq: "2", soldCount: "800+ sold", image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&h=520&fit=crop" },
  { id: "lft2", name: "Quilted Crossbody",   price: "$499", moq: "2", soldCount: "800+ sold", image: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=400&h=520&fit=crop" },
  { id: "lft3", name: "Polka Dot Sundress",  price: "$499", moq: "2", soldCount: "800+ sold", image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=520&fit=crop" },
  { id: "lft4", name: "Graphic Print Tee",   price: "$499", moq: "2", soldCount: "800+ sold", image: "https://images.unsplash.com/photo-1622445275576-721325763afe?w=400&h=520&fit=crop" },
  { id: "lft5", name: "Camp Collar Shirt",   price: "$499", moq: "2", soldCount: "800+ sold", image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&h=520&fit=crop" },
  { id: "lft6", name: "Ribbed Tank Top",     price: "$499", moq: "2", soldCount: "800+ sold", image: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=400&h=520&fit=crop" },
];

// Brand Picks and Recommended Premium Brands were static mock arrays whose
// cards all routed to the same placeholder (`/search/results` and
// `/vendor/premium-1`). Both now read real data:
//   Brand Picks     → useActiveAds(), the same paid-ad pipeline SponsoredRail
//                     uses, routed to the real promoted product.
//   Premium Brands  → useTopVendors(), routed to the real vendor.
// See the render blocks below for the SponsoredRail de-duplication rule.

// De-duplication between the two ad surfaces on this page. SponsoredRail sits
// higher and is served first; Brand Picks takes the rows after it. The RPC
// orders deterministically (advertisements.created_at desc), so the split is
// stable and the same ad can never appear twice in one scroll — which also
// keeps impression counts honest, since those feed ad reporting.
//
// Consequence worth knowing: the two sections SPLIT the available inventory
// rather than both showing everything, so Brand Picks stays empty until more
// than SPONSORED_MAX campaigns are live. Kept low for that reason.
const SPONSORED_MAX = 3;
const BRAND_PICKS_MAX = 6;

const HOME_TABS = [
  { label: "NEW ARRIVALS", href: "/home/new-arrivals" },
  { label: "TRENDS",       href: "/home/trends" },
  { label: "SALE",         href: "/home/sale" },
  { label: "FOR YOU",      href: "/home/for-you" },
  { label: "FOLLOWINGS",   href: "/home/followings" },
];

// ─────────────────────────────────────────────────────────────
// PRODUCT CARD — standard card format used across all listing pages
// ─────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: Product }) {
  const callVendor = useCallVendor();
  const savedState = useSaved();
  const saved = Boolean(savedState.products[product.id]);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="rounded-xl border border-gray-200 overflow-hidden bg-white flex flex-col h-full"
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

        {product.verified && (
          <img
            src={trustedSeal}
            alt="TrustedSEAL verified vendor"
            className="absolute top-2 lg:top-3 left-2 lg:left-3 h-4 lg:h-5 w-auto rounded shadow-sm"
          />
        )}

        <button
          onClick={e => { e.preventDefault(); openSaveModal(product); }}
          className="absolute top-2 lg:top-3 right-2 lg:right-3 w-7 lg:w-9 h-7 lg:h-9 bg-white/90 rounded-full flex items-center justify-center shadow-sm"
          aria-label={saved ? "Edit saved folders" : "Save product"}
        >
          {saved ? <BookmarkCheck className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-gray-500" />}
        </button>

        <div className="absolute bottom-2 lg:bottom-3 left-2 lg:left-3 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 lg:px-2 py-0.5 lg:py-1">
          <Star className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-yellow-400 fill-yellow-400" />
          <span className="text-[9px] lg:text-xs font-bold text-gray-800">{product.rating}</span>
          <span className="text-[9px] lg:text-xs text-gray-400">| {product.enquiries}</span>
        </div>
      </Link>

      <div className="p-2 lg:p-3.5 flex flex-col flex-1">
        <p className="text-xs lg:text-sm font-bold text-[#ef4d62] leading-snug">
          {product.price} | MOQ: {product.moq} | {product.soldCount}
        </p>
        <p className="text-[10px] lg:text-xs text-gray-600 mt-1 lg:mt-1.5">
          {product.name} | <Link to={`/vendor/${product.vendorId}`} className="font-bold hover:underline">{product.manufacturer}</Link>
        </p>
        <div className="flex items-center gap-0.5 mt-1 lg:mt-1.5">
          <MapPin className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-gray-500 shrink-0" />
          <span className="text-[10px] lg:text-xs font-bold text-gray-700">{product.location}</span>
        </div>
        <p className="text-[10px] lg:text-xs text-gray-500 mt-1 lg:mt-1.5">Fabric: {product.fabric} | GSM: {product.gsm}</p>
        <p className="text-[10px] lg:text-xs text-gray-500 mt-0.5">Fit Type: {product.fitType}</p>

        {/* Spacer absorbs uneven text height so every Call Now aligns at the card's bottom edge */}
        <div className="flex-1" />

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

const NewArrivals = () => {
  const t = useT();
  const navigate = useNavigate();
  const callVendor = useCallVendor();
  const { profile } = useAuth();
  const firstName = (profile?.full_name?.trim().split(/\s+/)[0]) || "there";

  // ── Brand Picks: real paid ads, de-duplicated against SponsoredRail ──
  // One window covering both sections; SponsoredRail renders the first
  // SPONSORED_MAX, Brand Picks takes the rest. Ordering is deterministic, so
  // the split is stable across renders.
  const { data: adWindow = [] } = useActiveAds(SPONSORED_MAX + BRAND_PICKS_MAX);
  const brandPicks = useMemo(() => adWindow.slice(SPONSORED_MAX), [adWindow]);
  const loggedAds = useRef<Set<string>>(new Set());
  useEffect(() => {
    brandPicks.forEach((a) => {
      if (!loggedAds.current.has(a.adId)) {
        loggedAds.current.add(a.adId);
        void logAdImpression(a.adId);
      }
    });
  }, [brandPicks]);

  const openAd = (a: ActiveAd) => {
    void logAdClick(a.adId);
    if (a.productId) navigate(`/product/${a.productId}`);
  };

  // ── Recommended Premium Brands: real vendors, ranked paid-plan-first ──
  const { data: topVendors = [] } = useTopVendors(4);

  // Mouse click-and-drag scrolling for the horizontal rails below — touch/
  // trackpad already scroll them natively, this is what makes desktop mouse
  // users able to slide them at all.
  const categoriesDrag = useDragScroll<HTMLDivElement>();
  const videoRailDrag = useDragScroll<HTMLDivElement>();
  const brandPicksDrag = useDragScroll<HTMLDivElement>();

  // Real vendor-uploaded reels; fall back to local samples while loading / if empty.
  const { data: dbVideos } = useVideoCloseUps();
  const videoCatalogue = dbVideos && dbVideos.length > 0 ? dbVideos : VIDEO_CLOSE_UPS;
  const [viewMode, setViewMode] = useState<"2-col" | "3-col">("2-col");
  const [batchCount, setBatchCount] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [quickRfqOpen, setQuickRfqOpen] = useState(false);
  const [videoViewerOpen, setVideoViewerOpen] = useState(false);
  const [videoStartIndex, setVideoStartIndex] = useState(0);
  const [bookmarkedVideoIds, setBookmarkedVideoIds] = useState<Set<string>>(new Set());

  // Categories the buyer has shown interest in THIS session, derived from
  // which video close-ups they've bookmarked. Recomputed only when the
  // bookmark set actually changes. See rankVideoCloseUps for what this
  // feeds into and why it's scoped to session-only signal.
  const interestedCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const video of videoCatalogue) {
      if (bookmarkedVideoIds.has(video.id)) cats.add(video.category);
    }
    return cats;
  }, [bookmarkedVideoIds, videoCatalogue]);

  const rankedVideoCloseUps = useMemo(
    () => rankVideoCloseUps(videoCatalogue, interestedCategories),
    [videoCatalogue, interestedCategories]
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !isLoadingMore) {
        setIsLoadingMore(true);
        setTimeout(() => { setBatchCount(c => c + 1); setIsLoadingMore(false); }, 300);
      }
    }, { rootMargin: "200px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [isLoadingMore]);

  // "Today's New In" is now the real, shared catalogue: live products a vendor
  // actually uploaded (status='live'), read from Supabase. While loading — or if
  // the catalogue is empty — fall back to the local samples so the page never
  // looks broken. `batchCount` still drives the infinite-scroll sentinel.
  const { data: liveProducts, isLoading: productsLoading } = useLiveProducts();
  const products = useMemo(() => {
    if (liveProducts && liveProducts.length > 0) return liveProducts;
    if (productsLoading) return [];
    return Array.from({ length: batchCount }, (_, b) =>
      BASE_PRODUCTS.map(p => ({ ...p, id: `${p.id}-${b}`, vendorId: `${p.vendorId}-${b}` }))
    ).flat();
  }, [liveProducts, productsLoading, batchCount]);

  // Grid columns per breakpoint, derived from the active toggle. Desktop shows
  // twice the mobile column count (see the grid className below).
  const cols = viewMode === "2-col" ? 2 : 3;
  const desktopCols = cols * 2; // 4 (2-col) or 6 (3-col)

  // Pad the feed so the final desktop row is always complete — otherwise a count
  // like 6 leaves a half-empty row on wide screens. We top up to the next
  // multiple of desktopCols by cycling the existing products (unique ids/keys).
  // desktopCols is a multiple of the mobile column count, so mobile stays full too.
  const displayProducts = useMemo(() => {
    if (products.length === 0) return products;
    const remainder = products.length % desktopCols;
    if (remainder === 0) return products;
    const fillers = Array.from({ length: desktopCols - remainder }, (_, i) => {
      const src = products[i % products.length];
      return { ...src, id: `${src.id}-fill${i}` };
    });
    return [...products, ...fillers];
  }, [products, desktopCols]);

  // Interleave a Submit Requirement card every 5 rows. A row is `cols` cards on
  // mobile but `desktopCols` on desktop, so the insert positions differ per
  // breakpoint: every (cols*5) products on mobile, every (desktopCols*5) on
  // desktop. Cards at a multiple of the desktop interval show on both; the
  // in-between mobile multiples are mobile-only (`lg:hidden`, so they collapse
  // out of the desktop grid and leave no gap). Net: mobile sees a card every 5
  // mobile rows, desktop every 5 desktop rows.
  const mobileInterval = cols * 5;         // 10 (2-col) or 15 (3-col)
  const desktopInterval = desktopCols * 5; // 20 (2-col) or 30 (3-col)
  const feedNodes: JSX.Element[] = [];
  displayProducts.forEach((product, i) => {
    feedNodes.push(<ProductCard key={product.id} product={product} />);
    const n = i + 1;
    if (n >= displayProducts.length) return; // never trail the last loaded product
    if (n % desktopInterval === 0) {
      feedNodes.push(
        <div key={`req-${i}`} className="col-span-full lg:max-w-4xl lg:mx-auto my-2 lg:my-4">
          <SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} />
        </div>
      );
    } else if (n % mobileInterval === 0) {
      feedNodes.push(
        <div key={`req-m-${i}`} className="col-span-full lg:hidden my-2">
          <SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} />
        </div>
      );
    }
  });

  return (
    <BuyerShell>
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-3">
        {/* ── Home tabs ── */}
        <div className="flex justify-start lg:justify-center gap-4 lg:gap-7 overflow-x-auto pb-2 mb-3 border-b border-gray-100 scrollbar-hide">
          {HOME_TABS.map(tab => (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                "text-xs lg:text-sm font-bold whitespace-nowrap pb-2 border-b-2 transition-colors shrink-0",
                tab.href === "/home/new-arrivals"
                  ? "text-[#ef4d62] border-[#ef4d62]"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              )}
            >
              {tab.href === "/home/new-arrivals" && "✦ "}{t(tab.label)}
            </Link>
          ))}
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 space-y-5 lg:space-y-10 pb-4">

        {/* ── Everyday Fashion Hero — center-emphasis auto-advancing carousel ── */}
        <EverydayFashionHero />

        {/* ── What's on your mind — categories slider (2 rows, scrolls horizontally) ── */}
        <div>
          <div className="flex items-center justify-between mb-2 lg:mb-3 px-1">
            <h2 className="text-sm lg:text-lg font-bold text-gray-900 tracking-tight text-center w-full">WHAT'S ON YOUR MIND</h2>
          </div>
          <div
            ref={categoriesDrag.ref}
            className={cn("overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory pb-1 -mx-1 px-1", categoriesDrag.className)}
            style={{ WebkitOverflowScrolling: "touch" }}
            onMouseDown={categoriesDrag.onMouseDown}
            onMouseMove={categoriesDrag.onMouseMove}
            onMouseUp={categoriesDrag.onMouseUp}
            onMouseLeave={categoriesDrag.onMouseLeave}
            onClickCapture={categoriesDrag.onClickCapture}
          >
            {/* lg:w-max + lg:mx-auto centers the strip when it fits the row (typical
                desktop widths); if a future viewport/category count makes it wider
                than the container, auto margins collapse to 0 and the parent's
                native overflow-x-auto scrolling takes over unchanged — this avoids
                the flex `justify-center` + overflow scrolling bug. Mobile (no lg:
                override) keeps its original percentage-based edge-to-edge layout. */}
            <div className="grid grid-flow-col grid-rows-2 auto-cols-[22%] lg:auto-cols-[128px] gap-3 lg:gap-5 lg:w-max lg:mx-auto">
              {CATEGORIES.map(cat => (
                <Link
                  key={cat.name}
                  to={`/search/results?category=${encodeURIComponent(cat.name)}`}
                  className="text-center group snap-start"
                >
                  <div className="aspect-square rounded-xl overflow-hidden bg-white border border-gray-100 mb-1.5 lg:mb-2 p-2 lg:p-3 group-hover:border-gray-200 group-hover:shadow-sm transition-all">
                    <img src={cat.image} alt={cat.name} className="w-full h-full object-contain" draggable={false} />
                  </div>
                  <span className="text-[10px] lg:text-xs text-gray-700 font-medium leading-tight">{cat.name}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-3 lg:mt-5 text-[10px] lg:text-xs font-bold text-gray-300 tracking-widest">
            <span>&lt;</span>
            <span>SLIDE TO SEE</span>
            <span>&gt;</span>
          </div>
        </div>

        {/* ── Sponsored (vendor ad campaigns) ──
            Explicit max so Brand Picks below knows exactly how many rows to
            skip; the component itself is unchanged. */}
        <SponsoredRail max={SPONSORED_MAX} />

        {/* ── Video Close-Ups — Reels style ── */}
        <div>
          <h2 className="text-base lg:text-xl font-bold text-gray-900 mb-2 lg:mb-4 px-1">Video Close-Ups</h2>
          <div
            ref={videoRailDrag.ref}
            className={cn("flex gap-3 lg:gap-5 overflow-x-auto pb-1 scrollbar-hide px-1", videoRailDrag.className)}
            onMouseDown={videoRailDrag.onMouseDown}
            onMouseMove={videoRailDrag.onMouseMove}
            onMouseUp={videoRailDrag.onMouseUp}
            onMouseLeave={videoRailDrag.onMouseLeave}
            onClickCapture={videoRailDrag.onClickCapture}
          >
            {rankedVideoCloseUps.map((v, i) => (
              <button
                key={v.id}
                onClick={() => { setVideoStartIndex(i); setVideoViewerOpen(true); }}
                className="relative shrink-0 w-36 lg:w-56 aspect-[3/4] rounded-md overflow-hidden bg-gray-100"
              >
                <img src={v.thumbnail} alt={v.brandLine} className="w-full h-full object-cover" />
                {/* Bottom gradient only — keeps the image clear, just ensures the text below stays legible */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 via-black/10 to-transparent pointer-events-none" />
                {/* Small play indicator, corner-placed instead of a large centered overlay */}
                <div className="absolute top-2 lg:top-3 right-2 lg:right-3 w-6 lg:w-8 h-6 lg:h-8 bg-white/85 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <Play className="w-2.5 lg:w-3.5 h-2.5 lg:h-3.5 text-gray-900 fill-gray-900" />
                </div>
                <div className="absolute bottom-2 lg:bottom-3 left-2 lg:left-3 right-2 lg:right-3">
                  <p className="text-[10px] lg:text-xs font-bold text-white truncate drop-shadow">{v.category}</p>
                  <p className="text-[10px] lg:text-xs text-white/90 drop-shadow">{v.price}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Looking for these? */}
          <h3 className="text-sm lg:text-lg font-bold text-gray-900 mt-4 lg:mt-6 mb-2 lg:mb-4 px-1">Looking for these?</h3>
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-4">
            {LOOKING_FOR_THESE.map((item, i) => (
              <Link
                key={item.id}
                to={`/product/${item.id}`}
                className={cn("rounded-lg overflow-hidden border border-gray-100", i >= 3 && "hidden lg:block")}
              >
                <div className="relative aspect-square bg-gray-100">
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  <div className="absolute bottom-1 left-1 flex items-center gap-0.5 bg-white/90 rounded-full px-1 py-0.5">
                    <Star className="w-2 h-2 text-yellow-400 fill-yellow-400" />
                    <span className="text-[7px] lg:text-[10px] font-bold">3.9</span>
                  </div>
                </div>
                <div className="p-1.5 lg:p-2.5">
                  <p className="text-[9px] lg:text-xs font-bold text-[#ef4d62] leading-tight">{item.price} | MOQ: {item.moq}</p>
                  <p className="text-[8px] lg:text-[11px] text-gray-400">{item.soldCount}</p>
                  <p className="text-[8px] lg:text-[11px] text-gray-500 truncate">{item.name} | <span className="font-bold">Manufacturer</span></p>
                  <button onClick={(e) => { e.preventDefault(); placeCall(item.name, demoPhone(item.id)); }} className="mt-1 lg:mt-1.5 w-full flex items-center justify-center gap-1 bg-[#ef4d62] text-white text-[9px] lg:text-xs font-bold py-1.5 lg:py-2 rounded">
                    <Phone className="w-2.5 lg:w-3 h-2.5 lg:h-3" /> Call Now
                  </button>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Brand Picks — real paid ad campaigns ──
            Renders nothing when no vendor has a live campaign, same rule as
            SponsoredRail: a sponsored rail with no sponsors should be absent,
            not filled with placeholders. */}
        {brandPicks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 lg:mb-4 px-1">
            <h2 className="text-base lg:text-xl font-bold text-gray-900">Brand Picks</h2>
            <ChevronRight className="w-4 lg:w-5 h-4 lg:h-5 text-gray-400" />
          </div>
          <p className="text-[10px] lg:text-xs text-gray-300 px-1 mb-2">sponsored</p>
          <div
            ref={brandPicksDrag.ref}
            className={cn("flex gap-3 lg:gap-5 overflow-x-auto pb-1 px-1 scrollbar-hide", brandPicksDrag.className)}
            onMouseDown={brandPicksDrag.onMouseDown}
            onMouseMove={brandPicksDrag.onMouseMove}
            onMouseUp={brandPicksDrag.onMouseUp}
            onMouseLeave={brandPicksDrag.onMouseLeave}
            onClickCapture={brandPicksDrag.onClickCapture}
          >
            {/* Card body and Call Now are siblings, not nested buttons — the
                old markup nested a button inside a Link, which is invalid. */}
            {brandPicks.map((a) => (
              <div key={a.adId} className="shrink-0 w-32 lg:w-48">
                <button onClick={() => openAd(a)} className="w-full text-left">
                  <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 mb-1.5 lg:mb-2.5">
                    {a.imageUrl && <img src={a.imageUrl} alt={a.productName ?? a.title} className="w-full h-full object-cover" loading="lazy" />}
                  </div>
                  <p className="text-[10px] lg:text-sm font-semibold text-gray-700 truncate">{a.productName ?? a.title}</p>
                  <p className="text-[10px] lg:text-sm font-semibold text-gray-700 truncate">{a.categoryName ?? a.vendorName ?? ""}</p>
                  <p className="text-[10px] lg:text-sm font-semibold text-gray-700">{a.price ?? ""}</p>
                </button>
                <button
                  onClick={() => { if (a.vendorId) void callVendor(a.vendorId, a.productName ?? a.title); }}
                  className="mt-1.5 lg:mt-2.5 w-full flex items-center justify-center gap-1 bg-[#ef4d62] text-white text-[9px] lg:text-xs font-bold py-1.5 lg:py-2 rounded"
                >
                  <Phone className="w-2.5 lg:w-3 h-2.5 lg:h-3" /> Call Now
                </button>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* ── Today's New In + first 2 rows + Submit Requirement Box + more rows ── */}
        <div>
          <div className="flex items-center justify-between mb-2 lg:mb-4 px-1">
            <div>
              <h2 className="text-base lg:text-xl font-bold text-gray-900">Today's New In</h2>
            </div>
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("2-col")}
                className={cn("p-1.5 lg:p-2 rounded-md transition-colors", viewMode === "2-col" ? "bg-[#ef4d62] text-white" : "text-gray-400")}
              >
                <Grid2X2 className="w-3.5 lg:w-4 h-3.5 lg:h-4" />
              </button>
              <button
                onClick={() => setViewMode("3-col")}
                className={cn("p-1.5 lg:p-2 rounded-md transition-colors", viewMode === "3-col" ? "bg-[#ef4d62] text-white" : "text-gray-400")}
              >
                <Grid3X3 className="w-3.5 lg:w-4 h-3.5 lg:h-4" />
              </button>
            </div>
          </div>

          {/* One continuous grid so a mobile-only (`lg:hidden`) Submit Requirement
              card can collapse out of the desktop grid without leaving a gap. */}
          <div className={cn(
            "grid gap-3 lg:gap-5",
            viewMode === "2-col" ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3 lg:grid-cols-6"
          )}>
            {feedNodes}
          </div>

          <div ref={loadMoreRef} className="py-6 text-center text-xs lg:text-sm text-gray-400">
            {isLoadingMore ? "Loading more products..." : "Scroll for more"}
          </div>
        </div>

        {/* ── Personalized recommendations ── */}
        <div>
          <p className="text-sm lg:text-base mb-2 lg:mb-4 px-1">
            <Link to="/profile" className="text-blue-600 font-semibold hover:underline">{firstName}</Link>
            <span className="text-gray-900 font-bold">, we recommend</span>
            <span className="float-right text-[10px] lg:text-xs text-gray-300 font-semibold">AD</span>
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
            {products.slice(0, 4).map(p => <ProductCard key={"rec-" + p.id} product={p} />)}
          </div>
        </div>

        {/* ── Recommended Premium Brands — real vendors ──
            Ranked paid-plan-first, then rating (see useTopVendors). There is
            no vendor-level ad placement to sell yet, so the old "AD" label is
            dropped: this is a merit ranking, not paid inventory. Labelling it
            AD would misrepresent it. */}
        {topVendors.length > 0 && (
        <div>
          <h2 className="text-base lg:text-xl font-bold text-gray-900 mb-1 lg:mb-2 px-1">Recommended Premium Brands</h2>
          <p className="text-[10px] lg:text-xs text-gray-400 px-1 mb-2 lg:mb-4">Top-rated verified suppliers on Cosora</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
            {topVendors.map((v) => (
              <Link key={v.id} to={`/vendor/${v.id}`} className="relative rounded-xl overflow-hidden aspect-square bg-gray-100">
                {v.imageUrl && <img src={v.imageUrl} alt={v.brandName} className="w-full h-full object-cover" loading="lazy" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                {v.verified && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-0.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] lg:text-[10px] font-bold text-[#14ae5c]">
                    <BadgeCheck className="w-2.5 lg:w-3 h-2.5 lg:h-3" /> Verified
                  </span>
                )}
                <div className="absolute bottom-2 lg:bottom-4 left-2 lg:left-4 right-2">
                  <p className="text-xs lg:text-base font-bold text-white truncate">{v.brandName}</p>
                  {v.city && <p className="text-[10px] lg:text-xs text-white/80 truncate">{v.city}</p>}
                  <p className="inline-flex items-center gap-0.5 text-xs lg:text-base font-bold text-white">
                    <Star className="w-2.5 lg:w-3.5 h-2.5 lg:h-3.5 text-yellow-400 fill-yellow-400" />
                    {v.ratingAvg.toFixed(1)}
                    <span className="font-normal text-[10px] lg:text-xs text-white/70"> · {v.liveProducts} products</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
        )}

      </div>

      <QuickRfqModal isOpen={quickRfqOpen} onClose={() => setQuickRfqOpen(false)} />
      <VideoCloseUpsViewer
        videos={rankedVideoCloseUps}
        initialIndex={videoStartIndex}
        isOpen={videoViewerOpen}
        onClose={() => setVideoViewerOpen(false)}
        onBookmarkChange={setBookmarkedVideoIds}
      />
    </BuyerShell>
  );
};

export default NewArrivals;