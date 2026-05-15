import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  Bell,
  Eye,
  MessageSquare,
  TrendingUp,
  Package,
  Users,
  FileText,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { BusinessProfileScore } from "@/components/dashboard/BusinessProfileScore";
import { SellerQuickActionsGrid } from "@/components/dashboard/SellerQuickActionsGrid";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const sellerStats = [
  { title: "Total Views", value: "12.4K", change: "+18% vs last week", changeType: "positive" as const, icon: Eye },
  { title: "Total Products", value: "48", change: "+3 this month", changeType: "positive" as const, icon: Package },
  { title: "Inquiries", value: "156", change: "+24 this week", changeType: "positive" as const, icon: Users },
  { title: "Your Quotes", value: "24", change: "Share more →", changeType: "neutral" as const, icon: FileText },
];

const recentProducts = [
  { name: "Premium Cotton Blend T-Shirt", price: "₹349/pc", image: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=100&h=100&fit=crop", views: 342, inquiries: 12 },
  { name: "Italian Silk Collection Fabric", price: "₹899/yd", image: "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=100&h=100&fit=crop", views: 567, inquiries: 28 },
  { name: "Sustainable Linen Blend Roll", price: "₹459/yd", image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=100&h=100&fit=crop", views: 189, inquiries: 8 },
];

const sellerActivity = [
  { vendor: "Arjun Mehta", action: "New inquiry received", product: "Cotton T-Shirts", type: "inquiry", time: "2m ago" },
  { vendor: "Priya Sharma", action: "Quote accepted", product: "Silk Fabric", type: "quote", time: "1h ago" },
  { vendor: "Rahul Gupta", action: "Sample requested", product: "Linen Blend", type: "other", time: "3h ago" },
];

const slides = [
  {
    bg: "bg-gradient-to-r from-accent to-accent/80",
    title: "Get Prime Placement Above Competitors",
    titleClass: "text-accent-foreground",
    cta: "Advertise Now →",
    btnClass: "bg-accent-foreground text-accent hover:bg-accent-foreground/90",
    href: "/advertisements",
  },
  {
    bg: "bg-gradient-to-r from-foreground to-foreground/80",
    title: "Upload Products & Get More Leads",
    titleClass: "text-background",
    cta: "Add Products →",
    btnClass: "bg-background text-foreground hover:bg-background/90",
    href: "/upload",
  },
];

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

const SellerHome = () => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCurrentSlide((p) => (p + 1) % slides.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <DashboardLayout>
      {/* Switch to Buyer Banner */}
      <div className="flex items-center justify-between bg-accent/10 border-b border-accent/20 px-4 py-2 -mx-4 -mt-4 mb-4 lg:-mx-6 lg:-mt-6 lg:mb-6">
        <div className="flex items-center">
          <ArrowLeftRight className="h-4 w-4 text-accent" />
          <span className="text-sm text-accent font-medium ml-2">Switch To Buyer Account</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs border-accent/40 text-accent hover:bg-accent/10 rounded-full px-3"
          onClick={() => navigate("/browse")}
        >
          Switch
        </Button>
      </div>

      <div className="space-y-5 pb-20 lg:pb-0">
        {/* Page Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl font-semibold font-display text-foreground lg:text-2xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Welcome back! Here's an overview of your business.
          </p>
        </motion.div>

        {/* Promo Carousel */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="relative overflow-hidden rounded-xl h-28">
            {slides.map((s, index) => (
              <div
                key={index}
                className={`absolute inset-0 ${s.bg} p-4 flex flex-col justify-between transition-all duration-500`}
                style={{
                  transform: `translateX(${currentSlide === index ? 0 : 100}%)`,
                  opacity: currentSlide === index ? 1 : 0,
                }}
              >
                <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border-2 border-white/10" />
                <div className="absolute -right-2 bottom-0 w-20 h-20 rounded-full border border-white/10" />
                <p className={`text-base font-semibold ${s.titleClass} relative`}>{s.title}</p>
                <Link to={s.href} className="relative">
                  <Button
                    variant="secondary"
                    size="sm"
                    className={`h-7 text-xs rounded-full w-fit ${s.btnClass}`}
                  >
                    {s.cta}
                  </Button>
                </Link>
              </div>
            ))}
            <div className="absolute bottom-2 right-3 flex gap-1 z-10">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    currentSlide === i ? "bg-white w-3" : "bg-white/40 w-1.5"
                  }`}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Business Profile Score */}
        <BusinessProfileScore score={45} />

        {/* Quick Actions */}
        <SellerQuickActionsGrid />

        {/* Stats Row + RFQ Alerts */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4 mb-6">
          {sellerStats.map((s, i) => (
            <StatsCard key={s.title} {...s} delay={0.1 + i * 0.05} />
          ))}
          <div className="col-span-2 lg:col-span-4 rounded-xl border-2 border-dashed border-accent/30 bg-accent/5 p-3 flex items-center justify-between">
            <div className="flex items-center">
              <Bell className="h-5 w-5 text-accent mr-2" />
              <span className="text-sm font-medium text-foreground">
                Get notified when buyers post matching RFQs
              </span>
            </div>
            <Link to="/leads">
              <Button
                size="sm"
                className="h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90 rounded-full px-4"
              >
                Set Alerts
              </Button>
            </Link>
          </div>
        </div>

        {/* Three Column Grid */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Top Products */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-1"
          >
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base font-semibold font-display">Top Products</h2>
                  <Link to="/products">
                    <Button variant="ghost" size="sm" className="text-xs text-accent h-auto p-0">
                      View All →
                    </Button>
                  </Link>
                </div>
                {recentProducts.slice(0, 3).map((p, i) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                  >
                    <span className="text-2xl font-bold text-muted-foreground/20 w-6">{i + 1}</span>
                    <img src={p.image} alt={p.name} className="w-12 h-12 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.price}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        {p.views}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-accent">
                        <MessageSquare className="h-3 w-3" />
                        {p.inquiries}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Recent Leads */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold font-display text-base">Recent Leads</h2>
                    <Link to="/leads">
                      <Button variant="ghost" size="sm" className="text-xs text-accent h-auto p-0">
                        View All →
                      </Button>
                    </Link>
                  </div>

                  <div className="flex gap-2 my-3">
                    <Link to="/upload">
                      <Button variant="outline" size="sm" className="h-8 text-xs">
                        Add Product
                      </Button>
                    </Link>
                    <Link to="/quotes">
                      <Button variant="outline" size="sm" className="h-8 text-xs">
                        Browse Quotes
                      </Button>
                    </Link>
                    <Link to="/chat">
                      <Button variant="outline" size="sm" className="h-8 text-xs">
                        Messages
                      </Button>
                    </Link>
                  </div>

                  <div className="space-y-1">
                    {sellerActivity.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
                      >
                        <div
                          className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                            item.type === "quote"
                              ? "bg-green-500"
                              : item.type === "inquiry"
                              ? "bg-accent"
                              : "bg-blue-500"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.action}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.vendor} • {item.product}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0 ml-auto">
                          {item.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Recent Messages */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold font-display text-base">Recent Messages</h2>
                    <Link to="/chat">
                      <Button variant="ghost" size="sm" className="text-xs text-accent h-auto p-0">
                        View All →
                      </Button>
                    </Link>
                  </div>
                  {sellerActivity.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                    >
                      <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
                        {initials(item.vendor)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.vendor}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.action}</p>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {item.time}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SellerHome;