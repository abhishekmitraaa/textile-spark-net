import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import BuyerShell from "@/components/buyer/BuyerShell";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, FileText, MessageCircle, TrendingUp, ArrowLeft, ChevronRight, Send,
  Clock, CheckCircle2, XCircle, Search, ChevronDown, Award, Star, Scale, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { quotesForRfq, rfqStats, bestPrice, topRated } from "@/lib/quotesStore";
import { fmtMoney, type QuoteStatus, type VendorQuote } from "@/lib/quotesData";
import { useBuyerQuotes, setQuoteStatusDb } from "@/lib/queries/rfqs";
import { useCallVendor } from "@/lib/queries/calls";
import { useAuth } from "@/contexts/AuthContext";
import ReceivedQuoteCard from "@/components/buyer/quotes/ReceivedQuoteCard";
import QuoteDetailsModal from "@/components/buyer/quotes/QuoteDetailsModal";
import VendorChatModal from "@/components/buyer/quotes/VendorChatModal";
import CompareTable from "@/components/buyer/quotes/CompareTable";
import DirectRequestThread from "@/components/buyer/quotes/DirectRequestThread";
import { cn } from "@/lib/utils";

// "received" is the open-marketplace comparison screen (many competing
// vendors). "direct" is a product-page request addressed to one vendor, where
// comparison is meaningless — see DirectRequestThread.
type View = "list" | "received" | "direct";

const BLUE = "#256fef";
type StatusFilter = "all" | QuoteStatus;
type SortKey = "recent" | "price" | "rating";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All Status" }, { key: "pending", label: "Pending" },
  { key: "shortlisted", label: "Shortlisted" }, { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
];
const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Most Recent" }, { key: "price", label: "Lowest Price" }, { key: "rating", label: "Highest Rating" },
];

function StatCard({ icon: Icon, value, label, tint, badge }: {
  icon: typeof FileText; value: number | string; label: string; tint: string; badge?: number;
}) {
  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white p-3 flex flex-col items-center text-center">
      {badge ? (
        <span className="absolute top-2 right-2 min-w-4 h-4 px-1 rounded-full bg-[#ef4d62] text-white text-[9px] font-bold flex items-center justify-center">{badge}</span>
      ) : null}
      <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-1.5", tint)}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="text-lg font-extrabold text-gray-900 leading-none">{value}</span>
      <span className="text-[10px] text-gray-500 mt-1 leading-tight">{label}</span>
    </div>
  );
}

const MyQuotes = () => {
  const navigate = useNavigate();
  const callVendor = useCallVendor();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: buyerData } = useBuyerQuotes(user?.id);
  const rfqs = buyerData?.rfqs ?? [];
  const quotesMap = buyerData?.quotesMap ?? {};

  const [view, setView] = useState<View>("list");
  const [rfqId, setRfqId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "accepted" | "rejected" } | null>(null);

  const rfq = rfqs.find((r) => r.id === rfqId);
  const rfqQuotes = useMemo(() => (rfqId ? quotesForRfq(quotesMap, rfqId) : []), [quotesMap, rfqId]);
  const stats = useMemo(() => rfqStats(rfqQuotes), [rfqQuotes]);
  const best = useMemo(() => bestPrice(rfqQuotes), [rfqQuotes]);
  const top = useMemo(() => topRated(rfqQuotes), [rfqQuotes]);

  const filtered = useMemo(() => {
    let list = [...rfqQuotes];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((x) => x.vendorName.toLowerCase().includes(q) || (rfq?.productName ?? "").toLowerCase().includes(q));
    if (status !== "all") list = list.filter((x) => x.status === status);
    if (sort === "price") list.sort((a, b) => a.pricePerUnit - b.pricePerUnit);
    else if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [rfqQuotes, search, status, sort, rfq]);

  // A targeted request has exactly one vendor in it, so it opens the
  // single-vendor thread; everything else keeps the comparison screen.
  const openReceived = (id: string) => {
    const target = rfqs.find((r) => r.id === id);
    setRfqId(id); setView(target?.targetVendorId ? "direct" : "received");
    setSearch(""); setStatus("all"); setSort("recent");
    setCompareMode(false); setSelected([]); setBanner(null);
  };

  // The target vendor's reply, or null while the request is still pending.
  const directQuote = useMemo(() => {
    if (!rfq?.targetVendorId) return null;
    return rfqQuotes.find((q) => q.vendorId === rfq.targetVendorId) ?? null;
  }, [rfq, rfqQuotes]);

  const flashBanner = (type: "accepted" | "rejected") => {
    setBanner({ type });
    window.setTimeout(() => setBanner((b) => (b?.type === type ? null : b)), 3500);
  };

  const changeStatus = async (id: string, s: QuoteStatus) => {
    try {
      await setQuoteStatusDb(id, s);
      queryClient.invalidateQueries({ queryKey: ["rfqs", "buyer", user?.id] });
      if (s === "accepted") flashBanner("accepted");
      else if (s === "rejected") flashBanner("rejected");
    } catch (e) {
      toast.error("Couldn't update quote", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  };

  const goCall = (q: VendorQuote) => callVendor(q.vendorId, q.vendorName);

  // Totals for the list view
  const listTotals = useMemo(() => {
    const all = Object.values(quotesMap);
    return {
      activeRfqs: rfqs.filter((r) => r.status === "active").length,
      totalQuotes: all.length,
      newQuotes: all.filter((q) => q.isNew).length,
    };
  }, [quotesMap, rfqs]);

  const selectedQuotes = selected.map((id) => quotesMap[id]).filter(Boolean);

  return (
    <BuyerShell>
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
        <AnimatePresence mode="wait">
          {/* ───────── LIST VIEW ───────── */}
          {view === "list" && (
            <motion.div key="list" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -12 }}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">My Quotes</h1>
                  <p className="text-sm text-gray-500">Manage your quote requests</p>
                </div>
                <button
                  onClick={() => navigate("/requirement/post-requirement")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white px-3.5 py-2.5 text-sm font-bold transition-colors shrink-0"
                >
                  <Plus className="w-4 h-4" /> Create New
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <StatCard icon={FileText} value={listTotals.activeRfqs} label="Active RFQs" tint="bg-[#ef4d62]/10 text-[#ef4d62]" />
                <StatCard icon={MessageCircle} value={listTotals.totalQuotes} label="Total Quotes" tint="bg-blue-50 text-blue-500" />
                <StatCard icon={TrendingUp} value={listTotals.newQuotes} label="New Quotes" tint="bg-emerald-50 text-emerald-500" badge={listTotals.newQuotes} />
              </div>

              <h2 className="text-xs font-bold tracking-wide text-gray-400 mb-2.5">YOUR REQUESTS</h2>
              {rfqs.length === 0 && (
                <p className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
                  {user ? "No requirements yet — tap Create New to post one." : "Sign in as a buyer to see your requirements."}
                </p>
              )}
              <div className="space-y-3">
                {rfqs.map((r) => {
                  const rq = quotesForRfq(quotesMap, r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => openReceived(r.id)}
                      className="w-full text-left rounded-2xl border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {/* Wraps so the vendor name in the Direct chip stays
                              readable next to the Active / "N new" badges. */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold",
                              r.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
                            )}>
                              {r.status === "active" ? "Active" : "Closed"}
                            </span>
                            {r.newCount > 0 && (
                              <span className="rounded-full bg-[#ef4d62] text-white px-2 py-0.5 text-[10px] font-bold">{r.newCount} new</span>
                            )}
                            {r.targetVendorId && (
                              <span
                                className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                                style={{ backgroundColor: `${BLUE}1a`, color: BLUE }}
                              >
                                <Send className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">Direct to {r.targetVendorName}</span>
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-1">{r.title}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">{r.units} units • ₹{r.priceMin} - ₹{r.priceMax}/unit</p>
                        </div>
                        <img src={r.image} alt={r.title} className="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0" />
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                        {/* A direct request has one vendor, so "N quotes" and a
                            "lowest" price are both meaningless on it. */}
                        {r.targetVendorId ? (
                          <span className="inline-flex items-center gap-1">
                            <MessageCircle className="w-3.5 h-3.5" />
                            {rq.length > 0
                              ? <>Quoted <span className="font-bold text-gray-800">₹{r.lowest}</span></>
                              : "Awaiting reply"}
                          </span>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {rq.length} quotes</span>
                            <span>Lowest: <span className="font-bold text-gray-800">₹{r.lowest}</span></span>
                          </>
                        )}
                        <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {r.date}</span>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ───────── DIRECT REQUEST VIEW (one vendor) ───────── */}
          {view === "direct" && rfq && rfq.targetVendorId && (
            <div key="direct">
              <AnimatePresence>
                {banner && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    className={cn(
                      "rounded-xl px-4 py-3 mb-3 text-white",
                      banner.type === "accepted" ? "bg-emerald-600" : "bg-red-500"
                    )}
                  >
                    <p className="text-sm font-bold">
                      {banner.type === "accepted" ? "Quote Accepted 🎉" : "Quote Rejected"}
                    </p>
                    <p className="text-xs opacity-90">
                      {banner.type === "accepted"
                        ? "Congratulations! The vendor will be notified to proceed."
                        : "The vendor will be notified of your decision."}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
              <DirectRequestThread
                rfq={rfq}
                quote={directQuote}
                onBack={() => setView("list")}
                onChat={() => navigate(`/chats/${rfq.targetVendorId}`)}
                onCall={() => callVendor(rfq.targetVendorId as string, rfq.productName)}
                onStatus={(s) => { if (directQuote) changeStatus(directQuote.id, s); }}
              />
            </div>
          )}

          {/* ───────── RECEIVED VIEW ───────── */}
          {view === "received" && rfq && (
            <motion.div key="received" initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -16 }}>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setView("list")} aria-label="Back" className="-ml-1 p-1"><ArrowLeft className="w-5 h-5 text-gray-700" /></button>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">Quotes Received</h1>
                  <p className="text-xs text-gray-500">Review and manage quotes from vendors</p>
                </div>
              </div>

              {/* Selected RFQ banner */}
              <div className="rounded-xl bg-[#ef4d62]/5 border border-[#ef4d62]/15 px-3.5 py-2.5 mb-4">
                <p className="text-sm font-bold text-gray-900">{rfq.title}</p>
              </div>

              {/* Stats 2x2 */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <StatCard icon={Send} value={stats.total} label="Total Quotes" tint="bg-[#ef4d62]/10 text-[#ef4d62]" />
                <StatCard icon={Clock} value={stats.pending} label="Pending Review" tint="bg-amber-50 text-amber-500" />
                <StatCard icon={CheckCircle2} value={stats.shortlisted} label="Shortlisted" tint="bg-emerald-50 text-emerald-500" />
                <StatCard icon={XCircle} value={stats.rejected} label="Rejected" tint="bg-red-50 text-red-500" />
              </div>

              {/* Best price + Top rated */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                  <p className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-500"><Award className="w-3.5 h-3.5" /> Best Price</p>
                  <p className="text-base font-extrabold text-gray-900 mt-0.5">{best ? `${fmtMoney(best.currency, best.pricePerUnit)}/unit` : "—"}</p>
                  <p className="text-[11px] text-gray-500 truncate">{best?.vendorName ?? "No quotes yet"}</p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                  <p className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Top Rated</p>
                  <p className="text-base font-extrabold text-gray-900 mt-0.5">{top ? top.rating.toFixed(1) : "—"}</p>
                  <p className="text-[11px] text-gray-500 truncate">{top?.vendorName ?? "No quotes yet"}</p>
                </div>
              </div>

              {/* Received Quotes + Compare */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-900">Received Quotes {compareMode && <span className="text-gray-400 font-normal">({stats.total})</span>}</h2>
                <button
                  onClick={() => { setCompareMode((v) => !v); setSelected([]); }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    compareMode ? "border-[#ef4d62] bg-[#ef4d62] text-white" : "border-gray-200 text-gray-700 hover:border-gray-300"
                  )}
                >
                  <Scale className="w-3.5 h-3.5" /> {compareMode ? "Exit Compare" : "Compare"}
                </button>
              </div>

              {/* Compare bar */}
              {compareMode && (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-[#ef4d62]/5 border border-[#ef4d62]/20 px-3.5 py-2.5 mb-3">
                  <span className="text-xs font-semibold text-gray-700">{selected.length} selected (max 3)</span>
                  <button
                    onClick={() => setShowCompare(true)}
                    disabled={selected.length < 2}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                      selected.length >= 2 ? "bg-[#ef4d62] text-white hover:bg-[#ef4d62]/90" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    Compare Now
                  </button>
                </div>
              )}

              {/* Search + filters */}
              {!compareMode && (
                <div className="space-y-2.5 mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by vendor or product..."
                      className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex items-center justify-between gap-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 focus:outline-none">
                        {STATUS_FILTERS.find((s) => s.key === status)?.label} <ChevronDown className="w-4 h-4 text-gray-400" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-44">
                        {STATUS_FILTERS.map((o) => (
                          <DropdownMenuItem key={o.key} onClick={() => setStatus(o.key)} className="gap-2 text-sm">
                            <Check className={cn("w-4 h-4", status === o.key ? "opacity-100 text-[#ef4d62]" : "opacity-0")} /> {o.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex items-center justify-between gap-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 focus:outline-none">
                        {SORTS.find((s) => s.key === sort)?.label} <ChevronDown className="w-4 h-4 text-gray-400" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {SORTS.map((o) => (
                          <DropdownMenuItem key={o.key} onClick={() => setSort(o.key)} className="gap-2 text-sm">
                            <Check className={cn("w-4 h-4", sort === o.key ? "opacity-100 text-[#ef4d62]" : "opacity-0")} /> {o.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}

              {/* Accept / Reject banner */}
              <AnimatePresence>
                {banner && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    className={cn(
                      "rounded-xl px-4 py-3 mb-3 text-white",
                      banner.type === "accepted" ? "bg-emerald-600" : "bg-red-500"
                    )}
                  >
                    <p className="text-sm font-bold">
                      {banner.type === "accepted" ? "Quote Accepted 🎉" : "Quote Rejected"}
                    </p>
                    <p className="text-xs opacity-90">
                      {banner.type === "accepted"
                        ? "Congratulations! The vendor will be notified to proceed."
                        : "The vendor will be notified of your decision."}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Quote list */}
              {filtered.length === 0 ? (
                <div className="py-16 text-center">
                  <Send className="w-9 h-9 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-700">No quotes found</p>
                  <p className="text-xs text-gray-400 mt-0.5">Try adjusting your filters or search query</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((q) => (
                    <ReceivedQuoteCard
                      key={q.id}
                      quote={q}
                      forProduct={rfq.productName}
                      compareMode={compareMode}
                      selected={selected.includes(q.id)}
                      onToggleSelect={() => toggleSelect(q.id)}
                      onChat={() => setChatId(q.id)}
                      onCall={() => goCall(q)}
                      onDetails={() => setDetailsId(q.id)}
                      onStatus={(s) => changeStatus(q.id, s)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      <QuoteDetailsModal
        quote={detailsId ? quotesMap[detailsId] : null}
        forProduct={rfq?.productName ?? ""}
        onClose={() => setDetailsId(null)}
        onChat={() => { const id = detailsId; setDetailsId(null); setChatId(id); }}
        onCall={() => { if (detailsId) goCall(quotesMap[detailsId]); }}
        onStatus={(s) => { if (detailsId) changeStatus(detailsId, s); }}
      />
      <VendorChatModal quote={chatId ? quotesMap[chatId] : null} onClose={() => setChatId(null)} />
      <CompareTable
        quotes={showCompare ? selectedQuotes : []}
        onClose={() => setShowCompare(false)}
        onChat={(q) => { setShowCompare(false); setChatId(q.id); }}
        onCall={(q) => goCall(q)}
      />
    </BuyerShell>
  );
};

export default MyQuotes;
