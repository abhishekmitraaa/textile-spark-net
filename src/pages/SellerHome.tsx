import { useState, useEffect } from "react";
import homeBanner1 from "@/assets/vendorhome/homebanner1.jpg";
import homeBanner from "@/assets/vendorhome/homebanner2.jpg";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, BarChart2, Bell, Eye, FileText, Package, Plus, Search, TrendingUp,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { BusinessProfileScore } from "@/components/dashboard/BusinessProfileScore";
import { SellerQuickActionsGrid } from "@/components/dashboard/SellerQuickActionsGrid";
import { useAuth } from "@/contexts/AuthContext";
import { profileScoreSignals, useVendorDashboard } from "@/lib/queries/vendorDashboard";
import { useVendorEntitlements } from "@/lib/queries/entitlements";
import { NextStepCard } from "@/components/dashboard/NextStepCard";
import { priceText } from "@/lib/currency";
import { SellerHomeState } from "@/components/dashboard/SellerHomeState";

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
  const { user, loading } = useAuth();
  // One call (seller_home_summary) for the counts, the score and the three lists (SH-006).
  const dashQuery = useVendorDashboard(user?.id);
  const dash = dashQuery.data ?? undefined;
  const home = dash?.home;
  const listsLoading = Boolean(user) && dashQuery.isPending;
  const { data: entitlements } = useVendorEntitlements(user?.id);
  const alertsEntitled = Boolean(entitlements?.features.lead_alerts);
  const [currentSlide, setCurrentSlide] = useState(0);
  const reduced = useReducedMotion();

  const topProducts = home?.topProducts ?? [];
  const recentLeads = home?.recentLeads ?? [];
  const recentMessages = home?.recentChats ?? [];
  const when = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };
  const initialsOf = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const analysisStats = [
    { label: "Live Products", value: String(dash?.productsLive ?? 0),  change: `${dash?.productsUnderReview ?? 0} under review`, Icon: Package },
    { label: "Open Leads",    value: String((dash?.openLeads ?? 0) + (dash?.directRequests ?? 0)),     change: "Active buyer requirements",                     Icon: Eye },
    { label: "Inquiries",     value: String(dash?.enquiries ?? 0),     change: "Lifetime · from interested buyers",             Icon: TrendingUp },
    { label: "Your Quotes",   value: String(dash?.quotesSent ?? 0),    change: `${dash?.quotesAccepted ?? 0} accepted`,         Icon: FileText },
  ];

  useEffect(() => {
    const t = setInterval(() => setCurrentSlide((s) => (s === 0 ? 1 : 0)), 3500);
    return () => clearInterval(t);
  }, []);

  const blocked = loading
    ? "loading"
    : !user
      ? "signed-out"
      : dashQuery.isError
        ? "error"
        : dashQuery.isSuccess && dashQuery.data === null
          ? "not-a-seller"
          : null;
  if (blocked) {
    return (
      <DashboardLayout>
        <SellerHomeState state={blocked} onRetry={() => void dashQuery.refetch()} />
      </DashboardLayout>
    );
  }

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
        className="mx-auto flex max-w-2xl flex-col gap-4 lg:grid lg:max-w-6xl lg:grid-cols-12 lg:gap-5"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >
        {/* 1. PAGE HEADER */}
        <motion.div variants={section} className="lg:col-span-12">
          <h1 className="text-xl font-semibold text-foreground lg:text-2xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Here's an overview of your business.</p>
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
              <Link
                to="/advertisement-slideshow"
                className="relative z-10 inline-flex h-7 w-fit items-center rounded-full bg-white px-3 text-xs font-medium text-accent hover:bg-white/90"
              >
                Advertise Now →
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
              <Link
                to="/upload"
                className="relative z-10 inline-flex h-7 w-fit items-center rounded-full bg-white px-3 text-xs font-medium text-accent hover:bg-white/90"
              >
                Add Products →
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
          <SellerQuickActionsGrid done={{ website: dash?.profileChecks.website, email: dash?.profileChecks.email }} />
        </motion.div>

        {/* 5. ANALYSIS PANEL */}
        <motion.div variants={section} className="lg:col-span-12">
          <div data-testid="analysis-panel" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
            <h3 className="text-base font-bold text-gray-900 mb-3">Analysis</h3>
            <motion.div
              className="grid grid-cols-2 gap-3 mb-3 lg:grid-cols-4 lg:gap-4"
              variants={listContainer}
              initial="hidden"
              animate="show"
            >
              {analysisStats.map(s => (
                <motion.div key={s.label} variants={listItem} data-testid={`stat-${s.label}`} className="bg-gray-50 rounded-xl p-3 lg:p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">{s.label}</span>
                    <s.Icon className="w-4 h-4 text-accent/70" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{listsLoading ? "–" : s.value}</p>
                  <p className="text-xs mt-0.5 text-muted-foreground">{s.change}</p>
                </motion.div>
              ))}
            </motion.div>

            <Link to="/analytics" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-accent transition-colors">
              View All <ArrowRight className="w-4 h-4" />
            </Link>

            {/* Lead alerts are a plan feature (subscriptions P6): only a seller it belongs to is sent there. Nobody is
                promised a channel that isn't running (claude.md). */}
            <div data-testid="alerts-card" className="rounded-xl border border-accent/20 bg-accent/5 p-3 flex items-center justify-between">
              <div className="flex items-start gap-2.5">
                <Bell className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {alertsEntitled ? "Get alerts for new requirements" : "New requirements in your categories"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {alertsEntitled
                      ? "Choose how you hear about requirements that match you."
                      : "New requirements appear on your Leads page."}
                  </p>
                </div>
              </div>
              <Link
                to={alertsEntitled ? "/lead-alerts" : "/leads"}
                className="ml-3 shrink-0 px-4 py-2 rounded-lg border border-accent text-accent text-xs font-bold hover:bg-accent/10 transition-colors"
              >
                {alertsEntitled ? "Set up lead alerts" : "View Leads"}
              </Link>
            </div>
          </div>
        </motion.div>

        {/* 6. TOP PERFORMING PRODUCTS (left column on a laptop) */}
        <motion.div variants={section} className="order-1 lg:order-none lg:col-start-1 lg:col-span-7">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
            <h3 className="text-base font-bold text-gray-900 mb-3">Top Performing Products</h3>
            <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-0">
              {topProducts.map((p) => (
                <motion.div
                  key={p.id}
                  variants={listItem}
                  onClick={() => navigate(`/upload?id=${p.id}`)}
                  data-product-id={p.id}
                  className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
                >
                  {p.image
                    ? <img src={p.image} alt={p.name} className="w-11 h-11 rounded-lg object-cover shrink-0" />
                    : <div className="w-11 h-11 rounded-lg bg-muted shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate" data-no-translate>{p.name}</p>
                    <p className="text-xs text-gray-500">{p.inquiries} inquiries</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">{p.priceValue != null ? priceText("₹", p.priceValue) : "Price not set"}</p>
                    <p className="text-xs text-gray-400">{p.views.toLocaleString("en-IN")} views</p>
                  </div>
                </motion.div>
              ))}
              {listsLoading && <div className="h-14 animate-pulse rounded-lg bg-muted" />}
              {!listsLoading && topProducts.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">
                  No live products yet. <Link to="/upload" className="font-semibold text-accent">Add a product</Link> to start getting inquiries.
                </p>
              )}
            </motion.div>
            <Link to="/products" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-accent transition-colors">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>

        {/* 7. RIGHT COLUMN on a laptop: one stack, so its cards sit together without gaps (SH-025). On a phone the
               wrapper is `contents` and each card keeps its place in the reading order through `order`. */}
        <div className="contents lg:col-start-8 lg:col-span-5 lg:row-span-3 lg:flex lg:flex-col lg:gap-5">
          <motion.div variants={section} className="order-2 lg:order-none space-y-2 lg:space-y-3">
            {[
              { Icon: Plus, iconBg: "bg-accent/10", iconColor: "text-accent", title: "Add New Product", subtitle: "Showcase your products to buyers", to: "/upload" },
              { Icon: Search, iconBg: "bg-brand-vendor/10", iconColor: "text-brand-vendor", title: "Browse Leads", subtitle: "Find new buyer requirements", to: "/leads" },
            ].map(cta => (
              <Link
                key={cta.title}
                to={cta.to}
                data-right-card
                className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${cta.iconBg} flex items-center justify-center shrink-0`}>
                    <cta.Icon className={`w-4 h-4 ${cta.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{cta.title}</p>
                    <p className="text-xs text-gray-400">{cta.subtitle}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </Link>
            ))}
          </motion.div>

          {dash && (
            <motion.div variants={section} className="order-4 lg:order-none" data-right-card>
              <NextStepCard signals={profileScoreSignals(dash.scoreInput)} />
            </motion.div>
          )}

          <motion.div variants={section} className="order-6 lg:order-none" data-right-card>
            <div className="rounded-2xl bg-gradient-to-br from-brand-vendor to-[#1d5ed6] p-4 text-white lg:p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                  <BarChart2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-base font-bold">Category benchmarks</p>
                  <p className="text-sm text-white/80 mt-0.5">See how you compare in your categories</p>
                </div>
              </div>
              <Link
                to="/competitor-ads"
                className="w-full bg-white text-gray-900 text-sm font-bold py-2.5 rounded-xl hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
              >
                View benchmarks <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </div>

        {/* 8. RECENT LEADS: direct requests first, then the newest (seller_home_summary). */}
        <motion.div variants={section} className="order-3 lg:order-none lg:col-start-1 lg:col-span-7">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Recent Leads</h3>
              <Link to="/leads" className="text-xs font-medium text-accent hover:underline">View All</Link>
            </div>
            <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-3">
              {recentLeads.map((lead) => (
                <motion.div
                  key={lead.id}
                  variants={listItem}
                  onClick={() => navigate("/leads")}
                  data-lead-id={lead.id}
                  className="border border-gray-100 rounded-xl p-3 cursor-pointer hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <LeadThumb src={lead.image} alt={lead.productName} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 truncate" data-no-translate>{lead.productName}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${lead.quoted ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                            {lead.quoted ? "Quoted" : lead.direct ? "For you" : "New"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate" data-no-translate>{lead.title}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600 mb-3">
                    <span className="bg-gray-100 px-2 py-0.5 rounded-full">📦 {(lead.quantity ?? 0).toLocaleString("en-IN")} pcs</span>
                    {(lead.budgetMax ?? 0) > 0 && (
                      <span className="bg-gray-100 px-2 py-0.5 rounded-full">
                        {priceText("₹", lead.budgetMin ?? 0)}–{priceText("₹", lead.budgetMax ?? 0)}
                      </span>
                    )}
                    <span className="text-gray-400">🕐 {new Date(lead.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}</span>
                  </div>
                  <motion.button
                    whileTap={TAP}
                    transition={TAP_T}
                    onClick={(e) => { e.stopPropagation(); navigate("/leads"); }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors"
                  >
                    {lead.quoted ? "View quote" : "Send a quote"}
                  </motion.button>
                </motion.div>
              ))}
              {listsLoading && <div className="h-24 animate-pulse rounded-xl bg-muted" />}
              {!listsLoading && recentLeads.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">No open buyer requirements right now. Check back soon.</p>
              )}
            </motion.div>
          </div>
        </motion.div>

        {/* 9. RECENT MESSAGES */}
        <motion.div variants={section} className="order-5 lg:order-none lg:col-start-1 lg:col-span-7">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
            <h3 className="text-base font-bold text-gray-900 mb-3">Recent Messages</h3>
            <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-0">
              {recentMessages.map((msg) => (
                <motion.div
                  key={msg.otherId}
                  variants={listItem}
                  onClick={() => navigate(`/chats/${msg.otherId}`)}
                  data-chat-id={msg.otherId}
                  className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div className="relative shrink-0">
                    {msg.avatar ? (
                      <img src={msg.avatar} alt={msg.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 text-xs font-bold" data-no-translate>
                        {initialsOf(msg.name)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate" data-no-translate>{msg.name}</p>
                    <p className="text-xs text-gray-500 truncate" data-no-translate>{msg.lastMessage}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{when(msg.lastMessageAt)}</p>
                  </div>
                  {msg.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-white" aria-label={`${msg.unread} unread`}>
                      {msg.unread > 99 ? "99+" : msg.unread}
                    </span>
                  )}
                </motion.div>
              ))}
              {listsLoading && <div className="h-14 animate-pulse rounded-lg bg-muted" />}
              {!listsLoading && recentMessages.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">No messages yet. Buyer conversations will show up here.</p>
              )}
            </motion.div>
            <Link to="/chat" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-accent transition-colors">
              View All Messages <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>

      </motion.div>
    </DashboardLayout>
  );
};

/** A lead's picture, or the package icon when it has none or it fails to load (SH-018). */
function LeadThumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
        <Package className="w-4 h-4" />
      </div>
    );
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} className="w-8 h-8 rounded-lg object-cover shrink-0" />;
}

export default SellerHome;
