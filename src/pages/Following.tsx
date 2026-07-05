import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import BuyerShell from "@/components/buyer/BuyerShell";
import ListingProductCard from "@/components/buyer/ListingProductCard";
import { makeListingProduct, type Gender, type ListingProduct } from "@/lib/listingProducts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Brand } from "@/lib/followingStore";
import { useFollowing } from "@/lib/queries/follows";
import { useLiveProducts, sortTrending, type ProductCardData } from "@/lib/queries/products";

// Map a live product row into the compact listing-card shape.
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
  });
}
import {
  ArrowUpDown,
  Check,
  ChevronRight,
  EyeOff,
  Filter,
  MoreVertical,
  Plus,
  SlidersHorizontal,
  UserMinus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const HOME_TABS = [
  { label: "NEW ARRIVALS", href: "/home/new-arrivals" },
  { label: "TRENDS", href: "/home/trends" },
  { label: "SALE", href: "/home/sale" },
  { label: "FOR YOU", href: "/home/for-you" },
  { label: "FOLLOWINGS", href: "/home/followings" },
];

type GenderFilter = "all" | Gender;
type SortKey = "newest" | "price-asc" | "price-desc" | "rating";

const GENDER_OPTIONS: { key: GenderFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "women", label: "Women" },
  { key: "men", label: "Men" },
  { key: "kids", label: "Kids" },
  { key: "unisex", label: "Unisex" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "price-asc", label: "Price: Low to High" },
  { key: "price-desc", label: "Price: High to Low" },
  { key: "rating", label: "Top Rated" },
];

// ─────────────────────────────────────────────────────────────
// "Looking for New Brands?" — swipeable brand discovery carousel.
// Each slide is a suggested (not-yet-followed) brand with its top
// inquired products. Swiping left reveals the next brand.
// ─────────────────────────────────────────────────────────────

function NewBrandsCarousel({ brands, onFollow }: { brands: Brand[]; onFollow: (b: Brand) => void }) {
  const navigate = useNavigate();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive(idx);
  };

  if (brands.length === 0) return null;

  return (
    <section className="rounded-2xl bg-[#ececeb] p-3 lg:p-4">
      <h2 className="text-sm lg:text-lg font-bold text-gray-900 mb-2.5">Looking for New Brands?</h2>

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-1 px-1 gap-3"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {brands.map((brand) => (
          <div key={brand.id} className="snap-center shrink-0 w-full">
            <div className="rounded-xl bg-white overflow-hidden border border-gray-100">
              {/* Brand header */}
              <div className="flex items-center gap-2.5 p-3">
                <button onClick={() => navigate(`/vendor/${brand.id}`)} className="shrink-0">
                  <img src={brand.logo} alt={brand.name} className="w-10 h-10 rounded-full object-cover" />
                </button>
                <button onClick={() => navigate(`/vendor/${brand.id}`)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-gray-900 truncate">{brand.name}</span>
                    {brand.isAd && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide shrink-0">AD</span>}
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">{brand.location} · {brand.followers} followers</p>
                </button>
                <button
                  onClick={() => { onFollow(brand); toast.success(`Following ${brand.name}`); }}
                  className="shrink-0 flex items-center gap-1 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
                >
                  <Plus className="w-3 h-3" /> Follow
                </button>
              </div>

              {/* Top inquired products */}
              <div className="grid grid-cols-2 gap-px bg-gray-100">
                {brand.topProducts.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(`/vendor/${brand.id}`)}
                    className="relative aspect-square bg-gray-100"
                  >
                    <img src={p.image} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-left">
                      <p className="text-[10px] font-semibold text-white truncate">{p.name}</p>
                      <p className="text-[10px] font-bold text-white">{p.price}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dots */}
      {brands.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {brands.map((b, i) => (
            <button
              key={b.id}
              onClick={() => {
                const el = trackRef.current;
                if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
              }}
              aria-label={`Go to brand ${i + 1}`}
              className={cn("h-1.5 rounded-full transition-all", i === active ? "w-4 bg-[#ef4d62]" : "w-1.5 bg-gray-400/60")}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// "Your Followings" — compact list with per-brand Unfollow / Hide
// ─────────────────────────────────────────────────────────────

function FollowingRow({ brand, onUnfollow, onHide }: { brand: Brand; onUnfollow: (b: Brand) => void; onHide: (b: Brand) => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 py-2.5">
      <button onClick={() => navigate(`/vendor/${brand.id}`)} className="shrink-0">
        <span className="relative block">
          <img src={brand.logo} alt={brand.name} className="w-11 h-11 rounded-full object-cover" />
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#ef4d62] flex items-center justify-center">
            <Check className="w-2.5 h-2.5 text-white" />
          </span>
        </span>
      </button>
      <button onClick={() => navigate(`/vendor/${brand.id}`)} className="min-w-0 flex-1 text-left">
        <p className="text-sm font-bold text-gray-900 truncate">{brand.name}</p>
        <p className="text-[11px] text-gray-500 truncate">
          {brand.handle} · Followers {brand.followers} · items {brand.items}
        </p>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger className="shrink-0 p-1 text-gray-400 hover:text-gray-700 focus:outline-none" aria-label="More options">
          <MoreVertical className="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            onClick={() => { onUnfollow(brand); toast(`Unfollowed ${brand.name}`); }}
            className="gap-2 text-sm"
          >
            <UserMinus className="w-4 h-4" /> Unfollow
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => { onHide(brand); toast(`Hid ${brand.name} from your feed`); }}
            className="gap-2 text-sm"
          >
            <EyeOff className="w-4 h-4" /> Hide
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// GENDER / SORT / FILTER control row
// ─────────────────────────────────────────────────────────────

function FeedControls({
  gender, setGender, sort, setSort, verifiedOnly, setVerifiedOnly,
}: {
  gender: GenderFilter; setGender: (g: GenderFilter) => void;
  sort: SortKey; setSort: (s: SortKey) => void;
  verifiedOnly: boolean; setVerifiedOnly: (v: boolean) => void;
}) {
  const genderLabel = GENDER_OPTIONS.find((g) => g.key === gender)?.label ?? "All";
  const sortLabel = SORT_OPTIONS.find((s) => s.key === sort)?.label ?? "Newest";

  return (
    <div className="grid grid-cols-3 border-y border-gray-200 divide-x divide-gray-200">
      {/* GENDER */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none">
          <span className="truncate">{gender === "all" ? "GENDER" : genderLabel}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          {GENDER_OPTIONS.map((opt) => (
            <DropdownMenuItem key={opt.key} onClick={() => setGender(opt.key)} className="gap-2 text-sm">
              <Check className={cn("w-4 h-4", gender === opt.key ? "opacity-100 text-[#ef4d62]" : "opacity-0")} />
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* SORT */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span className="truncate">{sort === "newest" ? "SORT" : sortLabel}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-48">
          {SORT_OPTIONS.map((opt) => (
            <DropdownMenuItem key={opt.key} onClick={() => setSort(opt.key)} className="gap-2 text-sm">
              <Check className={cn("w-4 h-4", sort === opt.key ? "opacity-100 text-[#ef4d62]" : "opacity-0")} />
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* FILTER */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none">
          <Filter className={cn("w-3.5 h-3.5", verifiedOnly && "text-[#ef4d62]")} />
          <span>FILTER</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setVerifiedOnly(!verifiedOnly)} className="gap-2 text-sm">
            <Check className={cn("w-4 h-4", verifiedOnly ? "opacity-100 text-[#ef4d62]" : "opacity-0")} />
            <SlidersHorizontal className="w-4 h-4" /> TradeSEAL brands only
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Product list helpers
// ─────────────────────────────────────────────────────────────

function applyControls(products: ListingProduct[], gender: GenderFilter, sort: SortKey): ListingProduct[] {
  let out = products;
  if (gender !== "all") out = out.filter((p) => p.gender === gender);
  const sorted = [...out];
  switch (sort) {
    case "price-asc": sorted.sort((a, b) => a.priceValue - b.priceValue); break;
    case "price-desc": sorted.sort((a, b) => b.priceValue - a.priceValue); break;
    case "rating": sorted.sort((a, b) => b.rating - a.rating); break;
    default: break; // newest = seed order
  }
  return sorted;
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const Following = () => {
  const { brands, follow, unfollow, hide } = useFollowing();
  const { data: live } = useLiveProducts();
  const t = useT();

  const followed = useMemo(() => brands.filter((b) => b.isFollowing && !b.isHidden), [brands]);
  const suggested = useMemo(() => brands.filter((b) => !b.isFollowing && !b.isHidden), [brands]);

  // Feed controls
  const [gender, setGender] = useState<GenderFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  // Most Popular reveal (when followed-brand New-In is exhausted)
  const [showMostPopular, setShowMostPopular] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Real products from the followed brands, plus a trending global pool.
  const followedIds = useMemo(() => {
    const set = new Set((verifiedOnly ? followed.filter((b) => b.verified) : followed).map((b) => b.id));
    return set;
  }, [followed, verifiedOnly]);

  const followedProducts = useMemo(
    () => (live ?? []).filter((p) => followedIds.has(p.vendorId)).map(toListing),
    [live, followedIds],
  );

  // Top performing — a couple of standout products from followed brands.
  const topPerforming = useMemo(() => followedProducts.slice(0, 4), [followedProducts]);

  const newIn = useMemo(() => applyControls(followedProducts, gender, sort), [followedProducts, gender, sort]);

  // Most Popular — trending across the whole catalogue (not limited to followed brands).
  const mostPopularBase = useMemo(() => sortTrending(live ?? []).map(toListing), [live]);
  const mostPopular = useMemo(() => applyControls(mostPopularBase, gender, sort), [mostPopularBase, gender, sort]);

  // Reveal Most Popular once the user reaches the end of the followed-brand feed.
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setShowMostPopular(true); },
      { rootMargin: "150px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // If the user follows nobody, surface Most Popular immediately.
  useEffect(() => {
    if (followed.length === 0) setShowMostPopular(true);
  }, [followed.length]);

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
                tab.href === "/home/followings"
                  ? "text-[#ef4d62] border-[#ef4d62]"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              )}
            >
              {tab.href === "/home/new-arrivals" && "✦ "}{t(tab.label)}
            </Link>
          ))}
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pb-24 space-y-6 lg:space-y-8">

        {/* Looking for New Brands? */}
        <NewBrandsCarousel brands={suggested} onFollow={(b) => follow(b.id)} />

        {/* Following Top Performing */}
        {topPerforming.length > 0 && (
          <section>
            <h2 className="text-base lg:text-xl font-bold text-gray-900 mb-3">Following Top Performing</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-5">
              {topPerforming.map((p) => <ListingProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}

        {/* Your Followings */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base lg:text-xl font-bold text-gray-900">Your Followings</h2>
          </div>
          {followed.length > 0 ? (
            <>
              <div className="divide-y divide-gray-100">
                {followed.slice(0, 3).map((b) => <FollowingRow key={b.id} brand={b} onUnfollow={(x) => unfollow(x.id)} onHide={(x) => hide(x.id)} />)}
              </div>
              <Link
                to="/home/followings/view-all"
                className="mt-2 flex items-center justify-center gap-1 border-t border-gray-100 pt-3 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
              >
                View All <ChevronRight className="w-4 h-4" />
              </Link>
            </>
          ) : (
            <p className="py-4 text-sm text-gray-400">You aren't following any brands yet.</p>
          )}
        </section>

        {/* Following New-In */}
        <section>
          <h2 className="text-base lg:text-xl font-bold text-gray-900 mb-2">Following New-In</h2>
          <FeedControls
            gender={gender} setGender={setGender}
            sort={sort} setSort={setSort}
            verifiedOnly={verifiedOnly} setVerifiedOnly={setVerifiedOnly}
          />
          {newIn.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 mt-4">
              {newIn.map((p) => <ListingProductCard key={p.id} product={p} />)}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-gray-400">
              No new arrivals from your followed brands right now.
            </p>
          )}

          {/* Sentinel: reaching here means followed-brand products are exhausted */}
          <div ref={sentinelRef} className="h-px" />
        </section>

        {/* Most Popular — global products shown when followed-brand feed runs out */}
        {showMostPopular && (
          <section>
            <h2 className="text-base lg:text-xl font-bold text-gray-900 mb-2">Most Popular</h2>
            <p className="text-[11px] text-gray-400 mb-2">
              You've seen everything new from your brands. Here's what's trending across Cosora.
            </p>
            <FeedControls
              gender={gender} setGender={setGender}
              sort={sort} setSort={setSort}
              verifiedOnly={verifiedOnly} setVerifiedOnly={setVerifiedOnly}
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 mt-4">
              {mostPopular.map((p) => <ListingProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </div>
    </BuyerShell>
  );
};

export default Following;
