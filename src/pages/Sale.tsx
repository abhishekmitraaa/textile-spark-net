import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useT } from "@/lib/i18n";
import BuyerShell from "@/components/buyer/BuyerShell";
import QuickRfqModal from "@/components/buyer/QuickRfqModal";
import SubmitRequirementCard from "@/components/buyer/SubmitRequirementCard";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bookmark, BookmarkCheck, MapPin, Phone, Star, Zap, Clock, Grid2X2, Grid3X3,
  ChevronDown, Check, Tag, Flame, ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import { useLiveProducts, filterSale, type ProductCardData } from "@/lib/queries/products";
import { useCallVendor } from "@/lib/queries/calls";
import trustedSeal from "@/assets/Trustedseal.png";

// ─────────────────────────────────────────────────────────────
// Animation constants (project convention)
// ─────────────────────────────────────────────────────────────
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };
const listContainer = { show: { transition: { staggerChildren: 0.04 } } };
const listItem = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } } };

const HOME_TABS = [
  { label: "NEW ARRIVALS", href: "/home/new-arrivals" },
  { label: "TRENDS", href: "/home/trends" },
  { label: "SALE", href: "/home/sale" },
  { label: "FOR YOU", href: "/home/for-you" },
  { label: "FOLLOWINGS", href: "/home/followings" },
];

// Sale windows fixed once per session so the countdown ticks consistently.
const HERO_END = Date.now() + 2 * 24 * 3600_000 + 8 * 3600_000; // ~2 days 8h
const FLASH_END = Date.now() + 5 * 3600_000 + 42 * 60_000;      // ~5h 42m

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────
interface SaleProduct {
  id: string;
  vendorId: string;
  name: string;
  manufacturer: string;
  location: string;
  originalValue: number;
  saleValue: number;
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

const discountOf = (p: SaleProduct) => Math.round(((p.originalValue - p.saleValue) / p.originalValue) * 100);

const BASE_SALE: SaleProduct[] = [
  { id: "s1", vendorId: "v1", name: "Ribbed Tank Top", manufacturer: "Tirupur Textiles", location: "Tirupur", originalValue: 499, saleValue: 299, moq: "MOQ: 50", soldCount: "800+ sold", enquiries: "5.6k", rating: 4.3, fabric: "Cotton", gsm: "200", fitType: "Regular", image: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=500&h=650&fit=crop", verified: true },
  { id: "s2", vendorId: "v2", name: "Camp Collar Shirt", manufacturer: "Mumbai Linen House", location: "Mumbai", originalValue: 899, saleValue: 629, moq: "MOQ: 30", soldCount: "1.2k sold", enquiries: "1.8k", rating: 4.0, fabric: "Linen", gsm: "180", fitType: "Regular", image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&h=650&fit=crop" },
  { id: "s3", vendorId: "v3", name: "Denim Jacket 12 Oz", manufacturer: "Ahmedabad Denim Co.", location: "Ahmedabad", originalValue: 1499, saleValue: 599, moq: "MOQ: 40", soldCount: "600+ sold", enquiries: "3.1k", rating: 4.6, fabric: "Denim", gsm: "340", fitType: "Regular", image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=500&h=650&fit=crop", verified: true },
  { id: "s4", vendorId: "v4", name: "Graphic Print Tee", manufacturer: "StyleCraft Apparels", location: "Bangalore", originalValue: 399, saleValue: 319, moq: "MOQ: 100", soldCount: "2.4k sold", enquiries: "1.6k", rating: 3.9, fabric: "Cotton", gsm: "180", fitType: "Regular", image: "https://images.unsplash.com/photo-1622445275576-721325763afe?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=500&h=650&fit=crop" },
  { id: "s5", vendorId: "v5", name: "Oversized Crewneck", manufacturer: "Delhi Fashion Hub", location: "Delhi NCR", originalValue: 1199, saleValue: 479, moq: "MOQ: 25", soldCount: "900+ sold", enquiries: "2.2k", rating: 4.4, fabric: "Fleece", gsm: "320", fitType: "Oversized", image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=500&h=650&fit=crop", verified: true },
  { id: "s6", vendorId: "v6", name: "Pleated Midi Skirt", manufacturer: "Surat Studio Kintsugi", location: "Surat", originalValue: 799, saleValue: 559, moq: "MOQ: 50", soldCount: "500+ sold", enquiries: "980", rating: 4.1, fabric: "Rayon", gsm: "160", fitType: "Regular", image: "https://images.unsplash.com/photo-1583496661160-fb5886a13d27?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=500&h=650&fit=crop" },
  { id: "s7", vendorId: "v7", name: "Cargo Joggers", manufacturer: "Ludhiana Active Wear", location: "Ludhiana", originalValue: 899, saleValue: 359, moq: "MOQ: 60", soldCount: "1.5k sold", enquiries: "1.4k", rating: 4.2, fabric: "Cotton", gsm: "240", fitType: "Regular", image: "https://images.unsplash.com/photo-1556906781-9a412961c28c?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=500&h=650&fit=crop", verified: true },
  { id: "s8", vendorId: "v8", name: "Formal Cotton Shirt", manufacturer: "Bangalore Apparel", location: "Bangalore", originalValue: 699, saleValue: 559, moq: "MOQ: 100", soldCount: "780+ sold", enquiries: "760", rating: 4.5, fabric: "Cotton", gsm: "200", fitType: "Slim", image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&h=650&fit=crop", secondaryImage: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=500&h=650&fit=crop" },
];

// Map a live discounted product (compare_at_price above the live price) into
// the sale-card shape. The live price is the sale price; compare is the original.
function toSale(p: ProductCardData): SaleProduct {
  return {
    id: p.id,
    vendorId: p.vendorId,
    name: p.name,
    manufacturer: p.manufacturer,
    location: p.location,
    originalValue: p.compareAtPrice ?? p.priceValue,
    saleValue: p.priceValue,
    moq: `MOQ: ${p.moq}`,
    soldCount: p.soldCount,
    enquiries: p.enquiries,
    rating: p.rating,
    fabric: p.fabric,
    gsm: p.gsm,
    fitType: p.fitType,
    image: p.image,
    secondaryImage: p.secondaryImage,
    verified: p.verified,
  };
}

const TIERS = [
  { key: "all", label: "All Deals", test: () => true },
  { key: "lt25", label: "Up to 25%", test: (d: number) => d <= 25 },
  { key: "25-50", label: "25–50% off", test: (d: number) => d > 25 && d <= 50 },
  { key: "gt50", label: "50% & above", test: (d: number) => d > 50 },
] as const;

const SORTS = [
  { key: "discount", label: "Biggest Discount" },
  { key: "price-asc", label: "Price: Low to High" },
  { key: "price-desc", label: "Price: High to Low" },
] as const;

// ─────────────────────────────────────────────────────────────
// Live countdown
// ─────────────────────────────────────────────────────────────
function useTick() {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
}

function Countdown({ target, showDays = false, tone = "light" }: { target: number; showDays?: boolean; tone?: "light" | "coral" }) {
  useTick();
  const diff = Math.max(0, target - Date.now());
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const cells = showDays
    ? [{ v: pad(d), l: "Days" }, { v: pad(h), l: "Hrs" }, { v: pad(m), l: "Min" }, { v: pad(s), l: "Sec" }]
    : [{ v: pad(h), l: "Hrs" }, { v: pad(m), l: "Min" }, { v: pad(s), l: "Sec" }];

  return (
    <div className="flex items-center gap-1.5">
      {cells.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="flex flex-col items-center">
            <span className={cn(
              "min-w-[2.1rem] rounded-md px-1.5 py-1 text-center text-sm font-bold tabular-nums",
              tone === "light" ? "bg-white/20 text-white" : "bg-[#ef4d62] text-white"
            )}>
              {c.v}
            </span>
            <span className={cn("mt-0.5 text-[8px] font-semibold uppercase tracking-wider", tone === "light" ? "text-white/70" : "text-gray-400")}>{c.l}</span>
          </div>
          {i < cells.length - 1 && <span className={cn("text-sm font-bold", tone === "light" ? "text-white/60" : "text-gray-300")}>:</span>}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sale product card
// ─────────────────────────────────────────────────────────────
function SaleCard({ product, compact = false }: { product: SaleProduct; compact?: boolean }) {
  const callVendor = useCallVendor();
  const saved = useSaved();
  const isSaved = Boolean(saved.products[product.id]);
  const [hovered, setHovered] = useState(false);
  const discount = discountOf(product);

  return (
    <div
      className="rounded-xl border border-gray-200 overflow-hidden bg-white"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to={`/product/${product.id}`} className="relative aspect-[4/5] block bg-gray-100">
        <img src={product.image} alt={product.name} className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", hovered ? "opacity-0" : "opacity-100")} />
        <img src={product.secondaryImage} alt="" className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", hovered ? "opacity-100" : "opacity-0")} />

        {/* Discount badge */}
        <span className="absolute top-0 left-0 rounded-br-xl bg-[#ef4d62] px-2 py-1 text-[10px] lg:text-xs font-extrabold text-white shadow-sm">
          {discount}% OFF
        </span>

        {/* TrustedSEAL for verified vendors */}
        {product.verified && (
          <img src={trustedSeal} alt="TrustedSEAL verified vendor" className="absolute top-8 lg:top-9 left-1.5 h-4 lg:h-5 w-auto rounded shadow-sm" />
        )}

        <div className="absolute bottom-1.5 right-1.5 lg:bottom-2 lg:right-2 text-[8px] lg:text-[10px] font-semibold text-white/70 bg-black/30 px-1.5 lg:px-2 py-0.5 rounded">COSORA</div>

        <button
          onClick={(e) => { e.preventDefault(); openSaveModal({ ...product, price: `₹${product.saleValue}`, priceValue: product.saleValue }); }}
          className="absolute top-2 lg:top-3 right-2 lg:right-3 w-7 lg:w-9 h-7 lg:h-9 bg-white/90 rounded-full flex items-center justify-center shadow-sm"
          aria-label={isSaved ? "Edit saved folders" : "Save product"}
        >
          {isSaved ? <BookmarkCheck className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-gray-500" />}
        </button>

        <div className="absolute bottom-2 lg:bottom-3 left-2 lg:left-3 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 lg:px-2 py-0.5 lg:py-1">
          <Star className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-yellow-400 fill-yellow-400" />
          <span className="text-[9px] lg:text-xs font-bold text-gray-800">{product.rating.toFixed(1)}</span>
          <span className="text-[9px] lg:text-xs text-gray-400">| {product.enquiries}</span>
        </div>
      </Link>

      <div className={cn(compact ? "p-2" : "p-2 lg:p-3.5")}>
        {/* Price line: sale + struck-through original + MOQ */}
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm lg:text-base font-extrabold text-[#ef4d62] leading-none">₹{product.saleValue}</span>
          <span className="text-[10px] lg:text-xs text-gray-400 line-through">₹{product.originalValue}</span>
        </div>
        <p className="text-[10px] lg:text-xs text-gray-500 mt-1">{product.moq} | {product.soldCount}</p>
        <p className="text-[10px] lg:text-xs text-gray-600 mt-1">
          {product.name} | <Link to={`/vendor/${product.vendorId}`} className="font-bold hover:underline">{product.manufacturer}</Link>
        </p>
        <div className="flex items-center gap-0.5 mt-1">
          <MapPin className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-gray-500 shrink-0" />
          <span className="text-[10px] lg:text-xs font-bold text-gray-700">{product.location}</span>
        </div>
        {!compact && (
          <>
            <p className="text-[10px] lg:text-xs text-gray-500 mt-1">Fabric: {product.fabric} | GSM: {product.gsm}</p>
            <p className="text-[10px] lg:text-xs text-gray-500 mt-0.5">Fit Type: {product.fitType}</p>
          </>
        )}
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
const Sale = () => {
  const reduced = useReducedMotion();
  const t = useT();
  const [viewMode, setViewMode] = useState<"2-col" | "3-col">("2-col");
  const [tier, setTier] = useState<(typeof TIERS)[number]["key"]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("discount");
  const [batchCount, setBatchCount] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [quickRfqOpen, setQuickRfqOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Infinite scroll
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isLoadingMore) {
        setIsLoadingMore(true);
        window.setTimeout(() => { setBatchCount((c) => c + 1); setIsLoadingMore(false); }, 300);
      }
    }, { rootMargin: "200px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [isLoadingMore]);

  const activeTier = TIERS.find((t) => t.key === tier) ?? TIERS[0];

  // Real discounted catalogue; fall back to the seeded set only until it loads.
  const { data: live } = useLiveProducts();
  const saleAll = useMemo(() => {
    const real = filterSale(live ?? []).map(toSale);
    return real.length ? real : BASE_SALE;
  }, [live]);

  const flashDeals = useMemo(
    () => [...saleAll].sort((a, b) => discountOf(b) - discountOf(a)).slice(0, 6),
    [saleAll],
  );

  const products = useMemo(() => {
    let list = saleAll.filter((p) => activeTier.test(discountOf(p)));
    if (sort === "discount") list = [...list].sort((a, b) => discountOf(b) - discountOf(a));
    else if (sort === "price-asc") list = [...list].sort((a, b) => a.saleValue - b.saleValue);
    else if (sort === "price-desc") list = [...list].sort((a, b) => b.saleValue - a.saleValue);
    return list.slice(0, batchCount * 8);
  }, [saleAll, activeTier, sort, batchCount]);

  const maxDiscount = saleAll.length ? Math.max(...saleAll.map(discountOf)) : 0;

  // Interleave a Submit Requirement card every 5 rows. A row is `cols` cards on
  // mobile but `cols*2` on desktop, so the insert positions differ per breakpoint:
  // every (cols*5) products on mobile, every (cols*10) on desktop. Cards at a
  // desktop-interval multiple show on both; the in-between mobile multiples are
  // mobile-only (`lg:hidden`). Intervals follow the active 2-col/3-col toggle.
  const cols = viewMode === "2-col" ? 2 : 3;
  const mobileInterval = cols * 5;      // 10 (2-col) or 15 (3-col)
  const desktopInterval = cols * 2 * 5; // 20 (2-col) or 30 (3-col)
  const dealFeedNodes: JSX.Element[] = [];
  products.forEach((p, i) => {
    dealFeedNodes.push(
      <motion.div variants={reduced ? {} : listItem} key={p.id}>
        <SaleCard product={p} />
      </motion.div>
    );
    const n = i + 1;
    if (n >= products.length) return;
    if (n % desktopInterval === 0) {
      dealFeedNodes.push(
        <div key={`req-${i}`} className="col-span-full lg:max-w-4xl lg:mx-auto my-2 lg:my-4">
          <SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} />
        </div>
      );
    } else if (n % mobileInterval === 0) {
      dealFeedNodes.push(
        <div key={`req-m-${i}`} className="col-span-full lg:hidden my-2">
          <SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} />
        </div>
      );
    }
  });

  return (
    <BuyerShell>
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-3">
        {/* Home tabs */}
        <div className="flex justify-start lg:justify-center gap-4 lg:gap-7 overflow-x-auto pb-2 mb-3 border-b border-gray-100 scrollbar-hide">
          {HOME_TABS.map((tab) => (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                "text-xs lg:text-sm font-bold whitespace-nowrap pb-2 border-b-2 transition-colors shrink-0",
                tab.href === "/home/sale" ? "text-[#ef4d62] border-[#ef4d62]" : "text-gray-400 border-transparent hover:text-gray-600"
              )}
            >
              {t(tab.label)}
            </Link>
          ))}
        </div>
      </div>

      <motion.div
        className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 space-y-6 lg:space-y-9 pb-4"
        variants={reduced ? {} : page} initial="hidden" animate="show"
      >
        {/* ── HERO ── */}
        <motion.section variants={section} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#ef4d62] via-[#f0576b] to-[#ff8093] p-5 lg:p-8 text-white">
          {/* decorative glow */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-6 h-40 w-40 rounded-full bg-black/10 blur-2xl" />

          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] lg:text-xs font-bold uppercase tracking-wider backdrop-blur">
              <Flame className="w-3 h-3" /> Limited time
            </span>
            <h1 className="mt-3 text-3xl lg:text-5xl font-extrabold tracking-tight leading-none">MEGA SALE</h1>
            <p className="mt-2 text-sm lg:text-base font-medium text-white/90">
              Up to <span className="font-extrabold">{maxDiscount}% OFF</span> on bulk orders from verified manufacturers
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div>
                <p className="text-[10px] lg:text-xs font-semibold uppercase tracking-wider text-white/70 mb-1">Sale ends in</p>
                <Countdown target={HERO_END} showDays tone="light" />
              </div>
              <button
                onClick={() => setQuickRfqOpen(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#ef4d62] shadow-sm hover:bg-white/90 transition-colors"
              >
                <Zap className="w-4 h-4 fill-[#ef4d62]" /> Quick RFQ
              </button>
            </div>
          </div>
        </motion.section>

        {/* ── FLASH DEALS ── */}
        <motion.section variants={section}>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="inline-flex items-center gap-2 text-base lg:text-xl font-bold text-gray-900">
              <motion.span
                animate={reduced ? undefined : { scale: [1, 1.15, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                className="inline-flex"
              >
                <Zap className="w-5 h-5 text-[#ef4d62] fill-[#ef4d62]" />
              </motion.span>
              Flash Deals
            </h2>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#ef4d62]/5 border border-[#ef4d62]/20 px-2.5 py-1">
              <Clock className="w-3.5 h-3.5 text-[#ef4d62]" />
              <Countdown target={FLASH_END} tone="coral" />
            </div>
          </div>
          <motion.div variants={listContainer} className="flex gap-3 lg:gap-5 overflow-x-auto pb-1 px-1 scrollbar-hide snap-x snap-mandatory">
            {flashDeals.map((p) => (
              <motion.div variants={listItem} key={p.id} className="shrink-0 w-40 lg:w-56 snap-start">
                <SaleCard product={p} compact />
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* ── SHOP BY DISCOUNT ── */}
        <motion.section variants={section}>
          <h2 className="inline-flex items-center gap-2 text-base lg:text-xl font-bold text-gray-900 mb-3 px-1">
            <Tag className="w-4 h-4 text-[#ef4d62]" /> Shop by Discount
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1 px-1 scrollbar-hide">
            {TIERS.map((t) => {
              const active = t.key === tier;
              return (
                <button
                  key={t.key}
                  onClick={() => { setTier(t.key); setBatchCount(1); }}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95",
                    active ? "border-[#ef4d62] bg-[#ef4d62] text-white" : "border-gray-200 text-gray-600 hover:border-[#ef4d62]/40"
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* ── ALL DEALS FEED ── */}
        <motion.section variants={section}>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-base lg:text-xl font-bold text-gray-900">All Deals</h2>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:outline-none">
                  <ArrowUpDown className="w-3.5 h-3.5" /> {SORTS.find((s) => s.key === sort)?.label}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {SORTS.map((o) => (
                    <DropdownMenuItem key={o.key} onClick={() => setSort(o.key)} className="gap-2 text-sm">
                      <Check className={cn("w-4 h-4", sort === o.key ? "opacity-100 text-[#ef4d62]" : "opacity-0")} /> {o.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5">
                <button onClick={() => setViewMode("2-col")} aria-label="2 columns" className={cn("p-1.5 rounded-md transition-colors", viewMode === "2-col" ? "bg-[#ef4d62] text-white" : "text-gray-400")}>
                  <Grid2X2 className="w-3.5 lg:w-4 h-3.5 lg:h-4" />
                </button>
                <button onClick={() => setViewMode("3-col")} aria-label="3 columns" className={cn("p-1.5 rounded-md transition-colors", viewMode === "3-col" ? "bg-[#ef4d62] text-white" : "text-gray-400")}>
                  <Grid3X3 className="w-3.5 lg:w-4 h-3.5 lg:h-4" />
                </button>
              </div>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="py-16 text-center">
              <Tag className="w-9 h-9 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No deals in this range right now.</p>
              <button onClick={() => setTier("all")} className="mt-3 text-sm font-semibold text-[#ef4d62]">View all deals</button>
            </div>
          ) : (
            <motion.div
              key={`${tier}-${sort}`}
              variants={reduced ? {} : listContainer}
              initial="hidden"
              animate="show"
              className={cn("grid gap-3 lg:gap-5", viewMode === "2-col" ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3 lg:grid-cols-6")}
            >
              {dealFeedNodes}
            </motion.div>
          )}

          {/* Submit Requirement — same shared card + Quick RFQ modal as New Arrivals/Trends */}
          <div className="mt-6 lg:max-w-4xl lg:mx-auto">
            <SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} />
          </div>

          <div ref={loadMoreRef} className="py-6 text-center text-xs lg:text-sm text-gray-400">
            {isLoadingMore ? "Loading more deals..." : "Scroll for more"}
          </div>
        </motion.section>
      </motion.div>

      <QuickRfqModal isOpen={quickRfqOpen} onClose={() => setQuickRfqOpen(false)} />
    </BuyerShell>
  );
};

export default Sale;
