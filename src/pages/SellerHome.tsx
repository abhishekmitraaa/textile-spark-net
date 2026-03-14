import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { BusinessProfileScore } from "@/components/dashboard/BusinessProfileScore";
import { SellerQuickActionsGrid } from "@/components/dashboard/SellerQuickActionsGrid";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Eye, MessageSquare, Bell, MapPin, Clock,
  Upload, Megaphone, MessageCircle, FileText,
  Package,
} from "lucide-react";

/* ── Data ── */

const topProducts = [
  { name: "Premium Cotton Blend T-Shirt", price: "₹349/pc", image: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=100&h=100&fit=crop", views: 342, inquiries: 12 },
  { name: "Italian Silk Collection Fabric", price: "₹899/yd", image: "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=100&h=100&fit=crop", views: 567, inquiries: 28 },
  { name: "Sustainable Linen Blend Roll", price: "₹459/yd", image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=100&h=100&fit=crop", views: 189, inquiries: 8 },
];

const leads = [
  { buyer: "Arjun Mehta", company: "FashionBrand X", status: "New", statusColor: "bg-green-500/10 text-green-600", location: "Delhi", time: "2h ago", product: "Cotton T-Shirts", qty: "500 pcs" },
  { buyer: "Priya Sharma", company: "LuxuryCo.", status: "Contacted", statusColor: "bg-blue-500/10 text-blue-600", location: "Mumbai", time: "5h ago", product: "Silk Fabric", qty: "200 yards" },
  { buyer: "Rahul Gupta", company: "StyleHouse", status: "Negotiating", statusColor: "bg-amber-500/10 text-amber-600", location: "Bangalore", time: "1d ago", product: "Linen Blend", qty: "300 yards" },
];

const recentMessages = [
  { name: "Arjun Mehta", initials: "AM", message: "Can you share the GSM details for the cotton...", time: "2m ago" },
  { name: "Priya Sharma", initials: "PS", message: "We'd like to proceed with the silk order. Pl...", time: "1h ago" },
  { name: "Rahul Gupta", initials: "RG", message: "Looking forward to the samples next week.", time: "3h ago" },
];

const stats = [
  { label: "Total Views", value: "12.4K", chip: "+18% vs last week" },
  { label: "Total Products", value: "48", chip: "+3 this month" },
  { label: "Inquiries", value: "156", chip: "+24 this week" },
  { label: "Your Quotes", value: "24", chipLink: true, chip: "Share more quotes →" },
];

/* ── Banner Carousel ── */

const bannerSlides = [
  {
    gradient: "bg-gradient-to-r from-accent to-accent/80",
    title: "Get Prime Placement Above Competitors",
    cta: "Advertise Now",
    href: "/advertisements",
  },
  {
    gradient: "bg-gradient-to-r from-foreground to-foreground/80",
    title: "Upload Products & Get More Leads",
    cta: "Add Products",
    href: "/upload",
  },
];

const BannerCarousel = () => {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const slide = bannerSlides[activeSlide];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className={`rounded-xl p-4 relative overflow-hidden ${slide.gradient}`}>
        {/* Decorative circles */}
        <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full border border-white/10" />
        <div className="absolute -left-4 -bottom-4 w-16 h-16 rounded-full border border-white/10" />
        <div className="absolute right-12 bottom-2 w-10 h-10 rounded-full border border-white/10" />

        <div className="relative">
          <h3 className="font-display text-lg font-bold text-white mb-3 pr-8">
            {slide.title}
          </h3>
          <Link to={slide.href}>
            <button className="bg-accent-foreground text-accent text-xs rounded-full px-3 py-1 font-medium">
              {slide.cta}
            </button>
          </Link>
        </div>
      </div>
      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 mt-2">
        {bannerSlides.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveSlide(i)}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === activeSlide ? "bg-accent" : "bg-border"
            }`}
          />
        ))}
      </div>
    </motion.div>
  );
};

/* ── Main Page ── */

const SellerHome = () => {
  const isMobile = useIsMobile();

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-20 lg:pb-0">
        {/* Banner Carousel */}
        <BannerCarousel />

        {/* Profile Score */}
        <BusinessProfileScore score={45} />

        {/* Quick Actions */}
        <SellerQuickActionsGrid />

        {/* Analysis Panel */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex overflow-x-auto gap-3 pb-1 lg:grid lg:grid-cols-2 xl:grid-cols-4 lg:overflow-visible">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-card p-3 min-w-[140px] flex-shrink-0 lg:min-w-0">
                <p className="text-2xl font-bold text-accent">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                {stat.chipLink ? (
                  <Link to="/quotes" className="text-accent text-xs mt-1 inline-block">
                    {stat.chip}
                  </Link>
                ) : (
                  <span className="inline-block mt-1 text-[10px] bg-green-500/10 text-green-600 rounded-full px-2 py-0.5">
                    {stat.chip}
                  </span>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* RFQ Alerts */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <div className="rounded-xl border-2 border-dashed border-accent/30 bg-accent/5 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="text-accent h-5 w-5" />
              <span className="text-sm font-medium text-foreground">Get notified for matching RFQs</span>
            </div>
            <button className="bg-accent text-accent-foreground text-xs rounded-full px-3 py-1 font-medium">
              Set Alerts
            </button>
          </div>
        </motion.div>

        {/* Top Performing Products */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-semibold text-foreground">Top Performing Products</h2>
            <Link to="/products" className="text-accent text-sm">View All →</Link>
          </div>
          <div className="space-y-3">
            {topProducts.map((product, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-2xl font-bold text-muted-foreground/30 w-8 text-center flex-shrink-0">
                  {i + 1}
                </span>
                <img src={product.image} alt={product.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.price}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Eye className="h-3 w-3" /> {product.views}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-accent">
                    <MessageSquare className="h-3 w-3" /> {product.inquiries}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Leads */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-semibold text-foreground">Recent Leads</h2>
            <Link to="/leads" className="text-accent text-sm">View All →</Link>
          </div>

          {/* Shortcut buttons */}
          <div className="flex gap-2 mb-3 overflow-x-auto">
            <Link to="/upload">
              <Button variant="outline" size="sm" className="text-xs whitespace-nowrap gap-1">
                <Package className="h-3 w-3" /> Add New Product
              </Button>
            </Link>
            <Link to="/quotes">
              <Button variant="outline" size="sm" className="text-xs whitespace-nowrap gap-1">
                <FileText className="h-3 w-3" /> Browse Quotes
              </Button>
            </Link>
            <Link to="/chat">
              <Button variant="outline" size="sm" className="text-xs whitespace-nowrap gap-1">
                <MessageCircle className="h-3 w-3" /> View Messages
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {leads.map((lead, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${lead.statusColor}`}>
                      {lead.status}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-medium text-foreground">{lead.buyer}</p>
                <p className="text-xs text-muted-foreground">{lead.company}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {lead.location}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {lead.time}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{lead.product} • {lead.qty}</p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" className="text-xs h-7">Call</Button>
                  <Button variant="outline" size="sm" className="text-xs h-7">Message</Button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Messages */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-semibold text-foreground">Recent Messages</h2>
            <Link to="/chat" className="text-accent text-sm">View All →</Link>
          </div>
          <div className="space-y-2">
            {recentMessages.map((msg, i) => (
              <Link to="/chat" key={i} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent text-sm font-semibold flex-shrink-0">
                  {msg.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{msg.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{msg.message}</p>
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{msg.time}</span>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Bottom Shortcuts Bar — mobile only */}
      {isMobile && (
        <div className="fixed bottom-14 left-0 right-0 z-20 bg-card border-t border-border grid grid-cols-4">
          {[
            { label: "Upload Product", icon: Upload, href: "/upload" },
            { label: "Create Ad", icon: Megaphone, href: "/advertisements" },
            { label: "View Messages", icon: MessageCircle, href: "/chat" },
            { label: "Check Quotes", icon: FileText, href: "/quotes" },
          ].map((item) => (
            <Link
              key={item.label}
              to={item.href}
              className="flex flex-col items-center gap-1 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <item.icon className="h-4 w-4" />
              <span className="text-[10px] leading-tight text-center">{item.label}</span>
            </Link>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
};

export default SellerHome;
