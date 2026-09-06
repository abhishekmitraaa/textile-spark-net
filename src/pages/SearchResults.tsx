import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import ToTopButton from "@/components/buyer/ToTopButton";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import { useBrandFollows, toggleBrandFollow } from "@/lib/brandFollowStore";
import { useCatalogue } from "@/lib/queries/products";
import { useProductSearch } from "@/lib/queries/search";
import SubmitRequirementCard from "@/components/buyer/SubmitRequirementCard";
import QuickRfqModal from "@/components/buyer/QuickRfqModal";
import VideoCloseUpsViewer, { type VideoCloseUp } from "@/components/buyer/VideoCloseUpsViewer";
import { devOnlyVideoCloseUps } from "@/data/videoCloseUps";
import { useVideoCloseUps } from "@/lib/queries/videos";
import { useDragScroll } from "@/hooks/useDragScroll";
import CosoraLogo from "@/components/CosoraLogo";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Search as SearchIcon, X, Bookmark, BookmarkCheck, ChevronDown, Check,
  Filter, ArrowUpDown, Grid2X2, Grid3X3, Star, MapPin, Phone, ChevronRight, Play, Users, Heart, BadgeCheck,
} from "lucide-react";
import trustedSeal from "@/assets/Trustedseal.png";
import {
  resolveFilterSchema, defaultSelections, gsmBucket, ratingThreshold, hashPick, moqBucket,
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
  // Real vendor-entered attributes, carried through from CatalogueRow. Optional
  // because a product with no value for a field simply doesn't match a filter
  // on it, which is the honest answer rather than a hash-derived one.
  moqValue?: number | null;
  pattern?: string[]; occasion?: string[]; sizes?: string[];
  neckType?: string; sleeveType?: string; collarType?: string; countryOfOrigin?: string;
  waistSizes?: string[]; lengths?: string[];
  categoryName?: string; parentCategoryName?: string;
}

// Thumbnails rendered in the Video Close-Ups teaser rail. The viewer still
// receives the full related list; this only caps images fetched by the page.
const VIDEO_RAIL_MAX = 12;

// Price-slider bounds are ALWAYS derived from the rows actually on screen (see
// priceBounds below). This is only the degenerate fallback for when there are
// no rows yet or none carry a price — a slider still needs a min and a max to
// render. It is not a claim about the catalogue.
const PRICE_BOUNDS = { min: 0, max: 2000 };

// ── Brand tab ───────────────────────────────────────────────
// Derived from the ranked product results, not from a fixture. Grouping the
// matched listings by vendor answers exactly the question the tab asks — which
// suppliers make what I searched for — using rows that are already on screen,
// with no extra request.
//
// What used to be here: BRAND_RESULTS, six invented manufacturers (Everest
// Outerwear Co., Denim Republic Mills, …) with invented ratings, review counts
// and follower numbers ("9,999+"), stock Unsplash photography, and product
// lines that existed nowhere in the database — so tapping one led to a vendor
// page that does not exist. Alongside it, BRAND_PICKS: a "Sponsored" rail of
// six more fake listings priced in USD ("$27.53") on an INR marketplace, with
// no ad system behind it. Both are gone.
//
// Rating / reviews / followers are deliberately NOT shown here. They exist in
// the schema but not on the rows this tab already has, and inventing them is
// what got the previous version into trouble. Fewer real fields beats more
// fabricated ones.
interface BrandProduct { id: string; name: string; price: string; image: string; }
interface BrandResult {
  id: string; name: string; location: string;
  verified: boolean; products: BrandProduct[];
}

/** Group the ranked product results by their owning vendor. Vendors appear in
 *  the order their best-ranked product did, so the tab inherits the server's
 *  relevance ordering rather than inventing one. */
function brandsFromProducts(rows: RProduct[]): BrandResult[] {
  const byVendor = new Map<string, BrandResult>();
  for (const p of rows) {
    let brand = byVendor.get(p.vendorId);
    if (!brand) {
      brand = { id: p.vendorId, name: p.manufacturer, location: p.location, verified: p.verified, products: [] };
      byVendor.set(p.vendorId, brand);
    }
    brand.products.push({
      id: p.id,
      name: p.name,
      price: p.priceValue > 0 ? `₹${p.priceValue.toLocaleString("en-IN")}` : "—",
      image: p.image,
    });
  }
  return [...byVendor.values()];
}

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
      <div className={cn("flex flex-col flex-1", compact ? "p-1.5" : "p-2 lg:p-3")}>
        <p className={cn("font-bold text-[#ef4d62] leading-snug", compact ? "text-[9px] truncate" : "text-xs lg:text-sm")}>₹{p.priceValue} | {p.moq} | {p.sold}</p>
        <p className={cn("text-gray-600 mt-0.5", compact ? "text-[8px] truncate" : "text-[10px] lg:text-xs")}>{p.name} | <Link to={`/vendor/${p.vendorId}`} className="font-bold hover:underline">{p.manufacturer}</Link></p>
        <div className="flex items-center gap-0.5 mt-0.5">
          <MapPin className={cn("text-gray-500 shrink-0", compact ? "w-2 h-2" : "w-2.5 h-2.5 lg:w-3 lg:h-3")} />
          <span className={cn("font-bold text-gray-700 truncate", compact ? "text-[8px]" : "text-[10px] lg:text-xs")}>{p.location}</span>
        </div>
        {!compact && (
          <>
            <p className="text-[10px] lg:text-[11px] text-gray-500 mt-0.5">Fabric: {p.fabric} | GSM: {p.gsm}</p>
            <p className="text-[10px] lg:text-[11px] text-gray-500">Fit Type: {p.fit}</p>
          </>
        )}
        <button onClick={() => callVendor(p.vendorId, p.name)}
          className={cn("mt-auto pt-2 w-full flex items-center justify-center gap-1.5 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white font-bold rounded-lg transition-colors", compact ? "text-[9px] py-1.5" : "text-xs lg:text-sm py-2 lg:py-2.5")}>
          <Phone className={compact ? "w-2.5 h-2.5" : "w-3 h-3 lg:w-3.5 lg:h-3.5"} /> {t("Call Now")}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Brand card (Brand tab) — a supplier that deals in the searched item,
// with its related product line, follow, and call/chat actions.
// ─────────────────────────────────────────────────────────────
function BrandCard({ brand, products }: { brand: BrandResult; products: BrandProduct[] }) {
  const navigate = useNavigate();
  const t = useT();
  const rail = useDragScroll<HTMLDivElement>();
  const follows = useBrandFollows();
  const following = follows.has(brand.id);

  // SINSANG-style store card: an image-forward, minimal surface. Just the store
  // header (logo · name · location/followers · heart-follow) and a row of product
  // thumbnails with price. No ratings / MOQ / product names / per-card call+chat —
  // tapping the store or a product goes to the profile / detail where you act.
  return (
    <div className="rounded-2xl border border-gray-100 p-4 lg:p-5 transition-colors hover:border-gray-200">
      {/* Store header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/vendor/${brand.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          {/* No logo column: vendor_profiles carries no logo on the rows this
              tab already has, and the previous version filled the gap with
              stock photography. An initial is honest and costs no request. */}
          <span className="w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-gray-100 shrink-0 flex items-center justify-center text-sm font-bold text-gray-500">
            {brand.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1">
              <span className="text-sm lg:text-[15px] font-semibold text-gray-900 truncate">{brand.name}</span>
              {brand.verified && <BadgeCheck className="w-3.5 h-3.5 text-[#ef4d62] shrink-0" />}
            </span>
            <span className="block text-xs text-gray-400 truncate mt-0.5">
              {brand.location} · {brand.products.length} {brand.products.length === 1 ? t("matching listing") : t("matching listings")}
            </span>
          </span>
        </button>
        <button onClick={() => toggleBrandFollow(brand.id)} aria-label={following ? "Unfollow" : "Follow"} className="shrink-0 -mr-1 p-1.5">
          <Heart className={cn("w-[22px] h-[22px] transition-colors", following ? "text-[#ef4d62] fill-[#ef4d62]" : "text-gray-300 hover:text-gray-400")} />
        </button>
      </div>

      {/* Product thumbnails — image-forward, price only */}
      <div
        ref={rail.ref}
        className={cn("flex gap-2 lg:gap-2.5 mt-3.5 overflow-x-auto scrollbar-hide -mx-1 px-1", rail.className)}
        onMouseDown={rail.onMouseDown}
        onMouseMove={rail.onMouseMove}
        onMouseUp={rail.onMouseUp}
        onMouseLeave={rail.onMouseLeave}
        onClickCapture={rail.onClickCapture}
      >
        {products.map((p) => (
          <Link key={p.id} to={`/product/${p.id}`} className="group shrink-0 w-[4.75rem] lg:w-24">
            <div className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-100">
              <img src={p.image} alt={p.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" draggable={false} />
            </div>
            <p className="mt-1.5 text-[11px] lg:text-xs font-semibold text-gray-700">{p.price}</p>
          </Link>
        ))}
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
// A text[] column matches when the product carries any of the chosen values.
const anyOf = (col: string[] | undefined, values: string[]) =>
  !!col && col.some((v) => values.includes(v));

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
    // moq has had a real column all along; it was hashPicked by oversight.
    case "moq": return p.moqValue != null && values.includes(moqBucket(p.moqValue));
    case "rating": return p.rating >= Math.min(...values.map(ratingThreshold));
    case "verified": return p.verified;

    // ── Real vendor-entered attributes ──
    // Array columns match if the product carries ANY of the selected values.
    case "pattern": return anyOf(p.pattern, values);
    case "occasion": return anyOf(p.occasion, values);
    case "sizes": return anyOf(p.sizes, values);
    case "waist": return anyOf(p.waistSizes, values);
    case "lengths": return anyOf(p.lengths, values);
    case "neckType": return !!p.neckType && values.includes(p.neckType);
    case "sleeveType": return !!p.sleeveType && values.includes(p.sleeveType);
    case "collarType": return !!p.collarType && values.includes(p.collarType);
    case "countryOfOrigin": return !!p.countryOfOrigin && values.includes(p.countryOfOrigin);
    // Selecting a parent taxonomy row keeps everything beneath it, so
    // "Apparel & Home Categories" matches a product filed under Men's T-Shirts.
    case "category":
      return (!!p.categoryName && values.includes(p.categoryName))
        || (!!p.parentCategoryName && values.includes(p.parentCategoryName));

    // Facets with no backing column derive a stable pseudo-value per product.
    // See the KNOWN GAPS note at the bottom of searchFilters.ts.
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
// Facet controls — the actual facet inputs, shared by the mobile
// bottom sheet and the persistent desktop sidebar so both stay in sync.
// ─────────────────────────────────────────────────────────────
function FacetControls({
  facets, selections, onToggle, onRange,
}: {
  facets: Facet[];
  selections: Record<string, string[]>;
  onToggle: (facet: Facet, value: string) => void;
  onRange: (facet: Facet, v: [number, number]) => void;
}) {
  return (
    <>
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
                  // Real product count, only present on catalogue-derived facets.
                  const count = f.optionCounts?.[opt];
                  return (
                    <button key={opt} onClick={() => onToggle(f, opt)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                        on ? "bg-[#ef4d62] text-white border-[#ef4d62]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                      )}>
                      {opt}
                      {count != null && (
                        <span className={cn("ml-1.5 font-medium", on ? "text-white/75" : "text-gray-400")}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
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
              <FacetControls facets={facets} selections={selections} onToggle={onToggle} onRange={onRange} />
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
type Menu = "gender" | "sort" | null;

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
  const [pageSaved, setPageSaved] = useState(false);
  const [quickRfqOpen, setQuickRfqOpen] = useState(false);
  const [videoViewerOpen, setVideoViewerOpen] = useState(false);
  const [videoStartIndex, setVideoStartIndex] = useState(0);

  // Mouse click-and-drag panning for the horizontal Brand Picks / Video rails
  // (touch + trackpad already pan natively; this is for desktop mouse users).
  const brandPicksDrag = useDragScroll<HTMLDivElement>();
  const videoRailDrag = useDragScroll<HTMLDivElement>();

  // ── Results source ──
  // With a query, ranking happens server-side in match_products (keyword +
  // vector, fused by RRF, weighted by the vendor's paid boost) and only the
  // matched rows come back. The page no longer downloads the whole live table
  // to run `.includes()` over it in the browser.
  //
  // Without a query — arriving via ?category= with an empty q — there is nothing
  // to rank, so the full catalogue is still the right source. Both hooks are
  // called unconditionally (rules of hooks); `enabled` decides which one runs.
  const hasQuery = query.trim().length > 0;
  const { data: searchData, isLoading: searchLoading } = useProductSearch(query);
  const { data: browseData, isLoading: browseLoading } = useCatalogue(!hasQuery);

  const catalogue = hasQuery ? searchData?.rows : browseData;
  const isLoading = hasQuery ? searchLoading : browseLoading;
  // False when the query had no cached embedding, so results were keyword-only.
  const semanticActive = hasQuery ? (searchData?.embeddingUsed ?? false) : false;

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
  const baseSchema = useMemo(() => {
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

  // The Category facet is the one facet whose options can't be written ahead of
  // time — they're the taxonomy rows that actually have matching products. Both
  // the options and their counts come from the live catalogue, counted against
  // every OTHER active facet (not the category selection itself), so a number
  // says what picking that category would actually return.
  //
  // Declared after `selections` because it reads it — a const is in its temporal
  // dead zone until initialised, so hoisting this above the useState throws
  // "Cannot access 'selections' before initialization" and blanks the page.
  const categoryOptions = useMemo(() => {
    if (!catalogue) return { names: [] as string[], counts: {} as Record<string, number> };
    const scoped = (catalogue as unknown as RProduct[]).filter((p) =>
      baseSchema.facets.every((f) => f.field === "category" || matchFacet(p, f, selections[f.id])));
    const counts: Record<string, number> = {};
    for (const p of scoped) {
      // A product counts towards its own subcategory and its parent, so picking
      // either narrows sensibly.
      for (const n of [p.parentCategoryName, p.categoryName]) {
        if (n) counts[n] = (counts[n] ?? 0) + 1;
      }
    }
    const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b)).slice(0, 12);
    return { names, counts };
  }, [catalogue, baseSchema, selections]);

  const schema = useMemo(() => ({
    ...baseSchema,
    facets: baseSchema.facets.map((f) =>
      f.field === "category"
        ? { ...f, options: categoryOptions.names, optionCounts: categoryOptions.counts }
        : f),
  }), [baseSchema, categoryOptions]);

  // Re-derive default selections (e.g. gender pre-scope) when the query changes.
  useEffect(() => { setSelections(defaultSelections(query)); }, [query]);

  // Gender is surfaced as its own bar dropdown (GENDER | SORT | FILTER), so it's
  // pulled out of the filter sheet — the sheet + its active-count only cover the
  // remaining facets. `genderFacet` is context-aware (e.g. dresses → Women/Girls)
  // and absent for non-apparel searches, in which case the GENDER button hides.
  // Also drop any facet left with no options — the Category facet is empty
  // until the catalogue loads, and an empty heading is just noise.
  const sheetFacets = useMemo(
    () => schema.facets.filter((f) => f.id !== "gender" && (f.kind === "range" || f.options.length > 0)),
    [schema],
  );
  const genderFacet = useMemo(() => schema.facets.find((f) => f.id === "gender"), [schema]);
  const genderOptions = genderFacet?.options ?? [...GENDERS];
  const genderSel = selections.gender?.[0] ?? null;

  const activeCount = useMemo(
    () => countActive(selections, sheetFacets),
    [selections, sheetFacets]
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
    // No placeholder rows while loading. The page previously stood in 8 fake
    // products to avoid an empty flash, which made a failed fetch look like a
    // populated catalogue — and the project's rule is that an empty catalogue
    // renders empty. Loading is its own state, rendered below.
    const source = (catalogue ?? []) as unknown as RProduct[];
    let list = source.filter((p) => schema.facets.every((f) => matchFacet(p, f, selections[f.id])));
    // "What's new" keeps the incoming order. For a search that order IS the
    // server's fused relevance ranking, so re-sorting here would throw away the
    // result of match_products.
    if (sort === "price-asc") list = [...list].sort((a, b) => a.priceValue - b.priceValue);
    else if (sort === "price-desc") list = [...list].sort((a, b) => b.priceValue - a.priceValue);
    else if (sort === "popularity") list = [...list].sort((a, b) => b.popularity - a.popularity);
    else if (sort === "discount") list = [...list].sort((a, b) => b.discount - a.discount);
    else if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    return list;
  }, [catalogue, schema, selections, sort]);

  // Suppliers who actually make what was searched for — grouped straight out of
  // the ranked, facet-filtered product results, so the tab can never disagree
  // with the Product tab beside it.
  const brandResults = useMemo(() => brandsFromProducts(products), [products]);

  // Video Close-Ups related to the search — vendor-uploaded reels only (the
  // sample set is dev-only, so an empty catalogue hides the whole section via
  // the `relatedVideos.length > 0` guard below). Ranked so the ones whose
  // category / product line / brand match the query tokens surface first.
  const { data: dbVideos } = useVideoCloseUps();
  const relatedVideos = useMemo(() => {
    const base: VideoCloseUp[] = dbVideos?.length ? dbVideos : devOnlyVideoCloseUps();
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return base;
    const score = (v: VideoCloseUp) => {
      const hay = `${v.category} ${v.brandLine} ${v.brandName}`.toLowerCase();
      return tokens.reduce((s, tk) => s + (hay.includes(tk) ? 1 : 0), 0);
    };
    return base
      .map((v, i) => ({ v, i, s: score(v) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.v);
  }, [dbVideos, query]);

  // Product feed with a "Submit Requirement" card interleaved every 5 rows —
  // same per-breakpoint cadence as New Arrivals. A row is `cols` cards on mobile
  // and `cols*2` on desktop, so cards land at multiples of the desktop interval
  // (shown on both breakpoints, `col-span-full`) plus the in-between mobile
  // multiples (`lg:hidden`, so they collapse out of the desktop grid, no gap).
  const desktopCols = cols * 2;             // 4 (2-col) or 6 (3-col)
  const mobileInterval = cols * 5;          // 10 or 15
  const desktopInterval = desktopCols * 5;  // 20 or 30
  const feedNodes: JSX.Element[] = [];
  products.forEach((p, i) => {
    feedNodes.push(
      <motion.div variants={reduced ? {} : listItem} key={p.id}><ProductCard p={p} compact={cols === 3} /></motion.div>
    );
    const n = i + 1;
    if (n >= products.length) return; // never trail the last loaded product
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

  // The infinite-scroll batching that used to live here only ever grew the
  // FAKE placeholder set — the real catalogue was rendered in full on first
  // paint. With search served by match_products the result set is already
  // bounded (SEARCH_MATCH_COUNT), so a "Scroll for more" affordance that loads
  // nothing was advertising pagination this page has never had.

  const sortLabel = sort === "new" ? "SORT" : SORTS.find((s) => s.key === sort)?.label ?? "SORT";

  return (
    <div className="min-h-screen bg-white">
      {/* ── Header ── */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="max-w-2xl lg:max-w-6xl xl:max-w-7xl mx-auto px-4 lg:px-6 pt-3">
          <button onClick={() => navigate("/home/new-arrivals")} className="block mb-2">
            <CosoraLogo height={22} />
          </button>

          <div className="flex items-center gap-2 pb-2">
            <button onClick={() => navigate(-1)} aria-label="Go back" className="shrink-0 p-1 -ml-1"><ArrowLeft className="w-5 h-5 text-gray-700" /></button>
            <button onClick={() => navigate("/search")} className="flex-1 lg:max-w-2xl flex items-center gap-2 bg-gray-100 rounded-full px-3.5 py-2 lg:py-2.5 text-left">
              <span className={cn("flex-1 truncate text-sm", query ? "text-gray-900" : "text-gray-400")}>{query || "Search for items or brands"}</span>
              {query && <span onClick={(e) => { e.stopPropagation(); navigate("/search"); }} aria-label="Clear"><X className="w-4 h-4 text-gray-400" /></span>}
            </button>
            <button onClick={() => setPageSaved((s) => !s)} aria-label="Save search" className="p-1 shrink-0">
              {pageSaved ? <BookmarkCheck className="w-5 h-5 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="w-5 h-5 text-gray-700" />}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-6">
            {/* Both counts are real. "Product" was a hardcoded `9,999+` sitting
                next to a genuine brand count — it now reports the filtered
                result set, so it moves as the buyer narrows the facets. */}
            {([["product", `Product ${products.length}`], ["brand", `Brand ${brandResults.length}`]] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setTab(key); setMenu(null); }} className="relative pb-2.5">
                <span className={cn("text-sm font-bold", tab === key ? "text-gray-900" : "text-gray-400")}>{label}</span>
                {tab === key && <motion.span layoutId="sr-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-gray-900 rounded-full" />}
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar (only on product tab) — GENDER | SORT | FILTER | grid,
            shown on every breakpoint. FILTER opens the context-aware sheet. */}
        {tab === "product" && (
          <div className="relative border-t border-gray-100">
            {/* Mobile/tablet: evenly-segmented grid. Desktop (lg): a left-aligned
                toolbar cluster (GENDER · SORT · FILTER) with the density toggle
                pushed to the right, instead of stretching edge-to-edge. */}
            <div className={cn(
              "max-w-2xl lg:max-w-6xl xl:max-w-7xl mx-auto px-4 lg:px-6 grid lg:flex items-center",
              genderFacet ? "grid-cols-[1fr_1fr_1fr_auto]" : "grid-cols-[1fr_1fr_auto]"
            )}>
              {genderFacet && (
                <button onClick={() => setMenu((m) => (m === "gender" ? null : "gender"))} className={cn("flex items-center justify-center gap-1 py-2.5 lg:px-5 text-xs lg:text-sm font-semibold border-r border-gray-100", genderSel ? "text-[#ef4d62]" : "text-gray-700")}>
                  <Users className="w-3.5 h-3.5" /> {t(genderSel ?? "GENDER")}
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", menu === "gender" && "rotate-180")} />
                </button>
              )}
              <button onClick={() => setMenu((m) => (m === "sort" ? null : "sort"))} className={cn("flex items-center justify-center gap-1 py-2.5 lg:px-5 text-xs lg:text-sm font-semibold border-r border-gray-100", sort !== "new" ? "text-[#ef4d62]" : "text-gray-700")}>
                <ArrowUpDown className="w-3.5 h-3.5" /> {t(sortLabel)}
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", menu === "sort" && "rotate-180")} />
              </button>
              <button onClick={() => setFilterOpen(true)} className={cn("flex items-center justify-center gap-1.5 py-2.5 lg:px-5 text-xs lg:text-sm font-semibold", activeCount > 0 ? "text-[#ef4d62]" : "text-gray-700")}>
                <Filter className="w-3.5 h-3.5" /> {t("FILTER")}
                {activeCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#ef4d62] text-white text-[10px] font-bold">{activeCount}</span>
                )}
              </button>
              <div className="flex items-center gap-1 pl-3 lg:pl-5 lg:ml-auto border-l border-gray-100 lg:border-l-0">
                <button onClick={() => setCols(2)} aria-label="2 columns" className={cn("p-1.5 rounded-md", cols === 2 ? "bg-[#ef4d62] text-white" : "text-gray-400 hover:text-gray-600")}><Grid2X2 className="w-3.5 h-3.5 lg:w-4 lg:h-4" /></button>
                <button onClick={() => setCols(3)} aria-label="3 columns" className={cn("p-1.5 rounded-md", cols === 3 ? "bg-[#ef4d62] text-white" : "text-gray-400 hover:text-gray-600")}><Grid3X3 className="w-3.5 h-3.5 lg:w-4 lg:h-4" /></button>
              </div>
            </div>

            <AnimatePresence>
              {menu === "gender" && (
                <FilterPanel key="gender-panel">
                  <p className="text-[10px] font-bold tracking-wider text-gray-400 mb-1">{(genderFacet?.label ?? "Gender").toUpperCase()}</p>
                  <button onClick={() => { setSelections((prev) => { const out = { ...prev }; delete out.gender; return out; }); setMenu(null); }} className="w-full flex items-center justify-between py-2.5 text-left border-b border-gray-50">
                    <span className={cn("text-sm", !genderSel ? "font-bold text-[#ef4d62]" : "text-gray-800")}>{t("Everyone")}</span>
                    {!genderSel && <Check className="w-4 h-4 text-[#ef4d62]" />}
                  </button>
                  {genderOptions.map((opt) => (
                    <button key={opt} onClick={() => { setSelections((prev) => ({ ...prev, gender: [opt] })); setMenu(null); }} className="w-full flex items-center justify-between py-2.5 text-left border-b border-gray-50 last:border-0">
                      <span className={cn("text-sm", genderSel === opt ? "font-bold text-[#ef4d62]" : "text-gray-800")}>{t(opt)}</span>
                      {genderSel === opt && <Check className="w-4 h-4 text-[#ef4d62]" />}
                    </button>
                  ))}
                </FilterPanel>
              )}
              {menu === "sort" && (
                <FilterPanel key="sort-panel">
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
      <div className="max-w-2xl lg:max-w-6xl xl:max-w-7xl mx-auto px-4 lg:px-6 pb-24 lg:pb-12 pt-4">
        {tab === "brand" ? (
          brandResults.length === 0 ? (
            <div className="space-y-5">
              <div className="text-center py-2">
                <p className="text-sm text-gray-500">{t("No brands match")} {query && <span className="font-semibold text-gray-800">"{query}"</span>} {t("yet")}.</p>
                <p className="text-xs text-gray-400 mt-1">{t("Post a requirement and verified manufacturers will reach out.")}</p>
              </div>
              <SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} />
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-3 lg:mb-4">
                <span className="font-bold text-gray-900">{brandResults.length}</span> {brandResults.length === 1 ? t("brand deals in") : t("brands deal in")}
                {query ? <> "<span className="text-gray-700 font-semibold">{query}</span>"</> : <> {t("apparel")}</>}
              </p>
              <motion.div
                key={query}
                variants={reduced ? {} : listContainer} initial="hidden" animate="show"
                className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 items-start"
              >
                {brandResults.map((brand) => (
                  <motion.div variants={reduced ? {} : listItem} key={brand.id}>
                    <BrandCard brand={brand} products={brand.products} />
                  </motion.div>
                ))}
              </motion.div>

              {/* Post-requirement CTA under the brand results */}
              <div className="mt-5 lg:mt-6 lg:max-w-3xl lg:mx-auto">
                <SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} />
              </div>
            </>
          )
        ) : (
          <>
            {/* The "Brand Picks — sponsored" rail that used to sit here was six
                hardcoded listings in USD with a Call Now button wired to
                nothing, labelled sponsored despite no ad ever having been sold
                against it. Real sponsored placement belongs to the ad system
                (advertisements / ad_orders), which serves through active_ads —
                not to a literal array in a page component. */}

              {/* Video Close-Ups — related to the search */}
              {relatedVideos.length > 0 && (
                <div className="mb-6 lg:mb-8">
                  <h2 className="text-lg lg:text-xl font-bold text-gray-900 mb-2 lg:mb-3">
                    Video Close-Ups{query ? <span className="text-gray-400 font-semibold"> · {query}</span> : null}
                  </h2>
                  <div
                    ref={videoRailDrag.ref}
                    className={cn("flex gap-3 lg:gap-5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1", videoRailDrag.className)}
                    onMouseDown={videoRailDrag.onMouseDown}
                    onMouseMove={videoRailDrag.onMouseMove}
                    onMouseUp={videoRailDrag.onMouseUp}
                    onMouseLeave={videoRailDrag.onMouseLeave}
                    onClickCapture={videoRailDrag.onClickCapture}
                  >
                    {relatedVideos.slice(0, VIDEO_RAIL_MAX).map((v, i) => (
                      <button
                        key={v.id}
                        onClick={() => { setVideoStartIndex(i); setVideoViewerOpen(true); }}
                        className="relative shrink-0 w-36 lg:w-52 aspect-[3/4] rounded-lg overflow-hidden bg-gray-100"
                      >
                        <img
                          src={v.thumbnail}
                          alt={v.brandLine}
                          loading="lazy"
                          decoding="async"
                          width={300}
                          height={400}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 via-black/10 to-transparent pointer-events-none" />
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
                </div>
              )}

              {/* Loading / empty / results stay three distinct states — the
                  project rule. A spinner is not an empty catalogue, and an
                  empty catalogue is not a failure. */}
              {isLoading ? (
                <div className={cn("grid gap-3 lg:gap-4", cols === 2 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3 lg:grid-cols-6")}>
                  {Array.from({ length: cols * 4 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="aspect-[4/5] bg-gray-100 animate-pulse" />
                      <div className="p-2 space-y-1.5">
                        <div className="h-2.5 w-3/4 bg-gray-100 rounded animate-pulse" />
                        <div className="h-2 w-1/2 bg-gray-100 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-semibold text-gray-700">
                    No products match {query ? <>&ldquo;{query}&rdquo;</> : "these filters"}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {activeCount > 0
                      ? "Try clearing a filter, or search for a broader term."
                      : "Try a broader term, or post a requirement and let suppliers come to you."}
                  </p>
                  <button
                    onClick={() => setQuickRfqOpen(true)}
                    className="mt-4 px-4 py-2 rounded-lg bg-[#ef4d62] text-white text-xs font-bold"
                  >
                    Post a requirement
                  </button>
                </div>
              ) : (
                <>
                  {/* Product grid (Submit Requirement card interleaved every 5 rows) */}
                  <motion.div key={`${JSON.stringify(selections)}-${sort}`} variants={reduced ? {} : listContainer} initial="hidden" animate="show"
                    className={cn("grid gap-3 lg:gap-4", cols === 2 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3 lg:grid-cols-6")}>
                    {feedNodes}
                  </motion.div>
                  <div className="py-6 text-center text-xs text-gray-400">
                    {products.length} {products.length === 1 ? "result" : "results"}
                    {hasQuery && !semanticActive && " · keyword match only"}
                  </div>
                </>
              )}
          </>
        )}
      </div>

      {/* Context-aware filter sheet (gender lives in the bar dropdown instead) */}
      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        domainLabel={schema.domainLabel}
        facets={sheetFacets}
        selections={selections}
        onToggle={toggleFacet}
        onRange={setRange}
        onClear={() => setSelections(defaultSelections(query))}
        resultCount={products.length}
      />

      {/* Quick RFQ (from interleaved Submit Requirement cards) */}
      <QuickRfqModal isOpen={quickRfqOpen} onClose={() => setQuickRfqOpen(false)} />

      {/* Video Close-Ups reel viewer */}
      <VideoCloseUpsViewer
        videos={relatedVideos}
        initialIndex={videoStartIndex}
        isOpen={videoViewerOpen}
        onClose={() => setVideoViewerOpen(false)}
      />

      <MobileBottomNav />
      <ToTopButton />
    </div>
  );
};

export default SearchResults;
