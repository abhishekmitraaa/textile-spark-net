import { useState, useEffect } from "react";
import homeBanner1 from "@/assets/vendorhome/homebanner1.jpg";
import homeBanner from "@/assets/vendorhome/homebanner2.png";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, Bell, Eye, MessageSquare,
  Package, FileText, TrendingUp,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { BusinessProfileScore } from "@/components/dashboard/BusinessProfileScore";
import { SellerQuickActionsGrid } from "@/components/dashboard/SellerQuickActionsGrid";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useVendorDashboard } from "@/lib/queries/vendorDashboard";
import { useMyProducts } from "@/lib/queries/products";
import { useOpenRfqs } from "@/lib/queries/rfqs";
import { useConversations } from "@/lib/queries/chat";

// Strong ease-out: starts fast, gives instant perceived feedback
const E = [0.23, 1, 0.32, 1] as [number, number, number, number];

const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};

// For lists inside sections — tighter stagger, shorter travel
const listContainer = {
  show: { transition: { staggerChildren: 0.055 } },
};

const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};

const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const SellerHome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: dash } = useVendorDashboard(user?.id);
  const { data: myProducts = [] } = useMyProducts(user?.id);
  const { data: openRfqs = [] } = useOpenRfqs(user?.id);
  const { data: conversations = [] } = useConversations();
  const [currentSlide, setCurrentSlide] = useState(0);
  const reduced = useReducedMotion();

  // Real dashboard lists (were hardcoded fixtures).
  const topProducts = [...myProducts]
    .filter((p) => p.status === "active")
    .sort((a, b) => b.inquiries - a.inquiries)
    .slice(0, 3);
  const recentLeads = openRfqs.slice(0, 3);
  const recentMessages = conversations.slice(0, 3);
  const initialsOf = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const analysisStats = [
    { label: "Live Products", value: String(dash?.productsLive ?? 0),  change: `${dash?.productsUnderReview ?? 0} under review`, up: true,  Icon: Package },
    { label: "Open Leads",    value: String(dash?.openLeads ?? 0),     change: "Active buyer RFQs",                             up: true,  Icon: Eye },
    { label: "Inquiries",     value: String(dash?.enquiries ?? 0),     change: "From interested buyers",                        up: true,  Icon: TrendingUp },
    { label: "Your Quotes",   value: String(dash?.quotesSent ?? 0),    change: `${dash?.quotesAccepted ?? 0} accepted`,         up: true,  Icon: FileText },
  ];

  useEffect(() => {
    const t = setInterval(() => setCurrentSlide((s) => (s === 0 ? 1 : 0)), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <DashboardLayout>
      {/* Mobile keeps the signed-off single 512px column, so every desktop rule
          below is gated behind `lg:` and nothing moves under 1024px.

          At desktop the eleven stacked sections become a 12-column grid. The DOM
          order is deliberately left untouched — grid auto-placement follows it —
          so the mobile reading order survives exactly. Spans are chosen so every
          row sums to 12 with no orphan cells (12 / 7+5 / 12 / 12 / 7+5 / 7+5 /
          7+5), which lands the list-style panels in the left column and the
          promo/action cards in the right without a second wrapper element. */}
      <motion.div
        className="mx-auto max-w-2xl space-y-4 lg:grid lg:max-w-6xl lg:grid-cols-12 lg:gap-5 lg:space-y-0"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >
        {/* 1. PAGE HEADER */}
        <motion.div variants={section} className="lg:col-span-12">
          <h1 className="text-xl font-semibold text-foreground lg:text-2xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Welcome back! Here's an overview of your business.</p>
        </motion.div>

        {/* 2. PROMO BANNER CAROUSEL */}
        <motion.div variants={section} className="relative h-48 rounded-xl overflow-hidden lg:col-span-7 lg:h-64">
          {/* Slide 1 */}
          <div
            className="absolute inset-0"
            style={{
              opacity: currentSlide === 0 ? 1 : 0,
              transform: `translateX(${currentSlide === 0 ? 0 : 100}%)`,
              transition: "opacity 480ms cubic-bezier(0.23,1,0.32,1), transform 480ms cubic-bezier(0.23,1,0.32,1)",
            }}
          >
            <img
              src={homeBanner}
              alt="Advertise on Cosora"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center 30%",
                transform: "scale(0.85)",
                transformOrigin: "center",
              }}
            />
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute inset-0 p-4 flex flex-col justify-between">
              <p className="text-base font-semibold text-white relative z-10">
                Get Prime Placement Above Competitors
              </p>
              <Link to="/advertisement-slideshow">
                <motion.div whileTap={TAP} transition={TAP_T} className="w-fit">
                  <Button size="sm" className="h-7 text-xs rounded-full bg-white text-accent hover:bg-white/90 relative z-10">
                    Advertise Now →
                  </Button>
                </motion.div>
              </Link>
            </div>
          </div>

          {/* Slide 2 */}
          <div
            className="absolute inset-0"
            style={{
              opacity: currentSlide === 1 ? 1 : 0,
              transform: `translateX(${currentSlide === 1 ? 0 : -100}%)`,
              transition: "opacity 480ms cubic-bezier(0.23,1,0.32,1), transform 480ms cubic-bezier(0.23,1,0.32,1)",
            }}
          >
            <img
              src={homeBanner1}
              alt="Upload Products"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center 30%",
                transform: "scale(0.85)",
                transformOrigin: "center",
              }}
            />
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute inset-0 p-4 flex flex-col justify-between">
              <p className="text-base font-semibold text-white relative z-10">
                Upload Products & Get More Leads
              </p>
              <Link to="/upload">
                <motion.div whileTap={TAP} transition={TAP_T} className="w-fit">
                  <Button size="sm" className="h-7 text-xs rounded-full bg-white text-accent hover:bg-white/90 relative z-10">
                    Add Products →
                  </Button>
                </motion.div>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* 3. BUSINESS PROFILE SCORE — sits beside the banner and matches its
               height, so the two hero cards read as one band. */}
        <motion.div variants={section} className="lg:col-span-5">
          <BusinessProfileScore />
        </motion.div>

        {/* 4. QUICK ACTIONS GRID */}
        <motion.div variants={section} className="lg:col-span-12">
          <SellerQuickActionsGrid />
        </motion.div>

        {/* 5. ANALYSIS PANEL */}
        <motion.div variants={section} className="lg:col-span-12">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
            <h3 className="text-base font-bold text-gray-900 mb-3">Analysis</h3>

            {/* Stat grid — each card staggers in */}
            {/* 2x2 on mobile; the full row of four at desktop, where the panel
                spans all twelve columns and a 2x2 would leave half of it empty. */}
            <motion.div
              className="grid grid-cols-2 gap-3 mb-3 lg:grid-cols-4 lg:gap-4"
              variants={listContainer}
              initial="hidden"
              animate="show"
            >
              {analysisStats.map(s => (
                <motion.div key={s.label} variants={listItem} className="bg-gray-50 rounded-xl p-3 lg:p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">{s.label}</span>
                    <s.Icon className="w-4 h-4 text-accent/70" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  <p className={`text-xs mt-0.5 ${s.up ? "text-green-600" : "text-red-500"}`}>{s.change}</p>
                </motion.div>
              ))}
            </motion.div>

            <Link to="/analytics">
              <motion.button
                whileTap={TAP}
                transition={TAP_T}
                className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-accent transition-colors mb-4 group"
              >
                View All
                <motion.span
                  className="inline-flex"
                  whileHover={{ x: 3 }}
                  transition={{ ease: E, duration: 0.2 }}
                >
                  <ArrowRight className="w-4 h-4" />
                </motion.span>
              </motion.button>
            </Link>

            {/* RFQ alert */}
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 flex items-center justify-between">
              <div className="flex items-start gap-2.5">
                <Bell className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Get notified for matching RFQs</p>
                  <p className="text-xs text-gray-500">Set up alerts for your product categories</p>
                </div>
              </div>
              <Link to="/leads">
                <motion.button
                  whileTap={TAP}
                  transition={TAP_T}
                  className="ml-3 shrink-0 px-4 py-2 rounded-lg border border-accent text-accent text-xs font-bold hover:bg-accent/10 transition-colors"
                >
                  Set Alerts
                </motion.button>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* 6. TOP PERFORMING PRODUCTS */}
        <motion.div variants={section} className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:h-full lg:p-5">
            <h3 className="text-base font-bold text-gray-900 mb-3">Top Performing Products</h3>
            <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-0">
              {topProducts.map((p) => (
                <motion.div
                  key={p.id}
                  variants={listItem}
                  onClick={() => navigate(`/upload?id=${p.id}`)}
                  className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <img src={p.image} alt={p.name} className="w-11 h-11 rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.inquiries} inquiries</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">₹{p.price}</p>
                    <p className="text-xs text-gray-400">{p.views.toLocaleString("en-IN")} views</p>
                  </div>
                </motion.div>
              ))}
              {topProducts.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">
                  No live products yet. <Link to="/upload" className="font-semibold text-accent">Add a product</Link> to start getting inquiries.
                </p>
              )}
            </motion.div>
            <Link to="/products">
              <motion.button
                whileTap={TAP}
                transition={TAP_T}
                className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-accent transition-colors mt-3 group"
              >
                View All
                <motion.span className="inline-flex" whileHover={{ x: 3 }} transition={{ ease: E, duration: 0.2 }}>
                  <ArrowRight className="w-4 h-4" />
                </motion.span>
              </motion.button>
            </Link>
          </div>
        </motion.div>

        {/* 7. ADD PRODUCT + BROWSE QUOTES */}
        <motion.div variants={section} className="space-y-2 lg:col-span-5 lg:flex lg:flex-col lg:justify-center lg:space-y-3">
          {[
            { icon: "＋", iconBg: "bg-accent/10", iconColor: "text-accent", title: "Add New Product", subtitle: "Showcase your products to buyers", to: "/upload" },
            { icon: "🔍", iconBg: "bg-blue-50",   iconColor: "text-blue-600", title: "Browse Quotes",  subtitle: "Find new business opportunities",  to: "/quotes" },
          ].map(cta => (
            <Link key={cta.title} to={cta.to}>
              <motion.div
                whileTap={TAP}
                transition={TAP_T}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${cta.iconBg} flex items-center justify-center text-lg shrink-0`}>
                    <span className={cta.iconColor}>{cta.icon}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{cta.title}</p>
                    <p className="text-xs text-gray-400">{cta.subtitle}</p>
                  </div>
                </div>
                <motion.span
                  className="inline-flex"
                  whileHover={{ x: 3 }}
                  transition={{ ease: E, duration: 0.2 }}
                >
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </motion.span>
              </motion.div>
            </Link>
          ))}
        </motion.div>

        {/* 8. RECENT LEADS */}
        <motion.div variants={section} className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:h-full lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Recent Leads</h3>
              <Link to="/leads">
                <motion.button
                  whileTap={TAP}
                  transition={TAP_T}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  View All
                </motion.button>
              </Link>
            </div>
            <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-3">
              {recentLeads.map((lead) => (
                <motion.div
                  key={lead.id}
                  variants={listItem}
                  onClick={() => navigate("/leads")}
                  className="border border-gray-100 rounded-xl p-3 cursor-pointer hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {lead.image ? (
                        <img src={lead.image} alt={lead.productName} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                          <Package className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 truncate">{lead.productName}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${lead.alreadyQuoted ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                            {lead.alreadyQuoted ? "Quoted" : "New"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{lead.title}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600 mb-3">
                    <span className="bg-gray-100 px-2 py-0.5 rounded-full">📦 {lead.units.toLocaleString("en-IN")} pcs</span>
                    {lead.priceMax > 0 && <span className="bg-gray-100 px-2 py-0.5 rounded-full">₹{lead.priceMin}–{lead.priceMax}</span>}
                    <span className="text-gray-400">🕐 {lead.date}</span>
                  </div>
                  <motion.button
                    whileTap={TAP}
                    transition={TAP_T}
                    onClick={(e) => { e.stopPropagation(); navigate("/leads"); }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors"
                  >
                    {lead.alreadyQuoted ? "View quote" : "Send a quote"}
                  </motion.button>
                </motion.div>
              ))}
              {recentLeads.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">No open buyer requirements right now. Check back soon.</p>
              )}
            </motion.div>
          </div>
        </motion.div>

        {/* 9. BOOST YOUR PROFILE — a short nudge card paired with the much taller
               Recent Leads. Centring it in the row beats stretching it, which
               would blow a 130px card up to 450px of empty peach. */}
        <motion.div variants={section} className="lg:col-span-5 lg:flex lg:flex-col lg:justify-center">
          <div className="bg-[#fff5f0] border border-orange-100 rounded-2xl p-4 flex items-start gap-3 lg:p-5">
            <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-orange-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">Boost Your Profile</p>
              <p className="text-xs text-gray-500 mt-0.5">Add 3 more products to increase your visibility by 40% and attract more buyers.</p>
              <Link to="/advertisements">
                <motion.button
                  whileTap={TAP}
                  transition={TAP_T}
                  className="mt-2 px-3 py-1 rounded-full border-2 border-yellow-400 bg-yellow-50 text-xs font-bold text-yellow-800 hover:bg-yellow-100 transition-colors"
                >
                  advertise
                </motion.button>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* 10. RECENT MESSAGES */}
        <motion.div variants={section} className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:h-full lg:p-5">
            <h3 className="text-base font-bold text-gray-900 mb-3">Recent Messages</h3>
            <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-0">
              {recentMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  variants={listItem}
                  onClick={() => navigate(`/chats/${msg.id}`)}
                  className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div className="relative shrink-0">
                    {msg.avatar ? (
                      <img src={msg.avatar} alt={msg.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 text-xs font-bold">
                        {initialsOf(msg.name)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{msg.name}</p>
                    <p className="text-xs text-gray-500 truncate">{msg.lastMessage}</p>
                    {msg.timestamp && <p className="text-xs text-gray-400 mt-0.5">{msg.timestamp}</p>}
                  </div>
                </motion.div>
              ))}
              {recentMessages.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">No messages yet. Buyer conversations will show up here.</p>
              )}
            </motion.div>
            <Link to="/chat">
              <motion.button
                whileTap={TAP}
                transition={TAP_T}
                className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-accent transition-colors mt-3"
              >
                View All Messages
                <motion.span className="inline-flex" whileHover={{ x: 3 }} transition={{ ease: E, duration: 0.2 }}>
                  <ArrowRight className="w-4 h-4" />
                </motion.span>
              </motion.button>
            </Link>
          </div>
        </motion.div>

        {/* 11. COMPETITOR'S ADVERTISEMENTS */}
        <motion.div variants={section} className="lg:col-span-5 lg:flex lg:flex-col lg:justify-center">
          <motion.div
            whileHover={{ scale: 1.012 }}
            whileTap={{ scale: 0.98 }}
            transition={{ ease: E, duration: 0.2 }}
            className="bg-gradient-to-br from-[#ef4d62] to-[#f97316] rounded-2xl p-4 text-white lg:p-5"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-base font-bold">Competitor's Advertisements</p>
                <p className="text-sm text-white/80 mt-0.5">See what your competitors are doing & stay ahead</p>
              </div>
            </div>
            <Link to="/competitor-ads">
              <motion.button
                whileTap={TAP}
                transition={TAP_T}
                className="w-full bg-white text-gray-900 text-sm font-bold py-2.5 rounded-xl hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
              >
                View Competitor Ads
                <motion.span className="inline-flex" whileHover={{ x: 3 }} transition={{ ease: E, duration: 0.2 }}>
                  <ArrowRight className="w-4 h-4" />
                </motion.span>
              </motion.button>
            </Link>
          </motion.div>
        </motion.div>

      </motion.div>
    </DashboardLayout>
  );
};

export default SellerHome;
