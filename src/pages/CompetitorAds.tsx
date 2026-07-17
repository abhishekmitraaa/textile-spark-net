import { motion, useReducedMotion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useAdBenchmarks } from "@/lib/queries/ads";
import {
  TrendingUp, Eye, Star, Package, Users, BarChart2, Megaphone, ShieldCheck, Info,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Advertise → Competitor insights.
//
// Previously this page showed fully fabricated named "competitors" with invented
// stats + stock-photo logos. It now shows REAL, anonymized category benchmarks
// (ad_category_benchmarks RPC) computed from actual live products / vendor
// profiles / reviews — aggregated across every seller in the vendor's categories
// so no single competitor is identifiable. No names, no invented numbers.
// ─────────────────────────────────────────────────────────────

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };
const listContainer = { show: { transition: { staggerChildren: 0.055 } } };
const listItem = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } } };

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function BenchmarkBar({ label, yours, peer, unit = "" }: { label: string; yours: number; peer: number; unit?: string }) {
  const max = Math.max(yours, peer, 1);
  const Row = ({ who, val, color }: { who: string; val: number; color: string }) => (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-semibold text-gray-600">{who}</span>
        <span className="font-bold text-gray-900">{unit}{val.toLocaleString("en-IN")}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(4, (val / max) * 100)}%` }} />
      </div>
    </div>
  );
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-sm font-bold text-gray-900 mb-3">{label}</p>
      <div className="space-y-3">
        <Row who="You" val={yours} color="bg-[#ef4d62]" />
        <Row who="Category average" val={peer} color="bg-gray-300" />
      </div>
    </div>
  );
}

const CompetitorAds = () => {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: b, isLoading } = useAdBenchmarks(user?.id);

  const cats = b?.categories ?? [];
  const hasData = Boolean(b?.has_data) && cats.length > 0;

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 -m-4 lg:-m-6">
        <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-12">

          {/* Header */}
          <motion.div variants={section}>
            <h1 className="text-xl font-bold text-gray-900">Category Benchmarks</h1>
            <p className="text-sm text-gray-400 mt-0.5 leading-snug">
              Anonymized insights from all sellers in your categories. See where you stand and where to invest.
            </p>
          </motion.div>

          {/* Disclaimer */}
          <motion.div variants={section} className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 p-3">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-800">
              These are aggregate figures across every seller in your categories — no individual competitor is identified. Computed from real Cosora data.
            </p>
          </motion.div>

          {isLoading ? (
            <motion.div variants={section} className="py-16 text-center text-sm text-gray-400">Loading your benchmarks…</motion.div>
          ) : !hasData ? (
            <motion.div variants={section} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-900">No benchmarks yet</p>
              <p className="text-xs text-gray-500 mt-1 mb-4">Add products with a category so we can compare you to peers in those categories.</p>
              <Link to="/upload" className="inline-flex items-center gap-1.5 rounded-xl bg-[#f75f71] px-4 py-2 text-xs font-bold text-white hover:bg-[#ff2160] transition-colors">
                Add a product
              </Link>
            </motion.div>
          ) : (
            <>
              {/* Top stats */}
              <motion.div variants={listContainer} className="grid grid-cols-3 gap-3">
                {[
                  { label: "Your categories", value: cats.length, Icon: BarChart2 },
                  { label: "Peer sellers", value: b?.peer_vendor_count ?? 0, Icon: Users },
                  { label: "Active ads here", value: b?.active_ads_in_categories ?? 0, Icon: Megaphone },
                ].map((s) => (
                  <motion.div key={s.label} variants={listItem} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5">
                    <s.Icon className="w-4 h-4 text-gray-300 mb-1.5" />
                    <p className="text-2xl font-bold text-gray-900 leading-none">{s.value}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{s.label}</p>
                  </motion.div>
                ))}
              </motion.div>

              {/* Per-category benchmarks */}
              <motion.div variants={section}>
                <h2 className="text-base font-bold text-gray-900 mb-3">By category</h2>
                <motion.div variants={listContainer} className="space-y-3">
                  {cats.map((c) => (
                    <motion.div key={c.category_id} variants={listItem} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-gray-900">{c.category_name}</p>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#ef4d62]/10 text-[#ef4d62] text-[10px] font-bold px-2 py-0.5">
                          You: {c.your_products} product{c.your_products === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 text-sm font-bold text-gray-900"><Package className="w-3.5 h-3.5 text-gray-400" />{c.product_count}</span>
                          <span className="text-[10px] text-gray-400">products from {c.vendor_count} seller{c.vendor_count === 1 ? "" : "s"}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 text-sm font-bold text-gray-900"><TrendingUp className="w-3.5 h-3.5 text-orange-400" />{inr(c.avg_price)}</span>
                          <span className="text-[10px] text-gray-400">avg. price</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 text-sm font-bold text-gray-900"><Eye className="w-3.5 h-3.5 text-gray-400" />{c.avg_views.toLocaleString("en-IN")}</span>
                          <span className="text-[10px] text-gray-400">avg. views</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>

              {/* Reviews + photos benchmarks (real) */}
              <motion.div variants={section} className="space-y-3">
                <BenchmarkBar label="Reviews — you vs. category average" yours={b?.reviews.yours ?? 0} peer={Math.round(b?.reviews.peer_avg ?? 0)} />
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-700 flex-1">Businesses with more reviews get more views and leads.</p>
                  <Link to="/reviews">
                    <motion.button whileTap={TAP} transition={TAP_T} className="shrink-0 px-4 py-2 bg-[#ef4d62] text-white text-xs font-bold rounded-lg hover:bg-[#ef4d62]/90 transition-colors">Ask for Reviews</motion.button>
                  </Link>
                </div>

                <BenchmarkBar label="Catalogue photos — you vs. category average" yours={b?.photos.yours ?? 0} peer={Math.round(b?.photos.peer_avg ?? 0)} />
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-700 flex-1">More product photos strengthen your listings.</p>
                  <Link to="/products">
                    <motion.button whileTap={TAP} transition={TAP_T} className="shrink-0 px-4 py-2 bg-[#ef4d62] text-white text-xs font-bold rounded-lg hover:bg-[#ef4d62]/90 transition-colors">Add Photos</motion.button>
                  </Link>
                </div>
              </motion.div>

              {/* My analysis */}
              <motion.div variants={section}>
                <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/analytics")}
                  className="w-full py-3 bg-white border border-gray-200 text-gray-800 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 hover:bg-gray-50">
                  <BarChart2 className="w-4 h-4" /> View my analytics
                </motion.button>
              </motion.div>
            </>
          )}

          {/* Advertise Now */}
          <motion.div variants={section}>
            <Link to="/advertisements">
              <motion.button whileTap={TAP} transition={TAP_T} className="w-full py-3.5 bg-[#256fef] hover:bg-[#256fef]/90 text-white text-sm font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Advertise to get ahead
              </motion.button>
            </Link>
          </motion.div>

        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default CompetitorAds;
