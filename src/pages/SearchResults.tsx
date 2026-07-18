import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import ToTopButton from "@/components/buyer/ToTopButton";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import { useCatalogue } from "@/lib/queries/products";
import SubmitRequirementCard from "@/components/buyer/SubmitRequirementCard";
import CosoraLogo from "@/components/CosoraLogo";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Search as SearchIcon, X, Bookmark, BookmarkCheck, ChevronDown, Check,
  Filter, ArrowUpDown, Grid2X2, Grid3X3, Star, MapPin, Phone, ChevronRight, BadgeCheck,
} from "lucide-react";
import trustedSeal from "@/assets/Trustedseal.png";
import {
  resolveFilterSchema, defaultSelections, gsmBucket, ratingThreshold, hashPick,
  type Facet,
} from "@/lib/searchFilters";
import { useCallVendor } from "@/lib/queries/calls";
import { useT } from "@/lib/i18n";

// Swatch colours for the Colour facet (names must match the facet options).
const COLOUR_HEX: Record<string, string> = {
  Black: "#111827", White: "#ffffff", Blue: "#2563eb", Navy: "#1e3a5f", Grey: "#9ca3af",
  Beige: "#e7d8b8", Olive: "#6b7f3a", Maroon: "#7f1d3a", Red: "#dc2626", Pink: "#ec4899",
  Green: "#16a34a", Yellow: "#eab308",
};
// Colours that need a dark check/label because the swatch itself is pale.
const PALE_COLOURS = new Set(["White", "Beige", "Yellow"]);

// Active-filter count: chip facets count each selected option; a range facet
// counts as one (a min/max pair is a single active refinement, not two).
function countActive(selections: Record<string, string[]>, facets: Facet[]): number {
  return facets.reduce((sum, f) => {
    if (f.hidden) return sum; // inferred pre-scopes (e.g. gender) aren't user-facing
    const sel = selections[f.id];
    if (!sel || sel.length === 0) return sum;
    return sum + (f.kind === "range" ? 1 : sel.length);
  }, 0);
}

// ── Animation constants ──
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const listContainer = { show: { transition: { staggerChildren: 0.04 } } };
const listItem = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } } };

// ── Filters / sort options (per reference) ──
const GENDERS = ["Men", "Boys", "Girls", "Women"] as const;
type Gender = (typeof GENDERS)[number];

const SORTS = [
  { key: "new", label: "What's new" },
  { key: "price-desc", label: "Price - high to low" },
  { key: "popularity", label: "Popularity" },
  { key: "discount", label: "Discount" },
  { key: "price-asc", label: "Price - low to high" },
  { key: "rating", label: "Customer Rating" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

// ── Data ──
interface RProduct {
  id: string; vendorId: string; name: string; manufacturer: string; location: string;
  priceValue: number; moq: string; sold: string; enquiries: string; rating: number;
  popularity: number; discount: number; fabric: string; gsm: string; fit: string;
  gender: Gender; colour: string; image: string; secondaryImage: string; verified: boolean;
}

const img = (s: string) => `https://picsum.photos/seed/${s}/500/650`;
const BASE_PRODUCTS: RProduct[] = [
  { id: "sr1", vendorId: "v1", name: "Ribbed Tank Top", manufacturer: "Artisan Weaves Co.", location: "Bangalore", priceValue: 499, moq: "MOQ: 2", sold: "800+ sold", enquiries: "5.6k", rating: 4.1, popularity: 5600, discount: 40, fabric: "Cotton", gsm: "200", fit: "Regular", gender: "Women", colour: "White", image: img("sr-tank"), secondaryImage: img("sr-tank-b"), verified: true },
  { id: "sr2", vendorId: "v2", name: "Camp Collar Shirt", manufacturer: "SilkThread Mills", location: "Bangalore", priceValue: 629, moq: "MOQ: 2", sold: "1.2k sold", enquiries: "1.6k", rating: 3.8, popularity: 1600, discount: 20, fabric: "Cotton", gsm: "200", fit: "Regular", gender: "Men", colour: "Blue", image: img("sr-camp"), secondaryImage: img("sr-camp-b"), verified: false },
  { id: "sr3", vendorId: "v3", name: "Kids Cotton Tee", manufacturer: "Gujarat Garments", location: "Ahmedabad", priceValue: 299, moq: "MOQ: 2", sold: "600+ sold", enquiries: "980", rating: 4.4, popularity: 980, discount: 55, fabric: "Cotton", gsm: "180", fit: "Regular", gender: "Boys", colour: "Yellow", image: img("sr-boy"), secondaryImage: img("sr-boy-b"), verified: true },
  { id: "sr4", vendorId: "v4", name: "Printed Frock", manufacturer: "Jaipur Weaves", location: "Jaipur", priceValue: 459, moq: "MOQ: 2", sold: "500+ sold", enquiries: "1.2k", rating: 4.0, popularity: 1200, discount: 30, fabric: "Rayon", gsm: "160", fit: "Regular", gender: "Girls", colour: "Pink", image: img("sr-girl"), secondaryImage: img("sr-girl-b"), verified: false },
  { id: "sr5", vendorId: "v5", name: "Oversized Crew Tee", manufacturer: "Tiruppur Knitworks", location: "Tirupur", priceValue: 549, moq: "MOQ: 2", sold: "900+ sold", enquiries: "3.2k", rating: 4.3, popularity: 3200, discount: 45, fabric: "Cotton", gsm: "240", fit: "Oversized", gender: "Men", colour: "Black", image: img("sr-crew"), secondaryImage: img("sr-crew-b"), verified: true },
  { id: "sr6", vendorId: "v6", name: "Satin Slip Dress", manufacturer: "Atelier Noor", location: "Surat", priceValue: 799, moq: "MOQ: 2", sold: "400+ sold", enquiries: "870", rating: 4.5, popularity: 870, discount: 25, fabric: "Satin", gsm: "140", fit: "Regular", gender: "Women", colour: "Maroon", image: img("sr-slip"), secondaryImage: img("sr-slip-b"), verified: true },
  { id: "sr7", vendorId: "v7", name: "Graphic Print Tee", manufacturer: "StyleCraft Apparels", location: "Bangalore", priceValue: 399, moq: "MOQ: 2", sold: "2.4k sold", enquiries: "1.6k", rating: 3.9, popularity: 2400, discount: 60, fabric: "Cotton", gsm: "180", fit: "Regular", gender: "Boys", colour: "Navy", image: img("sr-graphic"), secondaryImage: img("sr-graphic-b"), verified: false },
  { id: "sr8", vendorId: "v8", name: "Linen Blend Shirt", manufacturer: "Mumbai Linen House", location: "Mumbai", priceValue: 689, moq: "MOQ: 2", sold: "780+ sold", enquiries: "760", rating: 4.2, popularity: 760, discount: 15, fabric: "Linen", gsm: "180", fit: "Regular", gender: "Men", colour: "Beige", image: img("sr-linen"), secondaryImage: img("sr-linen-b"), verified: true },
];

// Price-slider bounds derived from the live catalogue (rounded out to the
// nearest ₹100) rather than a hardcoded ceiling — so the range always spans
// the real products and can never clip prices above an arbitrary cap.
const PRICE_BOUNDS = (() => {
  const vals = BASE_PRODUCTS.map((p) => p.priceValue);
  return {
    min: Math.floor(Math.min(...vals) / 100) * 100,
    max: Math.ceil(Math.max(...vals) / 100) * 100,
  };
})();

const BRAND_PICKS = [
  { id: "bp1", name: "THEOT / J mering...", category: "Shirts", price: "$27.53", image: img("bp-shirts") },
  { id: "bp2", name: "Queen's Square /...", category: "Knitwear/Sweaters", price: "$20.09", image: img("bp-knit") },
  { id: "bp3", name: "THEOT / high tou...", category: "Blouses", price: "$17.11", image: img("bp-blouse") },
];

const BRAND_RESULTS = [
  { id: "hm-home", name: "H&M Home Brand Store", followers: 5893, verified: true, logo: img("br-hm-home") },
  { id: "zara", name: "Zara Essentials Studio", followers: 4218, verified: true, logo: img("br-zara") },
];

// ─────────────────────────────────────────────────────────────
// Product card
// ─────────────────────────────────────────────────────────────
function ProductCard({ p, compact }: { p: RProduct; compact: boolean }) {
  const callVendor = useCallVendor();
  const t = useT();
  const saved = useSaved();
  const isSaved = Boolean(saved.products[p.id]);
  const [hovered, setHovered] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white flex flex-col"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <Link to={`/product/${p.id}`} className="relative aspect-[4/5] block bg-gray-100">
        <img src={p.image} alt={p.name} className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", hovered ? "opacity-0" : "opacity-100")} />
        <img src={p.secondaryImage} alt="" className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", hovered ? "opacity-100" : "opacity-0")} />
        {p.verified && <img src={trustedSeal} alt="TrustedSEAL verified vendor" className="absolute top-0 left-0 h-5 lg:h-6 w-auto" />}
        <button onClick={(e) => { e.preventDefault(); openSaveModal({ id: p.id, vendorId: p.vendorId, name: p.name, manufacturer: p.manufacturer, location: p.location, price: `₹${p.priceValue}`, priceValue: p.priceValue, moq: p.moq, image: p.image }); }}
          aria-label={isSaved ? "Edit saved folders" : "Save product"}
          className={cn("absolute top-2 right-2 bg-white/90 rounded-full flex items-center justify-center shadow-sm", compact ? "w-6 h-6" : "w-7 h-7")}>
          {isSaved ? <BookmarkCheck className={cn("text-[#ef4d62] fill-[#ef4d62]/15", compact ? "w-3 h-3" : "w-3.5 h-3.5")} /> : <Bookmark className={cn("text-gray-500", compact ? "w-3 h-3" : "w-3.5 h-3.5")} />}
        </button>
        <div className="absolute bottom-2 left-2 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 py-0.5">
          <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
          <span className="text-[9px] font-bold text-gray-800">{p.rating.toFixed(1)}</span>
          <span className="text-[9px] text-gray-400">| {p.enquiries}</span>
        </div>
      </Link>
      <div className={cn("flex flex-col flex-1", compact ? "p-1.5" : "p-2")}>
        <p className={cn("font-bold text-[#ef4d62] leading-snug", compact ? "text-[9px] truncate" : "text-xs")}>₹{p.priceValue} | {p.moq} | {p.sold}</p>
        <p className={cn("text-gray-600 mt-0.5", compact ? "text-[8px] truncate" : "text-[10px]")}>{p.name} | <Link to={`/vendor/${p.vendorId}`} className="font-bold hover:underline">{p.manufacturer}</Link></p>
        <div className="flex items-center gap-0.5 mt-0.5">
          <MapPin className={cn("text-gray-500 shrink-0", compact ? "w-2 h-2" : "w-2.5 h-2.5")} />
          <span className={cn("font-bold text-gray-700 truncate", compact ? "text-[8px]" : "text-[10px]")}>{p.location}</span>
        </div>
        {!compact && (
          <>
            <p className="text-[10px] text-gray-500 mt-0.5">Fabric: {p.fabric} | GSM: {p.gsm}</p>
            <p className="text-[10px] text-gray-500">Fit Type: {p.fit}</p>
          </>
        )}
        <button onClick={() => callVendor(p.vendorId, p.name)}
          className={cn("mt-auto pt-2 w-full flex items-center justify-center gap-1.5 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white font-bold rounded-lg transition-colors", compact ? "text-[9px] py-1.5" : "text-xs py-2")}>
          <Phone className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} /> {t("Call Now")}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dropdown panel (GENDER / SORT / FILTER) — slides below the bar
// ─────────────────────────────────────────────────────────────
function FilterPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: E }}
      className="absolute inset-x-0 top-full z-30 bg-white border-b border-gray-200 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 py-3">{children}</div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Facet matcher — tests a product against one context-aware facet
// ─────────────────────────────────────────────────────────────
function matchFacet(p: RProduct, f: Facet, values?: string[]): boolean {
  if (!values || values.length === 0) return true;
  switch (f.field) {
    case "gender": return values.includes(p.gender);
    case "fabric": return values.includes(p.fabric);
    case "fit": return values.includes(p.fit);
    case "price": {
      // Range facet: values are [min, max]. Keep products whose price falls
      // inside the buyer's chosen band.
      const min = Number(values[0]);
      const max = Number(values[1]);
      return p.priceValue >= min && p.priceValue <= max;
    }
    case "gsm": return values.includes(gsmBucket(p.gsm));
    case "colour": return values.includes(p.colour);
    case "moq": return values.includes(hashPick(p.id + "|moq", f.options));
    case "rating": return p.rating >= Math.min(...values.map(ratingThreshold));
    case "verified": return p.verified;
    // Facets with no backing field derive a stable pseudo-value per product.
    default: return values.includes(hashPick(p.id + "|" + f.id, f.options));
  }
}

// ─────────────────────────────────────────────────────────────
// Price range control — dual-thumb slider, buyer picks any min/max band
// ─────────────────────────────────────────────────────────────
function PriceRangeControl({ facet, value, onChange }: {
  facet: Facet; value: string[]; onChange: (v: [number, number]) => void;
}) {
  const min = facet.min ?? 0;
  const max = facet.max ?? 2000;
  const step = facet.step ?? 50;
  const cur: [number, number] = value.length === 2 ? [Number(value[0]), Number(value[1])] : [min, max];
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}${n >= max ? "+" : ""}`;

  return (
    <div className="pt-1">
      <div className="flex items-center justify-between mb-3">
        <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-sm font-bold text-gray-900 tabular-nums">{fmt(cur[0])}</span>
        <span className="text-xs text-gray-400">to</span>
        <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-sm font-bold text-gray-900 tabular-nums">{fmt(cur[1])}</span>
      </div>
      <SliderPrimitive.Root
        min={min} max={max} step={step} value={cur} minStepsBetweenThumbs={1}
        onValueChange={(v) => onChange([v[0], v[1]] as [number, number])}
        className="relative flex w-full touch-none select-none items-center py-2"
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-gray-200">
          <SliderPrimitive.Range className="absolute h-full bg-[#ef4d62]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb aria-label="Minimum price" className="block h-5 w-5 rounded-full border-2 border-[#ef4d62] bg-white shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4d62]/40" />
        <SliderPrimitive.Thumb aria-label="Maximum price" className="block h-5 w-5 rounded-full border-2 border-[#ef4d62] bg-white shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4d62]/40" />
      </SliderPrimitive.Root>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Context-aware filter sheet (bottom sheet on mobile)
// ─────────────────────────────────────────────────────────────
function FilterSheet({
  open, onClose, domainLabel, facets, selections, onToggle, onRange, onClear, resultCount,
}: {
  open: boolean; onClose: () => void; domainLabel: string; facets: Facet[];
  selections: Record<string, string[]>; onToggle: (facet: Facet, value: string) => void;
  onRange: (facet: Facet, v: [number, number]) => void;
  onClear: () => void; resultCount: number;
}) {
  const t = useT();
  const active = countActive(selections, facets);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.3, ease: E }}
            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl flex flex-col max-h-[85vh] sm:max-w-lg sm:mx-auto"
          >
            {/* Header */}
            <div className="shrink-0 px-5 pt-4 pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900">{t("Filters")}</h2>
                  <p className="text-xs text-gray-400 truncate">{t("Refining")} <span className="font-semibold text-[#ef4d62]">{domainLabel}</span></p>
                </div>
                <button onClick={onClose} className="p-1 -mr-1 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Facets */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {facets.filter((f) => !f.hidden).map((f) => {
                const sel = selections[f.id] || [];
                return (
                  <div key={f.id}>
                    <div className="flex items-baseline gap-2 mb-2">
                      <p className="text-sm font-bold text-gray-900">{f.label}</p>
                      {f.hint && <span className="text-[11px] text-gray-400">{f.hint}</span>}
                    </div>
                    {f.kind === "range" ? (
                      <PriceRangeControl facet={f} value={sel} onChange={(v) => onRange(f, v)} />
                    ) : f.id === "colour" ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-3">
                        {f.options.map((opt) => {
                          const on = sel.includes(opt);
                          const pale = PALE_COLOURS.has(opt);
                          return (
                            <button key={opt} onClick={() => onToggle(f, opt)} aria-pressed={on} aria-label={opt}
                              className="flex flex-col items-center gap-1 w-12">
                              <span
                                className={cn(
                                  "w-8 h-8 rounded-full flex items-center justify-center transition-shadow",
                                  on ? "ring-2 ring-[#ef4d62] ring-offset-1" : "ring-1 ring-gray-200"
                                )}
                                style={{ backgroundColor: COLOUR_HEX[opt] ?? "#d1d5db" }}
                              >
                                {on && <Check className={cn("w-4 h-4", pale ? "text-gray-800" : "text-white")} />}
                              </span>
                              <span className={cn("text-[10px] leading-tight text-center", on ? "font-bold text-gray-900" : "text-gray-500")}>{opt}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {f.options.map((opt) => {
                          const on = sel.includes(opt);
                          return (
                            <button key={opt} onClick={() => onToggle(f, opt)}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                                on ? "bg-[#ef4d62] text-white border-[#ef4d62]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                              )}>
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-t border-gray-100 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button onClick={onClear} disabled={active === 0}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-colors">
                {t("Clear")}{active > 0 ? ` (${active})` : ""}
              </button>
              <button onClick={onClose}
                className="flex-[1.4] py-3 rounded-xl text-sm font-bold text-white bg-[#ef4d62] hover:bg-[#ef4d62]/90 transition-colors">
                {t("Show")} {resultCount} {resultCount === 1 ? t("result") : t("results")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
type Tab = "product" | "brand";
type Menu = "sort" | null;

const SearchResults = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const t = useT();
  const [params] = useSearchParams();
  const query = params.get("q") || params.get("category") || "";

  const [tab, setTab] = useState<Tab>("product");
  const [menu, setMenu] = useState<Menu>(null);
  const [sort, setSort] = useState<SortKey>("new");
  const [cols, setCols] = useState<2 | 3>(2);
  const [batches, setBatches] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageSaved, setPageSaved] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Live catalogue from Supabase (all status='live' products). Feeds the grid
  // and the filter/sort pipeline below.
  const { data: catalogue } = useCatalogue();

  // Price-slider bounds derived from the live catalogue (fallback to the static
  // sample bounds while it loads or if the catalogue is empty).
  const priceBounds = useMemo(() => {
    const vals = (catalogue ?? []).map((p) => p.priceValue).filter((n) => n > 0);
    if (vals.length === 0) return PRICE_BOUNDS;
    return { min: Math.floor(Math.min(...vals) / 100) * 100, max: Math.ceil(Math.max(...vals) / 100) * 100 };
  }, [catalogue]);

  // Context-aware filters resolved from the search query. The price range's
  // bounds are overridden with the catalogue's actual min/max so the slider
  // always fits the real data instead of the schema's static fallback.
  const schema = useMemo(() => {
    const s = resolveFilterSchema(query);
    return {
      ...s,
      facets: s.facets.map((f) =>
        f.kind === "range" && f.id === "price" ? { ...f, min: priceBounds.min, max: priceBounds.max } : f
      ),
    };
  }, [query, priceBounds]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selections, setSelections] = useState<Record<string, string[]>>(() => defaultSelections(query));

  // Re-derive default selections (e.g. gender pre-scope) when the query changes.
  useEffect(() => { setSelections(defaultSelections(query)); }, [query]);

  const activeCount = useMemo(
    () => countActive(selections, schema.facets),
    [selections, schema]
  );

  const setRange = (facet: Facet, [lo, hi]: [number, number]) => {
    setSelections((prev) => {
      const out = { ...prev };
      const min = facet.min ?? 0;
      const max = facet.max ?? 0;
      // Full-span selection = no active filter; drop it so it doesn't count
      // or needlessly filter.
      if (lo <= min && hi >= max) delete out[facet.id];
      else out[facet.id] = [String(lo), String(hi)];
      return out;
    });
  };

  const toggleFacet = (facet: Facet, value: string) => {
    setSelections((prev) => {
      const cur = prev[facet.id] || [];
      const has = cur.includes(value);
      // multi defaults to true; single-select facets replace.
      const next = facet.multi === false
        ? (has ? [] : [value])
        : (has ? cur.filter((v) => v !== value) : [...cur, value]);
      const out = { ...prev, [facet.id]: next };
      if (next.length === 0) delete out[facet.id];
      return out;
    });
  };

  const products = useMemo(() => {
    // Real catalogue once loaded; the local samples only stand in while the
    // query is still in flight (avoids an empty flash on first paint).
    const source: RProduct[] = catalogue === undefined
      ? Array.from({ length: batches }, (_, b) =>
          BASE_PRODUCTS.map((p) => ({ ...p, id: `${p.id}-${b}`, vendorId: `${p.vendorId}-${b}` }))
        ).flat()
      : (catalogue as unknown as RProduct[]);
    let list = source.filter((p) => schema.facets.every((f) => matchFacet(p, f, selections[f.id])));
    if (sort === "price-asc") list = [...list].sort((a, b) => a.priceValue - b.priceValue);
    else if (sort === "price-desc") list = [...list].sort((a, b) => b.priceValue - a.priceValue);
    else if (sort === "popularity") list = [...list].sort((a, b) => b.popularity - a.popularity);
    else if (sort === "discount") list = [...list].sort((a, b) => b.discount - a.discount);
    else if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    return list;
  }, [catalogue, batches, schema, selections, sort]);

  const brands = useMemo(
    () => BRAND_RESULTS.filter((b) => !query || b.name.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  // Infinite scroll (product tab only)
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || tab !== "product") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMore) {
        setLoadingMore(true);
        window.setTimeout(() => { setBatches((c) => c + 1); setLoadingMore(false); }, 300);
      }
    }, { rootMargin: "300px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadingMore, tab]);

  useEffect(() => { setBatches(1); }, [selections, sort]);

  const sortLabel = sort === "new" ? "SORT" : SORTS.find((s) => s.key === sort)?.label ?? "SORT";

  return (
    <div className="min-h-screen bg-white">
      {/* ── Header ── */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-3">
          <button onClick={() => navigate("/home/new-arrivals")} className="block mb-2">
            <CosoraLogo height={22} />
          </button>

          <div className="flex items-center gap-2 pb-2">
            <button onClick={() => navigate(-1)} aria-label="Go back" className="shrink-0 p-1 -ml-1"><ArrowLeft className="w-5 h-5 text-gray-700" /></button>
            <button onClick={() => navigate("/search")} className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-3.5 py-2 text-left">
              <span className={cn("flex-1 truncate text-sm", query ? "text-gray-900" : "text-gray-400")}>{query || "Search for items or brands"}</span>
              {query && <span onClick={(e) => { e.stopPropagation(); navigate("/search"); }} aria-label="Clear"><X className="w-4 h-4 text-gray-400" /></span>}
            </button>
            <button onClick={() => setPageSaved((s) => !s)} aria-label="Save search" className="p-1 shrink-0">
              {pageSaved ? <BookmarkCheck className="w-5 h-5 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="w-5 h-5 text-gray-700" />}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-6">
            {([["product", `Product 9,999+`], ["brand", `Brand ${brands.length}`]] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setTab(key); setMenu(null); }} className="relative pb-2.5">
                <span className={cn("text-sm font-bold", tab === key ? "text-gray-900" : "text-gray-400")}>{label}</span>
                {tab === key && <motion.span layoutId="sr-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-gray-900 rounded-full" />}
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar (only on product tab) */}
        {tab === "product" && (
          <div className="relative border-t border-gray-100">
            <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 grid grid-cols-[1fr_1fr_auto] items-center">
              <button onClick={() => setMenu((m) => (m === "sort" ? null : "sort"))} className={cn("flex items-center justify-center gap-1 py-2.5 text-xs font-semibold border-r border-gray-100", sort !== "new" ? "text-[#ef4d62]" : "text-gray-700")}>
                <ArrowUpDown className="w-3.5 h-3.5" /> {t(sortLabel)}
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", menu === "sort" && "rotate-180")} />
              </button>
              <button onClick={() => setFilterOpen(true)} className={cn("flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold", activeCount > 0 ? "text-[#ef4d62]" : "text-gray-700")}>
                <Filter className="w-3.5 h-3.5" /> {t("FILTER")}
                {activeCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#ef4d62] text-white text-[10px] font-bold">{activeCount}</span>
                )}
              </button>
              <div className="flex items-center gap-1 pl-3 border-l border-gray-100">
                <button onClick={() => setCols(2)} aria-label="2 columns" className={cn("p-1.5 rounded-md", cols === 2 ? "bg-[#ef4d62] text-white" : "text-gray-400")}><Grid2X2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => setCols(3)} aria-label="3 columns" className={cn("p-1.5 rounded-md", cols === 3 ? "bg-[#ef4d62] text-white" : "text-gray-400")}><Grid3X3 className="w-3.5 h-3.5" /></button>
              </div>
            </div>

            <AnimatePresence>
              {menu === "sort" && (
                <FilterPanel>
                  <p className="text-[10px] font-bold tracking-wider text-gray-400 mb-1">SORT BY</p>
                  {SORTS.map((s) => (
                    <button key={s.key} onClick={() => { setSort(s.key); setMenu(null); }} className="w-full flex items-center justify-between py-2.5 text-left border-b border-gray-50 last:border-0">
                      <span className={cn("text-sm", sort === s.key ? "font-bold text-[#ef4d62]" : "text-gray-800")}>{s.label}</span>
                      {sort === s.key && <Check className="w-4 h-4 text-[#ef4d62]" />}
                    </button>
                  ))}
                </FilterPanel>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Scrim while a menu is open */}
      <AnimatePresence>
        {menu && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-20 bg-black/40" onClick={() => setMenu(null)} />
        )}
      </AnimatePresence>

      {/* ── Content ── */}
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pb-24 pt-4">
        {tab === "brand" ? (
          brands.length === 0 ? (
            <SubmitRequirementCard />
          ) : (
            <div className="space-y-2">
              {brands.map((b) => (
                <button key={b.id} onClick={() => navigate(`/vendor/${b.id}`)} className="w-full flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-gray-300 transition-colors">
                  <img src={b.logo} alt="" className="w-11 h-11 rounded-full object-cover bg-gray-100" />
                  <div className="flex-1 min-w-0">
                    <p className="flex items-center gap-1 text-sm font-bold text-gray-900 truncate">{b.name}{b.verified && <BadgeCheck className="w-3.5 h-3.5 text-[#ef4d62]" />}</p>
                    <p className="text-xs text-gray-400">{b.followers.toLocaleString("en-IN")} followers</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              ))}
            </div>
          )
        ) : products.length === 0 ? (
          <SubmitRequirementCard />
        ) : (
          <>
            {/* Brand Picks — sponsored */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="inline-flex items-center gap-1 text-base font-bold text-gray-900">Brand Picks <ChevronRight className="w-4 h-4 text-gray-400" /></h2>
                <span className="text-[10px] text-gray-300 font-semibold">sponsored</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                {BRAND_PICKS.map((b) => (
                  <div key={b.id} className="shrink-0 w-32 rounded-xl border border-[#ef4d62]/15 bg-[#ef4d62]/5 overflow-hidden">
                    <Link to="/search/results" className="block aspect-[3/4] bg-gray-100"><img src={b.image} alt={b.name} className="w-full h-full object-cover" /></Link>
                    <div className="p-1.5">
                      <p className="text-[10px] font-semibold text-gray-700 truncate">{b.name}</p>
                      <p className="text-[10px] text-gray-500">{b.category}</p>
                      <p className="text-xs font-bold text-gray-900">{b.price}</p>
                      <button className="mt-1 w-full flex items-center justify-center gap-1 bg-[#ef4d62] text-white text-[9px] font-bold py-1.5 rounded"><Phone className="w-2.5 h-2.5" /> Call Now</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Product grid */}
            <motion.div key={`${JSON.stringify(selections)}-${sort}`} variants={reduced ? {} : listContainer} initial="hidden" animate="show"
              className={cn("grid gap-3", cols === 2 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3 lg:grid-cols-6")}>
              {products.map((p) => (
                <motion.div variants={reduced ? {} : listItem} key={p.id}><ProductCard p={p} compact={cols === 3} /></motion.div>
              ))}
            </motion.div>

            <div ref={loadMoreRef} className="py-6 text-center text-xs text-gray-400">{loadingMore ? "Loading more..." : "Scroll for more"}</div>
          </>
        )}
      </div>

      {/* Context-aware filter sheet */}
      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        domainLabel={schema.domainLabel}
        facets={schema.facets}
        selections={selections}
        onToggle={toggleFacet}
        onRange={setRange}
        onClear={() => setSelections(defaultSelections(query))}
        resultCount={products.length}
      />

      <MobileBottomNav />
      <ToTopButton />
    </div>
  );
};

export default SearchResults;
