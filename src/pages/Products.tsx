import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProductCard } from "@/components/dashboard/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "react-router-dom";
import { Plus, Search, Filter, Grid3X3, List } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";

const allProducts = [
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
  {
    id: "5",
    name: "Organic Hemp Fabric",
    category: "Eco-Friendly",
    price: "$42.99/yard",
    image: "https://images.unsplash.com/photo-1606722590583-6951b5ea92ad?w=400&h=500&fit=crop",
    status: "active" as const,
    views: 234,
    inquiries: 15,
  },
  {
    id: "6",
    name: "Velvet Luxury Collection",
    category: "Premium Fabrics",
    price: "$78.99/yard",
    image: "https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=400&h=500&fit=crop",
    status: "active" as const,
    views: 456,
    inquiries: 22,
  },
];

const Products = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  return (
    <DashboardLayout>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between lg:mb-8"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Products
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your product catalog
          </p>
        </div>
        <Link to="/upload">
          <Button variant="gold" size="sm" className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </Link>
      </motion.div>

      {/* Filters and search */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4 space-y-3 rounded-xl border border-border bg-card p-3 sm:mb-6 sm:p-4"
      >
        {/* Search row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search products..." className="pl-10" />
          </div>
          <Button variant="outline" size="icon" className="shrink-0">
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2">
          <Select defaultValue="all">
            <SelectTrigger className="flex-1 sm:w-[140px] sm:flex-none">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="textiles">Textiles</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="eco">Eco-Friendly</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all">
            <SelectTrigger className="flex-1 sm:w-[120px] sm:flex-none">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>

          {/* View toggle - hidden on mobile */}
          <div className="ml-auto hidden gap-1 rounded-lg border border-border p-1 sm:flex">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "rounded-md p-2 transition-colors",
                viewMode === "grid"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-md p-2 transition-colors",
                viewMode === "list"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Products grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {allProducts.map((product, index) => (
          <ProductCard key={product.id} {...product} delay={0.2 + index * 0.05} />
        ))}
      </div>

      {/* Pagination */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row"
      >
        <p className="text-xs text-muted-foreground sm:text-sm">
          Showing 1-6 of 48 products
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="outline" size="sm">
            Next
          </Button>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Products;
