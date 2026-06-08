import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  Eye,
  Users,
  Phone,
  MessageSquare,
  TrendingUp,
  Pause,
  Play,
  MoreVertical,
  Crown,
  Search,
  Target,
  Megaphone,
  Star,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type CampaignStatus = "Active" | "Paused" | "Ended";
type FilterTab = "All" | "Active" | "Paused" | "Ended";

interface Campaign {
  id: string;
  status: CampaignStatus;
  dateRange: string;
  name: string;
  targeting: string;
  productCount: number;
  views: number;
  leads: number;
  calls: number;
  inquiries: number;
  costPerLead: number;
  budgetUsed: number;
  budgetTotal: number;
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: "camp-1",
    status: "Active",
    dateRange: "2024-01-01 – 2024-01-31",
    name: "Premium Silk Collection - Featured",
    targeting: "Retailers & Wholesalers",
    productCount: 2,
    views: 12450,
    leads: 86,
    calls: 34,
    inquiries: 52,
    costPerLead: 3,
    budgetUsed: 235,
    budgetTotal: 500,
    Icon: Crown,
    iconBg: "bg-yellow-100",
    iconColor: "text-yellow-600",
  },
  {
    id: "camp-2",
    status: "Active",
    dateRange: "2024-01-05 – 2024-02-05",
    name: "Sustainable Cotton - Category Spotlight",
    targeting: "Eco-conscious Brands",
    productCount: 2,
    views: 8920,
    leads: 62,
    calls: 28,
    inquiries: 34,
    costPerLead: 3,
    budgetUsed: 180,
    budgetTotal: 300,
    Icon: Target,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
  },
  {
    id: "camp-3",
    status: "Paused",
    dateRange: "2024-01-10 – 2024-02-10",
    name: "Winter Wool Collection - Search Boost",
    targeting: "Fashion Brands",
    productCount: 2,
    views: 5600,
    leads: 38,
    calls: 15,
    inquiries: 23,
    costPerLead: 4,
    budgetUsed: 120,
    budgetTotal: 400,
    Icon: Search,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
  },
  {
    id: "camp-4",
    status: "Ended",
    dateRange: "2023-11-01 – 2023-11-30",
    name: "Festive Linen Range - Open Listing",
    targeting: "Pan India Retailers",
    productCount: 4,
    views: 21300,
    leads: 145,
    calls: 67,
    inquiries: 89,
    costPerLead: 2,
    budgetUsed: 310,
    budgetTotal: 310,
    Icon: Megaphone,
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
  },
  {
    id: "camp-5",
    status: "Ended",
    dateRange: "2023-10-01 – 2023-10-31",
    name: "Export Quality Denim - Brand Ad",
    targeting: "Export Buyers",
    productCount: 3,
    views: 9870,
    leads: 54,
    calls: 22,
    inquiries: 31,
    costPerLead: 5,
    budgetUsed: 280,
    budgetTotal: 280,
    Icon: Star,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
  },
];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const styles: Record<CampaignStatus, string> = {
    Active: "bg-green-100 text-green-700",
    Paused: "bg-amber-100 text-amber-700",
    Ended:  "bg-gray-100 text-gray-500",
  };
  return (
    <span className={cn(
      "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0",
      styles[status]
    )}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// STAT ITEM — reusable icon + value + label
// ─────────────────────────────────────────────────────────────

function StatItem({
  icon: Icon,
  iconClass,
  value,
  valueClass = "text-gray-900",
  label,
}: {
  icon: React.ElementType;
  iconClass: string;
  value: string | number;
  valueClass?: string;
  label: string;
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

// ─────────────────────────────────────────────────────────────
// CAMPAIGN CARD
// ─────────────────────────────────────────────────────────────

function CampaignCard({
  campaign,
  onToggle,
  index,
}: {
  campaign: Campaign;
  onToggle: (id: string) => void;
  index: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const budgetPct = Math.min((campaign.budgetUsed / campaign.budgetTotal) * 100, 100);
  const barColor = budgetPct >= 90 ? "bg-red-500" : "bg-amber-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.28 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col"
    >
      {/* dotted pattern strip at top */}
      <div
        className="h-2 rounded-t-2xl"
        style={{
          backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
          backgroundSize: "8px 8px",
          backgroundColor: "#f9fafb",
        }}
      />

      <div className="p-4 flex flex-col gap-3.5 flex-1">

        {/* ── Row 1: icon + status/date + controls ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
              campaign.iconBg
            )}>
              <campaign.Icon className={cn("w-4 h-4", campaign.iconColor)} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <StatusBadge status={campaign.status} />
              <p className="text-[10px] text-gray-400 leading-none truncate">
                {campaign.dateRange}
              </p>
            </div>
          </div>

          {/* Pause/Play + 3-dot */}
          <div className="flex items-center gap-1 shrink-0">
            {campaign.status !== "Ended" && (
              <button
                onClick={() => onToggle(campaign.id)}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95"
                title={campaign.status === "Active" ? "Pause" : "Resume"}
              >
                {campaign.status === "Active"
                  ? <Pause className="w-3.5 h-3.5 text-gray-600 fill-gray-600" />
                  : <Play  className="w-3.5 h-3.5 text-gray-600 fill-gray-600" />}
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(p => !p)}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95"
              >
                <MoreVertical className="w-3.5 h-3.5 text-gray-600" />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1,   y: 0  }}
                      exit={{   opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-9 z-40 bg-white border border-gray-100 rounded-xl shadow-xl py-1 w-44"
                    >
                      {["View Report", "Duplicate Ad"].map(label => (
                        <button key={label}
                          onClick={() => setMenuOpen(false)}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                          {label}
                        </button>
                      ))}
                      {campaign.status !== "Ended" && (
                        <button
                          onClick={() => setMenuOpen(false)}
                          className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-gray-50">
                          Stop Campaign
                        </button>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ── Row 2: name + targeting ── */}
        <div>
          <h3 className="text-sm font-bold text-gray-900 leading-snug">
            {campaign.name}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Targeting: {campaign.targeting} • {campaign.productCount} product{campaign.productCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* ── Row 3: 2×2 stats ── */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <StatItem icon={Eye}          iconClass="text-gray-400"   value={formatNum(campaign.views)}  label="Views"     />
          <StatItem icon={Users}        iconClass="text-green-500"  value={campaign.leads}             label="Leads"     valueClass="text-green-600" />
          <StatItem icon={Phone}        iconClass="text-blue-400"   value={campaign.calls}             label="Calls"     />
          <StatItem icon={MessageSquare}iconClass="text-purple-400" value={campaign.inquiries}         label="Inquiries" />
        </div>

        {/* ── Row 4: cost/lead ── */}
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span className="text-sm font-bold text-orange-500">₹{campaign.costPerLead}</span>
          <span className="text-[10px] text-gray-400">Cost/Lead</span>
        </div>

        {/* ── Row 5: budget bar ── */}
        <div className="pt-2 border-t border-gray-100 mt-auto">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Budget Used
            </span>
            <span className="text-[11px] font-bold text-gray-700">
              ₹{campaign.budgetUsed} / ₹{campaign.budgetTotal}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${budgetPct}%` }}
              transition={{ duration: 0.9, ease: "easeOut", delay: index * 0.07 + 0.25 }}
              className={cn("h-full rounded-full", barColor)}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const TABS: FilterTab[] = ["All", "Active", "Paused", "Ended"];

export default function OldAdvertisements() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>(INITIAL_CAMPAIGNS);
  const [activeTab, setActiveTab] = useState<FilterTab>("All");

  const counts: Record<FilterTab, number> = {
    All:    campaigns.length,
    Active: campaigns.filter(c => c.status === "Active").length,
    Paused: campaigns.filter(c => c.status === "Paused").length,
    Ended:  campaigns.filter(c => c.status === "Ended").length,
  };

  const filtered =
    activeTab === "All"
      ? campaigns
      : campaigns.filter(c => c.status === activeTab);

  const handleToggle = (id: string) =>
    setCampaigns(prev =>
      prev.map(c =>
        c.id !== id ? c
          : { ...c, status: c.status === "Active" ? "Paused" : "Active" }
      )
    );

  return (
    <DashboardLayout>
      {/*
        DashboardLayout gives us:
          - lg:pl-64  (sidebar offset on desktop)
          - p-4 lg:p-6  (padding on <main>)
          - pb-20 lg:pb-0  (bottom nav clearance on mobile)
        So we don't need our own sticky header — we use the existing DashboardHeader.
        We just build the content area here.
      */}
      <div className="space-y-5">

        {/* ── Page title row ── */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors shrink-0 -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-none">
              Old Advertisements
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* ── Summary chips — clickable to filter ── */}
        <div className="flex gap-2 flex-wrap">
          {(["Active", "Paused", "Ended"] as const).map(s => {
            const chipStyle: Record<typeof s, string> = {
              Active: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
              Paused: "bg-amber-50  text-amber-700  border-amber-200  hover:bg-amber-100",
              Ended:  "bg-gray-50   text-gray-500   border-gray-200   hover:bg-gray-100",
            };
            return (
              <button
                key={s}
                onClick={() => setActiveTab(activeTab === s ? "All" : s)}
                className={cn(
                  "px-3 py-1 rounded-xl border text-xs font-semibold transition-all",
                  chipStyle[s],
                  activeTab === s && "ring-2 ring-offset-1 ring-current"
                )}
              >
                {counts[s]} {s}
              </button>
            );
          })}
        </div>

        {/* ── Filter tabs ── */}
        <div className="flex border-b border-gray-100 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:-mx-6 lg:px-6">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold",
                "border-b-2 whitespace-nowrap shrink-0 transition-all",
                activeTab === tab
                  ? "border-[#f75f71] text-[#f75f71]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {tab}
              {tab !== "All" && counts[tab] > 0 && (
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                  activeTab === tab
                    ? "bg-[#fff0f0] text-[#f75f71]"
                    : "bg-gray-100 text-gray-500"
                )}>
                  {counts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Campaign cards ──
            Breakpoints:
            - mobile  (<640px):  1 column, full width
            - tablet  (640-1023px): 2 columns
            - desktop (≥1024px): 3 columns (sidebar takes 256px, main is wide)
        ── */}
        <AnimatePresence mode="wait">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24 text-gray-400"
            >
              <Megaphone className="w-12 h-12 opacity-20 mb-3" />
              <p className="text-sm font-medium">
                No {activeTab === "All" ? "" : activeTab.toLowerCase() + " "}campaigns
              </p>
              <button
                onClick={() => setActiveTab("All")}
                className="mt-3 text-xs text-[#f75f71] font-semibold hover:underline"
              >
                Show all
              </button>
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {filtered.map((c, i) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  onToggle={handleToggle}
                  index={i}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Create new CTA ── */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          onClick={() => navigate("/advertisements")}
          className={cn(
            "w-full py-4 rounded-2xl text-sm font-bold transition-colors",
            "border-2 border-dashed border-[#f75f71]/30",
            "text-[#f75f71] hover:bg-[#fff5f5]"
          )}
        >
          + Create New Ad Campaign
        </motion.button>

      </div>
    </DashboardLayout>
  );
}