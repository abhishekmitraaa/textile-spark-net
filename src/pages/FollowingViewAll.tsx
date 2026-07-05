import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import CosoraLogo from "@/components/CosoraLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Brand } from "@/lib/followingStore";
import { useFollowing } from "@/lib/queries/follows";
import { ArrowLeft, BadgeCheck, Bookmark, Check, Flag, MoreVertical, Search, UserMinus } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Following → View All
// Brand management list: search the brands you follow, Unfollow / Report.
// Shares state with the Following feed via the following store.
// ─────────────────────────────────────────────────────────────

function BrandRow({ brand, onUnfollow }: { brand: Brand; onUnfollow: (b: Brand) => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 py-3">
      <button onClick={() => navigate(`/vendor/${brand.id}`)} className="shrink-0">
        <span className="relative block">
          <img src={brand.logo} alt={brand.name} className="w-12 h-12 rounded-full object-cover" />
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#ef4d62] flex items-center justify-center">
            <Check className="w-2.5 h-2.5 text-white" />
          </span>
        </span>
      </button>

      <button onClick={() => navigate(`/vendor/${brand.id}`)} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-gray-900 truncate">{brand.name}</span>
          {brand.verified && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-[#ef4d62] bg-[#ef4d62]/10 px-1.5 py-0.5 rounded-full shrink-0">
              <BadgeCheck className="w-3 h-3" /> TradeSEAL
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-500 truncate">
          {brand.location} · Followers {brand.followers}
        </p>
        <p className="text-[11px] text-gray-400 truncate">{brand.handle} · items {brand.items}</p>
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
            onClick={() => toast.success(`Reported ${brand.name}`, { description: "Our team will review this brand." })}
            className="gap-2 text-sm"
          >
            <Flag className="w-4 h-4" /> Report
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const FollowingViewAll = () => {
  const navigate = useNavigate();
  const { brands, unfollow } = useFollowing();
  const [query, setQuery] = useState("");

  const followed = useMemo(() => brands.filter((b) => b.isFollowing && !b.isHidden), [brands]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return followed;
    return followed.filter(
      (b) => b.name.toLowerCase().includes(q) || b.handle.toLowerCase().includes(q) || b.location.toLowerCase().includes(q)
    );
  }, [followed, query]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header: logo + bookmark */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <button onClick={() => navigate("/home/followings")} className="flex-1 text-left">
            <CosoraLogo height={22} />
          </button>
          <button onClick={() => navigate("/saved")} aria-label="Saved" className="p-1">
            <Bookmark className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-24">
        {/* Search */}
        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3.5 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for brand you follow."
            className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </div>

        {/* Following count */}
        <h1 className="text-sm font-bold text-gray-900 mt-4 mb-1">Following {followed.length}</h1>

        {/* List */}
        {filtered.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {filtered.map((b) => <BrandRow key={b.id} brand={b} onUnfollow={(x) => unfollow(x.id)} />)}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-gray-400">
            {query ? `No followed brands match "${query}"` : "You aren't following any brands yet."}
          </p>
        )}

        {/* End-of-list marker */}
        {filtered.length > 0 && (
          <p className="py-5 text-center text-xs text-gray-300">no more data</p>
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default FollowingViewAll;
