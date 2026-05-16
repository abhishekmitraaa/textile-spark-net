import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  ArrowRight,
  Bell,
  Eye,
  MessageSquare,
  Store,
  Package,
  Users,
  FileText,
  TrendingUp,
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

const SellerHome = () => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCurrentSlide((s) => (s === 0 ? 1 : 0)), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <DashboardLayout>
      <>
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

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
          <h1 className="text-xl font-semibold font-display text-foreground lg:text-2xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Welcome back! Here's an overview of your business.</p>
        </motion.div>

        <div className="relative overflow-hidden rounded-xl h-28 mb-4">
          <div
            className={`absolute inset-0 p-4 flex flex-col justify-between transition-all duration-500 bg-gradient-to-r from-accent to-accent/80 ${currentSlide === 0 ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full"}`}
          >
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border-2 border-white/10" />
            <div className="absolute -right-2 bottom-0 w-20 h-20 rounded-full border border-white/10" />
            <p className="text-base font-semibold text-accent-foreground">Get Prime Placement Above Competitors</p>
            <Link to="/advertisements">
              <Button size="sm" className="bg-accent-foreground text-accent hover:bg-accent-foreground/90 rounded-full h-7 text-xs w-fit px-4">
                Advertise Now →
              </Button>
            </Link>
          </div>

          <div
            className={`absolute inset-0 p-4 flex flex-col justify-between transition-all duration-500 bg-gradient-to-r from-foreground to-foreground/80 ${currentSlide === 1 ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full"}`}
          >
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border-2 border-background/10" />
            <div className="absolute -right-2 bottom-0 w-20 h-20 rounded-full border border-background/10" />
            <p className="text-base font-semibold text-background">Upload Products & Get More Leads</p>
            <Link to="/upload">
              <Button size="sm" className="bg-background text-foreground hover:bg-background/90 rounded-full h-7 text-xs w-fit px-4">
                Add Products →
              </Button>
            </Link>
          </div>

          <div className="absolute bottom-2 right-3 flex gap-1">
            {[0, 1].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${currentSlide === i ? "w-3 bg-white" : "w-1.5 bg-white/40"}`}
              />
            ))}
          </div>
        </div>

        <BusinessProfileScore score={45} />

        <SellerQuickActionsGrid />

        <div className="mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {sellerStats.map((stat, index) => (
              <StatsCard key={stat.title} {...stat} delay={index * 0.1} />
            ))}
          </div>
          <div className="rounded-xl border-2 border-dashed border-accent/30 bg-accent/5 p-3 flex items-center justify-between">
            <div className="flex items-center">
              <Bell className="h-5 w-5 text-accent mr-2" />
              <span className="text-sm font-medium text-foreground">Get notified when buyers post matching RFQs</span>
            </div>
            <Link to="/leads">
              <Button size="sm" className="h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90 rounded-full px-4 flex-shrink-0">
                Set Alerts
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-1">
            <Card className="h-full border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-base font-semibold text-foreground">Top Products</h3>
                  <Link to="/products">
                    <Button variant="ghost" size="sm" className="gap-1 text-xs text-accent">
                      View All <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
                <div className="space-y-0">
                  {recentProducts.slice(0, 3).map((product, index) => (
                    <div key={product.name} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                      <span className="text-2xl font-bold text-muted-foreground/20 w-6 text-center flex-shrink-0">{index + 1}</span>
                      <img src={product.image} alt={product.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.price}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <div className="flex items-center gap-1">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{product.views}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3 text-accent" />
                          <span className="text-xs text-accent">{product.inquiries}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="space-y-4 lg:col-span-2">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display text-base font-semibold text-foreground">Recent Leads</h3>
                    <Link to="/leads">
                      <Button variant="ghost" size="sm" className="text-xs gap-1 text-accent">
                        View All <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <Link to="/upload">
                      <Button variant="outline" size="sm" className="h-8 text-xs">Add Product</Button>
                    </Link>
                    <Link to="/quotes">
                      <Button variant="outline" size="sm" className="h-8 text-xs">Quotes</Button>
                    </Link>
                    <Link to="/chat">
                      <Button variant="outline" size="sm" className="h-8 text-xs">Messages</Button>
                    </Link>
                  </div>
                  <div className="space-y-1">
                    {sellerActivity.map((item, index) => (
                      <div key={index} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${item.type === "quote" ? "bg-green-500" : item.type === "inquiry" ? "bg-accent" : "bg-blue-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{item.action}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.vendor} • {item.product}</p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{item.time}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display text-base font-semibold text-foreground">Recent Messages</h3>
                    <Link to="/chat">
                      <Button variant="ghost" size="sm" className="text-xs gap-1 text-accent">
                        View All <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                  <div className="space-y-0">
                    {sellerActivity.map((item, index) => (
                      <div key={index} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                        <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
                          {item.vendor.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{item.vendor}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.action}</p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{item.time}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </>
    </DashboardLayout>
  );
};

export default SellerHome;