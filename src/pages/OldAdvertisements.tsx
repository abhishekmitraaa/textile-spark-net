import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMyAds, updateAdStatus, type AdRow } from "@/lib/queries/ads";
import { cn } from "@/lib/utils";
import { ChevronLeft, Eye, MousePointerClick, TrendingUp, Pause, Play, Megaphone } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// "Old Advertisements" — the vendor's REAL campaign history (was mock data).
// Reads the same advertisements table via useMyAds and derives an effective
// status (active campaigns past their end date read as Ended). Pause/Resume
// writes through the real updateAdStatus mutation.
// ─────────────────────────────────────────────────────────────

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };
const listContainer = { show: { transition: { staggerChildren: 0.055 } } };
const listItem = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } } };

type EffStatus = "Active" | "Paused" | "Ended";
type FilterTab = "All" | "Active" | "Paused" | "Ended";
const TABS: FilterTab[] = ["All", "Active", "Paused", "Ended"];

function effStatus(a: AdRow): EffStatus {
  if (a.status === "paused") return "Paused";
  if (a.status === "active") {
    if (a.endsAt && new Date(a.endsAt).getTime() < Date.now()) return "Ended";
    return "Active";
  }
  return "Ended"; // ended + draft read as inactive history
}

function formatNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}
function fmtDateRange(a: AdRow): string {
  const f = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
  return `${f(a.startsAt ?? a.createdAt)} – ${f(a.endsAt)}`;
}

function StatusBadge({ status }: { status: EffStatus }) {
  const styles: Record<EffStatus, string> = {
    Active: "bg-green-100 text-green-700",
    Paused: "bg-amber-100 text-amber-700",
    Ended: "bg-gray-100 text-gray-500",
  };
  return <span className={cn("inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0", styles[status])}>{status}</span>;
}

function CampaignCard({ ad, status, onToggle }: { ad: AdRow; status: EffStatus; onToggle: (a: AdRow) => void }) {
  const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : "0.0";
  return (
    <motion.div variants={listItem} className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
      <div className="p-4 flex flex-col gap-3.5 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#fff5f5] flex items-center justify-center shrink-0 overflow-hidden">
              {ad.imageUrl ? <img src={ad.imageUrl} alt="" className="h-full w-full object-cover" /> : <Megaphone className="w-4 h-4 text-[#f75f71]" />}
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <StatusBadge status={status} />
              <p className="text-[10px] text-gray-400 leading-none truncate">{fmtDateRange(ad)}</p>
            </div>
          </div>
          {status !== "Ended" && (
            <button
              onClick={() => onToggle(ad)}
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95"
              title={status === "Active" ? "Pause" : "Resume"}
            >
              {status === "Active" ? <Pause className="w-3.5 h-3.5 text-gray-600 fill-gray-600" /> : <Play className="w-3.5 h-3.5 text-gray-600 fill-gray-600" />}
            </button>
          )}
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-900 leading-snug truncate">{ad.title}</h3>
          {ad.placement && <p className="text-xs text-gray-500 mt-0.5">Placement: {ad.placement.split(",").join(", ")}</p>}
        </div>

        <div className="grid grid-cols-3 gap-x-4 gap-y-3">
          <StatItem icon={Eye} iconClass="text-gray-400" value={formatNum(ad.impressions)} label="Views" />
          <StatItem icon={MousePointerClick} iconClass="text-blue-400" value={formatNum(ad.clicks)} label="Clicks" />
          <StatItem icon={TrendingUp} iconClass="text-orange-400" value={`${ctr}%`} label="CTR" valueClass="text-orange-500" />
        </div>

        {ad.dailyBudget != null && (
          <div className="pt-2 border-t border-gray-100 mt-auto flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Daily budget</span>
            <span className="text-[11px] font-bold text-gray-700">₹{ad.dailyBudget}/day</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function StatItem({ icon: Icon, iconClass, value, valueClass = "text-gray-900", label }: {
  icon: React.ElementType; iconClass: string; value: string | number; valueClass?: string; label: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <Icon className={cn("w-3.5 h-3.5 shrink-0", iconClass)} />
        <span className={cn("text-sm font-bold", valueClass)}>{value}</span>
      </div>
      <span className="text-[10px] text-gray-400 pl-[18px]">{label}</span>
    </div>
  );
}

export default function OldAdvertisements() {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: ads = [], isLoading } = useMyAds(user?.id);
  const [activeTab, setActiveTab] = useState<FilterTab>("All");

  const withStatus = ads.map((a) => ({ ad: a, status: effStatus(a) }));
  const counts: Record<FilterTab, number> = {
    All: withStatus.length,
    Active: withStatus.filter((x) => x.status === "Active").length,
    Paused: withStatus.filter((x) => x.status === "Paused").length,
    Ended: withStatus.filter((x) => x.status === "Ended").length,
  };
  const filtered = activeTab === "All" ? withStatus : withStatus.filter((x) => x.status === activeTab);

  const onToggle = async (a: AdRow) => {
    const next = a.status === "active" ? "paused" : "active";
    try {
      await updateAdStatus(a.id, next);
      qc.invalidateQueries({ queryKey: ["advertisements"] });
    } catch (e) {
      toast.error("Update failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-5">
        {/* Title */}
        <motion.div variants={section} className="flex items-center gap-3">
          <motion.button onClick={() => navigate(-1)} whileTap={TAP} transition={TAP_T} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors shrink-0 -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </motion.button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-none">Old Advertisements</h1>
            <p className="text-xs text-gray-400 mt-0.5">{ads.length} campaign{ads.length === 1 ? "" : "s"}</p>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div variants={section} className="flex border-b border-gray-100 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:-mx-6 lg:px-6">
          {TABS.map((tab) => (
            <motion.button key={tab} whileTap={TAP} transition={TAP_T} onClick={() => setActiveTab(tab)}
              className={cn("flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap shrink-0 transition-all",
                activeTab === tab ? "border-[#f75f71] text-[#f75f71]" : "border-transparent text-gray-500 hover:text-gray-700")}>
              {tab}
              {tab !== "All" && counts[tab] > 0 && (
                <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                  activeTab === tab ? "bg-[#fff0f0] text-[#f75f71]" : "bg-gray-100 text-gray-500")}>{counts[tab]}</span>
              )}
            </motion.button>
          ))}
        </motion.div>

        {/* Cards */}
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-16 text-center text-sm text-gray-400">Loading campaigns…</motion.div>
          ) : filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Megaphone className="w-12 h-12 opacity-20 mb-3" />
              <p className="text-sm font-medium">No {activeTab === "All" ? "" : activeTab.toLowerCase() + " "}campaigns</p>
              <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/advertisements")} className="mt-3 text-xs text-[#f75f71] font-semibold hover:underline">Create a campaign</motion.button>
            </motion.div>
          ) : (
            <motion.div key={activeTab} variants={listContainer} initial="hidden" animate="show" exit={{ opacity: 0 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(({ ad, status }) => (
                <CampaignCard key={ad.id} ad={ad} status={status} onToggle={onToggle} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create CTA */}
        <motion.button variants={section} whileTap={TAP} transition={TAP_T} onClick={() => navigate("/advertisements")}
          className="w-full py-4 rounded-2xl text-sm font-bold transition-colors border-2 border-dashed border-[#f75f71]/30 text-[#f75f71] hover:bg-[#fff5f5]">
          + Create New Ad Campaign
        </motion.button>
      </motion.div>
    </DashboardLayout>
  );
}
