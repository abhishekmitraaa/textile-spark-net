import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BuyerShell from "@/components/buyer/BuyerShell";
import EverydayFashionHero from "@/components/buyer/EverydayFashionHero";
import QuickRfqModal from "@/components/buyer/QuickRfqModal";
import VideoCloseUpsViewer, { type VideoCloseUp } from "@/components/buyer/VideoCloseUpsViewer";
import { Bookmark, BookmarkCheck, ChevronRight, Grid2X2, Grid3X3, MapPin, Phone, Play, Star, Zap, FileText, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import trustedSeal from "@/assets/Trustedseal.png";

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: "Women's Apparel",  image: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=200&h=200&fit=crop" },
  { name: "Men's Apparel",    image: "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=200&h=200&fit=crop" },
  { name: "Men's Jeans",      image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=200&h=200&fit=crop" },
  { name: "Men's Shirt",      image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=200&h=200&fit=crop" },
  { name: "Accessories",      image: "https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=200&h=200&fit=crop" },
  { name: "Women's Trousers", image: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=200&h=200&fit=crop" },
  { name: "Women's T-shirts", image: "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=200&h=200&fit=crop" },
  { name: "Women's Shoes",    image: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=200&h=200&fit=crop" },
  { name: "Kidswear",         image: "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=200&h=200&fit=crop" },
  { name: "Ethnic Wear",      image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=200&h=200&fit=crop" },
  { name: "Activewear",       image: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=200&h=200&fit=crop" },
  { name: "Winter Wear",      image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=200&h=200&fit=crop" },
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

const VIDEO_CLOSE_UPS: VideoCloseUp[] = [
  { id: "vid1", vendorId: "v5", category: "Jeans", brandName: "Nam Pyunghwa / FORCE", brandLine: "Straight Fit Denim", price: "$6.78",  moq: "2", rating: 3.8, reviews: "1.6k", thumbnail: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=500&h=650&fit=crop" },
  { id: "vid2", vendorId: "v6", category: "T-shirts/Tops", brandName: "Nam Pyunghwa / FORCE", brandLine: "Oversized Graphic Tee", price: "$16.37", moq: "2", rating: 3.8, reviews: "1.6k", thumbnail: "https://images.unsplash.com/photo-1622445275576-721325763afe?w=500&h=650&fit=crop" },
  { id: "vid3", vendorId: "v7", category: "Jeans", brandName: "Tiruppur Mills", brandLine: "Slim Fit Stretch Jeans", price: "$26.71", moq: "2", rating: 4.2, reviews: "2.1k", thumbnail: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&h=650&fit=crop" },
];

const LOOKING_FOR_THESE = [
  { id: "lft1", name: "Floral Midi Dress",   price: "$499", moq: "2", soldCount: "800+ sold", image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&h=520&fit=crop" },
  { id: "lft2", name: "Quilted Crossbody",   price: "$499", moq: "2", soldCount: "800+ sold", image: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=400&h=520&fit=crop" },
  { id: "lft3", name: "Polka Dot Sundress",  price: "$499", moq: "2", soldCount: "800+ sold", image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=520&fit=crop" },
];

const BRAND_PICKS = [
  { name: "THEOT / J mering...",        category: "Shirts",            price: "$27.53", image: "https://images.unsplash.com/photo-1551489186-cf8726f514f8?w=300&h=380&fit=crop" },
  { name: "Queen's Square /...",        category: "Knitwear/Sweaters", price: "$20.09", image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=300&h=380&fit=crop" },
  { name: "THEOT / high tou...",        category: "Blouses",           price: "$17.11", image: "https://images.unsplash.com/photo-1551803091-e20673f15770?w=300&h=380&fit=crop" },
];

const PREMIUM_BRANDS = [
  { name: "Long Dresses",  moq: "MOQ:2", price: "$10.41", image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=300&h=380&fit=crop" },
  { name: "Cotton Pants",  moq: "MOQ:2", price: "$14.88", image: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=300&h=380&fit=crop" },
  { name: "Knit Sets",     moq: "MOQ:2", price: "$12.30", image: "https://images.unsplash.com/photo-1551489186-cf8726f514f8?w=300&h=380&fit=crop" },
  { name: "Denim Shirts",  moq: "MOQ:2", price: "$18.20", image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=300&h=380&fit=crop" },
];

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
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
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

        {product.verified && (
          <img
            src={trustedSeal}
            alt="TrustedSEAL verified vendor"
            className="absolute top-2 lg:top-3 left-2 lg:left-3 h-4 lg:h-5 w-auto rounded shadow-sm"
          />
        )}

        <button
          onClick={e => { e.preventDefault(); setSaved(p => !p); }}
          className="absolute top-2 lg:top-3 right-2 lg:right-3 w-7 lg:w-9 h-7 lg:h-9 bg-white/90 rounded-full flex items-center justify-center shadow-sm"
        >
          {saved ? <BookmarkCheck className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-[#256fef] fill-blue-100" /> : <Bookmark className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-gray-500" />}
        </button>

        <div className="absolute bottom-2 lg:bottom-3 left-2 lg:left-3 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 lg:px-2 py-0.5 lg:py-1">
          <Star className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-yellow-400 fill-yellow-400" />
          <span className="text-[9px] lg:text-xs font-bold text-gray-800">{product.rating}</span>
          <span className="text-[9px] lg:text-xs text-gray-400">| {product.enquiries}</span>
        </div>
      </Link>

      <div className="p-2 lg:p-3.5">
        <p className="text-xs lg:text-sm font-bold text-[#ef4d62] leading-snug">
          {product.price} | MOQ: {product.moq} | {product.soldCount}
        </p>
        <p className="text-[10px] lg:text-xs text-gray-600 mt-1 lg:mt-1.5">
          Product name | <Link to={`/vendor/${product.vendorId}`} className="font-bold hover:underline">{product.manufacturer}</Link>
        </p>
        <div className="flex items-center gap-0.5 mt-1 lg:mt-1.5">
          <MapPin className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-gray-500 shrink-0" />
          <span className="text-[10px] lg:text-xs font-bold text-gray-700">{product.location}</span>
        </div>
        <p className="text-[10px] lg:text-xs text-gray-500 mt-1 lg:mt-1.5">Fabric: {product.fabric} | GSM: {product.gsm}</p>
        <p className="text-[10px] lg:text-xs text-gray-500 mt-0.5">Fit Type: {product.fitType}</p>

        <button
          onClick={() => navigate(`/chats/${product.vendorId}`)}
          className="mt-2 lg:mt-3 w-full flex items-center justify-center gap-1.5 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-xs lg:text-sm font-bold py-2 lg:py-2.5 rounded-lg transition-colors"
        >
          <Phone className="w-3 lg:w-3.5 h-3 lg:h-3.5" /> Call Now
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBMIT REQUIREMENT BOX — appears after every 5 product rows
// ─────────────────────────────────────────────────────────────

function SubmitRequirementBox({ onQuickRfq }: { onQuickRfq: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      <div className="px-4 py-3.5 border-b border-gray-100">
        <h3 className="text-base font-bold text-gray-900">Looking for products?</h3>
        <p className="text-xs text-gray-500 mt-0.5">Get quotes from verified manufacturers</p>
      </div>
      <div className="p-4">
        <Link to="/requirement/post-requirement">
          <button className="w-full py-3 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold rounded-xl transition-colors mb-3">
            Submit Requirement
          </button>
        </Link>

        <button onClick={onQuickRfq} className="w-full flex items-center justify-between py-2.5 border-b border-gray-100 text-left">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-[#ef4d62] fill-[#ef4d62] shrink-0" />
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-gray-900">Quick RFQ</p>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-[#ef4d62]/10 text-[#ef4d62] px-1.5 py-0.5 rounded">Fast</span>
              </div>
              <p className="text-xs text-gray-400">Just upload an image + quantity. Get quotes in minutes!</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
        </button>

        <Link to="/requirement/post-requirement" className="flex items-center justify-between py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <ClipboardList className="w-4 h-4 text-blue-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Create New Requirement</p>
              <p className="text-xs text-gray-400">Detailed specifications for precise quotes</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
        </Link>

        <Link to="/requirement/my-quotes" className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-gray-500 shrink-0" />
            <p className="text-sm font-semibold text-gray-900">My Previous Quotes</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const NewArrivals = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"2-col" | "3-col">("2-col");
  const [batchCount, setBatchCount] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [quickRfqOpen, setQuickRfqOpen] = useState(false);
  const [videoViewerOpen, setVideoViewerOpen] = useState(false);
  const [videoStartIndex, setVideoStartIndex] = useState(0);
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

  const products = useMemo(
    () => Array.from({ length: batchCount }, (_, b) =>
      BASE_PRODUCTS.map(p => ({ ...p, id: `${p.id}-${b}`, vendorId: `${p.vendorId}-${b}` }))
    ).flat(),
    [batchCount]
  );

  // 5 rows per chunk, derived from the active column count (toggle-reactive).
  // Mobile cols are 2 or 3; desktop uses the same chunk size which means the
  // box appears slightly more often on wide screens. Mobile is primary.
  const cols = viewMode === "2-col" ? 2 : 3;
  const productsPerChunk = 5 * cols;
  const chunks: Product[][] = [];
  for (let i = 0; i < products.length; i += productsPerChunk) {
    chunks.push(products.slice(i, i + productsPerChunk));
  }

  return (
    <BuyerShell>
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-3">
        {/* ── Home tabs ── */}
        <div className="flex gap-4 lg:gap-7 overflow-x-auto pb-2 mb-3 border-b border-gray-100 scrollbar-hide">
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
              {tab.href === "/home/new-arrivals" && "✦ "}{tab.label}
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
            className="grid grid-flow-col grid-rows-2 auto-cols-[22%] lg:auto-cols-[11.5%] gap-3 lg:gap-5 overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory pb-1 -mx-1 px-1"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
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
          <div className="flex items-center justify-center gap-2 mt-3 lg:mt-5 text-[10px] lg:text-xs font-bold text-gray-300 tracking-widest">
            <span>&lt;</span>
            <span>SLIDE TO SEE</span>
            <span>&gt;</span>
          </div>
        </div>

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

          {chunks.map((chunk, chunkIdx) => (
            <div key={chunkIdx}>
              <div className={cn(
                "grid gap-3 lg:gap-5",
                viewMode === "2-col" ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3 lg:grid-cols-6"
              )}>
                {chunk.map(product => <ProductCard key={product.id} product={product} />)}
              </div>
              {/* Submit Requirement box after every chunk (≈5 rows) */}
              <div className="mt-4 lg:mt-6 mb-1 lg:max-w-md">
                <SubmitRequirementBox onQuickRfq={() => setQuickRfqOpen(true)} />
              </div>
            </div>
          ))}

          <div ref={loadMoreRef} className="py-6 text-center text-xs lg:text-sm text-gray-400">
            {isLoadingMore ? "Loading more products..." : "Scroll for more"}
          </div>
        </div>

        {/* ── Personalized recommendations ── */}
        <div>
          <p className="text-sm lg:text-base mb-2 lg:mb-4 px-1">
            <Link to="/profile" className="text-blue-600 font-semibold hover:underline">andymitra07</Link>
            <span className="text-gray-900 font-bold">, we recommend</span>
            <span className="float-right text-[10px] lg:text-xs text-gray-300 font-semibold">AD</span>
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
            {BASE_PRODUCTS.map(p => <ProductCard key={"rec-" + p.id} product={{ ...p, id: "rec-" + p.id }} />)}
          </div>
        </div>

        {/* ── Video Close-Ups — Reels style ── */}
        <div>
          <h2 className="text-base lg:text-xl font-bold text-gray-900 mb-2 lg:mb-4 px-1">Video Close-Ups</h2>
          <div className="flex gap-2.5 lg:gap-4 overflow-x-auto pb-1 scrollbar-hide px-1">
            {VIDEO_CLOSE_UPS.map((v, i) => (
              <button
                key={v.id}
                onClick={() => { setVideoStartIndex(i); setVideoViewerOpen(true); }}
                className="relative shrink-0 w-28 lg:w-44 aspect-[3/4] rounded-xl overflow-hidden bg-gray-100"
              >
                <img src={v.thumbnail} alt={v.brandLine} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                  <div className="w-8 lg:w-12 h-8 lg:h-12 bg-white/30 rounded-full flex items-center justify-center backdrop-blur-sm">
                    <Play className="w-3.5 lg:w-5 h-3.5 lg:h-5 text-white fill-white" />
                  </div>
                </div>
                <div className="absolute bottom-1.5 lg:bottom-3 left-1.5 lg:left-3 right-1.5 lg:right-3">
                  <p className="text-[9px] lg:text-xs font-bold text-white truncate drop-shadow">{v.category}</p>
                  <p className="text-[9px] lg:text-xs text-white/90 drop-shadow">{v.price}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Looking for these? */}
          <h3 className="text-sm lg:text-lg font-bold text-gray-900 mt-4 lg:mt-6 mb-2 lg:mb-4 px-1">Looking for these?</h3>
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-4">
            {LOOKING_FOR_THESE.map(item => (
              <Link key={item.id} to={`/product/${item.id}`} className="rounded-lg overflow-hidden border border-gray-100">
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
                  <p className="text-[8px] lg:text-[11px] text-gray-500 truncate">Product name | <span className="font-bold">Manufacturer</span></p>
                  <button className="mt-1 lg:mt-1.5 w-full flex items-center justify-center gap-1 bg-[#ef4d62] text-white text-[9px] lg:text-xs font-bold py-1.5 lg:py-2 rounded">
                    <Phone className="w-2.5 lg:w-3 h-2.5 lg:h-3" /> Call Now
                  </button>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Brand Picks — sponsored ── */}
        <div>
          <div className="flex items-center justify-between mb-2 lg:mb-4 px-1">
            <h2 className="text-base lg:text-xl font-bold text-gray-900">Brand Picks</h2>
            <ChevronRight className="w-4 lg:w-5 h-4 lg:h-5 text-gray-400" />
          </div>
          <p className="text-[10px] lg:text-xs text-gray-300 px-1 mb-2">sponsored</p>
          <div className="flex gap-3 lg:gap-5 overflow-x-auto pb-1 px-1 scrollbar-hide">
            {BRAND_PICKS.map((b, i) => (
              <Link key={i} to="/search/results" className="shrink-0 w-32 lg:w-48">
                <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 mb-1.5 lg:mb-2.5">
                  <img src={b.image} alt={b.name} className="w-full h-full object-cover" />
                </div>
                <p className="text-[10px] lg:text-sm font-semibold text-gray-700 truncate">{b.name}</p>
                <p className="text-[10px] lg:text-sm font-semibold text-gray-700">{b.category}</p>
                <p className="text-[10px] lg:text-sm font-semibold text-gray-700">{b.price}</p>
                <button className="mt-1.5 lg:mt-2.5 w-full flex items-center justify-center gap-1 bg-[#ef4d62] text-white text-[9px] lg:text-xs font-bold py-1.5 lg:py-2 rounded">
                  <Phone className="w-2.5 lg:w-3 h-2.5 lg:h-3" /> Call Now
                </button>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Recommended Premium Brands ── */}
        <div>
          <h2 className="text-base lg:text-xl font-bold text-gray-900 mb-1 lg:mb-2 px-1">Recommended Premium Brands</h2>
          <p className="text-[10px] lg:text-xs text-gray-300 px-1 mb-2 lg:mb-4">AD</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
            {PREMIUM_BRANDS.map((b, i) => (
              <Link key={i} to="/vendor/premium-1" className="relative rounded-xl overflow-hidden aspect-square">
                <img src={b.image} alt={b.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-2 lg:bottom-4 left-2 lg:left-4">
                  <p className="text-xs lg:text-base font-bold text-white">{b.name}</p>
                  <p className="text-[10px] lg:text-xs text-white/80">{b.moq}</p>
                  <p className="text-xs lg:text-base font-bold text-white">{b.price}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>

      <QuickRfqModal isOpen={quickRfqOpen} onClose={() => setQuickRfqOpen(false)} />
      <VideoCloseUpsViewer
        videos={VIDEO_CLOSE_UPS}
        initialIndex={videoStartIndex}
        isOpen={videoViewerOpen}
        onClose={() => setVideoViewerOpen(false)}
      />
    </BuyerShell>
  );
};

export default NewArrivals;
