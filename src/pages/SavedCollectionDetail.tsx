import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import BuyerShell from "@/components/buyer/BuyerShell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useSaved,
  folderProducts,
  removeFromFolder,
  ALL_SAVES_ID,
  type SavedProduct,
} from "@/lib/savedStore";
import type { Gender } from "@/lib/listingProducts";
import { useCallVendor } from "@/lib/queries/calls";
import {
  ArrowLeft,
  LayoutGrid,
  List as ListIcon,
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
import { cn } from "@/lib/utils";

type GenderFilter = "all" | Gender;
type SortKey = "recent" | "price-asc" | "price-desc" | "rating";

const GENDERS: { key: GenderFilter; label: string }[] = [
  { key: "all", label: "All" }, { key: "women", label: "Women" }, { key: "men", label: "Men" },
  { key: "kids", label: "Kids" }, { key: "unisex", label: "Unisex" },
];
const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recently Added" }, { key: "price-asc", label: "Price: Low to High" },
  { key: "price-desc", label: "Price: High to Low" }, { key: "rating", label: "Top Rated" },
];

// ── Grid card (Chat + Call Now + selectable) ──
function GridCard({ p, folderId, selected, onToggleSelect }: {
  p: SavedProduct; folderId: string; selected: boolean; onToggleSelect: () => void;
}) {
  const navigate = useNavigate();
  const callVendor = useCallVendor();
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      <Link to={`/product/${p.id}`} className="relative aspect-[4/5] block bg-gray-100">
        <img src={p.image} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute bottom-1.5 right-1.5 text-[8px] font-semibold text-white/70 bg-black/30 px-1.5 py-0.5 rounded">COSORA</div>
        <button
          onClick={(e) => { e.preventDefault(); onToggleSelect(); }}
          aria-label={selected ? "Deselect" : "Select"}
          className={cn(
            "absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center border-2 transition-colors",
            selected ? "bg-[#ef4d62] border-[#ef4d62]" : "bg-white/85 border-white/85"
          )}
        >
          {selected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
        </button>
        <div className="absolute bottom-2 left-2 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 py-0.5">
          <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
          <span className="text-[9px] font-bold text-gray-800">{p.rating.toFixed(1)}</span>
          <span className="text-[9px] text-gray-400">| {p.enquiries}</span>
        </div>
      </Link>
      <div className="p-2">
        <p className="text-xs font-bold text-[#ef4d62]">{p.price} | {p.moq}</p>
        <p className="text-[10px] text-gray-600 mt-1 truncate">{p.name} | <span className="font-bold">{p.manufacturer}</span></p>
        <div className="flex items-center gap-0.5 mt-1 text-[10px] text-gray-500">
          <MapPin className="w-2.5 h-2.5 shrink-0" /> <span className="truncate">{p.location}</span>
        </div>
        <div className="flex gap-1.5 mt-2">
          <button onClick={() => navigate(`/chats/${p.vendorId}`)} className="flex-1 flex items-center justify-center gap-1 border border-gray-200 rounded-lg py-1.5 text-[11px] font-semibold text-gray-700">
            <MessageCircle className="w-3 h-3" /> Chat
          </button>
          <button onClick={() => callVendor(p.vendorId, p.name)} className="flex-1 flex items-center justify-center gap-1 bg-[#ef4d62] text-white rounded-lg py-1.5 text-[11px] font-bold">
            <Phone className="w-3 h-3" /> Call
          </button>
        </div>
      </div>
    </div>
  );
}

// ── List row (matches the wishlist list-view reference) ──
function ListRow({ p, folderId }: { p: SavedProduct; folderId: string }) {
  const navigate = useNavigate();
  const callVendor = useCallVendor();
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex gap-3">
        <Link to={`/product/${p.id}`} className="relative w-20 h-24 shrink-0 rounded-lg overflow-hidden bg-gray-100">
          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
          <span className="absolute top-1 left-1 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center">
            <Heart className="w-3.5 h-3.5 fill-[#ef4d62] text-[#ef4d62]" />
          </span>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900 leading-snug">{p.name}</h3>
              <p className="inline-flex items-center gap-1 text-xs text-[#ef4d62] font-medium">
                {p.manufacturer} {p.verified && <BadgeCheck className="w-3 h-3" />}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-500">
            <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{p.location}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-600">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="font-bold">{p.rating.toFixed(1)}</span>
            <span className="text-gray-400">({p.reviews} reviews)</span>
          </div>
          <p className="text-sm font-bold text-gray-900 mt-1">{p.price}</p>
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span>{p.moq}</span>
            <span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" /> {p.timeAgo}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <button onClick={() => navigate(`/chats/${p.vendorId}`)} className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 rounded-lg py-2 text-xs font-semibold text-gray-700">
          <MessageCircle className="w-3.5 h-3.5" /> Chat
        </button>
        <button onClick={() => callVendor(p.vendorId, p.name)} className="flex-1 flex items-center justify-center gap-1.5 bg-[#ef4d62] text-white rounded-lg py-2 text-xs font-bold">
          <Phone className="w-3.5 h-3.5" /> CALL NOW
        </button>
        <button
          onClick={() => { removeFromFolder(folderId, p.id); toast("Removed from collection"); }}
          aria-label="Remove"
          className="shrink-0 w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#ef4d62] hover:border-[#ef4d62]/40 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const SavedCollectionDetail = () => {
  const { collectionId = ALL_SAVES_ID } = useParams();
  const navigate = useNavigate();
  const saved = useSaved();

  const folder = saved.folders.find((f) => f.id === collectionId);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [gender, setGender] = useState<GenderFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const products = useMemo(() => {
    let list = folderProducts(saved, collectionId);
    if (gender !== "all") list = list.filter((p) => p.gender === gender);
    if (verifiedOnly) list = list.filter((p) => p.verified);
    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => a.priceValue - b.priceValue);
    else if (sort === "price-desc") sorted.sort((a, b) => b.priceValue - a.priceValue);
    else if (sort === "rating") sorted.sort((a, b) => b.rating - a.rating);
    else sorted.sort((a, b) => b.savedAt - a.savedAt);
    return sorted;
  }, [saved, collectionId, gender, sort, verifiedOnly]);

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const deleteSelected = () => {
    if (selected.size === 0) { toast("Select items to remove"); return; }
    selected.forEach((id) => removeFromFolder(collectionId, id));
    toast(`Removed ${selected.size} item${selected.size > 1 ? "s" : ""}`);
    setSelected(new Set());
  };

  if (!folder) {
    return (
      <BuyerShell>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-sm text-gray-500">This collection no longer exists.</p>
          <button onClick={() => navigate("/saved")} className="mt-4 text-sm font-semibold text-[#ef4d62]">Back to My Saves</button>
        </div>
      </BuyerShell>
    );
  }

  const genderLabel = GENDERS.find((g) => g.key === gender)?.label ?? "All";
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? "Sort";

  return (
    <BuyerShell>
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
        {/* Title row */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => navigate("/saved")} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="flex-1 text-lg font-bold text-gray-900 truncate">{folder.name}</h1>
          <button onClick={deleteSelected} aria-label="Delete selected" className="p-1.5 text-gray-500 hover:text-[#ef4d62]">
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="flex items-center rounded-lg border border-gray-200 p-0.5">
            <button onClick={() => setView("grid")} className={cn("p-1.5 rounded-md", view === "grid" ? "bg-[#ef4d62] text-white" : "text-gray-400")} aria-label="Grid view">
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setView("list")} className={cn("p-1.5 rounded-md", view === "list" ? "bg-[#ef4d62] text-white" : "text-gray-400")} aria-label="List view">
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Gender / Sort / Filter */}
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

        {/* Items */}
        {products.length === 0 ? (
          <div className="py-16 text-center">
            <Heart className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No items in this collection yet.</p>
            <button onClick={() => navigate("/home/new-arrivals")} className="mt-4 text-sm font-semibold text-[#ef4d62]">Browse products</button>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {products.map((p) => (
              <GridCard key={p.id} p={p} folderId={collectionId} selected={selected.has(p.id)} onToggleSelect={() => toggleSelect(p.id)} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((p) => <ListRow key={p.id} p={p} folderId={collectionId} />)}
          </div>
        )}
      </div>
    </BuyerShell>
  );
};

export default SavedCollectionDetail;
