import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import OpenRfqLeads from "@/components/vendor/OpenRfqLeads";
import { useAuth } from "@/contexts/AuthContext";
import { useMySubmittedQuotes } from "@/lib/queries/rfqs";

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
  TrendingUp, CheckCircle2, Star, FileText, MessageSquare, X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface SubmittedQuote {
  id: string; quoteCode: string; rfqCode: string; rfqTitle: string; buyerName: string;
  pricePerUnit: number; moq: string; leadTime: string; submittedDate: string; lastUpdated: string;
  pcs: string; totalQuotes: number;
  status: "in_negotiation" | "accepted" | "awaiting" | "not_selected";
  rankBadge?: string; buyerResponse?: string; buyerResponseDate?: string; image?: string;
}

const SUBMITTED_QUOTES: SubmittedQuote[] = [
  { id:"q1", quoteCode:"QT-2024-001", rfqCode:"RFQ-2024-001", rfqTitle:"Women's Cotton Oversized T-Shirt - Acid Wash Finish", buyerName:"Fashion Forward Pvt Ltd", pricePerUnit:185, moq:"5,000 pcs", leadTime:"30 Days", submittedDate:"Dec 5, 2025", lastUpdated:"Dec 6, 2025", pcs:"5,000 pcs", totalQuotes:12, status:"in_negotiation", buyerResponse:"Your quote looks competitive. Can you provide sampling within 5 days instead of 7?", buyerResponseDate:"Dec 6, 2025" },
  { id:"q2", quoteCode:"QT-2024-002", rfqCode:"RFQ-2024-003", rfqTitle:"Printed Silk Scarves", buyerName:"Silk Route Exports", pricePerUnit:175, moq:"1,000 units", leadTime:"25 Days", submittedDate:"2024-01-08", lastUpdated:"2024-01-11", pcs:"1,000 units", totalQuotes:9, status:"accepted", image:"https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=400&h=200&fit=crop", buyerResponse:"Quote accepted! Please proceed with sampling.", buyerResponseDate:"Dec 5, 2025" },
  { id:"q3", quoteCode:"QT-2024-003", rfqCode:"RFQ-2024-005", rfqTitle:"Men's Polo T-Shirts - Premium Cotton Pique", buyerName:"Urban Threads Co.", pricePerUnit:265, moq:"3,000 pcs", leadTime:"20 Days", submittedDate:"Dec 3, 2025", lastUpdated:"Dec 5, 2025", pcs:"3,000 pcs", totalQuotes:24, status:"accepted", buyerResponse:"Congratulations! Your quote has been accepted. Please proceed with sampling.", buyerResponseDate:"Dec 5, 2025" },
  { id:"q4", quoteCode:"QT-2024-004", rfqCode:"RFQ-2024-007", rfqTitle:"Kids' Organic Cotton Rompers - Printed", buyerName:"Little Stars Retail", pricePerUnit:158, moq:"2,000 pcs", leadTime:"25 Days", submittedDate:"Dec 6, 2025", lastUpdated:"Dec 6, 2025", pcs:"2,000 pcs", totalQuotes:8, status:"awaiting", rankBadge:"Rank #3 of 8" },
  { id:"q5", quoteCode:"QT-2024-005", rfqCode:"RFQ-2024-009", rfqTitle:"Women's Chikankari Kurta Set - Pure Cotton", buyerName:"Ethnic Emporium", pricePerUnit:485, moq:"1,500 pcs", leadTime:"35 Days", submittedDate:"Nov 28, 2025", lastUpdated:"Dec 2, 2025", pcs:"1,500 pcs", totalQuotes:15, status:"not_selected", buyerResponse:"Thank you for your quote. We've decided to go with another vendor who offered faster delivery.", buyerResponseDate:"Dec 2, 2025" },
  { id:"q6", quoteCode:"QT-2024-006", rfqCode:"RFQ-2024-011", rfqTitle:"Denim Jeans - Slim Fit with Stretch", buyerName:"Denim World", pricePerUnit:365, moq:"8,000 pcs", leadTime:"40 Days", submittedDate:"Dec 4, 2025", lastUpdated:"Dec 4, 2025", pcs:"8,000 pcs", totalQuotes:31, status:"awaiting" },
];

// ─────────────────────────────────────────────────────────────
// RFQ CARD
// ─────────────────────────────────────────────────────────────

function SubmittedQuotesView({ onSwitchToRequests }: { onSwitchToRequests: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: myQuotes = [] } = useMySubmittedQuotes(user?.id);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = myQuotes.filter(q =>
    !search || q.rfqTitle.toLowerCase().includes(search.toLowerCase()) || q.buyerName.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "price_high") return b.pricePerUnit - a.pricePerUnit;
    if (sort === "price_low")  return a.pricePerUnit - b.pricePerUnit;
    if (sort === "status") return a.status.localeCompare(b.status);
    return 0;
  });

  const stats = {
    total: myQuotes.length,
    accepted: myQuotes.filter(q => q.status === "accepted").length,
    negotiating: myQuotes.filter(q => q.status === "in_negotiation").length,
    pending: myQuotes.filter(q => q.status === "awaiting").length,
  };

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">My Quotes</h2>
          <p className="text-xs text-gray-400">Track all your submitted quotes and buyer responses</p>
        </div>
        <div className="relative">
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#ef4d62] rounded-full text-[9px] text-white font-bold flex items-center justify-center">
            {stats.negotiating}
          </span>
          <Bell className="w-5 h-5 text-gray-500" />
        </div>
      </div>

      {/* Stats 2x2 */}
      <motion.div variants={listContainer} className="grid grid-cols-2 gap-3">
        {[
          { label: "Total Quotes",    value: stats.total,       icon: FileText,      color: "text-orange-400" },
          { label: "Accepted",        value: stats.accepted,    icon: CheckCircle2,  color: "text-green-500"  },
          { label: "In Negotiation",  value: stats.negotiating, icon: MessageSquare, color: "text-blue-500"   },
          { label: "Pending",         value: stats.pending,     icon: Clock,         color: "text-orange-400" },
        ].map(s => (
          <motion.div key={s.label} variants={listItem} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{s.label}</span>
              <s.icon className={cn("w-4 h-4", s.color)} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Performance card */}
      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-bold text-gray-900">Your Performance</span>
          </div>
          <span className="text-[10px] font-semibold bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full">
            This Month: 8 quotes
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <p className="text-xs text-gray-500">Acceptance Rate</p>
            <p className="text-lg font-bold text-green-600">25%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Avg. Response Time</p>
            <p className="text-lg font-bold text-gray-900">1.5 days</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Total Order Value</p>
            <p className="text-lg font-bold text-[#ef4d62]">₹24.5L</p>
          </div>
          <button onClick={onSwitchToRequests} className="flex items-center gap-1.5 px-4 py-2 bg-[#ef4d62] text-white text-xs font-bold rounded-xl hover:bg-[#ef4d62]/90 transition-colors">
            Browse RFQs <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input type="text" placeholder="Search quotes..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none placeholder-gray-400" />
        </div>
        <div className="relative">
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

      {/* Quote cards */}
      <motion.div variants={listContainer} className="space-y-3">
        {sorted.map(q => {
          const cfg = statusConfig[q.status];
          const respBg = buyerResponseBg[q.status];
          return (
            <motion.div key={q.id}
              variants={listItem}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Image (only if present — screenshot 6) */}
              {q.image && (
                <img src={q.image} alt={q.rfqTitle} className="w-full h-36 object-cover" />
              )}

              <div className="p-4">
                {/* Status badge + rank */}
                <div className="flex items-center gap-2 mb-2">
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
                  <p className="text-[10px] text-gray-400 mb-1">{q.quoteCode} · Submitted {q.submittedDate}</p>
                )}

                {/* Title + price */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 leading-snug">{q.rfqTitle}</p>
                    <p className="text-xs text-gray-400">{q.buyerName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-[#ef4d62]">₹ {q.pricePerUnit}</p>
                    <p className="text-[10px] text-gray-400">per unit</p>
                  </div>
                </div>

                {/* RFQ code (screenshot 6) */}
                {q.image && (
                  <p className="text-xs text-gray-600 mb-1">RFQ: {q.rfqCode}</p>
                )}

                {/* Price + MOQ line (screenshot 6) */}
                {q.image && (
                  <p className="text-xs text-gray-700 mb-1">Price: ₹{q.pricePerUnit}/unit&nbsp;&nbsp;MOQ: {q.moq}</p>
                )}

                {/* Lead time (screenshot 6) */}
                {q.image && (
                  <p className="text-xs text-gray-700 mb-2">Lead Time: {q.leadTime}</p>
                )}

                {/* Pcs + submitted date */}
                {!q.image && (
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                    <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {q.pcs}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Submitted {q.submittedDate}</span>
                  </div>
                )}

                {/* Total quotes */}
                {!q.image && (
                  <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
                    <Star className="w-3 h-3" /> {q.totalQuotes} quotes total
                  </p>
                )}

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
                  <p className="text-[10px] text-gray-400 mb-3">Last updated: {q.lastUpdated}</p>
                )}

                {/* Action button(s) */}
                {q.status === "in_negotiation" && (
                  <button onClick={() => navigate("/chat")} className="w-full py-3 bg-[#ef4d62] text-white text-sm font-bold rounded-xl hover:bg-[#ef4d62]/90 transition-colors flex items-center justify-center gap-2">
                    <MessageSquare className="w-4 h-4" /> Continue Chat
                  </button>
                )}
                {q.status === "accepted" && !q.image && (
                  <button onClick={() => navigate("/chat")} className="w-full py-3 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> View Order Details
                  </button>
                )}
                {q.status === "accepted" && q.image && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={onSwitchToRequests} className="py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                      <Star className="w-3.5 h-3.5" /> View RFQ
                    </button>
                    <button onClick={() => navigate("/chat")} className="py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Call Buyer
                    </button>
                  </div>
                )}
                {q.status === "not_selected" && (
                  <button onClick={onSwitchToRequests} className="w-full py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                    Browse New RFQs <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                {q.status === "awaiting" && (
                  <button onClick={onSwitchToRequests} className="w-full py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                    View RFQ <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
        {sorted.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <FileText className="w-9 h-9 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-900">No quotes submitted yet</p>
            <p className="text-xs text-gray-400 mt-1">Respond to open buyer requirements to see your quotes here.</p>
            <button onClick={onSwitchToRequests} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#ef4d62] px-4 py-2 text-xs font-bold text-white hover:bg-[#ef4d62]/90 transition-colors">
              Browse open RFQs <ChevronRight className="w-4 h-4" />
            </button>
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

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 -m-4 lg:-m-6">
        <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-12">

          {/* ── Header ── */}
          <motion.div variants={section}>
            <h1 className="text-xl font-bold text-gray-900">Quotation Requests</h1>
            <p className="text-xs text-gray-400">Quote on live buyer requirements and track every quote you've sent.</p>
          </motion.div>

          {/* ── Live buyer RFQs (real) — quote inline. Renders nothing when there are none. ── */}
          <motion.div variants={section}>
            <OpenRfqLeads />
          </motion.div>

          {/* ── Your submitted quotes (real) ── */}
          <motion.div variants={section}>
            <SubmittedQuotesView onSwitchToRequests={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
          </motion.div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default Quotes;