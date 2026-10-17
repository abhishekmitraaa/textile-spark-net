import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import BuyerShell from "@/components/buyer/BuyerShell";
import ListingProductCard from "@/components/buyer/ListingProductCard";
import NewBrandsCarousel from "@/components/buyer/NewBrandsCarousel";
import BrandAvatar from "@/components/buyer/BrandAvatar";
import SponsoredRail from "@/components/buyer/SponsoredRail";
import { useAdSlot } from "@/lib/queries/ads";
import { AD_SLOTS, type AdSlot, type AdSlotId } from "@/lib/adSlots";
import SubmitRequirementCard from "@/components/buyer/SubmitRequirementCard";
import QuickRfqModal from "@/components/buyer/QuickRfqModal";
import { makeListingProduct, type Gender, type ListingProduct } from "@/lib/listingProducts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Brand } from "@/lib/followingStore";
import { useFollowing, useNewBrandSuggestions } from "@/lib/queries/follows";
import { type ProductCardData } from "@/lib/queries/products";
import { useFeed, useFeedSlice, type FeedSort } from "@/lib/queries/feed";

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
    views: p.views,
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
// "Your Followings" — compact list with per-brand Unfollow / Hide
// ─────────────────────────────────────────────────────────────

function FollowingRow({ brand, onUnfollow, onHide }: { brand: Brand; onUnfollow: (b: Brand) => void; onHide: (b: Brand) => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 py-2.5">
      <button onClick={() => navigate(`/vendor/${brand.id}`)} className="shrink-0">
        <span className="relative block">
          <BrandAvatar name={brand.name} logo={brand.logo} className="block w-11 h-11 text-sm" />
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-brand-buyer flex items-center justify-center">
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
              <Check className={cn("w-4 h-4", gender === opt.key ? "opacity-100 text-brand-buyer" : "opacity-0")} />
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
              <Check className={cn("w-4 h-4", sort === opt.key ? "opacity-100 text-brand-buyer" : "opacity-0")} />
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* FILTER */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none">
          <Filter className={cn("w-3.5 h-3.5", verifiedOnly && "text-brand-buyer")} />
          <span>FILTER</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setVerifiedOnly(!verifiedOnly)} className="gap-2 text-sm">
            <Check className={cn("w-4 h-4", verifiedOnly ? "opacity-100 text-brand-buyer" : "opacity-0")} />
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

// The controls, as feed_products takes them (2026-10-14: they filtered and sorted in the browser).
// "Newest" is each feed's own order: newest for the followed sellers, trending for Most Popular.
function feedSort(sort: SortKey, base: FeedSort): FeedSort {
  return sort === "price-asc" ? "price_asc" : sort === "price-desc" ? "price_desc" : sort === "rating" ? "rating" : base;
}

// Render a product grid's children with a "Submit Requirement" card interleaved
// after every 5 rows — and since a row is 2 cards on mobile but 4 on desktop,
// the insert positions differ per breakpoint: every 10 products on mobile, every
// 20 on desktop. Cards at multiples of 20 show on both; the in-between multiples
// of 10 are mobile-only (`lg:hidden`, so they collapse out of the desktop grid),
// which leaves desktop with a card only every 20 products (5 desktop rows).
//
// `sponsored` (optional) additionally recurs an ad slot down the same grid,
// starting from block `fromBlock` — Most Popular passes it, the followed-brand
// feed does not. That feed is the brands the buyer explicitly chose to follow,
// and the paid placement on this page is the interleaved carousel above it; an
// ad rail cutting through the one list a buyer curated themselves is the wrong
// trade even though there is room for it.
function feedWithRequirements(
  products: ListingProduct[],
  onQuickRfq: () => void,
  sponsored?: { slot: AdSlotId; fromBlock: number },
): JSX.Element[] {
  const AD_EVERY = 8; // 4 mobile rows / 2 desktop rows
  const nodes: JSX.Element[] = [];
  products.forEach((p, i) => {
    nodes.push(<ListingProductCard key={p.id} product={p} />);
    const n = i + 1;
    if (n >= products.length) return; // never trail the final product with a card
    if (n % 20 === 0) {
      nodes.push(
        <div key={`req-${i}`} className="col-span-full lg:max-w-4xl lg:mx-auto">
          <SubmitRequirementCard onQuickRfq={onQuickRfq} />
        </div>
      );
    } else if (n % 10 === 0) {
      nodes.push(
        <div key={`req-m-${i}`} className="col-span-full lg:hidden">
          <SubmitRequirementCard onQuickRfq={onQuickRfq} />
        </div>
      );
    }
    if (sponsored && n % AD_EVERY === 0) {
      const block = sponsored.fromBlock + n / AD_EVERY - 1;
      const spec: AdSlot = AD_SLOTS[sponsored.slot];
      if (block < (spec.repeat?.blocks ?? 1)) {
        nodes.push(
          <div key={`ad-${block}`} className="col-span-full">
            <SponsoredRail slot={sponsored.slot} block={block} />
          </div>
        );
      }
    }
  });
  return nodes;
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const Following = () => {
  const { brands, follow, unfollow, hide, isLoading: followsLoading } = useFollowing();
  const t = useT();

  const followed = useMemo(() => brands.filter((b) => b.isFollowing && !b.isHidden), [brands]);
  // Suggestions come from the database (new_brand_suggestions), marked with what this buyer follows
  // now, so a slide followed from the carousel stays put and shows "Following".
  const { data: suggestions = [] } = useNewBrandSuggestions();
  const discoverable = useMemo(() => {
    const following = new Set(followed.map((b) => b.id));
    return suggestions.map((b) => ({ ...b, isFollowing: following.has(b.id) }));
  }, [suggestions, followed]);

  // Feed controls
  const [gender, setGender] = useState<GenderFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [quickRfqOpen, setQuickRfqOpen] = useState(false);

  // Store Promotion / Brand Ad campaigns for the discovery carousel. Fetched
  // here rather than inside the carousel so the carousel stays a presentation
  // component shared with FollowingViewAll, which passes none.
  const { data: brandAds = [] } = useAdSlot("followingBrands");

  // Most Popular reveal (when followed-brand New-In is exhausted)
  const [showMostPopular, setShowMostPopular] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // The followed sellers' listings and Cosora-wide Most Popular, a page at a time from feed_products
  // (2026-10-14). They were the whole catalogue filtered in the browser, so past 1,000 live
  // listings a followed seller's older listings disappeared. Sellers in groups of at most 500.
  const followedIds = useMemo(
    () => (verifiedOnly ? followed.filter((b) => b.verified) : followed).map((b) => b.id).sort().slice(0, 500),
    [followed, verifiedOnly],
  );
  const hasFollowed = followedIds.length > 0;
  const genderParam = gender === "all" ? null : gender;

  // Top performing: the followed sellers' four most sold and enquired-about listings.
  const { data: topRows = [] } = useFeedSlice({ sort: "trending", vendorIds: followedIds }, 4, { enabled: hasFollowed });
  const topPerforming = useMemo(() => topRows.map(toListing), [topRows]);

  const newInFeed = useFeed(
    { sort: feedSort(sort, "newest"), vendorIds: followedIds, gender: genderParam },
    { enabled: hasFollowed },
  );
  const newIn = useMemo(() => newInFeed.items.map(toListing), [newInFeed.items]);

  // Most Popular: trending across Cosora, beyond the buyer's follows (labelled as such below).
  const popularFeed = useFeed({ sort: feedSort(sort, "trending"), gender: genderParam }, { enabled: showMostPopular });
  const mostPopular = useMemo(() => popularFeed.items.map(toListing), [popularFeed.items]);
  const popularRef = useRef<HTMLDivElement | null>(null);

  // At the end of the followed feed: its next page, and once it has run out, Most Popular.
  const { fetchNextPage: nextNewIn } = newInFeed;
  const newInDone = !hasFollowed || (!newInFeed.isPending && !newInFeed.hasNextPage);
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (newInDone) setShowMostPopular(true);
        else nextNewIn();
      },
      { rootMargin: "300px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [newInDone, nextNewIn, newIn.length]);

  // Most Popular's own next page.
  const { fetchNextPage: nextPopular } = popularFeed;
  useEffect(() => {
    const target = popularRef.current;
    if (!target || !showMostPopular) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) nextPopular(); },
      { rootMargin: "400px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [showMostPopular, nextPopular, mostPopular.length]);

  // If the user follows nobody, surface Most Popular immediately.
  useEffect(() => {
    if (!followsLoading && followed.length === 0) setShowMostPopular(true);
  }, [followsLoading, followed.length]);

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
                  ? "text-brand-buyer border-brand-buyer"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              )}
            >
              {tab.href === "/home/new-arrivals" && "✦ "}{t(tab.label)}
            </Link>
          ))}
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pb-24 space-y-6 lg:space-y-8">

        {/* Looking for New Brands? — organic suggestions with Store Promotion /
            Brand Ad campaigns interleaved at 1-in-4, per the agreed placement
            mockup. The carousel owns the ratio and the labelling; see
            NewBrandsCarousel. Empty campaign list → a purely organic carousel,
            exactly as before. */}
        <NewBrandsCarousel
          brands={discoverable}
          onFollow={(b) => follow(b.id)}
          sponsored={brandAds}
        />

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
              {/* Mobile: single column of 3, always. Desktop: same single column
                  UNLESS there are more than 3 followed brands, in which case it
                  splits into two columns of up to 3 with a vertical divider
                  (up to 6 total) — never duplicates a real brand to pad it out. */}
              <div className={cn("divide-y divide-gray-100", followed.length > 3 && "lg:hidden")}>
                {followed.slice(0, 3).map((b) => <FollowingRow key={b.id} brand={b} onUnfollow={(x) => unfollow(x.id)} onHide={(x) => hide(x.id)} />)}
              </div>

              {followed.length > 3 && (
                <div className="hidden lg:grid lg:grid-cols-2 lg:divide-x lg:divide-gray-100">
                  <div className="divide-y divide-gray-100 lg:pr-6">
                    {followed.slice(0, 3).map((b) => <FollowingRow key={`c1-${b.id}`} brand={b} onUnfollow={(x) => unfollow(x.id)} onHide={(x) => hide(x.id)} />)}
                  </div>
                  <div className="divide-y divide-gray-100 lg:pl-6">
                    {followed.slice(3, 6).map((b) => <FollowingRow key={`c2-${b.id}`} brand={b} onUnfollow={(x) => unfollow(x.id)} onHide={(x) => hide(x.id)} />)}
                  </div>
                </div>
              )}

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
          {hasFollowed && newInFeed.isPending ? (
            <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
          ) : newIn.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 mt-4">
              {feedWithRequirements(newIn, () => setQuickRfqOpen(true))}
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
            {/* Open Listing campaigns, shown only once the followed-brand feed
                has run dry — the one point on this page where a buyer has
                explicitly reached the end of what they asked for. */}
            <SponsoredRail slot="followingPopular" className="mb-3" />
            <FeedControls
              gender={gender} setGender={setGender}
              sort={sort} setSort={setSort}
              verifiedOnly={verifiedOnly} setVerifiedOnly={setVerifiedOnly}
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 mt-4">
              {/* Block 0 is the rail directly above this grid, so the feed picks
                  up at block 1 — a different set of campaigns, not the rail
                  above repeated. */}
              {feedWithRequirements(mostPopular, () => setQuickRfqOpen(true),
                { slot: "followingPopular", fromBlock: 1 })}
            </div>
            <div ref={popularRef} className="py-6 text-center text-xs text-gray-400">
              {popularFeed.isFetchingNextPage ? "Loading more…" : popularFeed.hasNextPage ? "" : mostPopular.length > 0 ? "That's everything listed right now." : ""}
            </div>
          </section>
        )}

        {/* Submit Requirement — same shared card + Quick RFQ modal as the other buyer pages */}
        <div className="lg:max-w-4xl lg:mx-auto">
          <SubmitRequirementCard onQuickRfq={() => setQuickRfqOpen(true)} />
        </div>
      </div>

      <QuickRfqModal isOpen={quickRfqOpen} onClose={() => setQuickRfqOpen(false)} />
    </BuyerShell>
  );
};

export default Following;
