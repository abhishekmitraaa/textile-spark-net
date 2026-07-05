import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import BuyerShell from "@/components/buyer/BuyerShell";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, Star, MapPin, MessageCircle, Phone, SlidersHorizontal, ArrowUpDown, Check, ChevronDown, Users,
} from "lucide-react";
import { FREELANCERS, FREELANCER_CATEGORIES } from "@/lib/freelancersData";
import { placeCall, demoPhone } from "@/lib/queries/calls";
import { cn } from "@/lib/utils";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const listContainer = { show: { transition: { staggerChildren: 0.05 } } };
const listItem = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.3 } } };

const RATINGS = [
  { key: 0, label: "Any rating" }, { key: 4, label: "4.0+" }, { key: 4.5, label: "4.5+" },
];
const EXPERIENCE = [
  { key: 0, label: "Any experience" }, { key: 3, label: "3+ years" }, { key: 5, label: "5+ years" }, { key: 10, label: "10+ years" },
];
const SORTS = [
  { key: "recommended", label: "Recommended" },
  { key: "price-asc", label: "Price: Low to High" },
  { key: "price-desc", label: "Price: High to Low" },
  { key: "rating", label: "Top Rated" },
  { key: "experience", label: "Most Experienced" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const Freelancers = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("all");
  const [minRating, setMinRating] = useState(0);
  const [minExp, setMinExp] = useState(0);
  const [sort, setSort] = useState<SortKey>("recommended");

  const locations = useMemo(() => ["all", ...Array.from(new Set(FREELANCERS.map((f) => f.location.split(",")[0].trim())))], []);

  const results = useMemo(() => {
    let list = FREELANCERS.slice();
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((f) => f.name.toLowerCase().includes(q) || f.title.toLowerCase().includes(q) || f.tags.some((t) => t.toLowerCase().includes(q)));
    if (category !== "all") list = list.filter((f) => f.categoryId === category);
    if (location !== "all") list = list.filter((f) => f.location.startsWith(location));
    if (minRating) list = list.filter((f) => f.rating >= minRating);
    if (minExp) list = list.filter((f) => f.experienceYears >= minExp);
    if (sort === "price-asc") list.sort((a, b) => a.hourlyRate - b.hourlyRate);
    else if (sort === "price-desc") list.sort((a, b) => b.hourlyRate - a.hourlyRate);
    else if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    else if (sort === "experience") list.sort((a, b) => b.experienceYears - a.experienceYears);
    return list;
  }, [query, category, location, minRating, minExp, sort]);

  const activeFilters = (location !== "all" ? 1 : 0) + (minRating ? 1 : 0) + (minExp ? 1 : 0);

  return (
    <BuyerShell>
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-6 pt-4 pb-24">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-extrabold text-gray-900">Freelancers &amp; Experts</h1>
          <p className="text-sm text-gray-500">Connect with skilled fashion industry professionals for your projects</p>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search freelancers by name or skill..."
            className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]"
          />
        </div>

        {/* Controls: Location · Rating · Filters · Sort */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide mb-3">
          <FilterChip icon={MapPin} label={location === "all" ? "Location" : location} active={location !== "all"}
            items={locations.map((l) => ({ key: l, label: l === "all" ? "All locations" : l }))} value={location} onSelect={(v) => setLocation(String(v))} />
          <FilterChip icon={Star} label={minRating ? `Rating ${minRating}+` : "Rating"} active={!!minRating}
            items={RATINGS.map((r) => ({ key: r.key, label: r.label }))} value={minRating} onSelect={(v) => setMinRating(Number(v))} />
          {/* Filters (experience) */}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn("shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold focus:outline-none", activeFilters ? "border-[#ef4d62] text-[#ef4d62]" : "border-gray-200 text-gray-700")}>
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters{activeFilters ? ` (${activeFilters})` : ""}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Experience</p>
              {EXPERIENCE.map((x) => (
                <DropdownMenuItem key={x.key} onClick={() => setMinExp(x.key)} className="gap-2 text-sm">
                  <Check className={cn("w-4 h-4", minExp === x.key ? "opacity-100 text-[#ef4d62]" : "opacity-0")} /> {x.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn("shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold focus:outline-none", sort !== "recommended" ? "border-[#ef4d62] text-[#ef4d62]" : "border-gray-200 text-gray-700")}>
              <ArrowUpDown className="w-3.5 h-3.5" /> Sort
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {SORTS.map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => setSort(s.key)} className="gap-2 text-sm">
                  <Check className={cn("w-4 h-4", sort === s.key ? "opacity-100 text-[#ef4d62]" : "opacity-0")} /> {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mb-4">
          {FREELANCER_CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors active:scale-95",
                category === c.id ? "border-[#ef4d62] bg-[#ef4d62] text-white" : "border-gray-200 text-gray-600 hover:border-[#ef4d62]/40")}>
              {c.label}
            </button>
          ))}
        </div>

        <p className="text-sm text-gray-500 mb-3">{results.length} freelancer{results.length === 1 ? "" : "s"} found</p>

        {results.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No freelancers match your filters.</p>
            <button onClick={() => { setCategory("all"); setLocation("all"); setMinRating(0); setMinExp(0); setQuery(""); }} className="mt-3 text-sm font-semibold text-[#ef4d62]">Clear filters</button>
          </div>
        ) : (
          <motion.div variants={listContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((f) => (
              <motion.div key={f.id} variants={listItem}>
                <Link to={`/freelancers/${f.id}`} className="block rounded-2xl border border-gray-200 bg-white p-3 hover:shadow-md hover:border-gray-300 transition-all">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative">
                      <img src={f.avatar} alt={f.name} className="w-16 h-16 rounded-full object-cover" />
                      {f.online && <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />}
                    </div>
                    <h3 className="mt-2 text-sm font-bold text-gray-900 leading-tight">{f.name}</h3>
                    <p className="text-[11px] text-[#ef4d62] font-medium">{f.title}</p>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-600">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      <span className="font-bold">{f.rating}</span>
                      <span className="text-gray-400">({f.reviewsCount})</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-0.5 text-[10px] text-gray-400">
                      <MapPin className="w-2.5 h-2.5" /> {f.location}
                    </div>
                    <div className="mt-2 flex flex-wrap justify-center gap-1">
                      {f.tags.slice(0, 2).map((t) => (
                        <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-medium text-gray-600">{t}</span>
                      ))}
                    </div>
                    <p className="mt-2 text-base font-extrabold text-gray-900">₹{f.hourlyRate.toLocaleString("en-IN")}<span className="text-[11px] font-medium text-gray-400">/hr</span></p>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <button onClick={(e) => { e.preventDefault(); navigate(`/chats/${f.id}`); }} className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-gray-200 py-1.5 text-[11px] font-semibold text-gray-700 hover:border-gray-300">
                      <MessageCircle className="w-3 h-3" /> Chat
                    </button>
                    <button onClick={(e) => { e.preventDefault(); placeCall(f.name, demoPhone(f.id)); }} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-[#ef4d62] text-white py-1.5 text-[11px] font-bold hover:bg-[#ef4d62]/90">
                      <Phone className="w-3 h-3" /> Call
                    </button>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </BuyerShell>
  );
};

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

export default Freelancers;
