import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { ProductCard } from "@/components/dashboard/ProductCard";
import { Package, Eye, MessageSquare, TrendingUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const stats = [
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

const Index = () => {
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
          Welcome back! Here's an overview of your business.
        </p>
      </motion.div>

      {/* Stats grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:mb-8 lg:grid-cols-4 lg:gap-6">
        {stats.map((stat, index) => (
          <StatsCard key={stat.title} {...stat} delay={index * 0.1} />
        ))}
      </div>

      {/* Recent products section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
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

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
          {recentProducts.map((product, index) => (
            <ProductCard key={product.id} {...product} delay={0.5 + index * 0.1} />
          ))}
        </div>
      </motion.div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="mt-6 rounded-xl border border-border bg-card p-4 lg:mt-8 lg:p-6"
      >
        <h3 className="mb-3 font-display text-base font-semibold text-card-foreground lg:mb-4 lg:text-lg">
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Link to="/upload">
            <Button variant="gold" size="sm" className="text-xs sm:text-sm">
              Upload New Product
            </Button>
          </Link>
          <Link to="/advertisements">
            <Button variant="outline" size="sm" className="text-xs sm:text-sm">
              Create Advertisement
            </Button>
          </Link>
          <Button variant="secondary" size="sm" className="text-xs sm:text-sm">
            View Analytics
          </Button>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Index;
