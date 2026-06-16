import { useState, useEffect } from "react";
import homeBanner1 from "@/assets/vendorhome/homebanner1.jpg";
import homeBanner from "@/assets/vendorhome/homebanner2.png";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Bell, Eye, MessageSquare,
  Package, FileText, TrendingUp,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { BusinessProfileScore } from "@/components/dashboard/BusinessProfileScore";
import { SellerQuickActionsGrid } from "@/components/dashboard/SellerQuickActionsGrid";
import { Button } from "@/components/ui/button";




const SellerHome = () => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCurrentSlide((s) => (s === 0 ? 1 : 0)), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-4 lg:space-y-6">
        {/* 1. PAGE HEADER */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl font-semibold font-display text-foreground lg:text-2xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Welcome back! Here's an overview of your business.</p>
        </motion.div>

        {/* 2. PROMO BANNER CAROUSEL */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative h-48 rounded-xl overflow-hidden"
        >
          {/* Slide 1 */}
          <div
            className="absolute inset-0 transition-all duration-500"
            style={{
              opacity: currentSlide === 0 ? 1 : 0,
              transform: `translateX(${currentSlide === 0 ? 0 : 100}%)`,
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
                <Button size="sm" className="h-7 text-xs rounded-full bg-white text-accent hover:bg-white/90 w-fit relative z-10">
                  Advertise Now →
                </Button>
              </Link>
            </div>
          </div>
          {/* Slide 2 */}
          <div
          className="absolute inset-0 transition-all duration-500"
          style={{
            opacity: currentSlide === 1 ? 1 : 0,
            transform: `translateX(${currentSlide === 1 ? 0 : -100}%)`,
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
              <Button size="sm" className="h-7 text-xs rounded-full bg-white text-accent hover:bg-white/90 w-fit relative z-10">
                Add Products →
              </Button>
            </Link>
          </div>
        </div>
        </motion.div>

        {/* 3. BUSINESS PROFILE SCORE */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <BusinessProfileScore score={45} />
        </motion.div>

        {/* 4. QUICK ACTIONS GRID */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <SellerQuickActionsGrid />
        </motion.div>

        {/* ─── 5. ANALYSIS PANEL ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-base font-bold text-gray-900 mb-3">Analysis</h3>

            {/* 2×2 stat grid */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[
                { label: "Total Views",    value: "234",  change: "+18% vs last week", up: true,  Icon: Eye },
                { label: "Total Products", value: "28",   change: "+3 this month",     up: true,  Icon: Package },
                { label: "Inquiries",      value: "97",   change: "2% Vs last week",   up: false, Icon: TrendingUp },
                { label: "Your Quotes",    value: "15",   change: "Share more quotes", up: true,  Icon: FileText },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">{s.label}</span>
                    <s.Icon className="w-4 h-4 text-accent/70" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  <p className={`text-xs mt-0.5 ${s.up ? "text-green-600" : "text-red-500"}`}>{s.change}</p>
                </div>
              ))}
            </div>

            <Link to="/analytics">
              <button className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-accent transition-colors mb-4">
                View All <ArrowRight className="w-4 h-4" />
              </button>
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
                <button className="ml-3 shrink-0 px-4 py-2 rounded-lg border border-accent text-accent text-xs font-bold hover:bg-accent/10 transition-colors">
                  Set Alerts
                </button>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* ─── 6. TOP PERFORMING PRODUCTS ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-base font-bold text-gray-900 mb-3">Top Performing Products</h3>
            <div className="space-y-0">
              {[
                { name: "Men's Denim Jacket - Cla...",     inquiries: 42, price: "₹850", views: "2100 views", image: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=80&h=80&fit=crop" },
                { name: "Women's Cotton Oversiz...",        inquiries: 28, price: "₹195", views: "1240 views", image: "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=80&h=80&fit=crop" },
                { name: "Organic Linen Shirt - Prem...",   inquiries: 15, price: "₹450", views: "890 views",  image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=80&h=80&fit=crop" },
              ].map((p, i) => (
                <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
                  <img src={p.image} alt={p.name} className="w-11 h-11 rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.inquiries} inquiries</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">{p.price}</p>
                    <p className="text-xs text-gray-400">{p.views}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/products">
              <button className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-accent transition-colors mt-3">
                View All <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </motion.div>

        {/* ─── 7. ADD PRODUCT + BROWSE QUOTES ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
          className="space-y-2">
          {[
            { icon: "＋", iconBg: "bg-accent/10", iconColor: "text-accent", title: "Add New Product", subtitle: "Showcase your products to buyers", to: "/upload" },
            { icon: "🔍", iconBg: "bg-blue-50",   iconColor: "text-blue-600", title: "Browse Quotes",  subtitle: "Find new business opportunities",  to: "/quotes" },
          ].map(item => (
            <Link key={item.title} to={item.to}>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${item.iconBg} flex items-center justify-center text-lg shrink-0`}>
                    <span className={item.iconColor}>{item.icon}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-400">{item.subtitle}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </div>
            </Link>
          ))}
        </motion.div>

        {/* ─── 8. RECENT LEADS ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Recent Leads</h3>
              <Link to="/leads">
                <button className="text-xs font-medium text-accent hover:underline">View All</button>
              </Link>
            </div>
            <div className="space-y-3">
              {[
                { initials: "R", name: "Rajesh Kumar",    company: "Fashion Hub Pvt Ltd",   location: "Mumbai", time: "2h ago", product: "Cotton Kurta Set",  qty: "500 pcs",   status: "New",          statusColor: "bg-green-100 text-green-700" },
                { initials: "P", name: "Priya Sharma",    company: "Style Street Exports",  location: "Delhi",  time: "5h ago", product: "Printed Sarees",   qty: "1000 pcs",  status: "Contacted",    statusColor: "bg-blue-100 text-blue-700" },
                { initials: "M", name: "Mohammed...",      company: "Gulf Traders LLC",      location: "Dubai, UAE", time: "1d ago", product: "Men's Formal Sh...", qty: "2000 pcs", status: "Negotiating", statusColor: "bg-orange-100 text-orange-700" },
              ].map((lead, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-sm font-bold shrink-0">
                        {lead.initials}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">{lead.name}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${lead.statusColor}`}>
                            {lead.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{lead.company}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-2 pl-10">
                    <span>📍 {lead.location}</span>
                    <span>🕐 {lead.time}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 pl-10 mb-3">
                    <span className="bg-gray-100 px-2 py-0.5 rounded-full">📦 {lead.product} · {lead.qty}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => navigate("/leads")}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                      📞 Call
                    </button>
                    <button
                      onClick={() => navigate("/chat")}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors">
                      💬 Message
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ─── 9. BOOST YOUR PROFILE ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.33 }}>
          <div className="bg-[#fff5f0] border border-orange-100 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-orange-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">Boost Your Profile</p>
              <p className="text-xs text-gray-500 mt-0.5">Add 3 more products to increase your visibility by 40% and attract more buyers.</p>
              <Link to="/advertisements">
                <button className="mt-2 px-3 py-1 rounded-full border-2 border-yellow-400 bg-yellow-50 text-xs font-bold text-yellow-800 hover:bg-yellow-100 transition-colors">
                  advertise
                </button>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* ─── 10. RECENT MESSAGES ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-base font-bold text-gray-900 mb-3">Recent Messages</h3>
            <div className="space-y-0">
              {[
                { initials: "FF", name: "Fashion Forward Ltd.", online: true,  msg: "Can you share samples for the cotton t-shirts?", time: "2 hours ago" },
                { initials: "EE", name: "Elegance Exports",     online: true,  msg: "Thanks for the quote. We'll review and get back", time: "5 hours ago" },
                { initials: "GC", name: "GreenWear Co.",        online: false, msg: "Can you reduce the price to ₹480/unit?", time: "1 day ago" },
              ].map((msg, i) => (
                <div key={i} onClick={() => navigate("/chat")} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 text-xs font-bold">
                      {msg.initials}
                    </div>
                    {msg.online && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{msg.name}</p>
                    <p className="text-xs text-gray-500 truncate">{msg.msg}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{msg.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/chat">
              <button className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-accent transition-colors mt-3">
                View All Messages <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </motion.div>

        {/* ─── 11. COMPETITOR'S ADVERTISEMENTS ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
          <div className="bg-gradient-to-br from-[#ef4d62] to-[#f97316] rounded-2xl p-4 text-white">
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
              <button className="w-full bg-white text-gray-900 text-sm font-bold py-2.5 rounded-xl hover:bg-white/90 transition-colors flex items-center justify-center gap-2">
                View Competitor Ads <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </motion.div>

      </div>
    </DashboardLayout>
  );
};

export default SellerHome;