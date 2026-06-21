import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import type { BuyerProductCardData } from "@/components/buyer/BuyerProductCard";
import BuyerProductCard from "@/components/buyer/BuyerProductCard";
import {
  ArrowLeft,
  Search as SearchIcon,
  Mic,
  Camera,
  ImagePlus,
  X,
  BadgeCheck,
  Gift,
  Truck,
  Shirt,
  Briefcase,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

// Numbered list shown before the user types. In production this should be
// refreshed daily from a trending-search job (e.g. Google Trends), not hardcoded.
const POPULAR_KEYWORDS = [
  "Cotton Dresses",
  "Tank Tops",
  "Windbreaker Jackets",
  "Bermuda Shorts",
  "Satin Blouses",
  "Linen Jackets",
  "Oversized Hoodies",
  "Cropped Cardigans",
  "Pleated Skorts",
  "Flip-Flops",
  "Bustier Tops",
  "Wide-Leg Trousers",
];

const TRENDING_KEYWORDS = [
  { label: "Functional T-shirt", image: "https://picsum.photos/seed/trend-tshirt/80/80" },
  { label: "Cropped Knit", image: "https://picsum.photos/seed/trend-knit/80/80" },
  { label: "Men's Windbreaker", image: "https://picsum.photos/seed/trend-windbreaker/80/80" },
  { label: "Pleated Skirt", image: "https://picsum.photos/seed/trend-skirt/80/80" },
  { label: "Cargo Pants", image: "https://picsum.photos/seed/trend-cargo/80/80" },
];

// Product / category dictionary for the autocomplete dropdown. Filtered by substring
// match against the live query; top 5 shown, ordered as-is (would be relevance-ranked server-side).
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

// Brand / store dictionary. `keywords` lets a short query (e.g. "Ha") surface a
// relevant storefront even when it isn't a literal substring of the brand name.
const BRAND_SUGGESTIONS = [
  { name: "H&M Home Brand Store", followers: 5893, verified: true, keywords: ["ha", "hm", "home"] },
  { name: "H&M New Season Styles", followers: 7654, verified: true, keywords: ["ha", "hm", "season", "new"] },
  { name: "Zara Essentials Studio", followers: 4218, verified: true, keywords: ["za", "essentials"] },
  { name: "Levi's Official Store", followers: 9027, verified: true, keywords: ["le", "denim", "jeans"] },
];

const RECOMMENDED_PRODUCTS: BuyerProductCardData[] = [
  { id: "rec1", vendorId: "v-rec1", name: "Ribbed Tank Top", manufacturer: "Artisan Weaves Co.", location: "Bangalore", price: "₹499", moq: "MOQ: 2", soldCount: "800+ sold", enquiries: "5.6k", rating: 4.1, reviews: 312, fabric: "Cotton", gsm: "200 GSM", fitType: "Regular Fit", image: "https://picsum.photos/seed/search-rec-1/500/650", secondaryImage: "https://picsum.photos/seed/search-rec-1b/500/650" },
  { id: "rec2", vendorId: "v-rec2", name: "Camp Collar Shirt", manufacturer: "SilkThread Mills", location: "Bangalore", price: "₹499", moq: "MOQ: 2", soldCount: "800+ sold", enquiries: "1.6k", rating: 3.8, reviews: 154, fabric: "Cotton", gsm: "200 GSM", fitType: "Regular Fit", image: "https://picsum.photos/seed/search-rec-2/500/650", secondaryImage: "https://picsum.photos/seed/search-rec-2b/500/650" },
  { id: "rec3", vendorId: "v-rec3", name: "Ribbed Tank Top - Orange", manufacturer: "Artisan Weaves Co.", location: "Bangalore", price: "₹499", moq: "MOQ: 2", soldCount: "800+ sold", enquiries: "5.6k", rating: 4.1, reviews: 312, fabric: "Cotton", gsm: "200 GSM", fitType: "Regular Fit", image: "https://picsum.photos/seed/search-rec-3/500/650", secondaryImage: "https://picsum.photos/seed/search-rec-3b/500/650" },
  { id: "rec4", vendorId: "v-rec4", name: "Graphic Print Tee", manufacturer: "Tiruppur Knitworks", location: "Bangalore", price: "₹499", moq: "MOQ: 2", soldCount: "800+ sold", enquiries: "1.6k", rating: 3.8, reviews: 154, fabric: "Cotton", gsm: "200 GSM", fitType: "Regular Fit", image: "https://picsum.photos/seed/search-rec-4/500/650", secondaryImage: "https://picsum.photos/seed/search-rec-4b/500/650" },
];

// Seasonal promo strip — swap label/icon set per active campaign.
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
  if (idx === -1) {
    return <span className="truncate text-sm text-gray-800">{text}</span>;
  }
  return (
    <span className="truncate text-sm text-gray-800">
      {text.slice(0, idx)}
      <span className="font-bold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </span>
  );
}

function brandInitials(name: string) {
  return name
    .split(" ")
    .filter((w) => /[A-Za-z]/.test(w[0]))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const Search = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [recentKeywords, setRecentKeywords] = useState<string[]>(["dress", "tank top"]);

  const isSearching = query.trim().length > 0;

  const suggestions = useMemo(() => {
    if (!isSearching) return [];
    const q = query.trim().toLowerCase();
    return SEARCH_SUGGESTIONS.filter((s) => s.term.toLowerCase().includes(q)).slice(0, 5);
  }, [query, isSearching]);

  const brands = useMemo(() => {
    if (!isSearching) return [];
    const q = query.trim().toLowerCase();
    return BRAND_SUGGESTIONS.filter(
      (b) => b.name.toLowerCase().includes(q) || b.keywords.some((k) => k.includes(q))
    ).slice(0, 5);
  }, [query, isSearching]);

  const runSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentKeywords((prev) => [trimmed, ...prev.filter((k) => k !== trimmed)].slice(0, 8));
    navigate(`/search/results?q=${encodeURIComponent(trimmed)}`);
  };

  const removeRecent = (term: string) => setRecentKeywords((prev) => prev.filter((k) => k !== term));

  const closeDropdown = () => {
    setQuery("");
    inputRef.current?.blur();
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ── Top bar: logo + back/input/mic ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-3 pb-2.5">
          <button onClick={() => navigate("/home/new-arrivals")} className="block mb-2">
            <span className="font-logo text-xl font-extrabold italic text-[#a4172c] uppercase tracking-tight">
              COSORA
            </span>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch(query);
                  if (e.key === "Escape") closeDropdown();
                }}
                placeholder="Search for items or brands"
                className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search" className="shrink-0">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
              <button aria-label="Search by voice" className="shrink-0">
                <Mic className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content area (default state) with search-overlay layered on top ── */}
      <div className="relative">
        <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pb-24">

          {/* Photo search */}
          <div className="pt-4">
            <p className="text-xs font-bold text-gray-400 tracking-wider mb-2">PHOTO SEARCH</p>
            <div className="grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-3 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors">
                <Camera className="w-4 h-4" />
                Click a photo
              </button>
              <button className="flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-3 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors">
                <ImagePlus className="w-4 h-4" />
                Select a photo
              </button>
            </div>
          </div>

          {/* Recent keywords */}
          {recentKeywords.length > 0 && (
            <div className="pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-900">Recent keywords</p>
                <button onClick={() => setRecentKeywords([])} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  Delete all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentKeywords.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5 bg-gray-100 rounded-full pl-3 pr-2 py-1.5">
                    <button onClick={() => runSearch(k)} className="text-xs font-medium text-gray-700">
                      {k}
                    </button>
                    <button onClick={() => removeRecent(k)} aria-label={`Remove ${k}`}>
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Popular keywords */}
          <div className="pt-5">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm font-bold text-gray-900">Popular keywords</p>
              <span className="text-[10px] text-gray-300">{todayStamp()}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-6">
              {POPULAR_KEYWORDS.map((k, i) => (
                <button key={k} onClick={() => runSearch(k)} className="flex items-center gap-2 py-0.5 text-left">
                  <span className={cn("w-4 text-xs font-bold shrink-0", i < 3 ? "text-[#ef4d62]" : "text-gray-400")}>
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-700 truncate">{k}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Trending Keywords */}
          <div className="pt-5">
            <p className="text-sm font-bold text-gray-900 mb-2">Trending Keywords</p>
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
              {TRENDING_KEYWORDS.map((t) => (
                <button
                  key={t.label}
                  onClick={() => runSearch(t.label)}
                  className="flex items-center gap-2 shrink-0 bg-gray-100 rounded-full pl-1 pr-3 py-1 hover:bg-gray-200 transition-colors"
                >
                  <img src={t.image} alt="" className="w-6 h-6 rounded-full object-cover" />
                  <span className="text-xs font-medium text-gray-700 whitespace-nowrap">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recommended products */}
          <div className="pt-6">
            <p className="text-sm mb-2">
              <span className="text-gray-900 font-bold">We recommend</span>
              <span className="float-right text-[10px] text-gray-300 font-semibold">sponsored</span>
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
              {RECOMMENDED_PRODUCTS.map((p) => (
                <BuyerProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>

          {/* Seasonal promo strip */}
          <div className="pt-6">
            <div className="rounded-xl bg-[#ef4d62]/5 p-4">
              <p className="text-sm font-bold text-gray-900">Father's Day gifting top picks</p>
              <div className="flex gap-3 mt-3 overflow-x-auto scrollbar-hide">
                {GIFTING_PICKS.map((g) => (
                  <button key={g.label} onClick={() => runSearch(g.label)} className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
                      <g.icon className="w-5 h-5 text-[#ef4d62]" />
                    </div>
                    <span className="text-[10px] text-gray-600 font-medium whitespace-nowrap">{g.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Popular search categories */}
          <div className="pt-6">
            <p className="text-sm font-bold text-gray-900 mb-2">Popular search categories</p>
            <p className="text-xs text-gray-400 mb-2">For Him</p>
            <div className="grid grid-cols-3 gap-3">
              {FOR_HIM_CATEGORIES.map((c) => (
                <button key={c.label} onClick={() => runSearch(c.label)} className="text-center">
                  <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 mb-1.5">
                    <img src={c.image} alt={c.label} className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[10px] text-gray-600 font-medium">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Autocomplete overlay (scrim dims the content above; dropdown stays opaque) ── */}
        {isSearching && (
          <div className="absolute inset-0 z-20 bg-black/40" onClick={closeDropdown}>
            <div className="bg-white shadow-sm" onClick={(e) => e.stopPropagation()}>
              <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 py-1">
                {suggestions.length === 0 && brands.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-400">No matches for &ldquo;{query}&rdquo;</p>
                ) : (
                  <>
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

                    {brands.map((b) => (
                      <button
                        key={b.name}
                        onClick={() => navigate(`/vendor/${encodeURIComponent(b.name.toLowerCase().replace(/\s+/g, "-"))}`)}
                        className="w-full flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#ef4d62]/10 flex items-center justify-center text-xs font-bold text-[#ef4d62] shrink-0">
                          {brandInitials(b.name)}
                        </div>
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
            </div>
          </div>
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default Search;
