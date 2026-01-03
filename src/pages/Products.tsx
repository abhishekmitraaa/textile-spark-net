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
  {
    id: "7",
    name: "Denim Classic Blue",
    category: "Casual Wear",
    price: "$18.99/yard",
    image: "https://images.unsplash.com/photo-1565084888279-aca607ecce0c?w=400&h=500&fit=crop",
    status: "active" as const,
    views: 789,
    inquiries: 45,
  },
  {
    id: "8",
    name: "Cashmere Blend Premium",
    category: "Luxury",
    price: "$129.99/yard",
    image: "https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=400&h=500&fit=crop",
    status: "pending" as const,
    views: 123,
    inquiries: 6,
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
        className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Products
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manage your product catalog and listings
          </p>
        </div>
        <Link to="/upload">
          <Button variant="gold">
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
        className="mb-6 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-1 gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search products..." className="pl-10" />
          </div>
          <Select defaultValue="all">
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="textiles">Textiles</SelectItem>
              <SelectItem value="premium">Premium Fabrics</SelectItem>
              <SelectItem value="eco">Eco-Friendly</SelectItem>
              <SelectItem value="luxury">Luxury</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all">
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-1 rounded-lg border border-border p-1">
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
      </motion.div>

      {/* Products grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {allProducts.map((product, index) => (
          <ProductCard key={product.id} {...product} delay={0.2 + index * 0.05} />
        ))}
      </div>

      {/* Pagination */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-8 flex items-center justify-between"
      >
        <p className="text-sm text-muted-foreground">
          Showing 1-8 of 48 products
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
