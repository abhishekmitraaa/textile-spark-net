import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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

const ADVERTISE_CARDS = [
  { title: "Open Listing AD",      original: "120", current: "67",  discount: "44% off" },
  { title: "Category Top AD",      original: "250", current: "149", discount: "40% off" },
  { title: "Search Banner AD",     original: "500", current: "299", discount: "40% off" },
  { title: "Home Slider AD",       original: "800", current: "499", discount: "38% off" },
  { title: "Product Detail AD",    original: "150", current: "89",  discount: "41% off" },
  { title: "Push Notification AD", original: "300", current: "179", discount: "40% off" },
];

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
    <div className="grid grid-cols-2 gap-3">
      {STATS.map((s, i) => (
        <div key={i} className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow">
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
        </div>
      ))}
    </div>
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
  selectedAdTypes, setSelectedAdTypes,
  selectedProducts, setSelectedProducts,
  selectedDuration, setSelectedDuration,
  selectedGender, setSelectedGender,
  selectedCities, setSelectedCities,
  selectedCategories, setSelectedCategories,
  selectedGoals, setSelectedGoals,
  showMoreAdTypes, setShowMoreAdTypes,
}: {
  selectedAdTypes: string[]; setSelectedAdTypes: (v: string[]) => void;
  selectedProducts: number[]; setSelectedProducts: (v: number[]) => void;
  selectedDuration: string; setSelectedDuration: (v: string) => void;
  selectedGender: string; setSelectedGender: (v: string) => void;
  selectedCities: string[]; setSelectedCities: (v: string[]) => void;
  selectedCategories: string[]; setSelectedCategories: (v: string[]) => void;
  selectedGoals: string[]; setSelectedGoals: (v: string[]) => void;
  showMoreAdTypes: boolean; setShowMoreAdTypes: (v: boolean) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>("openListing");

  const toggleAdType = (ad: AdType) => {
    if (selectedAdTypes.includes(ad.id)) {
      setSelectedAdTypes(selectedAdTypes.filter(id => id !== ad.id));
      if (expandedId === ad.id) setExpandedId(null);
    } else {
      setSelectedAdTypes([...selectedAdTypes, ad.id]);
      setExpandedId(ad.id);
    }
  };

  const toggleProduct = (i: number) => {
    setSelectedProducts(
      selectedProducts.includes(i) ? selectedProducts.filter(p => p !== i) : [...selectedProducts, i]
    );
  };

  const toggleCity = (v: string) => {
    setSelectedCities(selectedCities.includes(v) ? selectedCities.filter(c => c !== v) : [...selectedCities, v]);
  };

  const toggleCategory = (v: string) => {
    if (v === "all") { setSelectedCategories(["all"]); return; }
    const next = selectedCategories.includes(v)
      ? selectedCategories.filter(c => c !== v)
      : [...selectedCategories.filter(c => c !== "all"), v];
    setSelectedCategories(next.length === 0 ? ["all"] : next);
  };

  const toggleGoal = (v: string) => {
    setSelectedGoals(selectedGoals.includes(v) ? selectedGoals.filter(g => g !== v) : [...selectedGoals, v]);
  };

  const displayed = showMoreAdTypes ? AD_TYPES : AD_TYPES.slice(0, 5);

  const DURATIONS = [{ value: "3", label: "3" }, { value: "7", label: "7" }, { value: "14", label: "14" }, { value: "30", label: "30" }];
  const GENDERS = [{ value: "all", label: "All" }, { value: "men", label: "Men" }, { value: "women", label: "Women" }];
  const CITIES = ["mumbai", "delhi", "allIndia", "south", "chennai", "kolkata", "west", "export", "pune", "ahmedabad"];
  const CITY_LABELS: Record<string, string> = { mumbai: "Mumbai", delhi: "Delhi", allIndia: "All India", south: "South", chennai: "Chennai", kolkata: "Kolkata", west: "West", export: "Export", pune: "Pune", ahmedabad: "Ahmedabad" };
  const CATS = [
    { v: "all", l: "All" }, { v: "fabrics", l: "Fabrics" }, { v: "garments", l: "Garments" },
    { v: "accessories", l: "Accessories" }, { v: "footwear", l: "Footwear" }, { v: "homeTextiles", l: "Home Textiles" },
  ];
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
                    <div className="text-right flex items-center gap-1">
                      <span className="text-base font-bold text-gray-900">{ad.price}</span>
                      <span className="text-xs text-gray-500 font-medium">{ad.period}</span>
                    </div>
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
            {/* Product tiles */}
            <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <h5 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Pick your best products
              </h5>
              <div className="flex flex-wrap gap-4 mb-3">
                {[1, 2, 3].map(i => (
                  <button key={i} onClick={() => toggleProduct(i)}
                    className={cn(
                      "w-20 h-20 rounded-2xl border-2 transition-all flex items-center justify-center",
                      selectedProducts.includes(i)
                        ? "border-[#FF6B6B] bg-[#fff5f5] shadow-inner"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    )}>
                    <Building2 className={cn("w-8 h-8", selectedProducts.includes(i) ? "text-[#FF6B6B]" : "text-gray-300")} />
                  </button>
                ))}
                <button onClick={() => toggleProduct(4)}
                  className={cn(
                    "w-20 h-20 rounded-2xl border-2 border-dashed transition-all flex items-center justify-center",
                    selectedProducts.includes(4)
                      ? "border-[#FF6B6B] bg-[#fff5f5] shadow-inner"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}>
                  <Plus className={cn("w-8 h-8", selectedProducts.includes(4) ? "text-[#FF6B6B]" : "text-gray-300")} />
                </button>
              </div>
              <p className="text-xs text-gray-500 font-medium">Choose from your uploaded catalogue</p>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Gender */}
              <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Gender</span>
                </div>
                <div className="flex gap-2">
                  {GENDERS.map(g => (
                    <button key={g.value} onClick={() => setSelectedGender(g.value)}
                      className={cn(
                        "flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
                        selectedGender === g.value
                          ? "bg-[#f75f71] text-white shadow-md"
                          : "bg-white text-gray-700 border border-gray-100 hover:border-gray-200"
                      )}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* City */}
              <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">City / Area</span>
                </div>
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
                <button className="flex items-center gap-2 bg-gray-200/50 p-2 rounded-xl mt-3">
                  <Plus className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Add Location</span>
                </button>
              </div>

              {/* Category */}
              <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 md:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <List className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Category</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CATS.map(c => (
                    <button key={c.v} onClick={() => toggleCategory(c.v)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                        selectedCategories.includes(c.v)
                          ? "bg-[#f75f71] text-white shadow-md"
                          : "bg-white text-gray-600 border border-gray-100 hover:border-gray-200"
                      )}>
                      {c.l}
                    </button>
                  ))}
                  <button className="flex items-center gap-2 bg-gray-200/50 p-2 rounded-xl">
                    <Plus className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Add Category</span>
                  </button>
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

// ── CostSummary ──
function CostSummary({
  selectedAdTypes, selectedProducts, selectedDuration
}: {
  selectedAdTypes: string[]; selectedProducts: number[]; selectedDuration: string;
}) {
  if (!selectedAdTypes.length || !selectedProducts.length || !selectedDuration) return null;

  const total = selectedAdTypes.reduce((sum, id) => {
    const ad = AD_TYPES.find(a => a.id === id);
    if (!ad) return sum;
    const price = parseInt(ad.price.replace("₹", ""));
    const days = ad.period === "/msg" ? 1 : parseInt(selectedDuration);
    return sum + price * days * selectedProducts.length;
  }, 0);

  const handleCreate = () => {
    toast.success("Ad campaign created!", { description: "Your ad is now live." });
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 mt-6">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-gray-600 text-base">Estimated Cost:</span>
          <span className="text-4xl font-bold text-gray-900">₹{total}</span>
          <span className="text-gray-600 text-base">for {selectedDuration} days</span>
        </div>
        <p className="text-sm text-gray-500">
          {selectedAdTypes.map(id => AD_TYPES.find(a => a.id === id)?.price).join(" + ")}/day × {selectedDuration} days × {selectedProducts.length} product{selectedProducts.length > 1 ? "s" : ""}
        </p>
      </div>

      <button onClick={handleCreate}
        className="w-full bg-[#ff2160] text-white py-4 rounded-2xl font-bold text-lg hover:bg-[#ff2160]/80 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2">
        Create Your Ad
        <ChevronRight className="w-5 h-5" />
      </button>

      <div className="grid grid-cols-2 gap-4 mt-6">
        {["No minimum spend", "Start from ₹22/day", "Go live instantly", "Pause or stop anytime"].map(b => (
          <div key={b} className="flex items-center gap-2">
            <div className="w-2 h-2 bg-pink-500 rounded-full" />
            <span className="text-sm text-gray-600">{b}</span>
          </div>
        ))}
      </div>
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
function AdvertiseCards() {
  return (
    <div className="rounded-xl mt-12 mb-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ADVERTISE_CARDS.map((ad, i) => (
          <div key={i}
            className="bg-white rounded-xl p-4 text-left flex gap-4 shadow-sm hover:shadow-2xl transition-all duration-500 group overflow-hidden border border-gray-100">
            <div className="h-full w-[120px] flex items-center justify-center">
              <div className="w-full h-24 bg-gray-100 rounded-xl flex items-center justify-center group-hover:scale-90 transition-transform duration-700">
                <Megaphone className="w-10 h-10 text-gray-300" />
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-2 flex-1">
              <h3 className="text-lg font-black text-gray-900 leading-tight">{ad.title}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-gray-400 line-through text-sm font-bold italic opacity-70">₹{ad.original}/day</span>
                <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black uppercase">{ad.discount}</span>
                <span className="bg-[#f74d61] text-white text-[10px] px-2 py-0.5 rounded-full font-black uppercase flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Trending
                </span>
              </div>
              <div className="mt-1">
                <span className="text-gray-500 text-xs font-bold">Starting at</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-gray-900 tracking-tighter">₹{ad.current}</span>
                  <span className="text-gray-500 text-sm font-bold">/day</span>
                </div>
                <button className="mt-2 bg-gray-950 hover:bg-[#f74d61] text-white px-4 py-2 rounded-xl flex items-center gap-2 font-black text-[12px] transition-all active:scale-95 shadow-lg">
                  Buy Now <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
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
  const [showIntro, setShowIntro] = useState(false);
  const [selectedAdTypes, setSelectedAdTypes] = useState<string[]>(["openListing"]);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [selectedDuration, setSelectedDuration] = useState("7");
  const [selectedGender, setSelectedGender] = useState("all");
  const [selectedCities, setSelectedCities] = useState<string[]>(["allIndia"]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["all"]);
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
        <div className="pb-20">
          <AdvHeader />
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <HeroSection />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <StatsGrid />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <CompetitorAdsLink />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <PricingHeader />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <AdCreationSteps
                selectedAdTypes={selectedAdTypes} setSelectedAdTypes={setSelectedAdTypes}
                selectedProducts={selectedProducts} setSelectedProducts={setSelectedProducts}
                selectedDuration={selectedDuration} setSelectedDuration={setSelectedDuration}
                selectedGender={selectedGender} setSelectedGender={setSelectedGender}
                selectedCities={selectedCities} setSelectedCities={setSelectedCities}
                selectedCategories={selectedCategories} setSelectedCategories={setSelectedCategories}
                selectedGoals={selectedGoals} setSelectedGoals={setSelectedGoals}
                showMoreAdTypes={showMoreAdTypes} setShowMoreAdTypes={setShowMoreAdTypes}
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <CostSummary
                selectedAdTypes={selectedAdTypes}
                selectedProducts={selectedProducts}
                selectedDuration={selectedDuration}
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <SuccessStoriesCarousel />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
              <FAQSection />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <WhyCosoraSection />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
              <ManufacturersSection />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <CTASection />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
              <AdvertiseCards />
            </motion.div>
          </div>
        </div>
      </DashboardLayout>
    </>
  );
};

export default Advertisements;