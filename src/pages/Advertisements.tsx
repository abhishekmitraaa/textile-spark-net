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
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMyAds, updateAdStatus, deleteAd, useVendorCategories, type AdRow } from "@/lib/queries/ads";
import { useMyProducts, type VendorProductRow } from "@/lib/queries/products";
import { createRazorpayOrder, openRazorpayCheckout, verifyRazorpayPayment, publishDemoAds, type AdSpec } from "@/lib/queries/payments";
import { useVendorPlan } from "@/lib/queries/subscriptions";
import { adStateAllowance, canRunAds, AD_SCOPE_LABEL, type AdLocationScope } from "@/lib/plan";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Phone, Eye, Users, TrendingUp, TrendingDown, PhoneMissed,
  MousePointerClick, ChevronLeft, ChevronRight, X, Plus, Check,
  Building2, ShoppingBag, List, Calendar, Zap, Shield, BadgeCheck,
  Globe, Smartphone, Monitor, Facebook, BarChart3, Award, Radio,
  Search, Star, Store, Megaphone,
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

interface Story {
  duration: number;
  bg: string;
  title: string;
  subtitle: string;
}

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const STATS = [
  { Icon: Phone,           value: "77",    label: "Phone Calls Received",    subtext: "8 today",                  trend: "down", color: "text-red-600",    bg: "bg-red-50"    },
  { Icon: Eye,             value: "27.2K", label: "Business Profile Views",  subtext: "+12% this week",            trend: "up",   color: "text-green-600",  bg: "bg-green-50"  },
  { Icon: Users,           value: "186",   label: "Leads Generated",         subtext: "+23% this month",           trend: "up",   color: "text-purple-600", bg: "bg-purple-50" },
  { Icon: TrendingUp,      value: "₹3",    label: "Avg. Cost/Lead",          subtext: "avg. per month",            trend: "up",   color: "text-orange-600", bg: "bg-orange-50" },
  { Icon: PhoneMissed,     value: "17",    label: "Missed Calls",            subtext: "in the last one month",     trend: "down", color: "text-red-600",    bg: "bg-red-50"    },
  { Icon: MousePointerClick,value: "5K",   label: "Ad Clicks",              subtext: "+12% this week",            trend: "up",   color: "text-green-600",  bg: "bg-green-50"  },
] as const;

const AD_TYPES: AdType[] = [
  { id: "openListing",          name: "Open Listing Ad",             price: "₹22",  period: "/day", Icon: Megaphone,    description: "Boost your visibility in the open marketplace. Your products will be showcased to a wider audience browsing the general listings.", image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop" },
  { id: "searchListing",        name: "Search Listing Ad",           price: "₹35",  period: "/day", Icon: Search,       description: "Appear at the top of search results when buyers look for products in your category. Targeted visibility for intent-driven buyers.", image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop" },
  { id: "featuredProduct",      name: "Featured Product",            price: "₹55",  period: "/day", Icon: Star,         description: "Premium placement for your key products on category pages. The highest-visibility position for serious buyers.", image: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=800&auto=format&fit=crop" },
  { id: "storePromotion",       name: "Store Promotion",             price: "₹99",  period: "/day", Icon: Store,        description: "Promote your entire store for maximum brand exposure. Best for building long-term relationships with bulk buyers.", image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800&auto=format&fit=crop" },
  { id: "directBroadcast",      name: "Direct Broadcast",            price: "₹15",  period: "/msg", Icon: Radio,        description: "Send direct messages to targeted buyers who match your product category. Pay only per message sent.", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=800&auto=format&fit=crop" },
  { id: "wholesalerPick",       name: "Wholesaler Pick Ad",          price: "₹59",  period: "",     Icon: ShoppingBag,  description: "Get featured in the exclusive Wholesaler Pick section. 72-hour guaranteed exposure with bumps.", image: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=800&auto=format&fit=crop" },
  { id: "brandAd",              name: "Brand Ad",                    price: "₹69",  period: "",     Icon: Award,        description: "Showcase your entire brand story and collection. Drives visits via store and key product exposures.", image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800&auto=format&fit=crop" },
  { id: "websiteBanner",        name: "Website Banner Ad",           price: "₹89",  period: "/day", Icon: Globe,        description: "Large scale visibility on the Cosora desktop website. Maximum impact for site-wide brand awareness.", image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop" },
  { id: "mobileBanner",         name: "Mobile Banner Ad",            price: "₹99",  period: "/day", Icon: Smartphone,   description: "Optimized banners for the Cosora mobile app. Reach on-the-go buyers with high-converting mobile placements.", image: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?q=80&w=800&auto=format&fit=crop" },
  { id: "webMobileCombo",       name: "Web & Mobile Combo",          price: "₹129", period: "",     Icon: Monitor,      description: "The ultimate visibility package. Reach buyers across all devices with synchronized desktop and mobile banners.", image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop" },
  { id: "fbInsta",              name: "Facebook & Instagram Ad",     price: "₹59",  period: "",     Icon: Facebook,     description: "Leverage social media to drive traffic to your Cosora store. Reaches buyers outside the platform.", image: "https://images.unsplash.com/photo-1611162617263-435d74236edc?q=80&w=800&auto=format&fit=crop" },
  { id: "googleProduct",        name: "Google Product Ad",           price: "₹59",  period: "",     Icon: BarChart3,    description: "Appear in Google search results and shopping tab. Captures high-intent buyers actively searching.", image: "https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?q=80&w=800&auto=format&fit=crop" },
  { id: "socialCombo",          name: "Social Media Combo",          price: "₹99",  period: "",     Icon: Megaphone,    description: "Combined reach of Facebook, Instagram and Google. Maximum off-platform exposure.", image: "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?q=80&w=800&auto=format&fit=crop" },
  { id: "trustedSeal",          name: "Trusted Seal & Verified Badge",price: "₹44", period: "",     Icon: Shield,       description: "Boost conversion with a trusted seller badge on your profile and all product cards.", image: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?q=80&w=800&auto=format&fit=crop" },
  { id: "verifiedCertificate",  name: "Cosora Verified Certificate", price: "₹199", period: "",     Icon: BadgeCheck,   description: "Official premium trust signal. Verified certificate displayed on your full profile.", image: "https://images.unsplash.com/photo-1523240715639-99a86501111b?q=80&w=800&auto=format&fit=crop" },
];

// Ad types that grant a time-bound trust seal (mirrors the edge function).
const SEAL_AD_TYPES = new Set(["trustedSeal", "verifiedCertificate"]);
// A campaign goal pre-selects the placement types that actually serve it — this
// is what makes the goal picker do something real (see toggleGoal).
const GOAL_PLACEMENTS: Record<string, string[]> = {
  visitProfile: ["storePromotion", "brandAd"],
  visitWebsite: ["websiteBanner", "googleProduct"],
  messageYou: ["directBroadcast"],
  mixOfActions: ["featuredProduct", "searchListing"],
};

const WHY_FEATURES = [
  { title: "Verified B2B Buyers Only",    desc: "Every buyer is vetted. No resellers, no time-wasters.",                              bg: "bg-pink-50",   color: "text-pink-600"   },
  { title: "Fashion & Sourcing Focus",    desc: "Built specifically for fashion, textiles, and related industries.",                   bg: "bg-orange-50", color: "text-orange-600" },
  { title: "Built for Manufacturers",     desc: "Not resellers, not retailers—designed for those who make products.",                  bg: "bg-pink-50",   color: "text-pink-600"   },
  { title: "India & Global Reach",        desc: "Connect with domestic and international buyers from one platform.",                   bg: "bg-blue-50",   color: "text-blue-600"   },
  { title: "Convert Views to Enquiries",  desc: "Platform designed to turn visibility into real business leads.",                      bg: "bg-orange-50", color: "text-orange-600" },
  { title: "No Wasted Traffic",           desc: "Every impression is a potential business opportunity.",                              bg: "bg-pink-50",   color: "text-pink-600"   },
];

const MANUFACTURERS_CARDS = [
  { title: "Made for Manufacturers", desc: "Not resellers or retailers" },
  { title: "Export + Domestic",      desc: "Reach buyers worldwide"     },
  { title: "Growing Ecosystem",      desc: "Join thousands of suppliers" },
  { title: "Trusted Platform",       desc: "Secure & verified buyers"   },
];

const SUCCESS_STORIES = [
  { name: "Rajesh Chhabria", business: "Chhabria and Sons", type: "sanitaryware dealers",   years: 13 },
  { name: "Varsha Mehta",    business: "V2 Modular",        type: "makeup artist",          years: 8  },
  { name: "Amit Kumar",      business: "Fashion Hub",        type: "garment manufacturer",   years: 5  },
  { name: "Priya Singh",     business: "Silk Route Exports", type: "fabric exporter",        years: 7  },
  { name: "Deepak Sharma",   business: "Cotton King",        type: "textile wholesaler",     years: 11 },
  { name: "Neha Gupta",      business: "Weave Masters",      type: "loom manufacturer",      years: 4  },
];

const FAQS = [
  { q: "How does advertising on Cosora work?",    a: "Cosora advertising helps you reach millions of potential customers searching for businesses like yours. You create targeted ads, set your budget, choose your audience, and track performance in real-time." },
  { q: "What is the minimum budget required?",    a: "You can start advertising with as little as ₹22/day. You have complete control over your daily and total budget, and can adjust anytime." },
  { q: "How long does it take for my ad to go live?", a: "Once you complete the ad creation and make payment, your ad goes live instantly. No approval delays." },
  { q: "Can I target specific cities or regions?", a: "Yes! You can target ads to specific cities, states, or all of India. Our targeting helps you reach the right audience in the right location." },
  { q: "How do I track my ad performance?",       a: "Our dashboard provides real-time analytics including impressions, clicks, calls, and conversions — accessible 24/7." },
  { q: "Can I pause or stop my ad campaign?",     a: "Absolutely. You can pause, resume, or stop your ads at any time. No long-term commitments or cancellation fees." },
];

const INTRO_STORIES: Story[] = [
  { duration: 3000, bg: "from-blue-600 to-blue-800",     title: "Welcome to Cosora",      subtitle: "Discover the power of advertising"          },
  { duration: 3000, bg: "from-purple-600 to-purple-800", title: "Reach Your Audience",    subtitle: "Connect with customers in your area"        },
  { duration: 3000, bg: "from-green-500 to-green-700",   title: "Easy Ad Creation",       subtitle: "Create stunning ads in minutes"             },
  { duration: 3000, bg: "from-teal-500 to-teal-700",     title: "Target Your Market",     subtitle: "Precise audience targeting"                 },
  { duration: 3000, bg: "from-orange-500 to-orange-700", title: "Get Started Today!",     subtitle: "Start advertising and grow your business"  },
];

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

// ── IntroStories ──
function IntroStories({ onComplete }: { onComplete: () => void }) {
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualNav = useRef(false);

  useEffect(() => {
    if (paused) return;
    setProgress(0);
    manualNav.current = false;
    const duration = INTRO_STORIES[current].duration;
    const startTime = Date.now();

    const tick = () => {
      if (manualNav.current) return;
      const pct = Math.min(((Date.now() - startTime) / duration) * 100, 100);
      setProgress(pct);
      if (pct >= 100 && !manualNav.current) {
        if (current < INTRO_STORIES.length - 1) setCurrent(p => p + 1);
        else onComplete();
      }
    };

    intervalRef.current = setInterval(tick, 50);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [current, paused, onComplete]);

  const go = (dir: "prev" | "next") => {
    manualNav.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (dir === "prev" && current > 0) setCurrent(p => p - 1);
    else if (dir === "next") { if (current < INTRO_STORIES.length - 1) setCurrent(p => p + 1); else onComplete(); }
  };

  const handleClick = (e: React.MouseEvent) => {
    go(e.clientX < window.innerWidth / 2 ? "prev" : "next");
  };

  const story = INTRO_STORIES[current];

  return (
    <div className="fixed inset-0 z-[99999] bg-black">
      {/* Progress bars */}
      <div className="absolute top-3 left-3 right-3 z-[100000] flex gap-1">
        {INTRO_STORIES.map((_, i) => (
          <div key={i} className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-white transition-all duration-100 ease-linear"
              style={{ width: i < current ? "100%" : i === current ? `${progress}%` : "0%" }} />
          </div>
        ))}
      </div>

      {/* Close */}
      <button onClick={onComplete}
        className="absolute top-3 right-3 z-[100001] bg-black/50 text-white rounded-full p-2 hover:bg-black/70">
        <X size={24} />
      </button>

      {/* Content */}
      <div className="w-full h-full cursor-pointer"
        onClick={handleClick}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}>
        <div className={cn("w-full h-full bg-gradient-to-br flex flex-col items-center justify-center p-8 text-white", story.bg)}>
          <h1 className="text-4xl font-bold mb-4 text-center">{story.title}</h1>
          <p className="text-xl text-center opacity-90">{story.subtitle}</p>
          {current === INTRO_STORIES.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); onComplete(); }}
              className="mt-8 bg-white text-orange-600 px-8 py-3 rounded-full font-bold text-lg hover:bg-gray-100 transition-colors">
              Create Your Ad
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Header ──
function AdvHeader() {
  const navigate = useNavigate();
  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
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
    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold mb-2 text-gray-900">Boost Your Visibility</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Promote your products to reach more buyers and get quality leads
          </p>
        </div>
        <a href="#adCreationSteps"
          className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors whitespace-nowrap">
          Start Advertising
        </a>
      </div>
    </div>
  );
}

// ── StatsGrid ──
function StatsGrid() {
  return (
    <motion.div variants={listContainer} className="grid grid-cols-2 gap-3">
      {STATS.map((s, i) => (
        <motion.div key={i} variants={listItem} className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={cn("p-2 rounded-lg", s.bg)}>
                <s.Icon className={cn("w-5 h-5", s.color)} />
              </div>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            </div>
            {s.trend === "up"
              ? <TrendingUp className="w-4 h-4 text-green-500" />
              : <TrendingDown className="w-4 h-4 text-red-500" />}
          </div>
          <div className="text-xs text-gray-600 mb-1">{s.label}</div>
          <div className={cn("text-xs font-medium", s.trend === "up" ? "text-green-600" : "text-red-600")}>
            {s.subtext}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── CompetitorAds ──
function CompetitorAdsLink() {
  const navigate = useNavigate();
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-4">
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

      <div className="border-t border-gray-100" />

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
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="text-center">
        <div className="text-orange-600 text-sm font-semibold mb-2">PAY PER AD</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Simple, Transparent Pricing</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
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
}: {
  products: VendorProductRow[];
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
}) {
  const [expandedId, setExpandedId] = useState<string | null>("openListing");

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

  const displayed = showMoreAdTypes ? AD_TYPES : AD_TYPES.slice(0, 5);

  const DURATIONS = [{ value: "3", label: "3" }, { value: "7", label: "7" }, { value: "14", label: "14" }, { value: "30", label: "30" }];
  const CITIES = ["mumbai", "delhi", "allIndia", "south", "chennai", "kolkata", "west", "export", "pune", "ahmedabad"];
  const CITY_LABELS: Record<string, string> = { mumbai: "Mumbai", delhi: "Delhi", allIndia: "All India", south: "South", chennai: "Chennai", kolkata: "Kolkata", west: "West", export: "Export", pune: "Pune", ahmedabad: "Ahmedabad" };
  const GOALS = [
    { value: "visitProfile",  title: "Visit your profile",  desc: "Best for brand awareness and follows"   },
    { value: "visitWebsite",  title: "Visit your website",  desc: "Best for online sales and bookings"     },
    { value: "messageYou",    title: "Message you",         desc: "Best for building direct trust"         },
    { value: "mixOfActions",  title: "A mix of actions",    desc: "Best for multiple goals"                },
  ];

  return (
    <section id="adCreationSteps" className="bg-white rounded-xl p-4 md:p-6 border border-gray-200">
      <div className="mb-6">
        <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2">Create Your Ad in 3 Steps</h3>
        <p className="text-sm text-gray-600">Select products from your catalogue, choose targeting, and go live instantly</p>
      </div>

      <div className="space-y-12">
        {/* ── Step 1: Ad Type ── */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-[#f75f71] text-white flex items-center justify-center text-sm font-bold shadow-md">1</div>
            <h4 className="text-base md:text-lg font-bold text-gray-900">Choose Ad Type</h4>
          </div>

          <div className="space-y-3 pl-0 md:pl-11">
            <div className="grid grid-cols-1 gap-3">
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
              className="w-full py-3 rounded-xl font-bold text-sm text-[#FF6B6B] bg-[#fff5f5] hover:bg-[#fff0f0] transition-all border border-[#FF6B6B]/20">
              {showMoreAdTypes ? "Show Less" : `More (${AD_TYPES.length - 5} more options)`}
            </button>
          </div>
        </div>

        {/* ── Step 2: Products & Duration ── */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-[#f75f71] text-white flex items-center justify-center text-sm font-bold shadow-md">2</div>
            <h4 className="text-base md:text-lg font-bold text-gray-900">Select Products</h4>
          </div>

          <div className="pl-0 md:pl-11 space-y-8">
            {/* Product tiles — the vendor's real live products */}
            <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <h5 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Pick the products to promote
              </h5>
              {products.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-6 text-center">
                  <p className="text-sm text-gray-500 mb-3">You have no products yet. Upload a product to advertise it.</p>
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
              <div className="grid grid-cols-4 gap-3 mt-4">
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

            <div className="grid grid-cols-1 gap-4">
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

              {/* City — plan-scope-limited selection, persisted on the ad.
                  Honest note: geo-based delivery filtering isn't live yet. */}
              <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">City / Area</span>
                  </div>
                  <span className="rounded-full bg-[#256fef]/10 text-[#256fef] text-[10px] font-bold px-2 py-0.5">
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
      toast.error("Payment failed", { description: e instanceof Error ? e.message : String(e) });
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
              <p className="text-[11px] text-gray-500 mt-1">{productCount} product{productCount > 1 ? "s" : ""} · {days} days</p>
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

// ── CostSummary ──
function CostSummary({
  products, selectedAdTypes, selectedProducts, selectedDuration, selectedCategories, selectedCities, vendorId, onCreated, canAds,
}: {
  products: VendorProductRow[]; selectedAdTypes: string[]; selectedProducts: string[]; selectedDuration: string;
  selectedCategories: string[]; selectedCities: string[];
  vendorId?: string; onCreated: () => void; canAds: boolean;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!selectedAdTypes.length || !selectedProducts.length || !selectedDuration) return null;

  // Free tier can't run ads (ad_location_scope = none) — show an upsell instead
  // of the checkout so enforcement happens at the point of action.
  if (!canAds) {
    return (
      <div className="bg-white rounded-xl p-6 border border-amber-200 mt-6 text-center">
        <p className="text-base font-bold text-gray-900 mb-1">Advertising is a paid feature</p>
        <p className="text-sm text-gray-500 mb-4">Your current (Free) plan can't run ad campaigns. Upgrade to a paid plan to promote your products.</p>
        <Link to="/subscription" className="inline-flex items-center gap-1.5 rounded-2xl bg-[#ff2160] px-6 py-3 text-sm font-bold text-white hover:bg-[#ff2160]/80 transition-colors">
          View plans <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const days = parseInt(selectedDuration) || 1;
  const perProductPerRun = selectedAdTypes.reduce((sum, id) => {
    const ad = AD_TYPES.find(a => a.id === id);
    if (!ad) return sum;
    const price = parseInt(ad.price.replace("₹", ""));
    const runDays = ad.period === "/msg" ? 1 : days;
    return sum + price * runDays;
  }, 0);
  const total = perProductPerRun * selectedProducts.length;
  const dailyBudget = Math.max(1, Math.round(perProductPerRun / days));
  const campaignLabel = selectedAdTypes.map(id => AD_TYPES.find(a => a.id === id)?.name).filter(Boolean).join(", ") || "Ad";

  const buildSpec = (): AdSpec => ({
    placementIds: selectedAdTypes,
    days,
    campaignLabel,
    items: selectedProducts.map((pid) => {
      const prod = products.find(p => p.id === pid);
      return { productId: pid, title: prod?.name ?? "Product", imageUrl: prod?.image ?? null };
    }),
    // Real targeting persisted on the campaign row (see edge functions).
    targetCategories: selectedCategories.length ? selectedCategories : undefined,
    targetCities: selectedCities.length ? selectedCities : undefined,
  });

  // Fallback (no Razorpay keys): publish server-side from the spec after the
  // simulated checkout. Used by the mock PaymentModal. Ads are still created by
  // the server (the edge function), never inserted directly by the client.
  const publishDemo = async () => {
    const res = await publishDemoAds(buildSpec());
    if (!res.ok) throw new Error(res.error || "Could not publish ads");
    onCreated();
    toast.success("Payment successful — your ads are live!", {
      description: `${res.count ?? selectedProducts.length} campaign${(res.count ?? selectedProducts.length) > 1 ? "s" : ""} now showing to buyers.`,
    });
  };

  // Primary path: real Razorpay checkout. Server creates the order + amount,
  // Razorpay collects payment, the server verifies the signature and publishes.
  const startCheckout = async () => {
    if (!vendorId) { toast.error("Sign in as a vendor to advertise"); return; }
    const spec = buildSpec();
    setBusy(true);
    try {
      const order = await createRazorpayOrder(spec);
      if (!order.configured) {
        // Gateway not wired yet → simulated checkout.
        setPayOpen(true);
        return;
      }
      const res = await openRazorpayCheckout({
        keyId: order.keyId!,
        orderId: order.orderId!,
        amount: order.amount,
        name: "Cosora Ads",
        description: `${selectedProducts.length} campaign${selectedProducts.length > 1 ? "s" : ""} · ${days} days`,
      });
      const verified = await verifyRazorpayPayment({
        orderId: res.razorpay_order_id,
        paymentId: res.razorpay_payment_id,
        signature: res.razorpay_signature,
      });
      if (verified.ok) {
        onCreated();
        toast.success("Payment successful — your ads are live!", {
          description: `${verified.count ?? selectedProducts.length} campaign${(verified.count ?? selectedProducts.length) > 1 ? "s" : ""} now showing to buyers.`,
        });
      } else {
        toast.error("Payment could not be verified", { description: "You were not charged. Please try again." });
      }
    } catch (e) {
      if (e instanceof Error && e.message === "dismissed") toast.info("Payment cancelled");
      else toast.error("Checkout failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 mt-6">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-gray-600 text-base">Estimated Cost:</span>
          <span className="text-4xl font-bold text-gray-900">₹{total.toLocaleString("en-IN")}</span>
          <span className="text-gray-600 text-base">for {selectedDuration} days</span>
        </div>
        <p className="text-sm text-gray-500">
          {selectedAdTypes.map(id => AD_TYPES.find(a => a.id === id)?.price).join(" + ")}/day × {selectedDuration} days × {selectedProducts.length} product{selectedProducts.length > 1 ? "s" : ""}
        </p>
      </div>

      <button onClick={startCheckout} disabled={busy}
        className="w-full bg-[#ff2160] text-white py-4 rounded-2xl font-bold text-lg hover:bg-[#ff2160]/80 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 disabled:opacity-60">
        {busy ? "Processing…" : <>Pay &amp; Publish · ₹{total.toLocaleString("en-IN")}<ChevronRight className="w-5 h-5" /></>}
      </button>

      <div className="grid grid-cols-2 gap-4 mt-6">
        {["No minimum spend", "Start from ₹22/day", "Go live instantly", "Pause or stop anytime"].map(b => (
          <div key={b} className="flex items-center gap-2">
            <div className="w-2 h-2 bg-pink-500 rounded-full" />
            <span className="text-sm text-gray-600">{b}</span>
          </div>
        ))}
      </div>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        amount={total}
        days={days}
        productCount={selectedProducts.length}
        onPaid={publishDemo}
      />
    </div>
  );
}

// ── SuccessStoriesCarousel ──
function SuccessStoriesCarousel() {
  const [idx, setIdx] = useState(0);
  const [cardW, setCardW] = useState(85);

  useEffect(() => {
    const update = () => {
      if (window.innerWidth < 768) setCardW(85);
      else if (window.innerWidth < 1024) setCardW(46);
      else setCardW(31);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const max = SUCCESS_STORIES.length - 1;

  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100 mt-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Success Stories</h2>
          <p className="text-gray-600 text-sm">5.9 Lakh+ Advertisers</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIdx(p => p === 0 ? max : p - 1)}
            className="w-10 h-10 bg-white rounded-full shadow-sm border border-gray-100 flex items-center justify-center hover:bg-gray-50 transition-all active:scale-90">
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <button onClick={() => setIdx(p => p === max ? 0 : p + 1)}
            className="w-10 h-10 bg-white rounded-full shadow-sm border border-gray-100 flex items-center justify-center hover:bg-gray-50 transition-all active:scale-90">
            <ChevronRight className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${idx * cardW}%)` }}>
          {SUCCESS_STORIES.map((s, i) => (
            <div key={i} className="w-[85%] md:w-[46%] lg:w-[31%] shrink-0 px-2">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 h-full">
                <div className="relative mb-6 rounded-xl">
                  <div className="w-full h-48 bg-gray-100 rounded-xl flex items-center justify-center">
                    <Building2 className="w-16 h-16 text-gray-300" />
                  </div>
                  <div className="absolute bottom-[-15px] left-3">
                    <button className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg border-4 border-gray-100">
                      <svg className="w-5 h-5 text-blue-600 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{s.name}</h3>
                  <p className="text-sm text-gray-600 mb-3 flex flex-col">
                    <span className="font-semibold text-gray-700">{s.business}</span>
                    <span className="text-gray-500 text-xs tracking-wider font-bold mt-0.5">{s.type}</span>
                  </p>
                  <p className="text-xs text-gray-500 font-bold italic mb-4">Customer since {s.years} years</p>
                  <a href="#" className="inline-flex items-center gap-2 text-blue-600 font-bold text-sm hover:gap-3 transition-all">
                    Visit Business <ChevronRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center gap-2 mt-8">
        {SUCCESS_STORIES.slice(0, Math.ceil(SUCCESS_STORIES.length - (100 / cardW) + 1)).map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={cn("h-1.5 rounded-full transition-all duration-300",
              idx === i ? "bg-purple-600 w-8" : "bg-gray-200 hover:bg-gray-300 w-2")} />
        ))}
      </div>
    </div>
  );
}

// ── FAQSection ──
function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Frequently Asked Questions</h2>
        <p className="text-gray-600">Everything you need to know about advertising on Cosora</p>
      </div>
      <div className="max-w-3xl mx-auto space-y-4">
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
    <div className="p-6">
      <div className="text-center mb-8">
        <div className="text-pink-600 text-sm font-bold mb-2 uppercase tracking-wide">WHY COSORA</div>
        <h2 className="text-3xl font-bold text-gray-900 mb-3">The Platform That Gets You Orders</h2>
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
    <div className="bg-gray-900 border border-gray-800 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-4">
      {MANUFACTURERS_CARDS.map((c, i) => (
        <div key={i} className="p-5 flex flex-col items-center justify-center text-center">
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
    <div className="bg-gray-200 rounded-2xl p-8 text-center">
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
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
      <p className="text-gray-500 text-sm mt-6">Start with just ₹25/day • No long-term commitment • Cancel anytime</p>
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
      <h2 className="text-lg font-bold text-gray-900 mb-4">Popular ad types</h2>
      <motion.div variants={listContainer} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {featured.map((ad) => (
          <motion.div key={ad.id} variants={listItem}
            className="bg-white rounded-xl p-4 text-left flex gap-4 shadow-sm hover:shadow-2xl transition-all duration-500 group overflow-hidden border border-gray-100">
            <div className="h-full w-[120px] shrink-0 flex items-center justify-center">
              <div className="w-full h-24 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                <img src={ad.image} alt={ad.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              </div>
            </div>
            <div className="mt-1 flex flex-col gap-2 flex-1 min-w-0">
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
  if (ads.length === 0) return null;
  const statusStyle: Record<string, string> = {
    active: "bg-green-100 text-green-700", paused: "bg-orange-100 text-orange-700",
    draft: "bg-gray-100 text-gray-500", ended: "bg-gray-100 text-gray-400",
  };
  const totalImpr = ads.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
  const ctr = (clicks: number, impr: number) => (impr > 0 ? ((clicks / impr) * 100).toFixed(1) : "0.0");
  const activeCount = ads.filter((a) => a.status === "active").length;
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200">
      <h3 className="text-sm font-bold text-gray-900 mb-3">Your Campaigns ({ads.length})</h3>

      {/* Analytics summary across all campaigns */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: "Active", value: String(activeCount) },
          { label: "Impressions", value: totalImpr.toLocaleString("en-IN") },
          { label: "Clicks", value: totalClicks.toLocaleString("en-IN") },
          { label: "CTR", value: `${ctr(totalClicks, totalImpr)}%` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-[#fff5f5] border border-[#FF6B6B]/15 p-2.5 text-center">
            <p className="text-base font-extrabold text-gray-900 leading-none">{s.value}</p>
            <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {ads.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
            <div className="w-9 h-9 rounded-lg bg-[#fff5f5] flex items-center justify-center shrink-0 overflow-hidden">
              {a.imageUrl ? <img src={a.imageUrl} alt="" className="h-full w-full object-cover" /> : <Megaphone className="w-4 h-4 text-[#f75f71]" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
              <p className="text-[11px] text-gray-400">
                {a.dailyBudget != null ? `₹${a.dailyBudget}/day · ` : ""}{a.impressions.toLocaleString("en-IN")} impressions · {a.clicks.toLocaleString("en-IN")} clicks · {ctr(a.clicks, a.impressions)}% CTR
              </p>
            </div>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0", statusStyle[a.status])}>
              {a.status}
            </span>
            {(a.status === "active" || a.status === "paused") && (
              <button
                onClick={() => onToggle(a.id, a.status === "active" ? "paused" : "active")}
                className="text-[11px] font-semibold text-[#f75f71] hover:underline shrink-0"
              >
                {a.status === "active" ? "Pause" : "Resume"}
              </button>
            )}
            <button onClick={() => onDelete(a.id)} className="p-1 text-gray-400 hover:text-red-500 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

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
  // Whether the vendor's plan already grants the trust seal (so they aren't
  // charged again for the trustedSeal/verifiedCertificate ad types).
  const planGrantsSeal = Boolean(vplan?.limits.has_verified_badge);
  const planName = vplan?.plan.name ?? "your";
  const refreshAds = () => qc.invalidateQueries({ queryKey: ["advertisements"] });
  const toggleAd = async (id: string, status: "active" | "paused") => {
    try { await updateAdStatus(id, status); refreshAds(); } catch (e) { toast.error("Update failed", { description: e instanceof Error ? e.message : String(e) }); }
  };
  const removeAd = async (id: string) => {
    try { await deleteAd(id); refreshAds(); toast.success("Campaign removed"); } catch (e) { toast.error("Delete failed", { description: e instanceof Error ? e.message : String(e) }); }
  };
  const [showIntro, setShowIntro] = useState(false);
  const [selectedAdTypes, setSelectedAdTypes] = useState<string[]>(["openListing"]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedDuration, setSelectedDuration] = useState("7");
  // Targeting defaults are empty = untargeted (shown to everyone); the vendor
  // opts in to category/city targeting.
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [showMoreAdTypes, setShowMoreAdTypes] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("hasSeenAdvertiseIntro");
    if (!seen) setShowIntro(true);
  }, []);

  const handleIntroComplete = () => {
    localStorage.setItem("hasSeenAdvertiseIntro", "true");
    setShowIntro(false);
  };

  return (
    <>
      {showIntro && <IntroStories onComplete={handleIntroComplete} />}
      <DashboardLayout>
        <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="pb-20">
          <AdvHeader />
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            <motion.div variants={section}>
              <HeroSection />
            </motion.div>
            <motion.div variants={section}>
              <StatsGrid />
            </motion.div>
            {myAds.length > 0 && (
              <motion.div variants={section}>
                <MyCampaigns ads={myAds} onToggle={toggleAd} onDelete={removeAd} />
              </motion.div>
            )}
            <motion.div variants={section}>
              <CompetitorAdsLink />
            </motion.div>
            <motion.div variants={section}>
              <PricingHeader />
            </motion.div>
            <motion.div variants={section}>
              <AdCreationSteps
                products={myProducts}
                selectedAdTypes={selectedAdTypes} setSelectedAdTypes={setSelectedAdTypes}
                selectedProducts={selectedProducts} setSelectedProducts={setSelectedProducts}
                selectedDuration={selectedDuration} setSelectedDuration={setSelectedDuration}
                selectedCities={selectedCities} setSelectedCities={setSelectedCities}
                selectedCategories={selectedCategories} setSelectedCategories={setSelectedCategories}
                selectedGoals={selectedGoals} setSelectedGoals={setSelectedGoals}
                showMoreAdTypes={showMoreAdTypes} setShowMoreAdTypes={setShowMoreAdTypes}
                cityLimit={cityLimit} scopeLabel={scopeLabel}
                vendorCats={vendorCats} planGrantsSeal={planGrantsSeal} planName={planName}
              />
            </motion.div>
            <motion.div variants={section}>
              <CostSummary
                products={myProducts}
                selectedAdTypes={selectedAdTypes}
                selectedProducts={selectedProducts}
                selectedDuration={selectedDuration}
                selectedCategories={selectedCategories}
                selectedCities={selectedCities}
                vendorId={user?.id}
                onCreated={refreshAds}
                canAds={canAds}
              />
            </motion.div>
            <motion.div variants={section}>
              <SuccessStoriesCarousel />
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
    </>
  );
};

export default Advertisements;