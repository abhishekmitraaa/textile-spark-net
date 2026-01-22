import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { ProductCard } from "@/components/dashboard/ProductCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Eye,
  MessageSquare,
  TrendingUp,
  ArrowRight,
  FileText,
  ShoppingBag,
  Truck,
  Users,
  Building2,
  Upload,
  Megaphone,
  MessageCircle,
  Star,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useUserRole } from "@/contexts/UserRoleContext";

const buyerStats = [
  {
    title: "Active RFQs",
    value: "8",
    change: "+2 this week",
    changeType: "positive" as const,
    icon: FileText,
  },
  {
    title: "Quotes Received",
    value: "24",
    change: "+12 new",
    changeType: "positive" as const,
    icon: MessageSquare,
  },
  {
    title: "Orders in Progress",
    value: "5",
    change: "3 shipping soon",
    changeType: "neutral" as const,
    icon: Truck,
  },
  {
    title: "Saved Vendors",
    value: "18",
    change: "+4 this month",
    changeType: "positive" as const,
    icon: Building2,
  },
];

const sellerStats = [
  {
    title: "Total Products",
    value: "48",
    change: "+3 this month",
    changeType: "positive" as const,
    icon: Package,
  },
  {
    title: "Total Views",
    value: "12.4K",
    change: "+18% vs last month",
    changeType: "positive" as const,
    icon: Eye,
  },
  {
    title: "Inquiries",
    value: "156",
    change: "+24 this week",
    changeType: "positive" as const,
    icon: MessageSquare,
  },
  {
    title: "Conversion Rate",
    value: "3.2%",
    change: "+0.4% improvement",
    changeType: "positive" as const,
    icon: TrendingUp,
  },
];

const recentProducts = [
  {
    id: "1",
    name: "Premium Cotton Blend Fabric",
    category: "Textiles",
    price: "$24.99/yard",
    image: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=500&fit=crop",
    status: "active" as const,
    views: 342,
    inquiries: 12,
  },
  {
    id: "2",
    name: "Italian Silk Collection",
    category: "Premium Fabrics",
    price: "$89.99/yard",
    image: "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=400&h=500&fit=crop",
    status: "active" as const,
    views: 567,
    inquiries: 28,
  },
  {
    id: "3",
    name: "Sustainable Linen Blend",
    category: "Eco-Friendly",
    price: "$34.99/yard",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=500&fit=crop",
    status: "pending" as const,
    views: 189,
    inquiries: 8,
  },
  {
    id: "4",
    name: "Designer Wool Tweed",
    category: "Winter Collection",
    price: "$56.99/yard",
    image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=500&fit=crop",
    status: "draft" as const,
    views: 0,
    inquiries: 0,
  },
];

// Quick action buttons for buyer
const buyerQuickActions = [
  { name: "New RFQ", href: "/quotes", icon: FileText, variant: "gold" as const },
  { name: "Browse Products", href: "/products", icon: ShoppingBag, variant: "outline" as const },
  { name: "View Messages", href: "/chat", icon: MessageCircle, variant: "secondary" as const },
  { name: "Track Orders", href: "/orders", icon: Truck, variant: "secondary" as const },
];

// Quick action buttons for seller
const sellerQuickActions = [
  { name: "Upload Product", href: "/upload", icon: Upload, variant: "gold" as const },
  { name: "Create Ad", href: "/advertisements", icon: Megaphone, variant: "outline" as const },
  { name: "View Messages", href: "/chat", icon: MessageCircle, variant: "secondary" as const },
  { name: "Check Leads", href: "/leads", icon: Users, variant: "secondary" as const },
];

// Recent activity for buyer
const buyerActivity = [
  { action: "Quote received", vendor: "Premium Textile Mills", product: "Organic Cotton", time: "2h ago", type: "quote" },
  { action: "Order shipped", vendor: "Silk Weavers Co.", product: "Silk Blend", time: "5h ago", type: "order" },
  { action: "New message", vendor: "Linen House", product: "Linen Fabric", time: "1d ago", type: "message" },
];

// Recent activity for seller
const sellerActivity = [
  { action: "New inquiry", vendor: "Fashion Brand X", product: "Cotton Blend", time: "1h ago", type: "inquiry" },
  { action: "Quote accepted", vendor: "Luxury Co.", product: "Silk Collection", time: "3h ago", type: "quote" },
  { action: "Product viewed", vendor: "Style House", product: "Linen Blend", time: "6h ago", type: "view" },
];

const Index = () => {
  const { role } = useUserRole();
  const stats = role === "buyer" ? buyerStats : sellerStats;
  const quickActions = role === "buyer" ? buyerQuickActions : sellerQuickActions;
  const activity = role === "buyer" ? buyerActivity : sellerActivity;

  return (
    <DashboardLayout>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 lg:mb-8"
      >
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {role === "buyer" 
            ? "Welcome back! Manage your quotes and orders."
            : "Welcome back! Here's an overview of your business."}
        </p>
      </motion.div>

      {/* Stats grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:mb-8 lg:grid-cols-4 lg:gap-6">
        {stats.map((stat, index) => (
          <StatsCard key={stat.title} {...stat} delay={index * 0.1} />
        ))}
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-6 rounded-xl border border-border bg-card p-4 lg:mb-8 lg:p-6"
      >
        <h3 className="mb-3 font-display text-base font-semibold text-card-foreground lg:mb-4 lg:text-lg">
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {quickActions.map((action) => (
            <Link key={action.name} to={action.href}>
              <Button 
                variant={action.variant} 
                size="sm" 
                className="text-xs sm:text-sm gap-2"
              >
                <action.icon className="h-4 w-4" />
                {action.name}
              </Button>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Two column layout for Activity and Products */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-1"
        >
          <Card className="h-full border-border/50">
            <CardContent className="p-4 lg:p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-semibold text-foreground lg:text-lg">
                  Recent Activity
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {activity.length} new
                </Badge>
              </div>
              <div className="space-y-4">
                {activity.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${
                      item.type === "quote" ? "bg-accent/10 text-accent" :
                      item.type === "order" ? "bg-emerald-500/10 text-emerald-600" :
                      item.type === "message" ? "bg-blue-500/10 text-blue-600" :
                      item.type === "inquiry" ? "bg-purple-500/10 text-purple-600" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {item.type === "quote" ? <FileText className="h-4 w-4" /> :
                       item.type === "order" ? <Truck className="h-4 w-4" /> :
                       item.type === "message" ? <MessageCircle className="h-4 w-4" /> :
                       item.type === "inquiry" ? <MessageSquare className="h-4 w-4" /> :
                       <Eye className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.action}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.vendor} • {item.product}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {item.time}
                    </span>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent products section - only for seller */}
        {role === "seller" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2"
          >
            <div className="mb-4 flex items-center justify-between lg:mb-6">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground sm:text-xl">
                  Recent Products
                </h2>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Your latest product listings
                </p>
              </div>
              <Link to="/products">
                <Button variant="ghost" size="sm" className="gap-1 text-xs sm:gap-2 sm:text-sm">
                  View All <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-4 lg:gap-4">
              {recentProducts.slice(0, 4).map((product, index) => (
                <ProductCard key={product.id} {...product} delay={0.5 + index * 0.1} />
              ))}
            </div>
          </motion.div>
        )}

        {/* For buyer - show featured vendors */}
        {role === "buyer" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2"
          >
            <div className="mb-4 flex items-center justify-between lg:mb-6">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground sm:text-xl">
                  Recommended Vendors
                </h2>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Top-rated manufacturers for your needs
                </p>
              </div>
              <Link to="/products">
                <Button variant="ghost" size="sm" className="gap-1 text-xs sm:gap-2 sm:text-sm">
                  View All <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:gap-4">
              {[
                { name: "Premium Textile Mills", rating: 4.8, location: "Mumbai, India", specialty: "Organic Cotton", verified: true },
                { name: "Silk Weavers Co.", rating: 4.9, location: "Bangalore, India", specialty: "Mulberry Silk", verified: true },
                { name: "Linen House", rating: 4.7, location: "Delhi, India", specialty: "European Linen", verified: true },
                { name: "Eco Fabrics Inc", rating: 4.6, location: "Chennai, India", specialty: "Recycled Materials", verified: false },
              ].map((vendor, index) => (
                <motion.div
                  key={vendor.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                >
                  <Card className="border-border/50 hover:border-accent/30 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-accent/40 text-foreground font-bold">
                          {vendor.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-sm text-foreground truncate">
                              {vendor.name}
                            </h4>
                            {vendor.verified && (
                              <Badge variant="outline" className="h-4 px-1 text-[10px] border-accent/50 text-accent">
                                ✓
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 text-accent fill-accent" />
                              {vendor.rating}
                            </div>
                            <span>•</span>
                            <span className="truncate">{vendor.location}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">
                            {vendor.specialty}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Index;
