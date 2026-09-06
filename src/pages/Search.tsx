import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import ListingProductCard from "@/components/buyer/ListingProductCard";
import { makeListingProduct, type Gender, type ListingProduct } from "@/lib/listingProducts";
import { useLiveProducts, type ProductCardData } from "@/lib/queries/products";
import { useSearchSuggestions, useDebounced } from "@/lib/queries/search";
import {
  ArrowLeft, Search as SearchIcon, Mic, Camera, ImagePlus, X, BadgeCheck,
  Gift, Truck, Shirt, Briefcase, Flame, LayoutGrid, Loader2, Store,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CosoraLogo from "@/components/CosoraLogo";
import { useProfileState } from "@/lib/profileStore";
import { useAuth } from "@/contexts/AuthContext";
import { useSpeechSearch } from "@/hooks/useSpeechSearch";
import { supabase } from "@/lib/supabase";

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
//
// What used to live here — and why it is gone:
//
//   SEARCH_SUGGESTIONS   invented search volumes ("Handbags For Clothes
//                        2,348,215") for terms no vendor lists.
//   BRAND_SUGGESTIONS    real trademarked brands (H&M, Zara, Levi's) that are
//                        not vendors on this marketplace, with invented
//                        follower counts and fake storefront ids that routed to
//                        /vendor/<id> pages which do not exist.
//   POPULAR_KEYWORDS     a hardcoded list rendered under a "Popular keywords"
//                        heading stamped with today's date, implying a daily
//                        trending job that was never built.
//   TRENDING_KEYWORDS    fabricated "trending" labels with picsum placeholder
//                        imagery.
//   RECOMMENDED_PRODUCTS 15 fake listings with picsum images, shown whenever the
//                        real catalogue was empty — which the project's own rule
//                        forbids ("No mock data in production. An empty
//                        catalogue is meant to render empty.").
//
// All of it is now derived from real rows: autocomplete comes from the
// search_suggestions RPC, and the category rail is counted off the live
// catalogue this page already loads.
// ─────────────────────────────────────────────────────────────

// Navigational shortcuts. These are search terms, not claims about data — each
// one just runs the search it names.
const QUICK_PICKS = [
  { label: "T-Shirts", icon: Shirt },
  { label: "Shirts", icon: Shirt },
  { label: "Jeans", icon: Flame },
  { label: "Kurta", icon: Gift },
  { label: "Activewear", icon: Briefcase },
  { label: "Jackets", icon: Truck },
];

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
  const [recentKeywords, setRecentKeywords] = useState<string[]>([]);
  const [recBatches, setRecBatches] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  // Category chip filtering the feed below. Null = everything.
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const isSearching = query.trim().length > 0;

  // Real autocomplete: categories (with live listing counts), live product
  // names, and actual vendor storefronts. Debounced so it is one request per
  // pause in typing, not one per keystroke.
  const debouncedQuery = useDebounced(query, 200);
  const { data: suggestionRows, isLoading: suggestLoading } = useSearchSuggestions(debouncedQuery);
  const suggestions = (suggestionRows ?? []).filter((s) => s.kind !== "vendor");
  const vendorSuggestions = (suggestionRows ?? []).filter((s) => s.kind === "vendor");

  // Category rail counted off the live catalogue this page already fetched —
  // no extra request, and every count is a real number of live listings.
  const categoryRail = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of live ?? []) {
      const name = p.categoryName;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }, [live]);

  const recommended = useMemo(() => {
    // No fabricated fallback pool. An empty catalogue renders empty — that is
    // the project's documented rule, and a fake grid hides a real outage.
    const catalogue = live ?? [];
    const pool = selectedCat
      ? catalogue.filter((p) => p.categoryName === selectedCat)
      : catalogue;
    return pool.map(toListing).slice(0, recBatches * 8);
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

          {/* Browse by category — counted off the live catalogue. The number on
              each chip is how many live listings it actually holds, so an empty
              marketplace shows no chips rather than fabricated ones. */}
          {categoryRail.length > 0 && (
            <motion.div variants={section} className="pt-5">
              <p className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-900 mb-2">
                <LayoutGrid className="w-4 h-4 text-[#ef4d62]" /> Browse by category
              </p>
              <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
                {categoryRail.map((c) => {
                  const active = selectedCat === c.label;
                  return (
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      key={c.label}
                      onClick={() => setSelectedCat((cur) => (cur === c.label ? null : c.label))}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center gap-1.5 shrink-0 rounded-full py-1.5 px-3.5 transition-colors",
                        active ? "bg-gray-900" : "bg-gray-100 hover:bg-gray-200"
                      )}
                    >
                      <span className={cn("text-xs font-medium whitespace-nowrap", active ? "text-white" : "text-gray-700")}>{c.label}</span>
                      <span className={cn("text-[10px] font-semibold", active ? "text-white/70" : "text-gray-400")}>{c.count}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Live catalogue feed, optionally scoped by the category chip above.
              Previously headed "Sponsored" — nothing here is paid placement, so
              the label was a false claim on the buyer's read of the ranking. */}
          <motion.div variants={section} className="pt-6">
            <p className="text-sm mb-3">
              <span className="text-blue-600 font-semibold">{firstName}</span>
              <span className="text-gray-900 font-bold">
                , {selectedCat ? `browsing ${selectedCat}` : "here's what's live"}
              </span>
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

          {/* Quick picks — plain search shortcuts. The old version framed these
              as "Father's Day gifting top picks", a seasonal claim tied to no
              campaign and no data, and sat beside a "Popular search categories /
              For Him" grid built on picsum placeholder photography. */}
          <motion.div variants={section} className="pt-2">
            <div className="rounded-xl bg-[#ef4d62]/5 p-4">
              <p className="text-sm font-bold text-gray-900">Jump to a category</p>
              <div className="flex gap-3 mt-3 overflow-x-auto scrollbar-hide">
                {QUICK_PICKS.map((g) => (
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
                  {suggestLoading && suggestions.length === 0 && vendorSuggestions.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-400">Searching…</p>
                  ) : suggestions.length === 0 && vendorSuggestions.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-400">No matches for &ldquo;{query}&rdquo;</p>
                  ) : (
                    <>
                      {/* Categories and live listings. The trailing number is the
                          real count — live listings for a category, enquiries for
                          a product — not an invented search volume. */}
                      {suggestions.map((s) => (
                        <button
                          key={`${s.kind}-${s.refId}`}
                          onClick={() => (s.kind === "product" ? navigate(`/product/${s.refId}`) : runSearch(s.label))}
                          className="w-full flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0 text-left"
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            {s.kind === "category"
                              ? <LayoutGrid className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                              : <SearchIcon className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
                            <HighlightMatch text={s.label} query={query} />
                          </span>
                          <span className="text-xs text-gray-300 shrink-0">
                            {s.kind === "category"
                              ? `${s.countHint} listing${s.countHint === 1 ? "" : "s"}`
                              : `${s.countHint.toLocaleString("en-IN")} enquiries`}
                          </span>
                        </button>
                      ))}

                      {/* Real vendor storefronts on this marketplace, with real
                          follower counts, routing to a vendor id that exists. */}
                      {vendorSuggestions.map((b) => (
                        <button
                          key={`vendor-${b.refId}`}
                          onClick={() => navigate(`/vendor/${b.refId}`)}
                          className="w-full flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 text-left"
                        >
                          <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                            <Store className="w-4 h-4 text-gray-400" />
                          </span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1 text-sm font-medium text-gray-800 truncate">
                              {b.label}
                              {b.verified && <BadgeCheck className="w-3.5 h-3.5 text-[#ef4d62] shrink-0" />}
                            </p>
                            <p className="text-xs text-gray-400">
                              {b.countHint.toLocaleString("en-IN")} follower{b.countHint === 1 ? "" : "s"}
                            </p>
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
