import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useT } from "@/lib/i18n";
import BuyerShell from "@/components/buyer/BuyerShell";
import QuickRfqModal from "@/components/buyer/QuickRfqModal";
import ListingProductCard from "@/components/buyer/ListingProductCard";
import SubmitRequirementCard from "@/components/buyer/SubmitRequirementCard";
import { makeListingProduct, img, type ListingProduct, type Gender } from "@/lib/listingProducts";
import { useLiveProducts, type ProductCardData } from "@/lib/queries/products";
import { BUYER_CATEGORIES as CATEGORIES, PREF_CAT_KEYWORDS } from "@/lib/buyerCategories";
import {
  usePreferences,
  toggleCategory,
  toggleLocation,
  removeCategory,
  removeLocation,
  completeOnboarding,
  resetFilters,
} from "@/lib/preferencesStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  SlidersHorizontal,
  X,
  Sparkles,
  Check,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const LOCATIONS = [
  { id: "tiruppur", label: "Tiruppur" },
  { id: "surat", label: "Surat" },
  { id: "ludhiana", label: "Ludhiana" },
  { id: "delhi", label: "Delhi NCR" },
  { id: "bangalore", label: "Bangalore" },
  { id: "mumbai", label: "Mumbai" },
  { id: "nopreference", label: "No preference" },
];

const HOME_TABS = [
  { label: "NEW ARRIVALS", href: "/home/new-arrivals" },
  { label: "TRENDS", href: "/home/trends" },
  { label: "SALE", href: "/home/sale" },
  { label: "FOR YOU", href: "/home/for-you" },
  { label: "FOLLOWINGS", href: "/home/followings" },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
const LOCATION_LABEL = Object.fromEntries(LOCATIONS.map((l) => [l.id, l.label]));

const MANUFACTURERS = ["Artisan Weaves Co.", "SilkThread Mills", "Tiruppur Knitworks", "Loom & Co.", "Verde Textiles"];
const FILTERABLE_LOCATIONS = LOCATIONS.filter((l) => l.id !== "nopreference");

// Build a deterministic product pool spread across every category + location so
// preference filtering always has something to show. Used only as a fallback
// while the real catalogue loads (or if it's empty).
const PRODUCT_POOL: ListingProduct[] = Array.from({ length: 48 }, (_, i) => {
  const cat = CATEGORIES[i % CATEGORIES.length];
  const loc = FILTERABLE_LOCATIONS[i % FILTERABLE_LOCATIONS.length];
  return makeListingProduct(`foryou-${i}`, {
    manufacturer: MANUFACTURERS[i % MANUFACTURERS.length],
    location: `${loc.label}, IND`,
    category: cat.id,
    locationId: loc.id,
    enquiries: i % 2 === 0 ? "5.6k" : "1.6k",
  });
});

// Map DB locations → preference location ids, so real products flow through the
// exact same preference-filter logic. (Category keyword mapping now lives in
// the shared src/lib/buyerCategories.ts as PREF_CAT_KEYWORDS.)
const PREF_LOC_KEYWORDS: Record<string, string> = {
  tiruppur: "tirupur", surat: "surat", ludhiana: "ludhiana",
  delhi: "delhi", bangalore: "bangalore", mumbai: "mumbai",
};

function prefCategoryOf(p: ProductCardData): string | undefined {
  const hay = `${p.categoryName ?? ""} ${p.name}`.toLowerCase();
  for (const [id, kws] of Object.entries(PREF_CAT_KEYWORDS)) {
    if (kws.some((k) => hay.includes(k))) return id;
  }
  return undefined;
}
function prefLocationOf(p: ProductCardData): string | undefined {
  const loc = p.location.toLowerCase();
  for (const [id, kw] of Object.entries(PREF_LOC_KEYWORDS)) if (loc.includes(kw)) return id;
  return undefined;
}
function toListing(p: ProductCardData): ListingProduct {
  return makeListingProduct(p.id, {
    name: p.name,
    manufacturer: p.manufacturer,
    vendorId: p.vendorId,
    location: p.location,
    price: p.price,
    priceValue: p.priceValue,
    moq: `MOQ: ${p.moq}`,
    rating: p.rating,
    soldCount: p.soldCount,
    enquiries: p.enquiries,
    fabric: p.fabric,
    gsm: p.gsm,
    fitType: p.fitType,
    image: p.image,
    secondaryImage: p.secondaryImage,
    gender: (p.gender.toLowerCase() as Gender),
    category: prefCategoryOf(p),
    locationId: prefLocationOf(p),
  });
}

// "Related To Recent Views" ad products (name + price overlay style).
const RECENT_VIEW_ADS = [
  { id: "rv1", name: "Candy Knit Cardigan", price: "$22.30", image: img("rv-cardigan", 400, 400) },
  { id: "rv2", name: "Candy Knit Cardigan", price: "$22.30", image: img("rv-cardigan-2", 400, 400) },
  { id: "rv3", name: "Maxi High-Waist Pin-Tuck", price: "$53.68", image: img("rv-maxi", 400, 400) },
  { id: "rv4", name: "Macaron Knit Hoodie Zip", price: "$24.40", image: img("rv-hoodie", 400, 400) },
];

// Full-width insert blocks land after a product count that's a multiple of BOTH
// the mobile (2) and desktop (4) grid columns — lcm = 4 — so the product row
// right before an inserted block is always complete on both breakpoints. (Using
// a mobile-only multiple like 10/14 left a ragged half-row of 2 on desktop.)
const PRODUCTS_PER_REQUIREMENT_BOX = 12; // 6 mobile rows / 3 desktop rows
const PRODUCTS_PER_RECENT_VIEW = 16; // 8 mobile rows / 4 desktop rows

// ─────────────────────────────────────────────────────────────
// Related To Recent Views ad block (inserted every 7 rows)
// ─────────────────────────────────────────────────────────────

function RecentViewsAd() {
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 lg:p-4">
      <div className="flex items-center justify-between mb-2.5 lg:mb-3">
        <h3 className="text-sm lg:text-lg font-bold text-gray-900">Related To Recent Views</h3>
        <span className="text-[9px] lg:text-[10px] font-semibold text-gray-300 border border-gray-200 rounded px-1.5 py-0.5">AD</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-5">
        {RECENT_VIEW_ADS.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate(`/product/${p.id}`)}
            className="relative aspect-[4/5] rounded-xl lg:rounded-2xl overflow-hidden bg-gray-100 text-left"
          >
            <img src={p.image} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute bottom-1.5 right-1.5 lg:bottom-2 lg:right-2 text-[8px] lg:text-[10px] font-semibold text-white/70 bg-black/30 px-1.5 py-0.5 rounded">COSORA</div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 lg:p-3">
              <p className="text-[11px] lg:text-sm font-semibold text-white truncate">{p.name}</p>
              <p className="text-[11px] lg:text-sm font-bold text-white">{p.price}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Preference editor (used in onboarding steps AND the filter popup)
// ─────────────────────────────────────────────────────────────

function CategoryPicker({
  selected, query, setQuery,
}: { selected: string[]; query: string; setQuery: (v: string) => void }) {
  const filtered = CATEGORIES.filter((c) => c.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search product types"
          className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((cat) => {
          const active = selected.includes(cat.id);
          return (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border-2 p-3 transition-all active:scale-[0.98]",
                active ? "border-[#ef4d62] bg-[#ef4d62]/5" : "border-gray-200 hover:border-[#ef4d62]/40"
              )}
            >
              <span className="text-xl">{cat.icon}</span>
              <span className="text-sm font-medium text-gray-800 text-left">{cat.label}</span>
            </button>
          );
        })}
        {filtered.length === 0 && <p className="col-span-2 py-4 text-center text-sm text-gray-400">No types match</p>}
      </div>
    </div>
  );
}

function LocationPicker({
  selected, query, setQuery,
}: { selected: string[]; query: string; setQuery: (v: string) => void }) {
  const filtered = LOCATIONS.filter((l) => l.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a country or city"
          className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]"
        />
      </div>
      <div className="space-y-2">
        {filtered.map((loc) => {
          const active = selected.includes(loc.id);
          return (
            <button
              key={loc.id}
              onClick={() => toggleLocation(loc.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border p-3.5 transition-all active:scale-[0.99]",
                active ? "border-[#ef4d62] bg-[#ef4d62]/5" : "border-gray-200 hover:border-[#ef4d62]/40"
              )}
            >
              <span className="text-sm font-medium text-gray-800">{loc.label}</span>
              <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
                active ? "border-[#ef4d62] bg-[#ef4d62] text-white" : "border-gray-300"
              )}>
                {active && <Check className="w-3 h-3" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && <p className="py-4 text-center text-sm text-gray-400">No locations match</p>}
      </div>
    </div>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex justify-center gap-2">
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("h-2 w-2 rounded-full", i <= step ? "bg-[#ef4d62]" : "bg-gray-200")} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const ForYou = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const t = useT();
  const prefs = usePreferences();

  // Onboarding local step state
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [catQuery, setCatQuery] = useState("");
  const [locQuery, setLocQuery] = useState("");

  // Feed state
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterCatQuery, setFilterCatQuery] = useState("");
  const [filterLocQuery, setFilterLocQuery] = useState("");
  const [batches, setBatches] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [quickRfqOpen, setQuickRfqOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const activeLocations = prefs.locations.filter((l) => l !== "nopreference");

  // Real catalogue mapped into the listing shape; fall back to the seeded pool
  // only while it loads / if it's empty.
  const { data: live } = useLiveProducts();
  const pool = useMemo(() => (live && live.length ? live.map(toListing) : PRODUCT_POOL), [live]);

  // Filtered product list (preferences + search).
  const filtered = useMemo(() => {
    let list = pool;
    if (prefs.categories.length > 0) list = list.filter((p) => p.category && prefs.categories.includes(p.category));
    if (activeLocations.length > 0) list = list.filter((p) => p.locationId && activeLocations.includes(p.locationId));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.manufacturer.toLowerCase().includes(q));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, prefs.categories, prefs.locations, search]);

  const visible = filtered.slice(0, batches * 8);

  // Build interleaved feed: product cards + requirement box + recent-views ad.
  // Blocks span the full grid width and land on a multiple of 4 products so no
  // ragged half-row precedes them on desktop (see the constants above).
  type FeedItem = { kind: "product"; product: ListingProduct } | { kind: "requirement" } | { kind: "recent" };
  const feedItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    visible.forEach((product, i) => {
      items.push({ kind: "product", product });
      const productsDone = i + 1;
      if (productsDone % PRODUCTS_PER_REQUIREMENT_BOX === 0) items.push({ kind: "requirement" });
      else if (productsDone % PRODUCTS_PER_RECENT_VIEW === 0) items.push({ kind: "recent" });
    });
    return items;
  }, [visible]);

  // Infinite scroll.
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && visible.length < filtered.length) {
          setLoadingMore(true);
          window.setTimeout(() => { setBatches((b) => b + 1); setLoadingMore(false); }, 300);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadingMore, visible.length, filtered.length]);

  // Reset paging when filters/search change.
  useEffect(() => { setBatches(1); }, [prefs.categories, prefs.locations, search]);

  // ─── ONBOARDING ───
  if (!prefs.hasCompleted) {
    return (
      <BuyerShell>
        <div className="max-w-md mx-auto px-5 flex min-h-[70vh] items-center justify-center">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="welcome"
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -16 }}
                className="w-full text-center"
              >
                <div className="mx-auto mb-5 w-44 h-44 rounded-full bg-[#ef4d62]/5 flex items-center justify-center overflow-hidden">
                  <img src={img("foryou-welcome", 360, 360)} alt="Welcome to Cosora" className="w-full h-full object-cover" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Welcome to Cosora 👋</h1>
                <p className="mt-3 text-sm text-gray-500 leading-relaxed">
                  Tell us what you usually source so we can match you with the right manufacturers.
                </p>
                <div className="my-7"><StepDots step={0} /></div>
                <button
                  onClick={() => setStep(1)}
                  className="w-full py-3.5 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold transition-colors active:scale-[0.99]"
                >
                  Start
                </button>
                <button onClick={() => completeOnboarding(true)} className="mt-3 text-sm text-gray-400 hover:text-gray-600">
                  Skip for now
                </button>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="categories"
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -16 }}
                className="w-full"
              >
                <div className="text-center mb-5">
                  <h1 className="text-xl font-bold text-gray-900">What are you looking to source?</h1>
                  <p className="mt-1.5 text-sm text-gray-500">Select all that apply</p>
                </div>
                <CategoryPicker selected={prefs.categories} query={catQuery} setQuery={setCatQuery} />
                <div className="my-6"><StepDots step={1} /></div>
                <button
                  onClick={() => setStep(2)}
                  className="w-full py-3.5 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold transition-colors active:scale-[0.99]"
                >
                  Next
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="locations"
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -16 }}
                className="w-full"
              >
                <div className="text-center mb-5">
                  <h1 className="text-xl font-bold text-gray-900">Where do you prefer to source from?</h1>
                  <p className="mt-1.5 text-sm text-gray-500">Choose one or more locations</p>
                </div>
                <LocationPicker selected={prefs.locations} query={locQuery} setQuery={setLocQuery} />
                <div className="my-6"><StepDots step={2} /></div>
                <button
                  onClick={() => completeOnboarding(false)}
                  className="w-full py-3.5 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold transition-colors active:scale-[0.99]"
                >
                  Next
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </BuyerShell>
    );
  }

  // ─── FEED ───
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
                tab.href === "/home/for-you" ? "text-[#ef4d62] border-[#ef4d62]" : "text-gray-400 border-transparent hover:text-gray-600"
              )}
            >
              {tab.href === "/home/new-arrivals" && "✦ "}{t(tab.label)}
            </Link>
          ))}
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pb-24">
        {/* Header toolbar — on desktop the title sits left and the search +
            controls group sits right on one row; on mobile they stack, matching
            the original single-column layout. */}
        <div className="lg:flex lg:items-start lg:justify-between lg:gap-8">
          <div className="lg:shrink-0">
            <div className="flex items-center gap-1.5 lg:gap-2">
              <Sparkles className="w-5 h-5 lg:w-6 lg:h-6 text-[#ef4d62]" />
              <h1 className="text-lg lg:text-3xl font-bold text-gray-900">For You</h1>
            </div>
            <p className="text-xs lg:text-sm text-gray-500 mt-0.5 lg:mt-1.5">Personalized recommendations based on your preferences</p>
          </div>

          {/* Preference controls. No in-page search here — the BuyerTopBar
              already provides the main product search; this page only needs to
              edit or reset the personalization preferences. */}
          <div className="mt-3 lg:mt-1 lg:shrink-0 flex items-center gap-3 lg:justify-end">
            <button
              onClick={() => setFilterOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-2 text-xs font-semibold text-[#ef4d62] hover:border-[#ef4d62] transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" /> Edit Preferences
            </button>
            <button onClick={resetFilters} className="text-xs font-semibold text-gray-400 hover:text-gray-600">
              Reset preferences
            </button>
          </div>
        </div>

        {/* Active preference chips + result count — filter summary directly above
            the grid (chips left, count right on desktop; stacked on mobile). */}
        <div className="mt-4 lg:mt-6 flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
          {(prefs.categories.length > 0 || activeLocations.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {prefs.categories.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 bg-[#ef4d62]/10 text-[#ef4d62] rounded-full pl-2.5 pr-1.5 py-1 text-xs font-semibold">
                  {CATEGORY_LABEL[id] ?? id}
                  <button onClick={() => removeCategory(id)} aria-label={`Remove ${CATEGORY_LABEL[id] ?? id}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {activeLocations.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded-full pl-2.5 pr-1.5 py-1 text-xs font-semibold">
                  {LOCATION_LABEL[id] ?? id}
                  <button onClick={() => removeLocation(id)} aria-label={`Remove ${LOCATION_LABEL[id] ?? id}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 lg:ml-auto lg:shrink-0">{filtered.length} products for you</p>
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white lg:max-w-xl lg:mx-auto">
            <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
              <Sparkles className="w-12 h-12 text-gray-300 mb-3" />
              <h3 className="text-lg font-bold text-gray-900">No matches found</h3>
              <p className="text-sm text-gray-500 mt-1 mb-4">Try adjusting your preferences or search</p>
              <button
                onClick={() => { setSearch(""); resetFilters(); }}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors"
              >
                Reset preferences
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 mt-4">
              {feedItems.map((item, idx) => {
                if (item.kind === "requirement") {
                  return <div key={`req-${idx}`} className="col-span-full lg:max-w-4xl lg:mx-auto"><SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} /></div>;
                }
                if (item.kind === "recent") {
                  return <div key={`rv-${idx}`} className="col-span-full"><RecentViewsAd /></div>;
                }
                return <ListingProductCard key={item.product.id} product={item.product} />;
              })}
            </div>

            <div ref={loadMoreRef} className="py-6 text-center text-xs text-gray-400">
              {visible.length < filtered.length ? (loadingMore ? "Loading more products..." : "Scroll for more") : "You're all caught up"}
            </div>
          </>
        )}

        {/* Bottom Submit Requirement bar */}
        <div className="mt-2 lg:mt-4 lg:max-w-2xl lg:mx-auto">
          <SubmitRequirementCard />
        </div>
      </div>

      {/* Filter popup = the first two onboarding questions */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit your preferences</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <p className="text-sm font-bold text-gray-900 mb-2">What are you looking to source?</p>
              <CategoryPicker selected={prefs.categories} query={filterCatQuery} setQuery={setFilterCatQuery} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 mb-2">Where do you prefer to source from?</p>
              <LocationPicker selected={prefs.locations} query={filterLocQuery} setQuery={setFilterLocQuery} />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { resetFilters(); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={() => setFilterOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold transition-colors"
              >
                Show {filtered.length} products
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <QuickRfqModal isOpen={quickRfqOpen} onClose={() => setQuickRfqOpen(false)} />
    </BuyerShell>
  );
};

export default ForYou;
