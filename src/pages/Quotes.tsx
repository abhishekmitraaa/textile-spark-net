import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import OpenRfqLeads from "@/components/vendor/OpenRfqLeads";
import DirectQuoteRequests from "@/components/vendor/DirectQuoteRequests";
import { useAuth } from "@/contexts/AuthContext";
import { useMySubmittedQuotes } from "@/lib/queries/rfqs";
import type { MySubmittedQuote } from "@/lib/queries/rfqs";
import { useCallBuyer } from "@/lib/queries/calls";
import { toast } from "sonner";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};
const listContainer = {
  show: { transition: { staggerChildren: 0.055 } },
};
const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};
import { cn } from "@/lib/utils";
import {
  Search, Bell, ChevronDown, ChevronRight, Clock, Package,
  TrendingUp, CheckCircle2, Star, FileText, MessageSquare, Phone, X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// SUBMITTED QUOTES
// Rows come from useMySubmittedQuotes (real `quotes` + `rfqs` + buyer
// profiles); the page holds no local quote types or fixtures any more.
//
// Desktop layout note: `DashboardLayout` eats 256px of sidebar + 48px of
// lg:p-6, so a vendor page only has ~976px at a 1280px viewport. The
// metrics rail therefore splits off at `min-[1400px]` (≈1096px of content),
// not at `xl:` — see CLAUDE.md "Vendor pages: Tailwind's breakpoints lie".
// Mobile markup is unchanged; every desktop rule is additive.
// ─────────────────────────────────────────────────────────────

type Stats = { total: number; accepted: number; negotiating: number; pending: number };

const statusConfig = {
  in_negotiation: { label: "In Negotiation", bg: "bg-blue-50",   text: "text-blue-600",   border: "border-blue-200",   icon: MessageSquare },
  accepted:       { label: "Quote Accepted", bg: "bg-green-50",  text: "text-green-600",  border: "border-green-200",  icon: CheckCircle2  },
  awaiting:       { label: "Awaiting Response", bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200", icon: Clock        },
  not_selected:   { label: "Not Selected",   bg: "bg-red-50",    text: "text-red-500",    border: "border-red-200",    icon: X            },
};

const buyerResponseBg = {
  in_negotiation: "bg-blue-50 border-blue-100",
  accepted:       "bg-green-50 border-green-100",
  awaiting:       "bg-gray-50 border-gray-100",
  not_selected:   "bg-red-50 border-red-100",
};

// ── Stats + performance. Full-width rows on mobile / tablet, a sticky
//    metrics rail beside the working column from 1400px up. ──
function MetricsRail({ stats, onSwitchToRequests }: { stats: Stats; onSwitchToRequests: () => void }) {
  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Stats: 2x2 on mobile, a 4-across strip on tablet, back to 2x2 in the rail */}
      <motion.div variants={listContainer} className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4 min-[1400px]:grid-cols-2 min-[1400px]:gap-3">
        {[
          { label: "Total Quotes",    value: stats.total,       icon: FileText,      color: "text-orange-400" },
          { label: "Accepted",        value: stats.accepted,    icon: CheckCircle2,  color: "text-green-500"  },
          { label: "In Negotiation",  value: stats.negotiating, icon: MessageSquare, color: "text-blue-500"   },
          { label: "Pending",         value: stats.pending,     icon: Clock,         color: "text-orange-400" },
        ].map(s => (
          <motion.div key={s.label} variants={listItem}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 lg:p-4 lg:transition-shadow lg:hover:shadow-md">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 lg:text-[13px]">{s.label}</span>
              <s.icon className={cn("w-4 h-4 shrink-0", s.color)} />
            </div>
            <p className="text-2xl font-bold text-gray-900 lg:text-[28px] lg:leading-tight lg:tabular-nums">{s.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Performance card */}
      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 lg:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="text-sm font-bold text-gray-900">Your Performance</span>
          </div>
          <span className="text-[10px] font-semibold bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full whitespace-nowrap">
            This Month: 8 quotes
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-3 lg:grid-cols-4 min-[1400px]:grid-cols-2">
          <div>
            <p className="text-xs text-gray-500">Acceptance Rate</p>
            <p className="text-lg font-bold text-green-600 lg:tabular-nums">25%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Avg. Response Time</p>
            <p className="text-lg font-bold text-gray-900">1.5 days</p>
          </div>
          {/* Total Order Value repeats inside the grid on the wide tablet row so
              the metrics read as one strip; the mobile placement stays below. */}
          <div className="hidden lg:block min-[1400px]:hidden">
            <p className="text-xs text-gray-500">Total Order Value</p>
            <p className="text-lg font-bold text-[#ef4d62]">₹24.5L</p>
          </div>
          <div className="hidden lg:flex lg:items-end min-[1400px]:hidden">
            <motion.button whileTap={TAP} transition={TAP_T} onClick={onSwitchToRequests}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-[#ef4d62] text-white text-xs font-bold rounded-xl hover:bg-[#ef4d62]/90 transition-colors">
              Browse RFQs <ChevronRight className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 lg:hidden min-[1400px]:flex">
          <div>
            <p className="text-xs text-gray-500">Total Order Value</p>
            <p className="text-lg font-bold text-[#ef4d62]">₹24.5L</p>
          </div>
          <motion.button whileTap={TAP} transition={TAP_T} onClick={onSwitchToRequests}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#ef4d62] text-white text-xs font-bold rounded-xl hover:bg-[#ef4d62]/90 transition-colors whitespace-nowrap">
            Browse RFQs <ChevronRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ── The submitted-quote list: search + sort controls and the cards. ──
function SubmittedQuotesList({ quotes, onSwitchToRequests }: { quotes: MySubmittedQuote[]; onSwitchToRequests: () => void }) {
  const navigate = useNavigate();
  const callBuyer = useCallBuyer();

  // Deep-link into the thread with this specific buyer. useChatThread
  // find-or-creates the canonical conversation for the pair, so this is the
  // same thread the buyer sees from their side. Guard against the rare row
  // whose RFQ we could not resolve, rather than routing to /chats/undefined.
  const openChat = (buyerId: string) => {
    if (!buyerId) {
      toast("Buyer unavailable", { description: "This quote has no buyer on file." });
      return;
    }
    navigate(`/chats/${buyerId}`);
  };

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = quotes.filter(q =>
    !search || q.rfqTitle.toLowerCase().includes(search.toLowerCase()) || q.buyerName.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "price_high") return b.pricePerUnit - a.pricePerUnit;
    if (sort === "price_low")  return a.pricePerUnit - b.pricePerUnit;
    if (sort === "status") return a.status.localeCompare(b.status);
    return 0;
  });

  return (
    <div className="space-y-4">
      {/* Search + Sort */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 lg:max-w-sm lg:focus-within:border-gray-300 lg:transition-colors">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input type="text" placeholder="Search quotes..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-0 text-sm text-gray-700 bg-transparent focus:outline-none placeholder-gray-400" />
        </div>
        <div className="relative lg:ml-auto">
          <button onClick={() => setSortOpen(p => !p)}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap">
            {sort === "recent" ? "Most Recent" : sort === "price_high" ? "Price: High" : sort === "price_low" ? "Price: Low" : "By Status"}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
              <div className="absolute right-0 top-11 z-20 bg-white border border-gray-100 rounded-xl shadow-xl py-1 w-40">
                {[
                  { v: "recent",     l: "Most Recent" },
                  { v: "price_high", l: "Price: High"  },
                  { v: "price_low",  l: "Price: Low"   },
                  { v: "status",     l: "By Status"    },
                ].map(o => (
                  <button key={o.v} onClick={() => { setSort(o.v); setSortOpen(false); }}
                    className={cn("w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2",
                      sort === o.v ? "text-[#ef4d62] font-semibold" : "text-gray-700")}>
                    {sort === o.v && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {o.l}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quote cards. Stacked image-over-content on mobile; from lg the card
          turns side-on so the width goes to content instead of whitespace. */}
      <motion.div variants={listContainer} className="space-y-3 lg:space-y-4">
        {sorted.map(q => {
          const cfg = statusConfig[q.status];
          const respBg = buyerResponseBg[q.status];
          return (
            <motion.div key={q.id}
              variants={listItem}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden lg:flex lg:items-stretch lg:transition-shadow lg:hover:shadow-md">

              {/* Image (only if present — screenshot 6) */}
              {q.image && (
                <img src={q.image} alt={q.rfqTitle}
                  className="w-full h-36 object-cover lg:h-auto lg:w-56 lg:shrink-0 min-[1400px]:w-64" />
              )}

              <div className="p-4 lg:flex-1 lg:min-w-0 lg:p-5">
                {/* Status badge + rank */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border",
                    cfg.bg, cfg.text, cfg.border
                  )}>
                    <cfg.icon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </span>
                  {q.rankBadge && (
                    <span className="text-[10px] font-semibold bg-orange-50 text-orange-500 border border-orange-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TrendingUp className="w-2.5 h-2.5" /> {q.rankBadge}
                    </span>
                  )}
                </div>

                {/* Code + date (screenshot 6 style) */}
                {q.image && (
                  <p className="text-[10px] text-gray-400 mb-1 lg:text-xs">{q.quoteCode} · Submitted {q.submittedDate}</p>
                )}

                {/* Title + price */}
                <div className="flex items-start justify-between gap-2 mb-1 lg:gap-6">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 leading-snug lg:text-base">{q.rfqTitle}</p>
                    <p className="text-xs text-gray-400 lg:text-[13px]">{q.buyerName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-[#ef4d62] lg:text-xl lg:tabular-nums">₹ {q.pricePerUnit}</p>
                    <p className="text-[10px] text-gray-400 lg:text-xs">per unit</p>
                  </div>
                </div>

                {/* RFQ code / price+MOQ / lead time — stacked on mobile, one
                    wrapping meta row once the card goes side-on. */}
                {q.image && (
                  <div className="lg:flex lg:flex-wrap lg:items-center lg:gap-x-5 lg:gap-y-1 lg:mb-2">
                    <p className="text-xs text-gray-600 mb-1 lg:mb-0">RFQ: {q.rfqCode}</p>
                    <p className="text-xs text-gray-700 mb-1 lg:mb-0">Price: ₹{q.pricePerUnit}/unit&nbsp;&nbsp;MOQ: {q.moq}</p>
                    <p className="text-xs text-gray-700 mb-2 lg:mb-0">Lead Time: {q.leadTime}</p>
                  </div>
                )}

                {/* Pcs + submitted date */}
                {!q.image && (
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                    <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {q.pcs}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Submitted {q.submittedDate}</span>
                  </div>
                )}

                {/* Competing-quote count. Shown on every card: it used to be
                    gated on !q.image, which hid a real number on any RFQ that
                    happened to have a photo. */}
                <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
                  <Star className="w-3 h-3" /> {q.totalQuotes} quotes total
                </p>

                {/* Buyer Response box */}
                {q.buyerResponse && (
                  <div className={cn("rounded-xl border p-3 mb-3", respBg)}>
                    <p className="text-xs font-bold text-gray-700 mb-1">Buyer's Response:</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{q.buyerResponse}</p>
                    {q.buyerResponseDate && (
                      <p className="text-[10px] text-gray-400 mt-1.5">{q.buyerResponseDate}</p>
                    )}
                  </div>
                )}

                {/* Last updated (screenshot 6) */}
                {q.image && (
                  <p className="text-[10px] text-gray-400 mb-3 lg:text-xs">Last updated: {q.lastUpdated}</p>
                )}

                {/* Action button(s). Full-bleed on mobile; sized to their label
                    on desktop so a 900px card isn't one giant button. */}
                {q.status === "in_negotiation" && (
                  <motion.button whileTap={TAP} transition={TAP_T} onClick={() => openChat(q.buyerId)}
                    className="w-full py-3 bg-[#ef4d62] text-white text-sm font-bold rounded-xl hover:bg-[#ef4d62]/90 transition-colors flex items-center justify-center gap-2 lg:w-auto lg:px-6 lg:py-2.5">
                    <MessageSquare className="w-4 h-4" /> Continue Chat
                  </motion.button>
                )}
                {q.status === "accepted" && !q.image && (
                  <motion.button whileTap={TAP} transition={TAP_T} onClick={() => openChat(q.buyerId)}
                    className="w-full py-3 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 lg:w-auto lg:px-6 lg:py-2.5">
                    <CheckCircle2 className="w-4 h-4" /> View Order Details
                  </motion.button>
                )}
                {q.status === "accepted" && q.image && (
                  <div className="grid grid-cols-2 gap-2 lg:flex lg:gap-2">
                    <motion.button whileTap={TAP} transition={TAP_T} onClick={onSwitchToRequests}
                      className="py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5 lg:px-5">
                      <Star className="w-3.5 h-3.5" /> View RFQ
                    </motion.button>
                    <motion.button whileTap={TAP} transition={TAP_T} onClick={() => callBuyer(q.buyerId)}
                      className="py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 lg:px-5">
                      <Phone className="w-3.5 h-3.5" /> Call Buyer
                    </motion.button>
                  </div>
                )}
                {q.status === "not_selected" && (
                  <motion.button whileTap={TAP} transition={TAP_T} onClick={onSwitchToRequests}
                    className="w-full py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5 lg:w-auto lg:px-5">
                    Browse New RFQs <ChevronRight className="w-4 h-4" />
                  </motion.button>
                )}
                {q.status === "awaiting" && (
                  <motion.button whileTap={TAP} transition={TAP_T} onClick={onSwitchToRequests}
                    className="w-full py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5 lg:w-auto lg:px-5">
                    View RFQ <ChevronRight className="w-4 h-4" />
                  </motion.button>
                )}
              </div>
            </motion.div>
          );
        })}
        {sorted.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center lg:py-14">
            <FileText className="w-9 h-9 text-gray-300 mx-auto mb-3 lg:w-11 lg:h-11" />
            <p className="text-sm font-semibold text-gray-900 lg:text-base">No quotes submitted yet</p>
            <p className="text-xs text-gray-400 mt-1 lg:text-sm lg:max-w-sm lg:mx-auto">Respond to open buyer requirements to see your quotes here.</p>
            <motion.button whileTap={TAP} transition={TAP_T} onClick={onSwitchToRequests}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#ef4d62] px-4 py-2 text-xs font-bold text-white hover:bg-[#ef4d62]/90 transition-colors lg:text-sm lg:px-5 lg:py-2.5">
              Browse open RFQs <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const Quotes = () => {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data: myQuotes = [] } = useMySubmittedQuotes(user?.id);
  const backToRequests = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const stats: Stats = {
    total: myQuotes.length,
    accepted: myQuotes.filter(q => q.status === "accepted").length,
    negotiating: myQuotes.filter(q => q.status === "in_negotiation").length,
    pending: myQuotes.filter(q => q.status === "awaiting").length,
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 -m-4 lg:-m-6">
        <motion.div variants={reduced ? {} : page} initial="hidden" animate="show"
          className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-12 lg:max-w-[1400px] lg:px-6 lg:py-6 lg:space-y-6 lg:pb-16">

          {/* ── Header ── */}
          <motion.div variants={section} className="lg:flex lg:items-end lg:justify-between lg:gap-6 lg:border-b lg:border-gray-200/80 lg:pb-5">
            <div>
              <h1 className="text-xl font-bold text-gray-900 lg:text-[28px] lg:leading-tight lg:tracking-tight">Quotation Requests</h1>
              <p className="text-xs text-gray-400 lg:text-sm lg:mt-1">Quote on live buyer requirements and track every quote you've sent.</p>
            </div>
            <div className="hidden lg:flex lg:items-center lg:gap-2 lg:shrink-0">
              <span className="text-sm text-gray-500">
                <span className="font-bold text-gray-900 tabular-nums">{stats.total}</span> quotes sent
              </span>
              <span className="h-4 w-px bg-gray-200" />
              <span className="text-sm text-gray-500">
                <span className="font-bold text-blue-600 tabular-nums">{stats.negotiating}</span> in negotiation
              </span>
            </div>
          </motion.div>

          {/* ── Working column + metrics rail. DOM order is the mobile order;
                 from 1400px the rail moves to column 2 and pins. ── */}
          <div className="flex flex-col gap-4 lg:gap-6 min-[1400px]:grid min-[1400px]:grid-cols-[minmax(0,1fr)_360px] min-[1400px]:items-start">

            {/* Live buyer RFQs (real) — quote inline. Renders nothing when there are none. */}
            <motion.div variants={section} className="min-w-0 min-[1400px]:col-start-1 min-[1400px]:row-start-1">
              <DirectQuoteRequests />
              <OpenRfqLeads />
            </motion.div>

            {/* My Quotes section header */}
            <motion.div variants={section} className="flex items-start justify-between min-[1400px]:col-start-1 min-[1400px]:row-start-2">
              <div>
                <h2 className="text-lg font-bold text-gray-900 lg:text-xl">My Quotes</h2>
                <p className="text-xs text-gray-400 lg:text-sm">Track all your submitted quotes and buyer responses</p>
              </div>
              <div className="relative lg:hidden">
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#ef4d62] rounded-full text-[9px] text-white font-bold flex items-center justify-center">
                  {stats.negotiating}
                </span>
                <Bell className="w-5 h-5 text-gray-500" />
              </div>
            </motion.div>

            {/* Stats + performance — inline on mobile, sticky rail on wide desktop */}
            <motion.div variants={section}
              className="min-w-0 min-[1400px]:col-start-2 min-[1400px]:row-start-1 min-[1400px]:row-span-3 min-[1400px]:self-start min-[1400px]:sticky min-[1400px]:top-24">
              <MetricsRail stats={stats} onSwitchToRequests={backToRequests} />
            </motion.div>

            {/* Search, sort, and the submitted-quote cards */}
            <motion.div variants={section} className="min-w-0 min-[1400px]:col-start-1 min-[1400px]:row-start-3">
              <SubmittedQuotesList quotes={myQuotes} onSwitchToRequests={backToRequests} />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default Quotes;
