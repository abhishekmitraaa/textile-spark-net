import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import BuyerShell from "@/components/buyer/BuyerShell";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, Star, MapPin, MessageCircle, Phone, SlidersHorizontal, ChevronDown, Check,
  LayoutGrid, List as ListIcon, Building2, Palette, Truck, Monitor, Calculator, Camera, Wrench, Briefcase,
} from "lucide-react";
import { SERVICE_VENDORS, SERVICE_CATEGORIES } from "@/lib/serviceVendorsData";
import { placeCall, demoPhone } from "@/lib/queries/calls";
import { cn } from "@/lib/utils";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const listContainer = { show: { transition: { staggerChildren: 0.05 } } };
const listItem = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.3 } } };

const CAT_ICONS: Record<string, typeof Building2> = {
  Building2, Palette, Truck, Monitor, Calculator, Camera, Wrench,
};

const RATINGS = [
  { key: 0, label: "Any rating" }, { key: 4, label: "4.0+" }, { key: 4.5, label: "4.5+" },
];
const SORTS = [
  { key: "recommended", label: "Recommended" },
  { key: "rating", label: "Top Rated" },
  { key: "reviews", label: "Most Reviewed" },
  { key: "name", label: "Name A–Z" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const ServiceVendors = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("all");
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState<SortKey>("recommended");
  const [view, setView] = useState<"grid" | "list">("grid");

  const locations = useMemo(
    () => ["all", ...Array.from(new Set(SERVICE_VENDORS.map((v) => v.location.split(",")[0].trim())))],
    [],
  );

  const results = useMemo(() => {
    let list = SERVICE_VENDORS.slice();
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((v) =>
      v.name.toLowerCase().includes(q) || v.serviceType.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q) || v.tags.some((t) => t.toLowerCase().includes(q)));
    if (category !== "all") list = list.filter((v) => v.categoryId === category);
    if (location !== "all") list = list.filter((v) => v.location.startsWith(location));
    if (minRating) list = list.filter((v) => v.rating >= minRating);
    if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    else if (sort === "reviews") list.sort((a, b) => b.reviewsCount - a.reviewsCount);
    else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [query, category, location, minRating, sort]);

  return (
    <BuyerShell>
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-4 pb-24">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-extrabold text-gray-900">Service Vendors</h1>
          <p className="text-sm text-gray-500">Find trusted manufacturing, printing, and logistics partners for your brand</p>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services..."
            className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]"
          />
        </div>

        {/* Controls: Filters (sort) · Location · Rating */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide mb-3">
          <DropdownMenu>
            <DropdownMenuTrigger className={cn("shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold focus:outline-none", sort !== "recommended" ? "border-[#ef4d62] text-[#ef4d62]" : "border-gray-200 text-gray-700")}>
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Sort by</p>
              {SORTS.map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => setSort(s.key)} className="gap-2 text-sm">
                  <Check className={cn("w-4 h-4", sort === s.key ? "opacity-100 text-[#ef4d62]" : "opacity-0")} /> {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <FilterChip icon={MapPin} label={location === "all" ? "Location" : location} active={location !== "all"}
            items={locations.map((l) => ({ key: l, label: l === "all" ? "All locations" : l }))} value={location} onSelect={(v) => setLocation(String(v))} />
          <FilterChip icon={Star} label={minRating ? `Rating ${minRating}+` : "Rating 4+"} active={!!minRating}
            items={RATINGS.map((r) => ({ key: r.key, label: r.label }))} value={minRating} onSelect={(v) => setMinRating(Number(v))} />
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mb-4">
          {SERVICE_CATEGORIES.map((c) => {
            const Icon = CAT_ICONS[c.icon] ?? Building2;
            const active = category === c.id;
            return (
              <button key={c.id} onClick={() => setCategory(c.id)}
                className={cn("shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors active:scale-95",
                  active ? "border-[#ef4d62] bg-[#ef4d62] text-white" : "border-gray-200 text-gray-600 hover:border-[#ef4d62]/40")}>
                <Icon className="w-3.5 h-3.5" /> {c.label}
              </button>
            );
          })}
        </div>

        {/* Count + view toggle */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500"><span className="font-bold text-gray-900">{results.length}</span> vendor{results.length === 1 ? "" : "s"} found</p>
          <div className="flex items-center rounded-lg border border-gray-200 p-0.5">
            <button onClick={() => setView("grid")} aria-label="Grid view" className={cn("p-1.5 rounded-md transition-colors", view === "grid" ? "bg-[#ef4d62] text-white" : "text-gray-400 hover:text-gray-600")}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setView("list")} aria-label="List view" className={cn("p-1.5 rounded-md transition-colors", view === "list" ? "bg-[#ef4d62] text-white" : "text-gray-400 hover:text-gray-600")}>
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {results.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No service vendors match your filters.</p>
            <button onClick={() => { setCategory("all"); setLocation("all"); setMinRating(0); setQuery(""); }} className="mt-3 text-sm font-semibold text-[#ef4d62]">Clear filters</button>
          </div>
        ) : view === "grid" ? (
          <motion.div variants={listContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((v) => (
              <motion.div key={v.id} variants={listItem}>
                <GridCard v={v} onChat={() => navigate(`/chats/${v.id}`)} onCall={() => placeCall(v.name, demoPhone(v.id))} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-3">
            {results.map((v) => (
              <motion.div key={v.id} variants={listItem}>
                <ListCard v={v} onChat={() => navigate(`/chats/${v.id}`)} onCall={() => placeCall(v.name, demoPhone(v.id))} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </BuyerShell>
  );
};

type Vendor = (typeof SERVICE_VENDORS)[number];

function TypeBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#ef4d62] px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
      <Briefcase className="w-2.5 h-2.5" /> {label}
    </span>
  );
}

function ActionRow({ onChat, onCall }: { onChat: () => void; onCall: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChat(); }} className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-gray-200 py-1.5 text-[11px] font-semibold text-gray-700 hover:border-gray-300">
        <MessageCircle className="w-3 h-3" /> Chat
      </button>
      <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onCall(); }} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-[#ef4d62] text-white py-1.5 text-[11px] font-bold hover:bg-[#ef4d62]/90">
        <Phone className="w-3 h-3" /> Call
      </button>
    </div>
  );
}

function GridCard({ v, onChat, onCall }: { v: Vendor; onChat: () => void; onCall: () => void }) {
  return (
    <Link to={`/services/${v.id}`} className="block rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md hover:border-gray-300 transition-all">
      <div className="relative aspect-[4/3] bg-gray-100">
        <img src={v.image} alt={v.name} className="w-full h-full object-cover" />
        <div className="absolute top-2 left-2"><TypeBadge label={v.serviceType} /></div>
      </div>
      <div className="p-3">
        <h3 className="text-sm font-bold text-gray-900 leading-tight truncate">{v.name}</h3>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
          <span className="inline-flex items-center gap-0.5"><Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> <span className="font-bold">{v.rating}</span></span>
          <span className="inline-flex items-center gap-0.5 text-gray-400 truncate"><MapPin className="w-2.5 h-2.5 shrink-0" /> {v.location.split(",")[0]}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {v.tags.slice(0, 2).map((t) => (
            <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-medium text-gray-600 truncate max-w-full">{t}</span>
          ))}
        </div>
        <p className="mt-2 text-[15px] font-extrabold text-gray-900">{v.price}</p>
        <div className="mt-2.5"><ActionRow onChat={onChat} onCall={onCall} /></div>
      </div>
    </Link>
  );
}

function ListCard({ v, onChat, onCall }: { v: Vendor; onChat: () => void; onCall: () => void }) {
  return (
    <Link to={`/services/${v.id}`} className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-3 hover:shadow-md hover:border-gray-300 transition-all">
      <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-gray-100">
        <img src={v.image} alt={v.name} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 leading-tight truncate">{v.name}</h3>
            <div className="mt-0.5"><TypeBadge label={v.serviceType} /></div>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-600">
          <span className="inline-flex items-center gap-0.5"><Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> <span className="font-bold">{v.rating}</span> <span className="text-gray-400">({v.reviewsCount})</span></span>
          <span className="inline-flex items-center gap-0.5 text-gray-400 truncate"><MapPin className="w-2.5 h-2.5 shrink-0" /> {v.location}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {v.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-medium text-gray-600">{t}</span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[15px] font-extrabold text-gray-900 whitespace-nowrap">{v.price}</p>
          <div className="w-32 sm:w-40"><ActionRow onChat={onChat} onCall={onCall} /></div>
        </div>
      </div>
    </Link>
  );
}

// Quick filter chip with dropdown
function FilterChip({ icon: Icon, label, active, items, value, onSelect }: {
  icon: typeof MapPin; label: string; active: boolean;
  items: { key: string | number; label: string }[]; value: string | number; onSelect: (v: string | number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("shrink-0 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold focus:outline-none", active ? "border-[#ef4d62] text-[#ef4d62]" : "border-gray-200 text-gray-700")}>
        <Icon className="w-3.5 h-3.5" /> {label} <ChevronDown className="w-3 h-3 text-gray-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44 max-h-64 overflow-y-auto">
        {items.map((it) => (
          <DropdownMenuItem key={it.key} onClick={() => onSelect(it.key)} className="gap-2 text-sm">
            <Check className={cn("w-4 h-4", value === it.key ? "opacity-100 text-[#ef4d62]" : "opacity-0")} /> {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ServiceVendors;
