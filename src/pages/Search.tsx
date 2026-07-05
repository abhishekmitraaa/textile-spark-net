import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import ListingProductCard from "@/components/buyer/ListingProductCard";
import { makeListingProduct, type Gender, type ListingProduct } from "@/lib/listingProducts";
import { useLiveProducts, type ProductCardData } from "@/lib/queries/products";
import {
  ArrowLeft, Search as SearchIcon, Mic, Camera, ImagePlus, X, BadgeCheck,
  Gift, Truck, Shirt, Briefcase, Flame, TrendingUp, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CosoraLogo from "@/components/CosoraLogo";
import { useProfileState } from "@/lib/profileStore";
import { useAuth } from "@/contexts/AuthContext";
import { useSpeechSearch } from "@/hooks/useSpeechSearch";
import { supabase } from "@/lib/supabase";

// Keywords per trending chip, matched against a live product's category + name.
const CAT_KEYWORDS: Record<TrendCat, string[]> = {
  tshirt: ["t-shirt", "tee", "tank", "polo", "tops"],
  knit: ["knit", "cardigan", "sweater", "pullover"],
  windbreaker: ["jacket", "windbreaker", "puffer", "blazer"],
  skirt: ["skirt", "dress"],
  cargo: ["cargo", "trouser", "jean", "pant", "track", "jogger"],
};

function toListing(p: ProductCardData): ListingProduct {
  return makeListingProduct(p.id, {
    name: p.name, manufacturer: p.manufacturer, vendorId: p.vendorId, location: p.location,
    price: p.price, priceValue: p.priceValue, moq: `MOQ: ${p.moq}`, rating: p.rating,
    soldCount: p.soldCount, enquiries: p.enquiries, fabric: p.fabric, gsm: p.gsm, fitType: p.fitType,
    image: p.image, secondaryImage: p.secondaryImage, gender: (p.gender.toLowerCase() as Gender),
  });
}

// ─────────────────────────────────────────────────────────────
// Animation constants (project convention)
// ─────────────────────────────────────────────────────────────
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } } };
const section = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.32 } } };
const listContainer = { show: { transition: { staggerChildren: 0.04 } } };
const listItem = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } } };

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

// Numbered list shown before the user types. In production this should be
// refreshed DAILY from a trending-search job (e.g. Google Trends), not hardcoded.
const POPULAR_KEYWORDS = [
  "Cotton Dresses", "Tank Tops", "Windbreaker Jackets", "Bermuda Shorts", "Satin Blouses", "Linen Jackets",
  "Oversized Hoodies", "Cropped Cardigans", "Pleated Skorts", "Flip-Flops", "Bustier Tops", "Wide-Leg Trousers",
];
const POPULAR_PER_PAGE = 6;

type TrendCat = "tshirt" | "knit" | "windbreaker" | "skirt" | "cargo";

// Each trending keyword maps to a product category so selecting a chip filters
// the recommendation feed below it.
const TRENDING_KEYWORDS: { label: string; category: TrendCat; image: string }[] = [
  { label: "Functional T-shirt", category: "tshirt", image: "https://picsum.photos/seed/trend-tshirt/80/80" },
  { label: "Cropped Knit", category: "knit", image: "https://picsum.photos/seed/trend-knit/80/80" },
  { label: "Men's Windbreaker", category: "windbreaker", image: "https://picsum.photos/seed/trend-windbreaker/80/80" },
  { label: "Pleated Skirt", category: "skirt", image: "https://picsum.photos/seed/trend-skirt/80/80" },
  { label: "Cargo Pants", category: "cargo", image: "https://picsum.photos/seed/trend-cargo/80/80" },
];

// Product / category dictionary for the autocomplete dropdown (top 5 shown).
const SEARCH_SUGGESTIONS = [
  { term: "Tshirts For Men", count: 106347 },
  { term: "Handbags Women", count: 42073 },
  { term: "Handbags For Clothes", count: 2348215 },
  { term: "Handbags", count: 42145 },
  { term: "Hrx Shoes", count: 1219 },
  { term: "Highlander Shirts", count: 4624 },
  { term: "Women's Dresses", count: 88210 },
  { term: "Denim Jackets", count: 31456 },
  { term: "Ethnic Kurtas", count: 19872 },
  { term: "Activewear Leggings", count: 27310 },
];

// Brand / store dictionary (top 5 shown after products). `keywords` lets a short
// query (e.g. "Ha") surface a relevant storefront even when not a literal substring.
const BRAND_SUGGESTIONS = [
  { id: "hm-home", name: "H&M Home Brand Store", followers: 5893, verified: true, logo: "https://picsum.photos/seed/brand-hm-home/64/64", keywords: ["ha", "hm", "home"] },
  { id: "hm-season", name: "H&M New Season Styles", followers: 7654, verified: true, logo: "https://picsum.photos/seed/brand-hm-season/64/64", keywords: ["ha", "hm", "season", "new"] },
  { id: "zara", name: "Zara Essentials Studio", followers: 4218, verified: true, logo: "https://picsum.photos/seed/brand-zara/64/64", keywords: ["za", "essentials"] },
  { id: "levis", name: "Levi's Official Store", followers: 9027, verified: true, logo: "https://picsum.photos/seed/brand-levis/64/64", keywords: ["le", "denim", "jeans"] },
];

type RecProduct = ListingProduct & { trendCat: TrendCat };

// Recommendation pool tagged by trend category — selecting a trending chip
// filters this feed. ~3 items per category so a filtered view has real density.
const REC_SPECS: { category: TrendCat; name: string; manufacturer: string; enq: string; rating: number }[] = [
  { category: "tshirt", name: "Functional Crew Tee", manufacturer: "Artisan Weaves Co.", enq: "5.6k", rating: 4.1 },
  { category: "tshirt", name: "Oversized Graphic Tee", manufacturer: "Tiruppur Knitworks", enq: "3.2k", rating: 4.3 },
  { category: "tshirt", name: "Performance Sport Tee", manufacturer: "FitForm Apparel", enq: "1.8k", rating: 3.9 },
  { category: "knit", name: "Cropped Rib Knit", manufacturer: "SilkThread Mills", enq: "2.1k", rating: 4.0 },
  { category: "knit", name: "Waffle Knit Pullover", manufacturer: "Studio Kintsugi", enq: "1.4k", rating: 4.2 },
  { category: "knit", name: "Cable Knit Cardigan", manufacturer: "Jaipur Weaves", enq: "980", rating: 4.4 },
  { category: "windbreaker", name: "Men's Windbreaker", manufacturer: "UrbanShell Co.", enq: "2.7k", rating: 4.1 },
  { category: "windbreaker", name: "Packable Rain Jacket", manufacturer: "TrailForm Gear", enq: "1.1k", rating: 3.8 },
  { category: "windbreaker", name: "Colour-block Windcheater", manufacturer: "UrbanShell Co.", enq: "1.6k", rating: 4.0 },
  { category: "skirt", name: "Pleated Midi Skirt", manufacturer: "Atelier Noor", enq: "2.3k", rating: 4.5 },
  { category: "skirt", name: "A-line Denim Skirt", manufacturer: "Ahmedabad Denim Co.", enq: "1.2k", rating: 3.9 },
  { category: "skirt", name: "Wrap Satin Skirt", manufacturer: "Surat Studio", enq: "870", rating: 4.1 },
  { category: "cargo", name: "Utility Cargo Pants", manufacturer: "Ludhiana Active Wear", enq: "3.4k", rating: 4.2 },
  { category: "cargo", name: "Relaxed Cargo Joggers", manufacturer: "FitForm Apparel", enq: "1.9k", rating: 4.0 },
  { category: "cargo", name: "Wide-leg Cargo Trouser", manufacturer: "UrbanShell Co.", enq: "1.3k", rating: 3.8 },
];

const RECOMMENDED_PRODUCTS: RecProduct[] = REC_SPECS.map((s, i) => ({
  id: `rec-${i}`,
  vendorId: `v-rec-${i}`,
  name: s.name,
  manufacturer: s.manufacturer,
  location: "Bangalore",
  price: "₹499",
  priceValue: 499,
  moq: "MOQ: 2",
  soldCount: "800+ sold",
  enquiries: s.enq,
  rating: s.rating,
  fabric: "Cotton",
  gsm: "200",
  fitType: "Regular",
  image: `https://picsum.photos/seed/search-rec-${i}/500/650`,
  secondaryImage: `https://picsum.photos/seed/search-rec-${i}b/500/650`,
  gender: "unisex",
  trendCat: s.category,
}));

const GIFTING_PICKS = [
  { label: "Gifting", icon: Gift },
  { label: "1-Day Delivery", icon: Truck },
  { label: "T-Shirts", icon: Shirt },
  { label: "Shirts", icon: Shirt },
  { label: "Suits & Blazers", icon: Briefcase },
  { label: "Edgy Jeans", icon: Flame },
];

const FOR_HIM_CATEGORIES = [
  { label: "Trendy T-Shirts", image: "https://picsum.photos/seed/for-him-tshirt/200/200" },
  { label: "Suave Shirts", image: "https://picsum.photos/seed/for-him-shirt/200/200" },
  { label: "Edgy Jeans", image: "https://picsum.photos/seed/for-him-jeans/200/200" },
];

const todayStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const idx = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (idx === -1) return <span className="truncate text-sm text-gray-800">{text}</span>;
  return (
    <span className="truncate text-sm text-gray-800">
      {text.slice(0, idx)}
      <span className="font-bold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
const Search = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { profile } = useProfileState();
  const { profile: authProfile } = useAuth();
  const { data: live } = useLiveProducts();
  const firstName = (authProfile?.full_name ?? profile.fullName).trim().split(" ")[0] || "there";
  const inputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [query, setQuery] = useState("");
  const [recentKeywords, setRecentKeywords] = useState<string[]>(["dress", "tank top"]);
  const [popPage, setPopPage] = useState(0);
  const [recBatches, setRecBatches] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  // Trending chip that filters the recommendation feed (first one active by default).
  const [selectedCat, setSelectedCat] = useState<TrendCat | null>(TRENDING_KEYWORDS[0].category);

  const isSearching = query.trim().length > 0;
  const popularPages = Math.ceil(POPULAR_KEYWORDS.length / POPULAR_PER_PAGE);

  const suggestions = useMemo(() => {
    if (!isSearching) return [];
    const q = query.trim().toLowerCase();
    return SEARCH_SUGGESTIONS.filter((s) => s.term.toLowerCase().includes(q)).slice(0, 5);
  }, [query, isSearching]);

  const brands = useMemo(() => {
    if (!isSearching) return [];
    const q = query.trim().toLowerCase();
    return BRAND_SUGGESTIONS.filter((b) => b.name.toLowerCase().includes(q) || b.keywords.some((k) => k.includes(q))).slice(0, 5);
  }, [query, isSearching]);

  const recommended = useMemo(() => {
    const catalogue = live ?? [];
    if (catalogue.length > 0) {
      // Real catalogue, filtered by the active trending chip (falls back to all
      // when a chip has no matches), then paginated by infinite scroll.
      let pool = catalogue;
      if (selectedCat) {
        const kws = CAT_KEYWORDS[selectedCat];
        const matched = catalogue.filter((p) => {
          const hay = `${p.categoryName ?? ""} ${p.name}`.toLowerCase();
          return kws.some((k) => hay.includes(k));
        });
        pool = matched.length ? matched : catalogue;
      }
      return pool.map(toListing).slice(0, recBatches * 8);
    }
    // Fallback (still loading / empty): seeded imagery, tagged by trend category.
    const seedPool = selectedCat ? RECOMMENDED_PRODUCTS.filter((p) => p.trendCat === selectedCat) : RECOMMENDED_PRODUCTS;
    return Array.from({ length: recBatches }, (_, b) =>
      seedPool.map((p) => ({ ...p, id: `${p.id}-${b}`, vendorId: `${p.vendorId}-${b}` }))
    ).flat();
  }, [live, recBatches, selectedCat]);

  // Infinite scroll for the recommendation feed (paused while searching).
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || isSearching) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMore) {
        setLoadingMore(true);
        window.setTimeout(() => { setRecBatches((c) => c + 1); setLoadingMore(false); }, 300);
      }
    }, { rootMargin: "300px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadingMore, isSearching]);

  const runSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentKeywords((prev) => [trimmed, ...prev.filter((k) => k !== trimmed)].slice(0, 8));
    navigate(`/search/results?q=${encodeURIComponent(trimmed)}`);
  };

  const removeRecent = (term: string) => setRecentKeywords((prev) => prev.filter((k) => k !== term));
  const closeDropdown = () => { setQuery(""); inputRef.current?.blur(); };

  // ── Voice search (browser Web Speech API — no plugin/key) ──
  const { listening, supported: voiceSupported, toggle: toggleVoice } = useSpeechSearch((text, isFinal) => {
    setQuery(text);
    if (isFinal && text.trim()) runSearch(text);
  });
  const onMicClick = () => {
    if (!voiceSupported) {
      toast.error("Voice search isn't supported in this browser", { description: "Try Chrome, Edge or Safari." });
      return;
    }
    toggleVoice();
  };

  // ── Image search (photo → vision query → catalogue search) ──
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(file);
    });

  const handleImageFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    let dataUrl: string;
    try { dataUrl = await fileToDataUrl(file); } catch { toast.error("Couldn't read that image"); return; }
    setImagePreview(dataUrl);
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("image-search", { body: { image: dataUrl, mimeType: file.type } });
      if (error) throw error;
      setAnalyzing(false);
      setImagePreview(null);
      if (data?.query) { runSearch(data.query); return; }
      if (data?.error === "not_configured") {
        toast.error("Image search isn't set up yet", { description: "The image-search API key needs to be added in Supabase." });
      } else {
        toast.error("Couldn't recognise that image", { description: "Try another photo or search by text." });
      }
    } catch (e) {
      setAnalyzing(false);
      setImagePreview(null);
      toast.error("Image search unavailable", { description: e instanceof Error ? e.message : "Please try again." });
    }
  };

  // Restart the recommendation feed when the trending filter changes.
  useEffect(() => { setRecBatches(1); }, [selectedCat]);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Top bar: logo + back/input/mic ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-3 pb-2.5">
          <button onClick={() => navigate("/home/new-arrivals")} className="block mb-2">
            <CosoraLogo height={22} />
          </button>

          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} aria-label="Go back" className="shrink-0 p-1 -ml-1">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-3.5 py-2 lg:py-2.5">
              <SearchIcon className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runSearch(query); if (e.key === "Escape") closeDropdown(); }}
                placeholder="Search for items or brands"
                className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search" className="shrink-0">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
              <button
                onClick={onMicClick}
                aria-label={listening ? "Stop voice search" : "Search by voice"}
                aria-pressed={listening}
                className={cn(
                  "shrink-0 flex items-center justify-center rounded-full transition-colors",
                  listening ? "w-6 h-6 bg-[#ef4d62] text-white animate-pulse" : "text-[#ef4d62]"
                )}
              >
                <Mic className={cn(listening ? "w-3.5 h-3.5" : "w-4 h-4")} />
              </button>
            </div>
          </div>

          {/* Live "listening" hint */}
          <AnimatePresence>
            {listening && (
              <motion.p
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="mt-2 flex items-center gap-2 text-xs font-medium text-[#ef4d62]"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ef4d62]/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ef4d62]" />
                </span>
                Listening… speak now
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Content area (default state) with search-overlay layered on top ── */}
      <div className="relative">
        <motion.div
          className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pb-24"
          variants={reduced ? {} : page} initial="hidden" animate="show"
        >
          {/* Photo search */}
          <motion.div variants={section} className="pt-4">
            <p className="text-xs font-bold text-gray-400 tracking-wider mb-2">PHOTO SEARCH</p>
            <div className="grid grid-cols-2 gap-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => cameraRef.current?.click()}
                className="flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-3 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors"
              >
                <Camera className="w-4 h-4" /> Click a photo
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => galleryRef.current?.click()}
                className="flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-3 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors"
              >
                <ImagePlus className="w-4 h-4" /> Select a photo
              </motion.button>
            </div>
            {/* Hidden inputs: camera capture + gallery pick */}
            <input
              ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { void handleImageFile(e.target.files?.[0]); e.currentTarget.value = ""; }}
            />
            <input
              ref={galleryRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { void handleImageFile(e.target.files?.[0]); e.currentTarget.value = ""; }}
            />
          </motion.div>

          {/* Recent keywords */}
          {recentKeywords.length > 0 && (
            <motion.div variants={section} className="pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-900">Recent keywords</p>
                <button onClick={() => setRecentKeywords([])} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Delete all</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <AnimatePresence mode="popLayout">
                  {recentKeywords.map((k) => (
                    <motion.span
                      key={k} layout
                      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.18 }}
                      className="inline-flex items-center gap-1.5 bg-gray-100 rounded-full pl-3 pr-2 py-1.5"
                    >
                      <button onClick={() => runSearch(k)} className="text-xs font-medium text-gray-700">{k}</button>
                      <button onClick={() => removeRecent(k)} aria-label={`Remove ${k}`}><X className="w-3 h-3 text-gray-400" /></button>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* Popular keywords (paginated — refreshes daily from trending source) */}
          <motion.div variants={section} className="pt-5">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm font-bold text-gray-900">Popular keywords</p>
              <span className="text-[10px] text-gray-300">{todayStamp()}</span>
            </div>
            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={popPage}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.25}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -50 && popPage < popularPages - 1) setPopPage((p) => p + 1);
                    else if (info.offset.x > 50 && popPage > 0) setPopPage((p) => p - 1);
                  }}
                  initial={reduced ? false : { opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduced ? undefined : { opacity: 0, x: -20 }}
                  transition={{ duration: 0.25, ease: E }}
                  className="grid grid-cols-2 gap-y-2 gap-x-6 cursor-grab active:cursor-grabbing"
                >
                  {POPULAR_KEYWORDS.slice(popPage * POPULAR_PER_PAGE, popPage * POPULAR_PER_PAGE + POPULAR_PER_PAGE).map((k, i) => {
                    const n = popPage * POPULAR_PER_PAGE + i + 1;
                    return (
                      <button key={k} onClick={() => runSearch(k)} className="flex items-center gap-2 py-0.5 text-left">
                        <span className={cn("w-4 text-xs font-bold shrink-0", n <= 3 ? "text-[#ef4d62]" : "text-gray-400")}>{n}</span>
                        <span className="text-sm text-gray-700 truncate">{k}</span>
                      </button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
            {/* Pagination dots */}
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {Array.from({ length: popularPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPopPage(i)}
                  aria-label={`Popular keywords page ${i + 1}`}
                  className={cn("h-1.5 rounded-full transition-all", i === popPage ? "w-4 bg-[#ef4d62]" : "w-1.5 bg-gray-300 hover:bg-gray-400")}
                />
              ))}
            </div>
          </motion.div>

          {/* Trending Keywords */}
          <motion.div variants={section} className="pt-5">
            <p className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-900 mb-2">
              <TrendingUp className="w-4 h-4 text-[#ef4d62]" /> Trending Keywords
            </p>
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
              {TRENDING_KEYWORDS.map((t) => {
                const active = selectedCat === t.category;
                return (
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    key={t.label}
                    onClick={() => setSelectedCat((c) => (c === t.category ? null : t.category))}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-2 shrink-0 rounded-full py-1 transition-colors",
                      active ? "bg-gray-900 pl-3 pr-3.5" : "bg-gray-100 hover:bg-gray-200 pl-1 pr-3"
                    )}
                  >
                    {!active && <img src={t.image} alt="" className="w-6 h-6 rounded-full object-cover" />}
                    <span className={cn("text-xs font-medium whitespace-nowrap", active ? "text-white" : "text-gray-700")}>{t.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* Recommended products (personalized + sponsored, infinite scroll) */}
          <motion.div variants={section} className="pt-6">
            <p className="text-sm mb-3">
              <span className="text-blue-600 font-semibold">{firstName}</span>
              <span className="text-gray-900 font-bold">, we recommend</span>
              <span className="float-right text-[10px] text-gray-300 font-semibold">Sponsored</span>
            </p>
            <motion.div key={selectedCat ?? "all"} variants={reduced ? {} : listContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
              {recommended.map((p) => (
                <motion.div variants={reduced ? {} : listItem} key={p.id}>
                  <ListingProductCard product={p} />
                </motion.div>
              ))}
            </motion.div>
            <div ref={loadMoreRef} className="py-6 text-center text-xs text-gray-400">
              {loadingMore ? "Loading more..." : "Scroll for more"}
            </div>
          </motion.div>

          {/* Seasonal promo strip */}
          <motion.div variants={section} className="pt-2">
            <div className="rounded-xl bg-[#ef4d62]/5 p-4">
              <p className="text-sm font-bold text-gray-900">Father's Day gifting top picks</p>
              <div className="flex gap-3 mt-3 overflow-x-auto scrollbar-hide">
                {GIFTING_PICKS.map((g) => (
                  <motion.button whileTap={{ scale: 0.95 }} key={g.label} onClick={() => runSearch(g.label)} className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
                      <g.icon className="w-5 h-5 text-[#ef4d62]" />
                    </div>
                    <span className="text-[10px] text-gray-600 font-medium whitespace-nowrap">{g.label}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Popular search categories */}
          <motion.div variants={section} className="pt-6">
            <p className="text-sm font-bold text-gray-900 mb-2">Popular search categories</p>
            <p className="text-xs text-gray-400 mb-2">For Him</p>
            <div className="grid grid-cols-3 gap-3">
              {FOR_HIM_CATEGORIES.map((c) => (
                <motion.button whileTap={{ scale: 0.97 }} key={c.label} onClick={() => runSearch(c.label)} className="text-center">
                  <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 mb-1.5">
                    <img src={c.image} alt={c.label} className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[10px] text-gray-600 font-medium">{c.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* ── Autocomplete overlay (scrim dims content; dropdown = products then brands) ── */}
        <AnimatePresence>
          {isSearching && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-20 bg-black/40" onClick={closeDropdown}
            >
              <motion.div
                initial={reduced ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: E }}
                className="bg-white shadow-sm" onClick={(e) => e.stopPropagation()}
              >
                <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 py-1">
                  {suggestions.length === 0 && brands.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-400">No matches for &ldquo;{query}&rdquo;</p>
                  ) : (
                    <>
                      {/* Top 5: products / categories with result counts */}
                      {suggestions.map((s) => (
                        <button
                          key={s.term}
                          onClick={() => runSearch(s.term)}
                          className="w-full flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0 text-left"
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <SearchIcon className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <HighlightMatch text={s.term} query={query} />
                          </span>
                          <span className="text-xs text-gray-300 shrink-0">{s.count.toLocaleString("en-IN")}</span>
                        </button>
                      ))}

                      {/* Then 5: brand stores with logo + followers */}
                      {brands.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => navigate(`/vendor/${b.id}`)}
                          className="w-full flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 text-left"
                        >
                          <img src={b.logo} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 bg-gray-100" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1 text-sm font-medium text-gray-800 truncate">
                              {b.name}
                              {b.verified && <BadgeCheck className="w-3.5 h-3.5 text-[#ef4d62] shrink-0" />}
                            </p>
                            <p className="text-xs text-gray-400">{b.followers.toLocaleString("en-IN")} followers</p>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Image-search analyzing overlay ── */}
      <AnimatePresence>
        {imagePreview && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6"
            onClick={() => { if (!analyzing) setImagePreview(null); }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-xs rounded-2xl bg-white overflow-hidden" onClick={(e) => e.stopPropagation()}
            >
              <div className="relative aspect-square bg-gray-100">
                <img src={imagePreview} alt="Selected" className="absolute inset-0 h-full w-full object-cover" />
                {analyzing && <div className="absolute inset-0 bg-black/40" />}
                {analyzing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="text-sm font-semibold">Analyzing image…</p>
                    <p className="text-[11px] text-white/80">Finding matching products</p>
                  </div>
                )}
              </div>
              {!analyzing && (
                <button
                  onClick={() => setImagePreview(null)}
                  className="w-full py-3 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <MobileBottomNav />
    </div>
  );
};

export default Search;
