import { errorMessage } from "@/lib/errorMessage";
import { useState, useEffect, useRef } from "react";
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
import { useNavigate, Link } from "react-router-dom";
import { supportChatHref } from "@/lib/supportContact";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMyAds, setCampaignRunning, deleteAd, useVendorCategories, useVendorHomeState, useAdReasonLabels, useMyAdManualWork, type AdRow } from "@/lib/queries/ads";
import { useFeatureFlag } from "@/lib/queries/featureFlags";
import { INDIA_STATES } from "@/data/indiaStates";
import { useLang } from "@/lib/i18n";
import { runStateOf, moderationReasonText } from "@/lib/campaignRunState";
import { EditCampaignDialog } from "@/components/vendor/EditCampaignDialog";
import { paidAdOutcome, freeAdOutcome, type AdCheckoutMessage } from "@/lib/adPaymentOutcome";
import { useMyProducts, type VendorProductRow } from "@/lib/queries/products";
import { useVendorCalls, callAnalyticsForWindow, MISSED_CALLS_UNAVAILABLE } from "@/lib/queries/callAnalytics";
import { useAdPerformance, adCountersTotal, revenueBookedSince } from "@/lib/queries/adPerformance";
import { useLeadFunnelData, funnelForWindow, formatInrCompact } from "@/lib/queries/vendorAnalytics";
import { createRazorpayOrder, openRazorpayCheckout, verifyRazorpayPayment, publishDemoAds, publishFreeAdOrder, adReachRefusal, type AdSpec } from "@/lib/queries/payments";
import { quoteAdDiscount, discountRefusal, DISCOUNT_CHECKOUT_TIMEOUT_S, type AdQuote } from "@/lib/queries/discounts";
import { DiscountCodeField } from "@/components/vendor/DiscountCodeField";
import { useVendorPlan } from "@/lib/queries/subscriptions";
import { useSellerRegistration, canPublish, type SellerRegistration } from "@/lib/queries/sellerRegistration";
import { adStateAllowance, canRunAds, AD_SCOPE_LABEL, type AdLocationScope } from "@/lib/plan";
import { computeOrderRupees, priceLines, VERIFICATION_DAYS, BROADCAST_MESSAGES, clampMessages, PER_MESSAGE_TYPES } from "@/lib/adPricing";
import { sellableAdTypes, MANUAL_AD_TYPES, hasManualAdType } from "@/lib/adSlots";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Phone, Eye, Users, TrendingUp, TrendingDown, PhoneMissed,
  MousePointerClick, ChevronLeft, ChevronRight, X, Plus, Check,
  Building2, ShoppingBag, List, Calendar, Zap, Shield, BadgeCheck,
  Globe, Smartphone, Monitor, Facebook, BarChart3, Award, Radio,
  Search, Star, Store, Megaphone, Minus,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface AdType {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  image: string;
  Icon: React.ElementType;
}

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

// The stats strip is windowed to 30 days where the data allows it, matching the
// "in the last one month" wording it has always carried. Which figures can and
// cannot be windowed is not a choice — see the StatsGrid comment below.
const ADS_STATS_WINDOW_DAYS = 30;

const AD_TYPES: AdType[] = [
  { id: "openListing",          name: "Open Listing Ad",             price: "₹22",  period: "/day", Icon: Megaphone,    description: "Boost your visibility in the open marketplace. Your products will be showcased to a wider audience browsing the general listings.", image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop" },
  { id: "searchListing",        name: "Search Listing Ad",           price: "₹35",  period: "/day", Icon: Search,       description: "Appear at the top of search results when buyers look for products in your category. Targeted visibility for intent-driven buyers.", image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop" },
  { id: "featuredProduct",      name: "Featured Product",            price: "₹55",  period: "/day", Icon: Star,         description: "Premium placement for your key products on category pages. The highest-visibility position for serious buyers.", image: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=800&auto=format&fit=crop" },
  { id: "storePromotion",       name: "Store Promotion",             price: "₹99",  period: "/day", Icon: Store,        description: "Promote your entire store for maximum brand exposure. Best for building long-term relationships with bulk buyers.", image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800&auto=format&fit=crop" },
  { id: "directBroadcast",      name: "Direct Broadcast",            price: "₹15",  period: "/msg", Icon: Radio,        description: "Cosora's team sends a message about your listing to buyers in its category. You choose how many messages, at ₹15 each.", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=800&auto=format&fit=crop" },
  { id: "wholesalerPick",       name: "Wholesaler Pick Ad",          price: "₹59",  period: "/day",     Icon: ShoppingBag,  description: "Get featured in the exclusive Wholesaler Pick section. 72-hour guaranteed exposure with bumps.", image: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=800&auto=format&fit=crop" },
  { id: "brandAd",              name: "Brand Ad",                    price: "₹69",  period: "/day",     Icon: Award,        description: "Showcase your entire brand story and collection. Drives visits via store and key product exposures.", image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800&auto=format&fit=crop" },
  { id: "websiteBanner",        name: "Website Banner Ad",           price: "₹89",  period: "/day", Icon: Globe,        description: "Large scale visibility on the Cosora desktop website. Maximum impact for site-wide brand awareness.", image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop" },
  { id: "mobileBanner",         name: "Mobile Banner Ad",            price: "₹99",  period: "/day", Icon: Smartphone,   description: "Optimized banners for the Cosora mobile app. Reach on-the-go buyers with high-converting mobile placements.", image: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?q=80&w=800&auto=format&fit=crop" },
  { id: "webMobileCombo",       name: "Web & Mobile Combo",          price: "₹129", period: "/day",     Icon: Monitor,      description: "The ultimate visibility package. Reach buyers across all devices with synchronized desktop and mobile banners.", image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop" },
  { id: "fbInsta",              name: "Facebook & Instagram Ad",     price: "₹59",  period: "/day",     Icon: Facebook,     description: "Cosora's team promotes your listing on Facebook and Instagram, with a link back to it on Cosora.", image: "https://images.unsplash.com/photo-1611162617263-435d74236edc?q=80&w=800&auto=format&fit=crop" },
  { id: "googleProduct",        name: "Google Product Ad",           price: "₹59",  period: "/day",     Icon: BarChart3,    description: "Cosora's team lists your product on Google Shopping, with a link back to it on Cosora.", image: "https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?q=80&w=800&auto=format&fit=crop" },
  { id: "socialCombo",          name: "Social Media Combo",          price: "₹99",  period: "/day",     Icon: Megaphone,    description: "Facebook, Instagram and Google Shopping together: Cosora's team sets up all three for your listing.", image: "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?q=80&w=800&auto=format&fit=crop" },
  { id: "trustedSeal",          name: "Trusted Seal & Verified Badge",price: "₹44", period: "",     Icon: Shield,       description: "Boost conversion with a trusted seller badge on your profile and all product cards.", image: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?q=80&w=800&auto=format&fit=crop" },
  { id: "verifiedCertificate",  name: "Cosora Verified Certificate", price: "₹199", period: "",     Icon: BadgeCheck,   description: "Official premium trust signal. Verified certificate displayed on your full profile.", image: "https://images.unsplash.com/photo-1523240715639-99a86501111b?q=80&w=800&auto=format&fit=crop" },
];

// Ad types that grant a time-bound trust seal (mirrors the edge function).
const SEAL_AD_TYPES = new Set(["trustedSeal", "verifiedCertificate"]);
// What the campaign builder offers (SH-093, SH-094): ad types buyers actually see. The seal and the certificate are
// bought on their own in "Get verified"; types with no live slot yet aren't sold.
const SELLABLE = new Set<string>(sellableAdTypes());
const BUILDER_AD_TYPES = AD_TYPES.filter((a) => SELLABLE.has(a.id) && !SEAL_AD_TYPES.has(a.id));
// Done by hand by the Cosora team after approval (Mitra, 2026-11-17): they run outside the app, so the builder says so.
const MANUAL = new Set<string>(MANUAL_AD_TYPES);
function ManualTag() {
  return (
    <span className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
      Set up by hand by the Cosora team
    </span>
  );
}
// A campaign goal pre-selects the placement types that actually serve it — this
// is what makes the goal picker do something real (see toggleGoal).
// Only types that are sold (SH-094): "Visit your website" and "Message you" picked website banners, Google Shopping and
// direct messages, which no buyer sees yet, so those goals aren't offered until they are.
const GOAL_PLACEMENTS: Record<string, string[]> = Object.fromEntries(
  Object.entries({
    visitProfile: ["storePromotion", "brandAd"],
    visitWebsite: ["websiteBanner", "googleProduct"],
    messageYou: ["directBroadcast"],
    mixOfActions: ["featuredProduct", "searchListing"],
  }).map(([goal, ids]) => [goal, ids.filter((id) => SELLABLE.has(id))]),
);

// Every line is something a vendor can check on Cosora (2026-11-14). It used to say every buyer is vetted, that
// ads reach millions and that thousands of suppliers had joined: none of it was measured.
const WHY_FEATURES = [
  { title: "Built for Business Buying",   desc: "Buyers post requirements and ask for quotes in bulk, by MOQ.",                         bg: "bg-pink-50",   color: "text-pink-600"   },
  { title: "Fashion & Sourcing Focus",    desc: "Built specifically for fashion, textiles, and related industries.",                   bg: "bg-orange-50", color: "text-orange-600" },
  { title: "Built for Suppliers",         desc: "Manufacturers, wholesalers, job workers and service providers sell here.",            bg: "bg-pink-50",   color: "text-pink-600"   },
  { title: "India & Overseas Buyers",     desc: "Buyers in India and abroad post requirements on the same platform.",                  bg: "bg-blue-50",   color: "text-blue-600"   },
  { title: "Reviewed Before It Runs",     desc: "Cosora checks every ad's picture, text and products before buyers see it.",           bg: "bg-orange-50", color: "text-orange-600" },
  { title: "You See the Numbers",         desc: "Impressions, clicks and click-through rate for every campaign, on this page.",       bg: "bg-pink-50",   color: "text-pink-600"   },
];

const MANUFACTURERS_CARDS = [
  { title: "For Suppliers",       desc: "Manufacturers to job workers"  },
  { title: "Export + Domestic",   desc: "Buyers in India and abroad"    },
  { title: "Reviewed Ads",        desc: "Checked before they run"       },
  { title: "Pause Anytime",       desc: "Stop or resume a campaign"     },
];

// What happens after "Create": replaces the "Success Stories" carousel of six invented advertisers and
// "5.9 Lakh+ Advertisers" (Mitra 2026-11-05: "Replace with honest copy"; claude.md exception lifted).
const HOW_IT_WORKS = [
  { title: "Pick the ad and products", desc: "Choose an ad type, the products it promotes, how long it runs and where it shows. You see the total before you pay." },
  { title: "Cosora reviews it",        desc: "After you pay, Cosora checks the picture, text and products. If something needs changing, you're told why." },
  { title: "It runs, you track it",    desc: "Once approved it runs for the days you chose. Your Campaigns shows its impressions, clicks and click-through rate." },
];

const FAQS = [
  { q: "How does advertising on Cosora work?",    a: "An ad puts your products or store in front of buyers on Cosora: in the open listings, search results, category pages and store promotions. You choose the ad type, the products, how long it runs and where it shows, and track its impressions and clicks." },
  { q: "What is the minimum budget required?",    a: "The lowest rate is ₹22 a day (Open Listing Ad), and a campaign runs for at least 3 days. You see the total before you pay." },
  { q: "How long does it take for my ad to go live?", a: "After you pay, Cosora reviews the ad's picture, text and products, and it runs once approved. Your Campaigns shows where it is." },
  { q: "Can I target specific cities or regions?", a: "Yes, on a paid plan. How many locations an ad can target depends on your plan; the plan page lists each one's reach." },
  { q: "How do I track my ad performance?",       a: "Your Campaigns, on this page, shows each campaign's impressions, clicks and click-through rate." },
  { q: "Can I pause or stop my ad campaign?",     a: "Absolutely. You can pause, resume, or stop your ads at any time. A paused ad keeps its remaining days until you resume it; Trusted Seal and Verified Certificate keep running while paused. No long-term commitments or cancellation fees." },
];

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

// ── Header ──
function AdvHeader() {
  const navigate = useNavigate();
  return (
    // Desktop already has the sidebar + dashboard header for orientation, so the
    // mobile back-bar would just be a second stacked chrome row — hide it there.
    <div className="bg-white border-b border-gray-200 sticky top-0 z-10 lg:hidden">
      <div className="max-w-4xl mx-auto px-2 py-2">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">ADVERTISE</h1>
        </div>
      </div>
    </div>
  );
}

// ── HeroSection ──
function HeroSection() {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm lg:p-10">
      <div className="flex items-start justify-between mb-4 lg:mb-0 lg:items-center lg:gap-10">
        <div className="lg:max-w-2xl">
          {/* On desktop this eyebrow carries the page title the hidden back-bar used to. */}
          <div className="hidden lg:block text-[11px] font-bold uppercase tracking-[0.18em] text-[#f75f71] mb-3">
            Advertise
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-900 lg:text-4xl lg:mb-3 lg:text-balance">Boost Your Visibility</h2>
          <p className="text-gray-600 text-sm leading-relaxed lg:text-base">
            Promote your products to reach more buyers and get quality leads
          </p>
          <div className="hidden lg:flex items-center gap-6 mt-6">
            {[
              { k: "From ₹22", v: "per day" },
              { k: "Reviewed", v: "before it runs" },
              { k: "Anytime", v: "pause or stop" },
            ].map((m) => (
              <div key={m.k} className="flex flex-col">
                <span className="text-sm font-bold text-gray-900">{m.k}</span>
                <span className="text-xs text-gray-500">{m.v}</span>
              </div>
            ))}
          </div>
        </div>
        <a href="#adCreationSteps"
          className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors whitespace-nowrap lg:shrink-0 lg:rounded-xl lg:px-7 lg:py-3.5 lg:text-base lg:shadow-lg lg:shadow-orange-600/20">
          Start Advertising
        </a>
      </div>
    </div>
  );
}

// ── StatsGrid ──
//
// Was a six-tile STATS constant of invented numbers ("77 calls", "27.2K views",
// "186 leads", "₹3 avg. cost/lead", "17 missed calls", "5K ad clicks"). Every
// tile now counts real rows, and the two that cannot be counted say so instead
// of showing a figure:
//
//   • Missed Calls — `calls` records (buyer_id, vendor_id, direction,
//     product_context, created_at) and nothing else. A row means the dialer was
//     opened, not that a call connected, so there is no missed-call signal to
//     count. Rendered as an em dash with the reason, never as a number.
//   • Business Profile Views / Ad Clicks — lifetime counters
//     (products.views_count, advertisements.clicks) with no per-event date, so
//     they cannot be narrowed to 30 days. Labelled "lifetime".
//
// "Avg. Cost/Lead" is gone on purpose and must not come back: Cosora ads are
// flat-rate prepaid placements, not an auction, so there is no cost per lead to
// compute. Its replacement is revenue booked over leads across the same window
// — the same wording Cosora-Admin AdsMonitoring.tsx uses.
function StatsGrid() {
  const { user } = useAuth();
  const { data: myProducts = [] } = useMyProducts(user?.id);
  const { data: callRows } = useVendorCalls(user?.id);
  const { data: funnelData } = useLeadFunnelData(user?.id);
  const { data: adPerf } = useAdPerformance(user?.id);

  const days = ADS_STATS_WINDOW_DAYS;
  const calls = callAnalyticsForWindow(callRows, days);
  const funnel = funnelForWindow(funnelData, days);
  const counters = adCountersTotal(adPerf);
  const revenueBooked = revenueBookedSince(adPerf, days);
  const profileViews = myProducts.reduce((sum, p) => sum + p.views, 0);
  const campaignCount = adPerf?.campaigns.length ?? 0;

  const trendWord = (n: number | null): "up" | "down" | "flat" =>
    n == null ? "flat" : n > 0 ? "up" : n < 0 ? "down" : "flat";

  const stats: {
    Icon: React.ElementType; value: string; label: string; subtext: string;
    trend: "up" | "down" | "flat"; color: string; bg: string; unavailable?: boolean;
  }[] = [
    {
      Icon: Phone, value: String(calls.inbound), label: "Phone Calls Received",
      subtext: calls.trendPct != null
        ? `${calls.trendPct >= 0 ? "+" : ""}${calls.trendPct}% vs previous 30 days`
        : `${calls.today} today · last 30 days`,
      trend: trendWord(calls.trendPct), color: "text-red-600", bg: "bg-red-50",
    },
    {
      Icon: Eye, value: profileViews.toLocaleString("en-IN"), label: "Business Profile Views",
      subtext: "lifetime — a view carries no date", trend: "flat",
      color: "text-green-600", bg: "bg-green-50",
    },
    {
      Icon: Users, value: String(funnel.leads), label: "Leads Generated",
      subtext: funnel.directLeads > 0
        ? `${funnel.directLeads} sent to you directly · last 30 days`
        : "last 30 days",
      trend: funnel.leads > 0 ? "up" : "flat", color: "text-purple-600", bg: "bg-purple-50",
    },
    {
      Icon: TrendingUp,
      value: funnel.leads > 0 && revenueBooked > 0 ? formatInrCompact(revenueBooked / funnel.leads) : "—",
      label: "Revenue Booked / Lead",
      subtext: revenueBooked > 0
        ? `${formatInrCompact(revenueBooked)} booked over ${funnel.leads} lead${funnel.leads === 1 ? "" : "s"}`
        : "no paid ad orders in the last 30 days",
      trend: "flat", color: "text-orange-600", bg: "bg-orange-50",
      unavailable: !(funnel.leads > 0 && revenueBooked > 0),
    },
    {
      Icon: PhoneMissed, value: "—", label: "Missed Calls",
      subtext: MISSED_CALLS_UNAVAILABLE, trend: "flat",
      color: "text-gray-400", bg: "bg-gray-100", unavailable: true,
    },
    {
      Icon: MousePointerClick, value: counters.clicks.toLocaleString("en-IN"), label: "Ad Clicks",
      subtext: `lifetime across ${campaignCount} campaign${campaignCount === 1 ? "" : "s"}`,
      trend: "flat", color: "text-green-600", bg: "bg-green-50",
    },
  ];

  return (
    // The vendor sidebar eats 256px, so the six-across strip only earns its keep
    // past ~1400px — below that three columns keeps the labels readable.
    <motion.div variants={listContainer} className="grid grid-cols-2 gap-3 lg:grid-cols-3 min-[1400px]:grid-cols-6">
      {stats.map((s) => (
        <motion.div key={s.label} variants={listItem} className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow min-[1400px]:p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={cn("p-2 rounded-lg", s.bg)}>
                <s.Icon className={cn("w-5 h-5", s.color)} />
              </div>
              <div className={cn("text-2xl font-bold lg:tabular-nums", s.unavailable ? "text-gray-400" : "text-gray-900")}>
                {s.value}
              </div>
            </div>
            {s.trend === "up"
              ? <TrendingUp className="w-4 h-4 text-green-500" />
              : s.trend === "down"
                ? <TrendingDown className="w-4 h-4 text-red-500" />
                : <Minus className="w-4 h-4 text-gray-300" />}
          </div>
          <div className="text-xs text-gray-600 mb-1">{s.label}</div>
          <div className={cn(
            "text-xs font-medium leading-snug",
            s.unavailable ? "text-gray-400" : s.trend === "up" ? "text-green-600" : s.trend === "down" ? "text-red-600" : "text-gray-500",
          )}>
            {s.subtext}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── CompetitorAds ──
// `inRail` — the panel sits beside the campaigns table on wide screens, so it
// stays a single stacked column there; on its own it pairs up side by side
// rather than leaving a full-width row mostly empty.
function CompetitorAdsLink({ inRail }: { inRail: boolean }) {
  const navigate = useNavigate();
  return (
    <div className={cn(
      "bg-white rounded-xl p-4 border border-gray-200 space-y-4 lg:h-full lg:p-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:content-start",
      inRail && "min-[1400px]:grid-cols-1 min-[1400px]:gap-5",
    )}>
      {/* Competitor Ads */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-900">Competitor's Advertisements</h3>
        </div>
        <p className="text-xs text-gray-600 mb-3">See what your competitors are doing</p>
        <button onClick={() => navigate("/competitor-ads")}
          className="flex items-center gap-1 text-xs text-[#f75f71] font-semibold hover:underline">
          View Competitor Ads <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className={cn("border-t border-gray-100 lg:hidden", inRail && "min-[1400px]:block")} />

      {/* Old Advertisements */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-900">Old Advertisements</h3>
        </div>
        <p className="text-xs text-gray-600 mb-3">View and manage your past ad campaigns</p>
        <button onClick={() => navigate("/old-advertisements")}
          className="flex items-center gap-1 text-xs text-[#f75f71] font-semibold hover:underline">
          View Old Advertisements <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── PricingHeader ──
function PricingHeader() {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 lg:py-10">
      <div className="text-center">
        <div className="text-orange-600 text-sm font-semibold mb-2 lg:tracking-[0.18em] lg:uppercase lg:text-xs">PAY PER AD</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2 lg:text-3xl">Simple, Transparent Pricing</h2>
        <p className="text-sm text-gray-600 leading-relaxed lg:max-w-2xl lg:mx-auto lg:text-base">
          No subscriptions. Choose your product, set your duration, target your audience. Pay only for what you use.
        </p>
      </div>
    </div>
  );
}

// ── AdCreationSteps ──
function AdCreationSteps({
  products,
  selectedAdTypes, setSelectedAdTypes,
  selectedProducts, setSelectedProducts,
  selectedDuration, setSelectedDuration,
  selectedCities, setSelectedCities,
  selectedCategories, setSelectedCategories,
  selectedGoals, setSelectedGoals,
  showMoreAdTypes, setShowMoreAdTypes,
  cityLimit, scopeLabel, vendorCats, planGrantsSeal, planName,
  stateTargeting, allowCountries, selectedCountries, setSelectedCountries,
  broadcastMessages, setBroadcastMessages,
}: {
  products: VendorProductRow[];
  /** Direct Broadcast's messages per listing, as typed (clamped when it's priced). */
  broadcastMessages: string; setBroadcastMessages: (v: string) => void;
  selectedAdTypes: string[]; setSelectedAdTypes: (v: string[]) => void;
  selectedProducts: string[]; setSelectedProducts: (v: string[]) => void;
  selectedDuration: string; setSelectedDuration: (v: string) => void;
  selectedCities: string[]; setSelectedCities: (v: string[]) => void;
  selectedCategories: string[]; setSelectedCategories: (v: string[]) => void;
  selectedGoals: string[]; setSelectedGoals: (v: string[]) => void;
  showMoreAdTypes: boolean; setShowMoreAdTypes: (v: boolean) => void;
  cityLimit: number; scopeLabel: string;
  vendorCats: { id: string; name: string }[];
  planGrantsSeal: boolean; planName: string;
  /** State targeting (subscriptions P5): selectedCities then holds state codes, not city keys. */
  stateTargeting: boolean;
  /** VIP: the ad may also reach buyers in chosen countries outside India. */
  allowCountries: boolean;
  selectedCountries: string[]; setSelectedCountries: (v: string[]) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>("openListing");
  const lang = useLang();
  // Country names in the reader's language, from the browser (P7 brings Cosora's own list).
  const countryName = (code: string) => {
    try {
      return new Intl.DisplayNames([lang === "hi" ? "hi" : lang === "gu" ? "gu" : "en"], { type: "region" }).of(code) ?? code;
    } catch {
      return code;
    }
  };
  const toggleCountry = (code: string) => {
    setSelectedCountries(selectedCountries.includes(code) ? selectedCountries.filter((c) => c !== code) : [...selectedCountries, code]);
  };

  const toggleAdType = (ad: AdType) => {
    // Don't let a vendor pay for a trust seal their plan already includes.
    if (SEAL_AD_TYPES.has(ad.id) && planGrantsSeal && !selectedAdTypes.includes(ad.id)) {
      toast.info(`Trust seal is already included in your ${planName} plan`, { description: "No need to buy it separately." });
      return;
    }
    if (selectedAdTypes.includes(ad.id)) {
      setSelectedAdTypes(selectedAdTypes.filter(id => id !== ad.id));
      if (expandedId === ad.id) setExpandedId(null);
    } else {
      setSelectedAdTypes([...selectedAdTypes, ad.id]);
      setExpandedId(ad.id);
    }
  };

  const toggleProduct = (id: string) => {
    setSelectedProducts(
      selectedProducts.includes(id) ? selectedProducts.filter(p => p !== id) : [...selectedProducts, id]
    );
  };

  const toggleCity = (v: string) => {
    const isOn = selectedCities.includes(v);
    // Plan ad-location scope: cap how many locations a tier can target
    // (1 state / 4 states / pan-India = unlimited). Removing is always allowed.
    if (!isOn && Number.isFinite(cityLimit) && selectedCities.length >= cityLimit) {
      toast.error(`Your plan targets up to ${cityLimit} location${cityLimit > 1 ? "s" : ""} (${scopeLabel})`, {
        description: "Upgrade for wider ad reach.",
      });
      return;
    }
    setSelectedCities(isOn ? selectedCities.filter(c => c !== v) : [...selectedCities, v]);
  };

  // Real DB category ids (no "all" pseudo-value — empty = untargeted = all buyers).
  const toggleCategory = (v: string) => {
    setSelectedCategories(
      selectedCategories.includes(v) ? selectedCategories.filter(c => c !== v) : [...selectedCategories, v]
    );
  };

  // Goals do something real: toggling a goal on pre-selects the placement types
  // that best serve it (union with the current selection).
  const toggleGoal = (v: string) => {
    if (selectedGoals.includes(v)) {
      setSelectedGoals(selectedGoals.filter(g => g !== v));
      return;
    }
    setSelectedGoals([...selectedGoals, v]);
    const suggested = GOAL_PLACEMENTS[v] ?? [];
    const toAdd = suggested.filter((id) => !selectedAdTypes.includes(id));
    if (toAdd.length) {
      setSelectedAdTypes([...selectedAdTypes, ...toAdd]);
      toast.success("Ad types suggested for your goal", { description: toAdd.map((id) => AD_TYPES.find((a) => a.id === id)?.name).filter(Boolean).join(", ") });
    }
  };

  const displayed = showMoreAdTypes ? BUILDER_AD_TYPES : BUILDER_AD_TYPES.slice(0, 5);

  const DURATIONS = [{ value: "3", label: "3" }, { value: "7", label: "7" }, { value: "14", label: "14" }, { value: "30", label: "30" }];
  const CITIES = ["mumbai", "delhi", "allIndia", "south", "chennai", "kolkata", "west", "export", "pune", "ahmedabad"];
  const CITY_LABELS: Record<string, string> = { mumbai: "Mumbai", delhi: "Delhi", allIndia: "All India", south: "South", chennai: "Chennai", kolkata: "Kolkata", west: "West", export: "Export", pune: "Pune", ahmedabad: "Ahmedabad" };
  // Where Indian textiles are bought most from abroad (ISO codes; names come from the browser).
  const AD_COUNTRIES = "US GB AE SA DE FR IT ES NL BD LK NP AU CA JP SG".split(" ");
  const GOALS = [
    { value: "visitProfile",  title: "Visit your profile",  desc: "Best for brand awareness and follows"   },
    { value: "visitWebsite",  title: "Visit your website",  desc: "Best for online sales and bookings"     },
    { value: "messageYou",    title: "Message you",         desc: "Best for building direct trust"         },
    { value: "mixOfActions",  title: "A mix of actions",    desc: "Best for multiple goals"                },
  ].filter((g) => (GOAL_PLACEMENTS[g.value] ?? []).length > 0);

  return (
    <section id="adCreationSteps" className="bg-white rounded-xl p-4 md:p-6 border border-gray-200 lg:p-8 xl:scroll-mt-24">
      <div className="mb-6 lg:mb-8">
        <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 lg:text-2xl">Create Your Ad in 3 Steps</h3>
        <p className="text-sm text-gray-600">Select products from your catalogue, choose targeting, and send it for review</p>
      </div>

      <div className="space-y-12 lg:space-y-14">
        {/* ── Step 1: Ad Type ── */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-[#f75f71] text-white flex items-center justify-center text-sm font-bold shadow-md">1</div>
            <h4 className="text-base md:text-lg font-bold text-gray-900">Choose Ad Type</h4>
          </div>

          <div className="space-y-3 pl-0 md:pl-11">
            {/* Desktop: every placement shows its artwork and description up front,
                so there is nothing to expand — the accordion below is mobile-only. */}
            <div className="hidden lg:grid lg:grid-cols-2 min-[1700px]:grid-cols-3 gap-4">
              {displayed.map(ad => {
                const on = selectedAdTypes.includes(ad.id);
                const included = SEAL_AD_TYPES.has(ad.id) && planGrantsSeal;
                return (
                  <button key={ad.id} onClick={() => toggleAdType(ad)} aria-pressed={on}
                    className={cn(
                      "group flex flex-col overflow-hidden rounded-2xl border-2 text-left transition-colors",
                      on ? "border-[#FF6B6B] bg-[#fff5f5]" : "border-gray-100 bg-white hover:border-gray-200"
                    )}>
                    <div className="relative h-28 w-full overflow-hidden bg-gray-100">
                      <img src={ad.image} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                      <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-white/95 shadow-sm">
                        <ad.Icon className="h-4 w-4 text-[#f75f71]" />
                      </span>
                      <span className={cn(
                        "absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                        on ? "border-[#FF6B6B] bg-[#f75f71]" : "border-white/80 bg-white/90"
                      )}>
                        {on && <Check className="h-3.5 w-3.5 text-white" strokeWidth={4} />}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <h5 className="text-sm font-bold text-gray-900">{ad.name}</h5>
                      {MANUAL.has(ad.id) && <ManualTag />}
                      <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{ad.description}</p>
                      <div className="mt-4 flex items-end justify-between border-t border-gray-100 pt-3">
                        {included ? (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold text-green-700">
                            Included in {planName}
                          </span>
                        ) : (
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-bold lg:tabular-nums text-gray-900">{ad.price}</span>
                            <span className="text-xs font-medium text-gray-500">{ad.period || "one-time"}</span>
                          </div>
                        )}
                        <span className={cn("text-[10px] font-bold uppercase tracking-wider transition-colors",
                          on ? "text-[#FF6B6B]" : "text-gray-300 group-hover:text-gray-400")}>
                          {on ? "Selected" : "Select"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:hidden">
              {displayed.map(ad => (
                <div key={ad.id} className="space-y-2">
                  <button
                    onClick={() => toggleAdType(ad)}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all",
                      selectedAdTypes.includes(ad.id)
                        ? "border-[#FF6B6B] bg-[#fff5f5]"
                        : "border-gray-100 bg-white hover:border-gray-200"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center",
                        selectedAdTypes.includes(ad.id) ? "border-[#FF6B6B]" : "border-gray-300")}>
                        {selectedAdTypes.includes(ad.id) && <div className="w-3 h-3 bg-[#f75f71] rounded-full" />}
                      </div>
                      <span className="text-sm font-bold text-gray-800">{ad.name}</span>
                      {MANUAL.has(ad.id) && <ManualTag />}
                    </div>
                    {SEAL_AD_TYPES.has(ad.id) && planGrantsSeal ? (
                      <span className="rounded-full bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 whitespace-nowrap">
                        Included in {planName}
                      </span>
                    ) : (
                      <div className="text-right flex items-center gap-1">
                        <span className="text-base font-bold text-gray-900">{ad.price}</span>
                        <span className="text-xs text-gray-500 font-medium">{ad.period}</span>
                      </div>
                    )}
                  </button>

                  {expandedId === ad.id && (
                    <div className="mx-1 overflow-hidden bg-white border border-[#FF6B6B]/20 rounded-2xl shadow-sm">
                      <div className="flex flex-col md:flex-row">
                        <div className="w-full md:w-48 h-40 md:h-auto overflow-hidden">
                          <img src={ad.image} alt={ad.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 p-5 flex flex-col justify-between bg-gradient-to-br from-white to-[#fff5f5]">
                          <div>
                            <h5 className="text-sm font-bold text-gray-900 mb-2">{ad.name}</h5>
                            <p className="text-xs text-gray-600 leading-relaxed font-medium">{ad.description}</p>
                          </div>
                          <div className="flex items-center justify-between mt-4">
                            <span className="text-[10px] font-bold text-[#FF6B6B] uppercase tracking-wider">Premium Placement</span>
                            <button onClick={() => setExpandedId(null)}
                              className="flex items-center gap-2 px-4 py-1.5 bg-gray-900 text-white rounded-full text-xs font-bold hover:bg-black transition-all">
                              Collapse
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowMoreAdTypes(!showMoreAdTypes)}
              className="w-full py-3 rounded-xl font-bold text-sm text-[#FF6B6B] bg-[#fff5f5] hover:bg-[#fff0f0] transition-all border border-[#FF6B6B]/20 lg:mx-auto lg:block lg:w-auto lg:px-12">
              {showMoreAdTypes ? "Show Less" : `More (${BUILDER_AD_TYPES.length - 5} more options)`}
            </button>

            {/* A manual ad type picked: what happens to it (Mitra, 2026-11-17). */}
            {selectedAdTypes.some((id) => MANUAL.has(id)) && (
              <div role="note" data-testid="manual-ad-banner" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-bold">The Cosora team sets these up by hand</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                  {selectedAdTypes.filter((id) => MANUAL.has(id)).map((id) => AD_TYPES.find((a) => a.id === id)?.name ?? id).join(", ")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                  These run outside the app. Once Cosora approves your campaign, our team sets them up for you and marks them
                  done under Your Campaigns, and you get a notice.
                </p>
              </div>
            )}

            {/* Direct Broadcast is bought by the message (Mitra, 2026-11-17, "add the field for message"). */}
            {selectedAdTypes.some((id) => PER_MESSAGE_TYPES.has(id)) && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="broadcast-messages">
                <label htmlFor="broadcast-messages" className="text-sm font-bold text-gray-900">Messages per listing</label>
                <input
                  id="broadcast-messages"
                  type="number"
                  inputMode="numeric"
                  min={BROADCAST_MESSAGES.min}
                  max={BROADCAST_MESSAGES.max}
                  step={10}
                  value={broadcastMessages}
                  onChange={(e) => setBroadcastMessages(e.target.value)}
                  onBlur={() => setBroadcastMessages(String(clampMessages(broadcastMessages)))}
                  className="mt-2 w-40 rounded-xl border border-gray-300 px-3 py-2 text-base tabular-nums focus:border-[#ff2160] focus:outline-none"
                />
                <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
                  {`₹15 a message, from ${BROADCAST_MESSAGES.min.toLocaleString("en-IN")} to ${BROADCAST_MESSAGES.max.toLocaleString("en-IN")}. Cosora's team sends them to buyers in your listing's category after approval.`}
                </p>
                {String(clampMessages(broadcastMessages)) !== broadcastMessages.trim() && (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    {`You'll be charged for ${clampMessages(broadcastMessages).toLocaleString("en-IN")} messages.`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Step 2: Products & Duration ── */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-[#f75f71] text-white flex items-center justify-center text-sm font-bold shadow-md">2</div>
            <h4 className="text-base md:text-lg font-bold text-gray-900">Select Products</h4>
          </div>

          <div className="pl-0 md:pl-11 space-y-8 xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start xl:gap-6 xl:space-y-0">
            {/* Product tiles — the vendor's real live products */}
            <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <h5 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Pick the products to promote
              </h5>
              {products.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-6 text-center">
                  <p className="text-sm text-gray-500 mb-3">You have no live listings yet. Ads run on listings Cosora has approved.</p>
                  <Link to="/upload" className="inline-flex items-center gap-1.5 rounded-full bg-[#f75f71] px-4 py-2 text-xs font-bold text-white hover:bg-[#ff2160] transition-colors">
                    <Plus className="w-4 h-4" /> Add a product
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-3">
                    {products.map(p => {
                      const on = selectedProducts.includes(p.id);
                      return (
                        <button key={p.id} onClick={() => toggleProduct(p.id)}
                          className={cn(
                            "group relative rounded-2xl border-2 overflow-hidden transition-all text-left",
                            on ? "border-[#FF6B6B] shadow-lg shadow-[#FF6B6B]/10" : "border-gray-200 hover:border-gray-300"
                          )}>
                          <div className="aspect-square bg-gray-100">
                            <img src={p.image} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                          </div>
                          {on && (
                            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#f75f71] text-white shadow">
                              <Check className="w-3 h-3" strokeWidth={4} />
                            </span>
                          )}
                          <div className="p-1.5">
                            <p className="text-[11px] font-semibold text-gray-800 truncate">{p.name}</p>
                            <p className="text-[10px] text-gray-500">₹{p.price}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 font-medium">{selectedProducts.length} selected · each promoted product is a separate campaign</p>
                </>
              )}
            </div>

            {/* Duration */}
            <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h5 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <MousePointerClick className="w-4 h-4" /> Duration
                </h5>
                <button className="flex items-center gap-2 bg-gray-200/50 p-2 rounded-xl">
                  <Calendar className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Date Range</span>
                </button>
              </div>
              {/* Once the checkout rail claims 300px this column is too narrow for
                  four abreast — fold to 2×2 until there is room again. */}
              <div className="grid grid-cols-4 gap-3 mt-4 min-[1400px]:grid-cols-2 min-[1700px]:grid-cols-4">
                {DURATIONS.map(d => (
                  <button key={d.value} onClick={() => setSelectedDuration(d.value)}
                    className={cn(
                      "py-4 px-2 rounded-xl text-center font-bold transition-all border-2",
                      selectedDuration === d.value
                        ? "bg-[#f75f71] text-white border-[#FF6B6B] shadow-lg shadow-[#FF6B6B]/20"
                        : "bg-white text-gray-700 border-gray-100 hover:border-gray-200"
                    )}>
                    <div className="text-xl">{d.label}</div>
                    <div className="text-[10px] uppercase tracking-wider opacity-80">Days</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Step 3: Target Audience ── */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-[#f75f71] text-white flex items-center justify-center text-sm font-bold shadow-md">3</div>
            <h4 className="text-base md:text-lg font-bold text-gray-900">Target Audience</h4>
          </div>

          <div className="pl-0 md:pl-11 space-y-6">
            <p className="text-sm text-gray-500 font-medium italic">Automatically finds and updates audiences</p>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
              {/* Category — REAL: filters which buyers see the ad on category
                  pages (e.g. product-detail). Empty = shown to everyone. */}
              <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <List className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Category</span>
                </div>
                <p className="text-[11px] text-gray-400 mb-3">
                  Show this ad to buyers browsing these categories. Leave empty to show it to everyone.
                </p>
                {vendorCats.length === 0 ? (
                  <p className="text-xs text-gray-400">Add products with a category to target by category.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {vendorCats.map(c => (
                      <button key={c.id} onClick={() => toggleCategory(c.id)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                          selectedCategories.includes(c.id)
                            ? "bg-[#f75f71] text-white shadow-md"
                            : "bg-white text-gray-600 border border-gray-100 hover:border-gray-200"
                        )}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Where the ad reaches (subscriptions P5): states, held to the plan, and on
                  VIP also countries. A buyer known to be in another state doesn't see it. */}
              {stateTargeting && (
                <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100" data-testid="ad-states">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-600" />
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">States</span>
                    </div>
                    <span className="rounded-full bg-brand-vendor/10 text-brand-vendor text-[10px] font-bold px-2 py-0.5">
                      Plan: {scopeLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mb-3">
                    {Number.isFinite(cityLimit)
                      ? "Buyers in other states won't see this ad. Buyers whose state we don't know still can."
                      : "Choose states to reach only those. Leave them all unchosen to reach all of India."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {INDIA_STATES.map((st) => (
                      <button key={st.code} onClick={() => toggleCity(st.code)} data-no-translate
                        aria-pressed={selectedCities.includes(st.code)} data-testid={`ad-state-${st.code}`}
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs font-bold transition-all",
                          selectedCities.includes(st.code)
                            ? "bg-[#f75f71] text-white shadow-md"
                            : "bg-white text-gray-600 border border-gray-100 hover:border-gray-200"
                        )}>
                        {lang === "hi" ? st.hi : lang === "gu" ? st.gu : st.name}
                      </button>
                    ))}
                  </div>
                  {allowCountries && (
                    <div className="mt-5 border-t border-gray-100 pt-4" data-testid="ad-countries">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Outside India</span>
                      <p className="mt-1 text-[11px] text-gray-500 mb-3">
                        Buyers in the countries you choose see this ad too. Part of your VIP plan.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {AD_COUNTRIES.map((code) => (
                          <button key={code} onClick={() => toggleCountry(code)} data-no-translate
                            aria-pressed={selectedCountries.includes(code)}
                            className={cn(
                              "px-3 py-2 rounded-lg text-xs font-bold transition-all",
                              selectedCountries.includes(code)
                                ? "bg-[#f75f71] text-white shadow-md"
                                : "bg-white text-gray-600 border border-gray-100 hover:border-gray-200"
                            )}>
                            {countryName(code)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* City — the older targeting, for accounts state targeting isn't on for yet. */}
              <div className={cn("bg-gray-50/50 p-5 rounded-2xl border border-gray-100", stateTargeting && "hidden")}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">City / Area</span>
                  </div>
                  <span className="rounded-full bg-brand-vendor/10 text-brand-vendor text-[10px] font-bold px-2 py-0.5">
                    Plan: {scopeLabel}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mb-3">
                  Recorded on your campaign and limited by your plan's reach. Geo-based delivery is rolling out.
                </p>
                <div className="flex flex-wrap gap-2">
                  {CITIES.map(c => (
                    <button key={c} onClick={() => toggleCity(c)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-bold transition-all",
                        selectedCities.includes(c)
                          ? "bg-[#f75f71] text-white shadow-md"
                          : "bg-white text-gray-600 border border-gray-100 hover:border-gray-200"
                      )}>
                      {CITY_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Goal */}
            <div className="bg-white p-6 rounded-3xl border-2 border-[#FF6B6B]/10 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-[#FF6B6B]" />
                <span className="text-xs font-bold text-gray-900 uppercase tracking-widest">Goal</span>
              </div>
              <div className="mb-6">
                <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2">What is the main goal of this ad?</h3>
                <p className="text-sm text-gray-500 font-medium">Choose a primary action for your potential customers.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {GOALS.map(g => (
                  <button key={g.value} onClick={() => toggleGoal(g.value)}
                    className={cn(
                      "w-full text-left p-5 rounded-2xl border-2 transition-all group",
                      selectedGoals.includes(g.value)
                        ? "border-[#FF6B6B] bg-[#fff5f5]"
                        : "border-gray-100 bg-white hover:border-gray-200"
                    )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-bold text-gray-900 mb-1 group-hover:text-[#FF6B6B] transition-colors">{g.title}</div>
                        <div className="text-[11px] text-gray-500 font-medium leading-relaxed">{g.desc}</div>
                      </div>
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                        selectedGoals.includes(g.value) ? "border-[#FF6B6B] bg-[#f75f71]" : "border-gray-200 bg-white"
                      )}>
                        {selectedGoals.includes(g.value) && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Payment modal (mock checkout — activates the ads on "pay") ──
function PaymentModal({
  open, onClose, amount, days, productCount, onPaid,
}: {
  open: boolean; onClose: () => void; amount: number; days: number; productCount: number;
  onPaid: () => Promise<void>;
}) {
  const [method, setMethod] = useState<"upi" | "card">("upi");
  const [paying, setPaying] = useState(false);

  const pay = async () => {
    setPaying(true);
    try {
      // Simulated gateway latency; a real integration (Razorpay/Stripe) would
      // open its checkout here and activate the ad on the webhook.
      await new Promise((r) => setTimeout(r, 900));
      await onPaid();
      onClose();
    } catch (e) {
      toast.error("Payment failed", { description: errorMessage(e) });
    } finally {
      setPaying(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">Complete payment</h3>
              <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="rounded-2xl bg-[#fff5f5] border border-[#FF6B6B]/20 p-4 mb-4 text-center">
              <p className="text-xs text-gray-500">Amount payable</p>
              <p className="text-3xl font-extrabold text-gray-900 mt-0.5">₹{amount.toLocaleString("en-IN")}</p>
              {productCount > 0
                ? <p className="text-[11px] text-gray-500 mt-1">{productCount} product{productCount > 1 ? "s" : ""} · {days} days</p>
                : <p className="text-[11px] text-gray-500 mt-1">{days} days</p>}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {(["upi", "card"] as const).map((m) => (
                <button key={m} onClick={() => setMethod(m)}
                  className={cn("rounded-xl border-2 py-2.5 text-sm font-bold transition-all",
                    method === m ? "border-[#FF6B6B] bg-[#fff5f5] text-gray-900" : "border-gray-200 text-gray-500 hover:border-gray-300")}>
                  {m === "upi" ? "UPI" : "Card"}
                </button>
              ))}
            </div>

            {method === "upi" ? (
              <input inputMode="text" placeholder="yourname@upi"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm mb-4 focus:outline-none focus:border-[#FF6B6B]" />
            ) : (
              <div className="space-y-2 mb-4">
                <input inputMode="numeric" placeholder="Card number"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#FF6B6B]" />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="MM / YY" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#FF6B6B]" />
                  <input inputMode="numeric" placeholder="CVV" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#FF6B6B]" />
                </div>
              </div>
            )}

            <button onClick={pay} disabled={paying}
              className="w-full bg-[#ff2160] text-white py-3.5 rounded-2xl font-bold text-base hover:bg-[#ff2160]/80 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
              {paying ? "Processing…" : `Pay ₹${amount.toLocaleString("en-IN")}`}
            </button>
            <p className="mt-3 text-center text-[11px] text-amber-600">Demo checkout — no real charge. Add Razorpay keys to take live payments.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// The order the checkout sends: what the server prices, charges and publishes.
function buildAdSpec(
  products: VendorProductRow[], selectedAdTypes: string[], selectedProducts: string[], days: number,
  selectedCategories: string[], selectedCities: string[],
  stateTargeting = false, selectedCountries: string[] = [], broadcastMessages = "",
): AdSpec {
  return {
    placementIds: selectedAdTypes,
    days,
    // Only an order with a broadcast carries a message count; the server clamps it the same way.
    messages: selectedAdTypes.some((id) => PER_MESSAGE_TYPES.has(id)) ? clampMessages(broadcastMessages) : undefined,
    campaignLabel: selectedAdTypes.map(id => AD_TYPES.find(a => a.id === id)?.name).filter(Boolean).join(", ") || "Ad",
    items: selectedProducts.map((pid) => {
      const prod = products.find(p => p.id === pid);
      return { productId: pid, title: prod?.name ?? "Product", imageUrl: prod?.image ?? null };
    }),
    // Real targeting persisted on the campaign row (see edge functions).
    targetCategories: selectedCategories.length ? selectedCategories : undefined,
    // With state targeting the selection is state codes; without it, the older city keys.
    targetCities: !stateTargeting && selectedCities.length ? selectedCities : undefined,
    targetStates: stateTargeting && selectedCities.length ? selectedCities : undefined,
    targetCountries: stateTargeting && selectedCountries.length ? selectedCountries : undefined,
  };
}

// ── CostSummary ──
function CostSummary({
  products, selectedAdTypes, selectedProducts, selectedDuration, selectedCategories, selectedCities, vendorId, onCreated, canAds,
  stateTargeting, selectedCountries, broadcastMessages,
}: {
  products: VendorProductRow[]; selectedAdTypes: string[]; selectedProducts: string[]; selectedDuration: string;
  selectedCategories: string[]; selectedCities: string[];
  vendorId?: string; onCreated: () => void; canAds: boolean;
  stateTargeting: boolean; selectedCountries: string[]; broadcastMessages: string;
}) {
  const messages = clampMessages(broadcastMessages);
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // A discount code (admin completion Phase 10). The quote is the server's: it
  // prices the order and says what the code takes off. When the order changes,
  // the same code is quoted again, and Pay waits for the new numbers.
  const [quote, setQuote] = useState<AdQuote | null>(null);
  const [quoteNote, setQuoteNote] = useState<string | null>(null);
  const [requoting, setRequoting] = useState(false);
  const quotedFor = useRef("");
  const specKey = [selectedAdTypes.join(","), selectedDuration, selectedProducts.join(","), messages].join("|");
  useEffect(() => {
    if (!quote || quotedFor.current === specKey || !selectedAdTypes.length || !selectedProducts.length) return;
    let cancelled = false;
    setRequoting(true);
    const t = setTimeout(async () => {
      const spec = buildAdSpec(products, selectedAdTypes, selectedProducts, parseInt(selectedDuration) || 1, selectedCategories, selectedCities, stateTargeting, selectedCountries, broadcastMessages);
      const res = await quoteAdDiscount(spec, quote.code);
      if (cancelled) return;
      setRequoting(false);
      if (res.quote) {
        quotedFor.current = specKey;
        setQuote(res.quote);
        setQuoteNote(null);
      } else {
        setQuote(null);
        setQuoteNote(res.message);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); setRequoting(false); };
    // specKey covers the order's contents; quote.code is the only part of the quote that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, quote?.code]);

  if (!selectedAdTypes.length || !selectedProducts.length || !selectedDuration) {
    // Mobile keeps its original behaviour — nothing appears until the form is
    // complete. The desktop rail is a fixed column, so instead of collapsing to
    // an empty gutter it holds its place and names what is still missing.
    const checklist = [
      { label: "Choose an ad type", done: selectedAdTypes.length > 0 },
      { label: "Select products to promote", done: selectedProducts.length > 0 },
      { label: "Pick a duration", done: Boolean(selectedDuration) },
    ];
    return (
      <div className="hidden min-[1400px]:block bg-white rounded-xl p-6 border border-dashed border-gray-200">
        <h3 className="text-sm font-bold text-gray-900">Your campaign</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Finish the steps and your cost appears here before you pay.
        </p>
        <ul className="mt-5 space-y-3">
          {checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-2.5">
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2",
                c.done ? "border-[#FF6B6B] bg-[#f75f71]" : "border-gray-200 bg-white")}>
                {c.done && <Check className="h-3 w-3 text-white" strokeWidth={4} />}
              </span>
              <span className={cn("text-xs font-semibold", c.done ? "text-gray-400 line-through" : "text-gray-700")}>
                {c.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Free tier can't run ads (ad_location_scope = none) — show an upsell instead
  // of the checkout so enforcement happens at the point of action.
  if (!canAds) {
    return (
      <div className="bg-white rounded-xl p-6 border border-amber-200 mt-6 text-center min-[1400px]:mt-0 min-[1400px]:text-left">
        <p className="text-base font-bold text-gray-900 mb-1">Advertising is a paid feature</p>
        <p className="text-sm text-gray-500 mb-4">Your current (Free) plan can't run ad campaigns. Upgrade to a paid plan to promote your products.</p>
        <p className="text-sm text-gray-500 mb-2">You can still get the Trusted Seal or the Verified Certificate on the Free plan.</p>
        <a href="#get-verified" className="mb-4 inline-block text-sm font-semibold text-[#ff2160] hover:underline">Get verified</a>
        <Link to="/subscription" className="inline-flex items-center gap-1.5 rounded-2xl bg-[#ff2160] px-6 py-3 text-sm font-bold text-white hover:bg-[#ff2160]/80 transition-colors">
          View plans <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const days = parseInt(selectedDuration) || 1;
  // The price shown here comes from the SAME module the payment path charges
  // from (src/lib/adPricing.ts mirrors supabase/functions/_shared/adPricing.ts,
  // and scripts/ad-pricing-check.mjs asserts they agree across 4000 generated
  // orders). It used to be a fourth hand-maintained copy of the formula.
  //
  // The visible change: trustedSeal and verifiedCertificate are now charged
  // ONCE for the account instead of once per product per day. A ₹199
  // certificate across 3 products on a 30-day campaign quoted ₹17,910 before.
  const total = computeOrderRupees(selectedAdTypes, days, selectedProducts.length, messages);
  const lines = priceLines(selectedAdTypes, days, selectedProducts.length, messages);
  // With a code applied, what the vendor pays is the server's quote.
  const payable = quote ? quote.total : total;

  const buildSpec = (): AdSpec =>
    buildAdSpec(products, selectedAdTypes, selectedProducts, days, selectedCategories, selectedCities, stateTargeting, selectedCountries, broadcastMessages);

  const applyCode = async (code: string): Promise<string | null> => {
    setQuoteNote(null);
    const res = await quoteAdDiscount(buildSpec(), code);
    if (!res.quote) return res.message;
    quotedFor.current = specKey;
    setQuote(res.quote);
    return null;
  };

  // The code was refused at the last step (its last use went, or it changed).
  const dropCode = (reason: string | undefined) => {
    setQuote(null);
    setQuoteNote(discountRefusal(reason));
  };

  const say = (m: AdCheckoutMessage) =>
    (m.kind === "success" ? toast.success : toast.error)(m.title, { description: m.description, duration: m.long ? 60_000 : undefined });

  // Fallback (no Razorpay keys): publish server-side from the spec after the
  // simulated checkout. Used by the mock PaymentModal. Ads are still created by
  // the server (the edge function), never inserted directly by the client.
  const publishDemo = async () => {
    const res = await publishDemoAds(buildSpec(), quote?.code);
    if (!res.ok && res.error === "discount") {
      setPayOpen(false);
      dropCode(res.reason);
      toast.error("Your discount code couldn't be used", { description: discountRefusal(res.reason) });
      return;
    }
    // The plan doesn't let the ad reach what was chosen (subscriptions P5).
    if (!res.ok && res.error === "ad_reach") throw new Error(adReachRefusal(res.reason));
    if (!res.ok) throw new Error(res.message || res.error || "Could not publish ads");
    onCreated();
    setQuote(null);
    toast.success("Your ads are waiting for Cosora's review", {
      description: `${res.count ?? selectedProducts.length} campaign${(res.count ?? selectedProducts.length) > 1 ? "s" : ""} sent for review. Your days start when Cosora approves them.`,
    });
  };

  // Primary path: real Razorpay checkout. Server creates the order + amount,
  // Razorpay collects payment, the server verifies the signature and publishes.
  const startCheckout = async () => {
    if (!vendorId) { toast.error("Sign in as a vendor to advertise"); return; }
    const spec = buildSpec();
    setBusy(true);
    try {
      const order = await createRazorpayOrder(spec, quote?.code);
      if (order.discountReason) {
        dropCode(order.discountReason);
        return;
      }
      if (!order.configured) {
        // Gateway not wired yet → simulated checkout.
        setPayOpen(true);
        return;
      }
      if (order.free) {
        // The code took the order to ₹0: nothing to pay, so no Razorpay checkout.
        const published = await publishFreeAdOrder(order.orderId!);
        if (published.ok) {
          onCreated();
          setQuote(null);
        }
        say(freeAdOutcome(published, selectedProducts.length));
        return;
      }
      const res = await openRazorpayCheckout({
        keyId: order.keyId!,
        orderId: order.orderId!,
        amount: order.amount,
        name: "Cosora Ads",
        description: `${selectedProducts.length} campaign${selectedProducts.length > 1 ? "s" : ""} · ${days} days`,
        // A code's use is held for this order for 30 minutes; don't let checkout outlive it.
        timeout: quote ? DISCOUNT_CHECKOUT_TIMEOUT_S : undefined,
      });
      const verified = await verifyRazorpayPayment({
        orderId: res.razorpay_order_id,
        paymentId: res.razorpay_payment_id,
        signature: res.razorpay_signature,
      });
      if (verified.ok) {
        onCreated();
        setQuote(null);
      }
      // What happened to the money, in words (src/lib/adPaymentOutcome.ts): never "not charged" after a payment.
      say(paidAdOutcome(verified, res.razorpay_payment_id, selectedProducts.length));
    } catch (e) {
      if (e instanceof Error && e.message === "dismissed") toast.info("Payment cancelled");
      else toast.error("Checkout failed", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 mt-6 min-[1400px]:mt-0 min-[1400px]:shadow-sm">
      <div className="text-center mb-6 min-[1400px]:text-left">
        {/* One inline sentence reads well full-width; in the 360px rail it has to
            stack, so the amount gets its own line. */}
        <div className="flex items-center justify-center gap-2 mb-2 min-[1400px]:flex-col min-[1400px]:items-start min-[1400px]:gap-0 min-[1400px]:mb-3">
          <span className="text-gray-600 text-base min-[1400px]:text-xs min-[1400px]:font-semibold min-[1400px]:uppercase min-[1400px]:tracking-wider min-[1400px]:text-gray-400">Estimated Cost:</span>
          <span className="text-4xl font-bold text-gray-900 lg:tabular-nums min-[1400px]:leading-tight">₹{payable.toLocaleString("en-IN")}</span>
          <span className="text-gray-600 text-base min-[1400px]:text-sm">for {selectedDuration} days</span>
        </div>
        {/* A real per-line breakdown, not one blanket "× days × products"
            sentence. That sentence is now false for account-level placements —
            a Trusted Seal does not multiply by product count — and a vendor
            who cannot see WHY the total changed just sees a different number. */}
        <ul className="space-y-1 text-sm text-gray-500 min-[1400px]:text-xs min-[1400px]:leading-relaxed">
          {lines.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="text-gray-700">{AD_TYPES.find(a => a.id === l.id)?.name ?? l.id}</span>
                <span className="block text-xs text-gray-400">{l.basis}</span>
              </span>
              <span className="shrink-0 tabular-nums text-gray-700">₹{l.rupees.toLocaleString("en-IN")}</span>
            </li>
          ))}
          {quote && quote.discount > 0 && (
            <li className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5 text-gray-700">
                <span>Discount</span>
                <span className="font-mono text-xs text-gray-500" data-no-translate>{quote.code}</span>
              </span>
              <span className="shrink-0 tabular-nums text-brand-success">−₹{quote.discount.toLocaleString("en-IN")}</span>
            </li>
          )}
        </ul>
      </div>

      <div className="mb-4">
        <DiscountCodeField
          applied={quote ? { code: quote.code, discount: quote.discount } : null}
          onApply={applyCode}
          onRemove={() => { setQuote(null); setQuoteNote(null); }}
          disabled={busy}
        />
        {requoting && <p className="mt-1.5 text-xs text-gray-500" role="status">Updating the discount for this order…</p>}
        {quoteNote && <p className="mt-1.5 text-xs text-destructive" role="alert">{quoteNote}</p>}
      </div>

      <button onClick={startCheckout} disabled={busy || requoting}
        className="w-full bg-[#ff2160] text-white py-4 rounded-2xl font-bold text-lg hover:bg-[#ff2160]/80 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 disabled:opacity-60 min-[1400px]:text-base">
        {busy ? "Processing…"
          : payable > 0 ? <>Pay &amp; Publish · ₹{payable.toLocaleString("en-IN")}<ChevronRight className="w-5 h-5" /></>
          : <>Publish for free<ChevronRight className="w-5 h-5" /></>}
      </button>

      <div className="grid grid-cols-2 gap-4 mt-6 min-[1400px]:grid-cols-1 min-[1400px]:gap-2.5 min-[1400px]:mt-5 min-[1400px]:border-t min-[1400px]:border-gray-100 min-[1400px]:pt-5">
        {/* "Go live instantly" was false and is now "Reviewed before it runs":
            since the v3 ads work, a paid campaign lands on `pending_review` and
            reaches no buyer until an admin approves it. Payment is never
            approval — the checkout panel should not promise otherwise. */}
        {["No minimum spend", "Start from ₹22/day", "Reviewed before it runs", "Pause or stop anytime"].map(b => (
          <div key={b} className="flex items-center gap-2">
            <div className="w-2 h-2 bg-pink-500 rounded-full shrink-0" />
            <span className="text-sm text-gray-600 min-[1400px]:text-xs">{b}</span>
          </div>
        ))}
      </div>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        amount={payable}
        days={days}
        productCount={selectedProducts.length}
        onPaid={publishDemo}
      />
    </div>
  );
}

// ── HowAdvertisingWorks ──
function HowAdvertisingWorks() {
  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100 mt-10 lg:p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6 lg:text-3xl lg:mb-8">How Advertising Works</h2>
      <ol className="grid gap-4 md:grid-cols-3">
        {HOW_IT_WORKS.map((h, i) => (
          <li key={h.title} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-700">{i + 1}</span>
            <h3 className="mt-3 text-base font-bold text-gray-900">{h.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{h.desc}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── FAQSection ──
function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div>
      <div className="text-center mb-8 lg:mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 lg:text-3xl">Frequently Asked Questions</h2>
        <p className="text-gray-600">Everything you need to know about advertising on Cosora</p>
      </div>
      <div className="max-w-3xl mx-auto space-y-4 lg:max-w-none lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:items-start">
        {FAQS.map((faq, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button onClick={() => setOpen(open === i ? null : i)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors">
              <span className="font-semibold text-gray-900">{faq.q}</span>
              <div className="bg-[#e8f4fc] rounded-full p-2">
                <ChevronRight className={cn("w-5 h-5 text-gray-500 transition-transform duration-300",
                  open === i ? "rotate-90" : "")} />
              </div>
            </button>
            <div className={cn("overflow-hidden transition-all duration-300", open === i ? "max-h-96" : "max-h-0")}>
              <div className="px-6 pb-4 text-gray-600">{faq.a}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── WhyCosoraSection ──
function WhyCosoraSection() {
  return (
    <div className="p-6 lg:px-0 lg:py-10">
      <div className="text-center mb-8 lg:mb-10">
        <div className="text-pink-600 text-sm font-bold mb-2 uppercase tracking-wide lg:text-xs lg:tracking-[0.18em]">WHY COSORA</div>
        <h2 className="text-3xl font-bold text-gray-900 mb-3 lg:text-4xl lg:text-balance">Why Advertise on Cosora</h2>
        <p className="text-gray-600 text-sm leading-relaxed max-w-2xl mx-auto">
          We understand what manufacturers need. That's why every feature is designed to connect you with serious buyers.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {WHY_FEATURES.map((f, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-lg transition-shadow">
            <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mb-4", f.bg)}>
              <Shield className={cn("w-6 h-6", f.color)} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
            <p className="text-sm text-gray-600">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ManufacturersSection ──
function ManufacturersSection() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-gray-800">
      {MANUFACTURERS_CARDS.map((c, i) => (
        <div key={i} className="p-5 flex flex-col items-center justify-center text-center lg:px-6 lg:py-10">
          <div className="w-12 h-12 bg-orange-900/30 rounded-full flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-orange-500" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">{c.title}</h3>
          <p className="text-sm text-gray-400">{c.desc}</p>
        </div>
      ))}
    </div>
  );
}

// ── CTASection ──
function CTASection() {
  return (
    <div className="bg-gray-200 rounded-2xl p-8 text-center lg:py-16">
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3 lg:text-5xl lg:text-balance lg:max-w-3xl lg:mx-auto">
        Your Products Deserve{" "}
        <span className="bg-gradient-to-r from-[#f74d61] to-[#ff6d59] bg-clip-text text-transparent">
          the Right Buyers.
        </span>
      </h2>
      <p className="text-gray-600 text-base sm:text-lg mb-8 max-w-2xl mx-auto">
        Stop waiting for buyers to find you. Start advertising on the platform built for manufacturers like you.
      </p>
      <a href="#adCreationSteps"
        className="inline-flex items-center gap-2 bg-[#f85b6f] hover:bg-[#f85b6f]/80 text-white font-bold py-4 px-8 rounded-2xl text-lg transition-all shadow-lg hover:shadow-xl">
        Advertise on Cosora
        <ChevronRight className="w-5 h-5" />
      </a>
      <p className="text-gray-500 text-sm mt-6">From ₹22/day • No long-term commitment • Pause anytime</p>
    </div>
  );
}

// ── AdvertiseCards ──
// Featured ad types — generated from the REAL AD_TYPES/AD_PRICE catalog (same
// prices you actually pay in the builder), not a second invented price list.
// "Buy Now" jumps to the builder where the ad is selected + paid for.
function AdvertiseCards() {
  const featured = AD_TYPES.slice(0, 4);
  return (
    <div className="rounded-xl mt-12 mb-12">
      <h2 className="text-lg font-bold text-gray-900 mb-4 lg:text-2xl lg:mb-6">Popular ad types</h2>
      <motion.div variants={listContainer} className="grid grid-cols-1 md:grid-cols-2 gap-6 xl:grid-cols-4">
        {featured.map((ad) => (
          <motion.div key={ad.id} variants={listItem}
            className="bg-white rounded-xl p-4 text-left flex gap-4 shadow-sm hover:shadow-2xl transition-all duration-500 group overflow-hidden border border-gray-100 xl:flex-col xl:gap-3">
            <div className="h-full w-[120px] shrink-0 flex items-center justify-center xl:h-auto xl:w-full">
              <div className="w-full h-24 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center xl:h-36">
                <img src={ad.image} alt={ad.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              </div>
            </div>
            <div className="mt-1 flex flex-col gap-2 flex-1 min-w-0 xl:mt-0">
              <h3 className="text-base font-black text-gray-900 leading-tight">{ad.name}</h3>
              <p className="text-xs text-gray-500 line-clamp-2">{ad.description}</p>
              <div className="mt-auto">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-gray-900 tracking-tighter">{ad.price}</span>
                  <span className="text-gray-500 text-sm font-bold">{ad.period || " one-time"}</span>
                </div>
                <a href="#adCreationSteps"
                  className="mt-2 inline-flex bg-gray-950 hover:bg-[#f74d61] text-white px-4 py-2 rounded-xl items-center gap-2 font-black text-[12px] transition-all shadow-lg">
                  Buy Now <ChevronRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

// ── MyCampaigns — the vendor's real, DB-backed ad campaigns ──
function MyCampaigns({ ads, onToggle, onDelete }: {
  ads: AdRow[]; onToggle: (id: string, status: "active" | "paused") => void; onDelete: (id: string) => void;
}) {
  const { data: reasonLabels } = useAdReasonLabels();
  const { user } = useAuth();
  const { data: manualWork } = useMyAdManualWork(user?.id);
  // The campaign open in "Edit and resubmit" (SH-089): "changes needed" used to be a dead end.
  const [editing, setEditing] = useState<AdRow | null>(null);
  if (ads.length === 0) return null;
  // Tone per run state, not per raw status: the states a vendor needs to tell
  // apart are "running", "waiting on Cosora", "needs your attention" and
  // "stopped" — not the twelve values the column can hold.
  const toneStyle: Record<string, string> = {
    live: "bg-green-100 text-green-700",
    waiting: "bg-blue-100 text-blue-700",
    attention: "bg-orange-100 text-orange-700",
    stopped: "bg-gray-100 text-gray-500",
  };
  const totalImpr = ads.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
  const ctr = (clicks: number, impr: number) => (impr > 0 ? ((clicks / impr) * 100).toFixed(1) : "0.0");
  const activeCount = ads.filter((a) => a.status === "active").length;
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200 lg:h-full lg:p-6">
      <h3 className="text-sm font-bold text-gray-900 mb-3 lg:text-base lg:mb-4">Your Campaigns ({ads.length})</h3>

      {/* Analytics summary across all campaigns */}
      <div className="grid grid-cols-4 gap-2 mb-4 lg:gap-3 lg:mb-5">
        {[
          { label: "Active", value: String(activeCount) },
          { label: "Impressions", value: totalImpr.toLocaleString("en-IN") },
          { label: "Clicks", value: totalClicks.toLocaleString("en-IN") },
          { label: "CTR", value: `${ctr(totalClicks, totalImpr)}%` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-[#fff5f5] border border-[#FF6B6B]/15 p-2.5 text-center lg:p-4">
            <p className="text-base font-extrabold text-gray-900 leading-none lg:tabular-nums lg:text-2xl">{s.value}</p>
            <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {ads.map((a) => {
          // Phase 8.1: the campaign's run state in words the vendor can act on.
          // The raw status used to be printed verbatim, which meant a paid
          // campaign showed the bare word "pending_review" with nothing saying
          // that payment had gone through, that Cosora was reviewing it, or
          // that there was nothing for the vendor to do.
          const rs = runStateOf(a, undefined, reasonLabels);
          return (
            <div key={a.id} className="rounded-xl border border-gray-100 p-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#fff5f5] flex items-center justify-center shrink-0 overflow-hidden">
                  {a.imageUrl ? <img src={a.imageUrl} alt="" className="h-full w-full object-cover" /> : <Megaphone className="w-4 h-4 text-[#f75f71]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
                  <p className="text-[11px] text-gray-400">
                    {a.dailyBudget != null ? `₹${a.dailyBudget}/day · ` : ""}{a.impressions.toLocaleString("en-IN")} impressions · {a.clicks.toLocaleString("en-IN")} clicks · {ctr(a.clicks, a.impressions)}% CTR
                  </p>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0", toneStyle[rs.tone])}>
                  {rs.label}
                </span>
                {/* Only offered where the RPC would actually allow it. An admin
                    pause shows no Resume button because resume_ad_campaign
                    refuses the vendor, and a button that always fails is worse
                    than no button. */}
                {(rs.action === "pause" || rs.action === "resume") && (
                  <button
                    onClick={() => onToggle(a.id, rs.action === "pause" ? "paused" : "active")}
                    className="text-[11px] font-semibold text-[#f75f71] hover:underline shrink-0"
                  >
                    {rs.action === "pause" ? "Pause" : "Resume"}
                  </button>
                )}
                {rs.action === "edit_and_resubmit" && (
                  <button
                    onClick={() => setEditing(a)}
                    className="text-[11px] font-semibold text-brand-vendor hover:underline shrink-0"
                  >
                    Edit and resubmit
                  </button>
                )}
                <button onClick={() => onDelete(a.id)} className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-1.5 pl-12 text-[11px] text-gray-500">{rs.reason}</p>
              {/* The part the Cosora team does by hand (Mitra, 2026-11-17). */}
              {hasManualAdType(a.placement) && (() => {
                const work = manualWork?.get(a.id);
                const doneAt = work?.doneAt ?? null;
                const approved = !["pending_review", "changes_requested", "rejected"].includes(a.status);
                return (
                  <p className="mt-1 pl-12 text-[11px] font-medium text-amber-800" data-testid="manual-ad-status">
                    {doneAt
                      ? `Set up by the Cosora team on ${new Date(doneAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`
                      : approved
                        ? "The Cosora team is setting up the part that runs outside the app."
                        : "After approval, the Cosora team sets up the part that runs outside the app."}
                    {work?.messages ? ` ${work.messages.toLocaleString("en-IN")} broadcast messages per listing.` : ""}
                  </p>
                );
              })()}
              {/* Cosora stopped or flagged it: the vendor can ask why, about this campaign (P3e). */}
              {rs.tone === "attention" && (
                <Link
                  to={supportChatHref({ category: "vendor_ads", entityType: "ad", entityId: a.id })}
                  className="mt-1 ml-12 inline-block text-[11px] font-semibold text-brand-vendor underline"
                >
                  Contact support
                </Link>
              )}
            </div>
          );
        })}
      </div>
      <EditCampaignDialog
        adId={editing?.id ?? null}
        reason={moderationReasonText(editing?.moderationReason, reasonLabels)}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

// ── Get verified (SH-093, Mitra 2026-11-17: "Sell them to Free sellers") ──
// The Trusted Seal and the Verified Certificate, bought on their own by any registered seller on any plan. The server
// fixes what is bought (_shared/adPricing.ts verificationSpec: the seal 30 days, the certificate a year, no listing);
// payment is never approval: the badge appears when Cosora approves it, and the certificate is printed and posted.
const VERIFY_OPTIONS = [
  { id: "trustedSeal" as const, title: "Trusted Seal", Icon: Shield,
    body: "A trusted-seller badge on your store and on every one of your product cards.",
    term: `${VERIFICATION_DAYS.trustedSeal} days from approval` },
  { id: "verifiedCertificate" as const, title: "Cosora Verified Certificate", Icon: BadgeCheck,
    body: "A printed certificate posted to your business address, and the badge on your store and product cards.",
    term: "1 year of the badge from approval" },
];

function GetVerified({ vendorId, planGrantsSeal, planName, registered, onCreated }: {
  vendorId?: string; planGrantsSeal: boolean; planName: string;
  registered: SellerRegistration | undefined; onCreated: () => void;
}) {
  const [chosen, setChosen] = useState<"trustedSeal" | "verifiedCertificate" | null>(null);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [quote, setQuote] = useState<AdQuote | null>(null);
  const [quoteNote, setQuoteNote] = useState<string | null>(null);
  const [bought, setBought] = useState<string | null>(null);
  const spec = (id: string): AdSpec => ({ placementIds: [id], days: VERIFICATION_DAYS[id] ?? 30, items: [], campaignLabel: id });
  const price = chosen ? computeOrderRupees([chosen], VERIFICATION_DAYS[chosen] ?? 30, 0) : 0;
  const payable = quote ? quote.total : price;
  // The server refuses an unregistered seller too (_shared/adOrderChecks.ts, SH-096); this says so before they pick.
  const notRegistered = registered ? !canPublish(registered) : false;

  const choose = (id: "trustedSeal" | "verifiedCertificate") => {
    setChosen(id); setQuote(null); setQuoteNote(null); setBought(null);
  };
  const done = (title: string, description: string) => {
    onCreated(); setQuote(null); setBought(chosen); setChosen(null);
    toast.success(title, { description, duration: 20_000 });
  };
  const applyCode = async (code: string): Promise<string | null> => {
    if (!chosen) return null;
    setQuoteNote(null);
    const res = await quoteAdDiscount(spec(chosen), code);
    if (!res.quote) return res.message;
    setQuote(res.quote);
    return null;
  };
  const publishDemo = async () => {
    if (!chosen) return;
    const res = await publishDemoAds(spec(chosen), quote?.code);
    if (!res.ok && res.error === "discount") { setPayOpen(false); setQuote(null); setQuoteNote(discountRefusal(res.reason)); return; }
    if (!res.ok) throw new Error(res.message || res.error || "Couldn't complete the purchase");
    done("Sent for Cosora's review", "Your badge appears once Cosora approves it. Your days start then.");
  };
  const buy = async () => {
    if (!vendorId || !chosen) { toast.error("Sign in as a seller first"); return; }
    setBusy(true);
    try {
      const order = await createRazorpayOrder(spec(chosen), quote?.code);
      if (order.discountReason) { setQuote(null); setQuoteNote(discountRefusal(order.discountReason)); return; }
      if (!order.configured) { setPayOpen(true); return; }
      if (order.free) {
        const published = await publishFreeAdOrder(order.orderId!);
        if (published.ok) done("Sent for Cosora's review", "Your badge appears once Cosora approves it.");
        else toast.error("We couldn't set it up", { description: "Nothing was charged. Please try again." });
        return;
      }
      const res = await openRazorpayCheckout({
        keyId: order.keyId!, orderId: order.orderId!, amount: order.amount,
        name: "Cosora", description: chosen === "trustedSeal" ? "Trusted Seal" : "Cosora Verified Certificate",
        timeout: quote ? DISCOUNT_CHECKOUT_TIMEOUT_S : undefined,
      });
      const verified = await verifyRazorpayPayment({
        orderId: res.razorpay_order_id, paymentId: res.razorpay_payment_id, signature: res.razorpay_signature,
      });
      const m = paidAdOutcome(verified, res.razorpay_payment_id, 1);
      if (verified.ok) done(m.title, "Your badge appears once Cosora approves it. It's listed under Your Campaigns.");
      else (m.kind === "success" ? toast.success : toast.error)(m.title, { description: m.description, duration: m.long ? 60_000 : undefined });
    } catch (e) {
      if (e instanceof Error && e.message === "dismissed") toast.info("Payment cancelled");
      else toast.error("Checkout failed", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="get-verified" className="scroll-mt-24 rounded-xl border border-gray-200 bg-white p-4 md:p-6 lg:p-8" data-testid="get-verified">
      <h3 className="text-lg font-bold text-gray-900 md:text-xl lg:text-2xl">Get verified</h3>
      <p className="mt-1 text-sm text-gray-600">
        On any plan, Free included. Bought on its own: no campaign or listing needed. Cosora reviews it first.
      </p>
      {notRegistered && (
        <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Finish your seller registration first. Once Cosora approves it, you can get verified.
        </p>
      )}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {VERIFY_OPTIONS.map((o) => {
          const included = o.id === "trustedSeal" && planGrantsSeal;
          const on = chosen === o.id;
          return (
            <button key={o.id} type="button" disabled={included || Boolean(notRegistered)} aria-pressed={on}
              onClick={() => choose(o.id)} data-testid={`verify-${o.id}`}
              className={cn("flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors disabled:cursor-not-allowed",
                on ? "border-[#FF6B6B] bg-[#fff5f5]" : "border-gray-100 hover:border-gray-200",
                (included || notRegistered) && "opacity-70")}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff5f5]">
                <o.Icon className="h-5 w-5 text-[#f75f71]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-gray-900">{o.title}</span>
                  {included
                    ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">Included in {planName}</span>
                    : <span className="text-base font-bold tabular-nums text-gray-900">₹{computeOrderRupees([o.id], VERIFICATION_DAYS[o.id], 0)}</span>}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-gray-500">{o.body}</span>
                <span className="mt-1.5 block text-xs font-semibold text-gray-700">{included ? "Already on your profile while your plan runs" : o.term}</span>
              </span>
            </button>
          );
        })}
      </div>
      {bought && !chosen && (
        <p className="mt-4 text-sm text-gray-600" role="status">Bought. It's listed under Your Campaigns while Cosora reviews it.</p>
      )}
      {chosen && (
        <div className="mt-5 space-y-3 md:max-w-md">
          <DiscountCodeField
            applied={quote ? { code: quote.code, discount: quote.discount } : null}
            onApply={applyCode}
            onRemove={() => { setQuote(null); setQuoteNote(null); }}
            disabled={busy}
          />
          {quoteNote && <p className="text-xs text-destructive" role="alert">{quoteNote}</p>}
          <button onClick={buy} disabled={busy} data-testid="verify-buy"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff2160] py-3.5 text-base font-bold text-white transition-all hover:bg-[#ff2160]/80 disabled:opacity-60">
            {busy ? "Processing…" : payable > 0 ? <>{`Pay · ₹${payable.toLocaleString("en-IN")}`}<ChevronRight className="h-5 w-5" /></> : <>Get it for free<ChevronRight className="h-5 w-5" /></>}
          </button>
        </div>
      )}
      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} amount={payable}
        days={chosen ? VERIFICATION_DAYS[chosen] : 30} productCount={0} onPaid={publishDemo} />
    </section>
  );
}

const Advertisements = () => {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: myAds = [] } = useMyAds(user?.id);
  const { data: myProducts = [] } = useMyProducts(user?.id);
  const { data: vplan } = useVendorPlan(user?.id);
  const { data: vendorCats = [] } = useVendorCategories(user?.id);
  // Plan ad-location scope drives ad enforcement: Free can't run ads; paid tiers
  // can target up to 1 / 4 / unlimited locations (pan-India / global).
  const adScope = (vplan?.limits.ad_location_scope ?? "none") as AdLocationScope;
  const canAds = canRunAds(adScope);
  const cityLimit = adStateAllowance(adScope);
  const scopeLabel = AD_SCOPE_LABEL[adScope];
  // State targeting (subscriptions P5), for accounts the ad_state_targeting switch lists:
  // the picker offers states, and on VIP countries, in place of the older city chips.
  const stateTargeting = useFeatureFlag("ad_state_targeting") === true;
  const { data: homeState } = useVendorHomeState(user?.id, stateTargeting);
  // Whether the vendor's plan already grants the trust seal (so they aren't
  // charged again for the trustedSeal/verifiedCertificate ad types).
  const planGrantsSeal = Boolean(vplan?.limits.has_verified_badge);
  const planName = vplan?.plan.name ?? "your";
  const refreshAds = () => qc.invalidateQueries({ queryKey: ["advertisements"] });
  // A paid order clears the builder (SH-091): Pay used to come back with the same selection, and a second tap bought
  // the campaign again (create-order makes a new order every time).
  const afterPurchase = () => {
    refreshAds();
    setSelectedProducts([]);
    setSelectedGoals([]);
  };
  // Only live listings can be advertised (SH-095): ads serve live listings only, and the server refuses the rest.
  const liveProducts = myProducts.filter((p) => p.status === "active");
  const sellerRegistered = useSellerRegistration(user?.id).data;
  // Goes through pause_ad_campaign_by_vendor / resume_ad_campaign, not a bare
  // UPDATE: an RLS-denied UPDATE matches zero rows and reports success, so the
  // vendor would be told the campaign paused while it kept running. The RPCs
  // raise, so a refusal actually lands in the catch below — including the
  // deliberate refusal to let a vendor lift an admin's pause.
  const toggleAd = async (id: string, status: "active" | "paused") => {
    try { await setCampaignRunning(id, status === "active"); refreshAds(); } catch (e) { toast.error("Update failed", { description: errorMessage(e) }); }
  };
  const removeAd = async (id: string) => {
    try { await deleteAd(id); refreshAds(); toast.success("Campaign removed"); } catch (e) { toast.error("Delete failed", { description: errorMessage(e) }); }
  };
  const [selectedAdTypes, setSelectedAdTypes] = useState<string[]>(["openListing"]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedDuration, setSelectedDuration] = useState("7");
  const [broadcastMessages, setBroadcastMessages] = useState(String(BROADCAST_MESSAGES.initial));
  // Targeting defaults are empty = untargeted (shown to everyone); the vendor
  // opts in to category/city targeting.
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  // A plan that reaches one or four states starts on the vendor's own state, once.
  const seededState = useRef(false);
  useEffect(() => {
    if (!stateTargeting || seededState.current || !homeState || !Number.isFinite(cityLimit) || cityLimit < 1) return;
    seededState.current = true;
    setSelectedCities((cur) => (cur.length ? cur : [homeState]));
  }, [stateTargeting, homeState, cityLimit]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [showMoreAdTypes, setShowMoreAdTypes] = useState(false);
  const hasAds = myAds.length > 0;

  return (
    <DashboardLayout registrationBanner>
        <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="pb-20 lg:pb-4">
          <AdvHeader />
          {/* Mobile keeps the 4xl reading column; desktop opens up to a real
              dashboard canvas so the content stops sitting in a narrow strip. */}
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 lg:max-w-6xl lg:px-0 lg:py-0 lg:space-y-8 xl:max-w-[1400px]">
            <motion.div variants={section}>
              <HeroSection />
            </motion.div>
            <motion.div variants={section}>
              <StatsGrid />
            </motion.div>
            {/* Campaigns and the shortcut panel pair up into one row on desktop. */}
            <motion.div
              variants={section}
              className={cn(
                "space-y-6 lg:space-y-8",
                hasAds && "min-[1400px]:grid min-[1400px]:grid-cols-3 min-[1400px]:gap-6 min-[1400px]:items-stretch min-[1400px]:space-y-0",
              )}
            >
              {hasAds && (
                <div className="min-[1400px]:col-span-2">
                  <MyCampaigns ads={myAds} onToggle={toggleAd} onDelete={removeAd} />
                </div>
              )}
              <CompetitorAdsLink inRail={hasAds} />
            </motion.div>
            <motion.div variants={section}>
              <PricingHeader />
            </motion.div>
            {/* Builder + checkout: stacked on mobile, side-by-side with a sticky
                summary rail once there is room for both. */}
            <motion.div variants={section} className="space-y-6 min-[1400px]:space-y-0 min-[1400px]:grid min-[1400px]:grid-cols-[minmax(0,1fr)_300px] min-[1400px]:gap-6 min-[1400px]:items-start">
              <AdCreationSteps
                products={liveProducts}
                selectedAdTypes={selectedAdTypes} setSelectedAdTypes={setSelectedAdTypes}
                selectedProducts={selectedProducts} setSelectedProducts={setSelectedProducts}
                selectedDuration={selectedDuration} setSelectedDuration={setSelectedDuration}
                selectedCities={selectedCities} setSelectedCities={setSelectedCities}
                selectedCategories={selectedCategories} setSelectedCategories={setSelectedCategories}
                selectedGoals={selectedGoals} setSelectedGoals={setSelectedGoals}
                showMoreAdTypes={showMoreAdTypes} setShowMoreAdTypes={setShowMoreAdTypes}
                cityLimit={cityLimit} scopeLabel={scopeLabel}
                vendorCats={vendorCats} planGrantsSeal={planGrantsSeal} planName={planName}
                stateTargeting={stateTargeting} allowCountries={adScope === "global"}
                selectedCountries={selectedCountries} setSelectedCountries={setSelectedCountries}
                broadcastMessages={broadcastMessages} setBroadcastMessages={setBroadcastMessages}
              />
              <div className="min-[1400px]:sticky min-[1400px]:top-24">
                <CostSummary
                  products={liveProducts}
                  selectedAdTypes={selectedAdTypes}
                  selectedProducts={selectedProducts}
                  selectedDuration={selectedDuration}
                  selectedCategories={selectedCategories}
                  selectedCities={selectedCities}
                  vendorId={user?.id}
                  onCreated={afterPurchase}
                  canAds={canAds}
                  stateTargeting={stateTargeting}
                  selectedCountries={selectedCountries}
                  broadcastMessages={broadcastMessages}
                />
              </div>
            </motion.div>
            <motion.div variants={section}>
              <GetVerified
                vendorId={user?.id}
                planGrantsSeal={planGrantsSeal}
                planName={planName}
                registered={sellerRegistered}
                onCreated={refreshAds}
              />
            </motion.div>
            <motion.div variants={section}>
              <HowAdvertisingWorks />
            </motion.div>
            <motion.div variants={section}>
              <FAQSection />
            </motion.div>
            <motion.div variants={section}>
              <WhyCosoraSection />
            </motion.div>
            <motion.div variants={section}>
              <ManufacturersSection />
            </motion.div>
            <motion.div variants={section}>
              <CTASection />
            </motion.div>
            <motion.div variants={section}>
              <AdvertiseCards />
            </motion.div>
          </div>
        </motion.div>
      </DashboardLayout>
  );
};

export default Advertisements;