import { useMemo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

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
import { Link, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Eye, Star, MapPin, ChevronDown,
  Search, BarChart2, Megaphone, Check,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const COMPETITORS = [
  { name: "Khanna Hosiery",       rating: 3.9, ratingCount: 40,  views: 12500, monthlyCharges: 4535, categories: ["Knitwear","Cotton","Hosiery"], pinCodes: ["395001","400001","110001"], image: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=80&h=80&fit=crop" },
  { name: "Deepak Enterprises",   rating: 3.5, ratingCount: 8,   views: 12500, monthlyCharges: 4535, categories: ["Denim","Formal","Casual"],    pinCodes: ["110001","380001"],          image: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=80&h=80&fit=crop" },
  { name: "Mumbai Textiles",      rating: 4.6, ratingCount: 124, views: 9800,  monthlyCharges: 3900, categories: ["Formal","T-Shirts"],           pinCodes: ["400001","400002"],          image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=80&h=80&fit=crop" },
  { name: "Surat Fab House",      rating: 4.3, ratingCount: 56,  views: 8200,  monthlyCharges: 3100, categories: ["Knitwear","Cotton"],           pinCodes: ["395001"],                   image: "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=80&h=80&fit=crop" },
  { name: "Tiruppur Mills",       rating: 4.5, ratingCount: 88,  views: 7600,  monthlyCharges: 2800, categories: ["T-Shirts","Knitwear"],         pinCodes: ["641601"],                   image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=80&h=80&fit=crop" },
  { name: "Ahmedabad Print Lab",  rating: 4.0, ratingCount: 34,  views: 5400,  monthlyCharges: 1900, categories: ["Printing","Trims"],            pinCodes: ["380001","380002"],           image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=80&h=80&fit=crop" },
];

const BAR_DATA = [
  { month: "Oct 2025", value: 8,  projected: false },
  { month: "Nov 2025", value: 11, projected: false },
  { month: "Dec 2025", value: 12, projected: false },
  { month: "Jan 2026", value: 12, projected: true  },
];
const BAR_MAX = 14;

const TIME_OPTIONS = [
  { value: "7days",  label: "Last 7 days"  },
  { value: "30days", label: "Last 30 days" },
  { value: "90days", label: "Last 90 days" },
  { value: "1year",  label: "Last year"    },
  { value: "custom", label: "Custom"       },
];

// ─────────────────────────────────────────────────────────────
// TIME FILTER DROPDOWN
// ─────────────────────────────────────────────────────────────

function TimeFilterDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = TIME_OPTIONS.find(o => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
      >
        <span className="text-gray-400">📅</span>
        {selected?.label}
        <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{   opacity: 0, y: -4,  scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-9 z-30 bg-white border border-gray-100 rounded-xl shadow-xl py-1 min-w-[140px]"
          >
            {TIME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors",
                  value === opt.value
                    ? "text-[#256fef] font-semibold bg-blue-50"
                    : "text-gray-700 hover:bg-gray-50",
                  opt.value === "custom" && "text-gray-400"
                )}
              >
                {value === opt.value && <Check className="w-3.5 h-3.5 shrink-0" />}
                {value !== opt.value && <span className="w-3.5 shrink-0" />}
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPETITOR CARD — matches screenshot exactly
// ─────────────────────────────────────────────────────────────

function CompetitorCard({ c }: { c: typeof COMPETITORS[0] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-start gap-3">
      {/* Product image */}
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
        <img src={c.image} alt={c.name} className="w-full h-full object-cover" />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-gray-900">{c.name}</p>
          <div className="flex items-center gap-1 shrink-0 text-xs text-gray-500">
            <Eye className="w-3.5 h-3.5" />
            <span>{(c.views / 1000).toFixed(1)}K views</span>
          </div>
        </div>

        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span className="font-medium text-gray-700">{c.rating}</span>
          <span className="text-gray-400">{c.ratingCount} Rating</span>
        </div>

        {/* Monthly charges pill */}
        <div className="mt-2 inline-flex items-center gap-1 bg-[#fff0eb] text-[#e85d26] text-xs font-semibold px-3 py-1 rounded-full">
          ₹ {c.monthlyCharges.toLocaleString()} Monthly Charges
        </div>

        {/* Categories + pin codes */}
        <p className="text-[10px] text-gray-400 mt-1.5">
          Categories ({c.categories.length}) • Pin Codes ({c.pinCodes.length * 10 + 1})
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BAR CHART — custom SVG matching the screenshot style
// ─────────────────────────────────────────────────────────────

function CompetitionBarChart() {
  const barW = 48;
  const gap  = 24;
  const h    = 140;
  const total = BAR_DATA.length * barW + (BAR_DATA.length - 1) * gap;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${total + 60} ${h + 60}`} className="w-full" style={{ minWidth: 260 }}>
        {BAR_DATA.map((d, i) => {
          const x    = 30 + i * (barW + gap);
          const barH = (d.value / BAR_MAX) * h;
          const y    = h - barH + 10;
          const fill = d.projected ? "#ef4d62" : "#f9b4ac";

          return (
            <g key={d.month}>
              {/* Bar */}
              <rect x={x} y={y} width={barW} height={barH} rx={8} fill={fill} />

              {/* Value label on top */}
              <text
                x={x + barW / 2} y={y - 6}
                textAnchor="middle" fontSize={11} fontWeight={600}
                fill={d.projected ? "#ef4d62" : "#374151"}
              >
                {d.value}
              </text>

              {/* "Projected" label for last bar */}
              {d.projected && (
                <text x={x + barW / 2} y={y - 20} textAnchor="middle" fontSize={10} fontWeight={700} fill="#22c55e">
                  Projected
                </text>
              )}

              {/* Month label below */}
              <text x={x + barW / 2} y={h + 26} textAnchor="middle" fontSize={10} fill="#9ca3af">
                {d.month}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const CompetitorAds = () => {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const [timePeriod, setTimePeriod] = useState("7days");

  // Top 6 by monthly charges
  const top6 = useMemo(() => [...COMPETITORS].sort((a, b) => b.monthlyCharges - a.monthlyCharges).slice(0, 6), []);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 -m-4 lg:-m-6">
        <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-12">

          {/* ── Header ── */}
          <motion.div variants={section} className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Competitor Advertisements</h1>
              <p className="text-sm text-gray-400 mt-0.5 leading-snug">
                Monitor what your competitors are promoting on Cosora. Get insights to stay ahead.
              </p>
            </div>
            <TimeFilterDropdown value={timePeriod} onChange={setTimePeriod} />
          </motion.div>

          {/* ── Stats 1×2 ── */}
          <motion.div variants={listContainer} className="grid grid-cols-2 gap-3">
            <motion.div variants={listItem} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-400">Total Competitor Ads</p>
                <Eye className="w-4 h-4 text-gray-300" />
              </div>
              <p className="text-3xl font-bold text-gray-900">156</p>
              <p className="text-[10px] text-green-500 mt-0.5">+12 this week</p>
            </motion.div>
            <motion.div variants={listItem} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-400">Avg. Daily Budget</p>
                <TrendingUp className="w-4 h-4 text-gray-300" />
              </div>
              <p className="text-3xl font-bold text-gray-900">₹35</p>
              <p className="text-[10px] text-orange-500 mt-0.5">+8% vs last month</p>
            </motion.div>
          </motion.div>

          {/* ── View My Analysis button ── */}
          <motion.div variants={section}>
            <motion.button
              whileTap={TAP}
              transition={TAP_T}
              onClick={() => navigate("/analytics")}
              className="w-full py-3 bg-[#256fef] hover:bg-[#256fef]/90 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <BarChart2 className="w-4 h-4" /> VIEW MY ANALYSIS
            </motion.button>
          </motion.div>

          {/* ── Your Competitors Ads ── */}
          <motion.div variants={section}>
            <h2 className="text-base font-bold text-gray-900 mb-0.5">Your Competitors Ads</h2>
            <p className="text-xs text-gray-400 mb-3">Be the best in class and have an edge over competition</p>
            <motion.div variants={listContainer} className="space-y-3">
              {top6.map((c) => (
                <motion.div key={c.name} variants={listItem}>
                  <CompetitorCard c={c} />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* ── Competition Trend ── */}
          <motion.div variants={section} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-base font-bold text-gray-900 mb-1">Competition Trend in your Area</h2>

            <div className="flex items-center gap-1.5 mb-1">
              <Search className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">Searches</span>
              <span className="text-gray-300">ⓘ</span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              31 Users searched for your categories in last 3 months in your area
            </p>

            <CompetitionBarChart />
          </motion.div>

          {/* ── Reviews Benchmark ── */}
          <motion.div variants={section} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-gray-900">How many reviews your business has received</p>
              <span className="text-gray-300 text-sm">ⓘ</span>
            </div>

            <div className="flex items-center justify-center gap-8 mb-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-[#ef4d62]">0</p>
                <p className="text-xs text-gray-400 mt-0.5">You</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-1">
                  <Star className="w-5 h-5 text-orange-400 fill-orange-400" />
                </div>
                <p className="text-xs font-bold text-gray-700">Reviews</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-900">15</p>
                <p className="text-xs text-gray-400 mt-0.5">Competition</p>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-700 flex-1">
                Businesses with more reviews get more views and leads
              </p>
              <Link to="/reviews">
                <motion.button whileTap={TAP} transition={TAP_T} className="shrink-0 px-4 py-2 bg-[#ef4d62] text-white text-xs font-bold rounded-lg hover:bg-[#ef4d62]/90 transition-colors">
                  Ask More Reviews
                </motion.button>
              </Link>
            </div>
          </motion.div>

          {/* ── Photos Benchmark ── */}
          <motion.div variants={section} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-gray-900">How engaging is your business</p>
              <span className="text-gray-300 text-sm">ⓘ</span>
            </div>

            <div className="flex items-center justify-center gap-8 mb-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-[#ef4d62]">1</p>
                <p className="text-xs text-gray-400 mt-0.5">You</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-1">
                  <Eye className="w-5 h-5 text-orange-400" />
                </div>
                <p className="text-xs font-bold text-gray-700">Photos</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-900">17</p>
                <p className="text-xs text-gray-400 mt-0.5">Competition</p>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-700 flex-1">
                Upload more photos to increase your profile strength
              </p>
              <Link to="/business-profile">
                <motion.button whileTap={TAP} transition={TAP_T} className="shrink-0 px-4 py-2 bg-[#ef4d62] text-white text-xs font-bold rounded-lg hover:bg-[#ef4d62]/90 transition-colors">
                  Upload More Photos
                </motion.button>
              </Link>
            </div>
          </motion.div>

          {/* ── Bottom Advertise Now ── */}
          <motion.div variants={section}>
            <Link to="/advertisements">
              <motion.button whileTap={TAP} transition={TAP_T} className="w-full py-3.5 bg-[#256fef] hover:bg-[#256fef]/90 text-white text-sm font-bold rounded-xl transition-colors">
                Advertise Now
              </motion.button>
            </Link>
          </motion.div>

        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default CompetitorAds;