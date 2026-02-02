import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Filter,
  Grid3X3,
  List,
  Heart,
  Star,
  MapPin,
  Package,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Sample products data for buyers
const allProducts = [
  {
    id: "1",
    name: "Premium Cotton Polo T-shirt",
    category: "Men's T-shirts",
    subType: "Polo T-shirt",
    price: "₹299",
    priceRange: "₹250 - ₹350",
    moq: "100 pcs",
    image: "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=400&h=500&fit=crop",
    rating: 4.8,
    reviews: 156,
    vendor: "Fashion Hub Pvt Ltd",
    location: "Mumbai, India",
    verified: true,
  },
  {
    id: "2",
    name: "100% Organic Cotton Fabric",
    category: "Knitted Fabrics",
    subType: "Single Jersey",
    price: "₹180/meter",
    priceRange: "₹150 - ₹200",
    moq: "500 meters",
    image: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=500&fit=crop",
    rating: 4.9,
    reviews: 234,
    vendor: "Textile Mills India",
    location: "Surat, India",
    verified: true,
  },
  {
    id: "3",
    name: "Industrial Sewing Machine",
    category: "Machinery",
    subType: "Lockstitch Machine",
    price: "₹45,000",
    priceRange: "₹40,000 - ₹55,000",
    moq: "1 unit",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=500&fit=crop",
    rating: 4.7,
    reviews: 89,
    vendor: "Machine World",
    location: "Delhi, India",
    verified: true,
  },
  {
    id: "4",
    name: "Metal Buttons Collection",
    category: "Trims & Accessories",
    subType: "Metal Buttons",
    price: "₹2.50/pc",
    priceRange: "₹2 - ₹5",
    moq: "1000 pcs",
    image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=500&fit=crop",
    rating: 4.6,
    reviews: 67,
    vendor: "Trim Solutions",
    location: "Ahmedabad, India",
    verified: false,
  },
  {
    id: "5",
    name: "Designer Silk Saree",
    category: "Women's Ethnic",
    subType: "Saree",
    price: "₹2,499",
    priceRange: "₹2,000 - ₹3,500",
    moq: "50 pcs",
    image: "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=400&h=500&fit=crop",
    rating: 4.9,
    reviews: 312,
    vendor: "Silk House",
    location: "Varanasi, India",
    verified: true,
  },
  {
    id: "6",
    name: "Premium Denim Fabric",
    category: "Raw Materials",
    subType: "Stretch Denim",
    price: "₹320/meter",
    priceRange: "₹280 - ₹400",
    moq: "300 meters",
    image: "https://images.unsplash.com/photo-1606722590583-6951b5ea92ad?w=400&h=500&fit=crop",
    rating: 4.8,
    reviews: 178,
    vendor: "Denim World",
    location: "Bangalore, India",
    verified: true,
  },
  {
    id: "7",
    name: "Men's Casual Chino Pants",
    category: "Men's Pants",
    subType: "Chinos",
    price: "₹599",
    priceRange: "₹500 - ₹700",
    moq: "50 pcs",
    image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400&h=500&fit=crop",
    rating: 4.5,
    reviews: 98,
    vendor: "Urban Style Co",
    location: "Chennai, India",
    verified: true,
  },
  {
    id: "8",
    name: "Women's Crop Top",
    category: "Women's Tops",
    subType: "Crop Top",
    price: "₹249",
    priceRange: "₹200 - ₹350",
    moq: "100 pcs",
    image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=500&fit=crop",
    rating: 4.7,
    reviews: 203,
    vendor: "Trendy Fashion",
    location: "Jaipur, India",
    verified: true,
  },
];

const categories = [
  "All Categories",
  "Men's T-shirts",
  "Men's Pants",
  "Women's Tops",
  "Women's Ethnic",
  "Raw Materials",
  "Knitted Fabrics",
  "Trims & Accessories",
  "Machinery",
];

const BrowseProducts = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState("relevance");

  // Filter products based on search and category
  const filteredProducts = useMemo(() => {
    return allProducts.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.vendor.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All Categories" || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  const handleProductClick = (productId: string) => {
    navigate(`/product/${productId}`);
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 sm:mb-6"
      >
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
          Browse Products
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Discover products from verified manufacturers
        </p>
      </motion.div>

      {/* Filters bar */}
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
            <Input
              placeholder="Search products, vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" size="icon" className="shrink-0">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="min-w-[140px] flex-shrink-0 sm:w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="min-w-[120px] flex-shrink-0 sm:w-[140px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
              <SelectItem value="rating">Highest Rated</SelectItem>
              <SelectItem value="newest">Newest First</SelectItem>
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

        {/* Results count */}
        <p className="text-xs text-muted-foreground">
          {filteredProducts.length} products found
        </p>
      </motion.div>

      {/* Products grid */}
      <div className={cn(
        "grid gap-3 sm:gap-4",
        viewMode === "grid"
          ? "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "grid-cols-1"
      )}>
        {filteredProducts.map((product, index) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => handleProductClick(product.id)}
          >
            <Card className="group overflow-hidden border-border/50 transition-all hover:border-accent/30 hover:shadow-lg cursor-pointer">
              <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                <img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                
                {/* Wishlist button */}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Heart className="h-4 w-4" />
                </button>

                {/* Verified badge */}
                {product.verified && (
                  <Badge className="absolute left-2 top-2 bg-accent text-accent-foreground text-[10px]">
                    ✓ Verified
                  </Badge>
                )}
              </div>

              <CardContent className="p-3 sm:p-4">
                <div className="mb-2">
                  <h3 className="font-medium text-card-foreground line-clamp-2 text-sm sm:text-base">
                    {product.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {product.subType}
                  </p>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <span className="font-display text-base font-semibold text-card-foreground sm:text-lg">
                    {product.price}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="h-3 w-3 fill-accent text-accent" />
                    <span>{product.rating}</span>
                    <span>({product.reviews})</span>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    <span>MOQ: {product.moq}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{product.location}</span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground truncate">
                    by <span className="font-medium text-foreground">{product.vendor}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Empty state */}
      {filteredProducts.length === 0 && (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No products found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Try adjusting your search or filters
            </p>
            <Button variant="outline" onClick={() => {
              setSearchQuery("");
              setSelectedCategory("All Categories");
            }}>
              Clear filters
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {filteredProducts.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row"
        >
          <p className="text-xs text-muted-foreground sm:text-sm">
            Showing 1-{filteredProducts.length} of {filteredProducts.length} products
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
      )}
    </DashboardLayout>
  );
};

export default BrowseProducts;
