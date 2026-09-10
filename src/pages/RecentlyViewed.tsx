import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import BuyerShell from "@/components/buyer/BuyerShell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Trash2,
  ArrowUpDown,
  Filter,
  Check,
  Heart,
  MapPin,
  Phone,
  MessageCircle,
  Star,
  Clock,
  BadgeCheck,
} from "lucide-react";
import {
  useRecentlyViewed,
  useRecentlyViewedHydrating,
  useRecentlyViewedOwner,
  removeRecent,
  clearRecent,
  relativeTime,
  type RecentProduct,
} from "@/lib/recentlyViewedStore";
import { useAuth } from "@/contexts/AuthContext";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import { useCallVendor } from "@/lib/queries/calls";
import type { Gender } from "@/lib/listingProducts";
import { cn } from "@/lib/utils";

type GenderFilter = "all" | Gender;
type SortKey = "recent" | "price-asc" | "price-desc" | "rating";

const GENDERS: { key: GenderFilter; label: string }[] = [
  { key: "all", label: "All" }, { key: "women", label: "Women" }, { key: "men", label: "Men" },
  { key: "kids", label: "Kids" }, { key: "unisex", label: "Unisex" },
];
const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recently Viewed" }, { key: "price-asc", label: "Price: Low to High" },
  { key: "price-desc", label: "Price: High to Low" }, { key: "rating", label: "Top Rated" },
];

// ── Card row (image + heart, details, Chat / CALL NOW / instant-delete) ──
function RecentRow({ p }: { p: RecentProduct }) {
  const navigate = useNavigate();
  const callVendor = useCallVendor();
  const saved = useSaved();
  const isSaved = Boolean(saved.products[p.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-gray-200 bg-white p-3"
    >
      <div className="flex gap-3">
        <Link to={`/product/${p.id}`} className="relative w-24 h-28 shrink-0 rounded-lg overflow-hidden bg-gray-100">
          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
          <button
            onClick={(e) => { e.preventDefault(); openSaveModal(p); }}
            aria-label={isSaved ? "Edit saved folders" : "Save product"}
            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm hover:bg-white transition-colors"
          >
            <Heart className={cn("w-3.5 h-3.5", isSaved ? "fill-[#ef4d62] text-[#ef4d62]" : "text-gray-500")} />
          </button>
        </Link>

        <div className="min-w-0 flex-1">
          <Link to={`/product/${p.id}`}>
            <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">{p.name}</h3>
          </Link>
          <p className="inline-flex items-center gap-1 text-xs text-[#ef4d62] font-medium mt-0.5">
            {p.manufacturer} {p.verified && <BadgeCheck className="w-3 h-3" />}
          </p>
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-500">
            <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{p.location}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-600">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="font-bold">{p.rating.toFixed(1)}</span>
            <span className="text-gray-400">({p.reviews} reviews)</span>
          </div>
          <div className="flex items-end justify-between gap-2 mt-1">
            <div>
              <p className="text-sm font-bold text-gray-900">{p.price}</p>
              <p className="text-[11px] text-gray-500">{p.moq}</p>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <Clock className="w-3 h-3" /> {relativeTime(p.viewedAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2.5">
        <button onClick={() => navigate(`/chats/${p.vendorId}`)} className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 rounded-lg py-2 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors">
          <MessageCircle className="w-3.5 h-3.5" /> Chat
        </button>
        <button onClick={() => callVendor(p.vendorId, p.name)} className="flex-1 flex items-center justify-center gap-1.5 bg-[#ef4d62] text-white rounded-lg py-2 text-xs font-bold hover:bg-[#ef4d62]/90 transition-colors">
          <Phone className="w-3.5 h-3.5" /> CALL NOW
        </button>
        {/* Deletes instantly — no confirm (per reference note) */}
        <button
          onClick={() => removeRecent(p.id)}
          aria-label="Remove from history"
          className="shrink-0 w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#ef4d62] hover:border-[#ef4d62]/40 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

const RecentlyViewed = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const recent = useRecentlyViewed();
  const hydrating = useRecentlyViewedHydrating();
  const syncedFor = useRecentlyViewedOwner();
  const { user, loading: authLoading } = useAuth();

  // Loading, empty and populated are three distinct states — the project rule,
  // as on SearchResults and ForYou. Until 2026-09-10 the empty state was
  // unreachable for exactly the people most likely to see it (first-time
  // visitors), because the store filled any empty history with six fabricated
  // products; with those gone, "not loaded yet" has to be told apart from
  // "nothing here" or a signed-in buyer's real history would flash up as
  // "No recently viewed products" while it is still being fetched.
  //
  //   * Signed in → the DB is authoritative, so show loading until the store
  //     holds THIS user's rows: StoreSync has not handed it the user yet (one
  //     render, its effect runs after this page's first commit), or the fetch
  //     is in flight. The local list is not shown in the meantime — it is not
  //     this account's history.
  //   * Auth still restoring the session and nothing local to show → we do not
  //     yet know whose history this is, so do not claim it is empty.
  const signedInPending = Boolean(user) && (syncedFor !== user?.id || hydrating);
  const loading = signedInPending || (authLoading && recent.length === 0);
  const hasItems = !loading && recent.length > 0;

  const [gender, setGender] = useState<GenderFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const products = useMemo(() => {
    let list = [...recent];
    if (gender !== "all") list = list.filter((p) => p.gender === gender);
    if (verifiedOnly) list = list.filter((p) => p.verified);
    if (sort === "price-asc") list.sort((a, b) => a.priceValue - b.priceValue);
    else if (sort === "price-desc") list.sort((a, b) => b.priceValue - a.priceValue);
    else if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    else list.sort((a, b) => b.viewedAt - a.viewedAt);
    return list;
  }, [recent, gender, sort, verifiedOnly]);

  const genderLabel = GENDERS.find((g) => g.key === gender)?.label ?? "All";
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? "Sort";

  return (
    <BuyerShell>
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
        {/* Title row */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => navigate(-1)} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900">Recently Viewed</h1>
            {/* A count is a claim about the history; while it is loading we do
                not have one, and "0 products" would be a wrong answer. */}
            <p className="text-xs text-gray-500">
              {loading ? "Loading…" : `${recent.length} product${recent.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {hasItems && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button aria-label="Clear viewing history" className="p-1.5 text-[#ef4d62] hover:bg-[#ef4d62]/10 rounded-lg transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-xs rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-center">Clear viewing history?</AlertDialogTitle>
                  <AlertDialogDescription className="text-center">
                    This will remove all recently viewed products. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
                  <AlertDialogAction
                    onClick={clearRecent}
                    className="w-full bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white"
                  >
                    Clear All
                  </AlertDialogAction>
                  <AlertDialogCancel className="w-full mt-0">Cancel</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Gender / Sort / Filter */}
        {hasItems && (
          <div className="grid grid-cols-3 border-y border-gray-200 divide-x divide-gray-200 mb-4">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none">
                {gender === "all" ? "GENDER" : genderLabel}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                {GENDERS.map((o) => (
                  <DropdownMenuItem key={o.key} onClick={() => setGender(o.key)} className="gap-2 text-sm">
                    <Check className={cn("w-4 h-4", gender === o.key ? "opacity-100 text-[#ef4d62]" : "opacity-0")} /> {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none">
                <ArrowUpDown className="w-3.5 h-3.5" /> {sort === "recent" ? "SORT" : sortLabel}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                {SORTS.map((o) => (
                  <DropdownMenuItem key={o.key} onClick={() => setSort(o.key)} className="gap-2 text-sm">
                    <Check className={cn("w-4 h-4", sort === o.key ? "opacity-100 text-[#ef4d62]" : "opacity-0")} /> {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none">
                <Filter className={cn("w-3.5 h-3.5", verifiedOnly && "text-[#ef4d62]")} /> FILTER
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setVerifiedOnly((v) => !v)} className="gap-2 text-sm">
                  <Check className={cn("w-4 h-4", verifiedOnly ? "opacity-100 text-[#ef4d62]" : "opacity-0")} /> Verified vendors only
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Items */}
        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading recently viewed products">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex gap-3">
                  <div className="w-24 h-28 shrink-0 rounded-lg bg-gray-100 animate-pulse" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
                    <div className="h-2.5 w-1/2 rounded bg-gray-100 animate-pulse" />
                    <div className="h-2.5 w-1/3 rounded bg-gray-100 animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="mb-1.5 text-base font-bold text-gray-900">No recently viewed products</h3>
            <p className="mb-6 max-w-xs text-sm text-gray-500">
              Products you view will appear here so you can easily find them again.
            </p>
            <button
              onClick={() => navigate("/home/new-arrivals")}
              className="rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white px-6 py-2.5 text-sm font-bold transition-colors"
            >
              Browse Products
            </button>
          </motion.div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center">
            <Filter className="w-9 h-9 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No products match these filters.</p>
            <button
              onClick={() => { setGender("all"); setVerifiedOnly(false); }}
              className="mt-3 text-sm font-semibold text-[#ef4d62]"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((p) => <RecentRow key={p.id} p={p} />)}
          </div>
        )}
      </div>
    </BuyerShell>
  );
};

export default RecentlyViewed;
