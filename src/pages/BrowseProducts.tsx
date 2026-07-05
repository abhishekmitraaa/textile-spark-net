import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useCallVendor } from "@/lib/queries/calls";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Heart,
  Star,
  MapPin,
  Package,
  SlidersHorizontal,
  Phone,
  Grid3X3,
  List,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const allProducts = [
  {
    id: "1",
    name: "Premium Cotton Polo T-shirt",
    category: "Men's T-shirts",
    subType: "Polo T-shirt",
    price: "₹499",
    moq: "MOQ: 2",
    enquiries: "800+ Enquiries",
    manufacturer: "Fashion Hub Pvt Ltd",
    location: "Bangalore, IND",
    fabric: "Cotton",
    gsm: "GSM: 220",
    fitType: "Fit Type: Regular",
    rating: 4.1,
    reviews: 565,
    verified: true,
    images: [
      "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=500&fit=crop",
    ],
  },
  {
    id: "2",
    name: "Classic White Shirt",
    category: "Men's Shirts",
    subType: "Formal Shirt",
    price: "₹599",
    moq: "MOQ: 2",
    enquiries: "800+ Enquiries",
    manufacturer: "Textile Mills India",
    location: "Mumbai, IND",
    fabric: "Cotton",
    gsm: "GSM: 200",
    fitType: "Fit Type: Regular",
    rating: 3.2,
    reviews: 750,
    verified: true,
    images: [
      "https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=500&fit=crop",
    ],
  },
  {
    id: "3",
    name: "Women's Casual Tank Top",
    category: "Women's Tops",
    subType: "Tank Top",
    price: "₹349",
    moq: "MOQ: 5",
    enquiries: "500+ Enquiries",
    manufacturer: "Trendy Fashion Co",
    location: "Delhi, IND",
    fabric: "Linen",
    gsm: "GSM: 180",
    fitType: "Fit Type: Slim",
    rating: 4.7,
    reviews: 320,
    verified: true,
    images: [
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&h=500&fit=crop",
    ],
  },
  {
    id: "4",
    name: "Oversized Cotton Tee",
    category: "Men's T-shirts",
    subType: "Oversized Fit",
    price: "₹449",
    moq: "MOQ: 10",
    enquiries: "1200+ Enquiries",
    manufacturer: "Urban Style Co",
    location: "Bangalore, IND",
    fabric: "Cotton",
    gsm: "GSM: 240",
    fitType: "Fit Type: Oversized",
    rating: 4.9,
    reviews: 880,
    verified: true,
    images: [
      "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=500&fit=crop",
    ],
  },
  {
    id: "5",
    name: "Summer Linen Shirt",
    category: "Men's Shirts",
    subType: "Casual Shirt",
    price: "₹799",
    moq: "MOQ: 5",
    enquiries: "600+ Enquiries",
    manufacturer: "Silk House India",
    location: "Surat, IND",
    fabric: "Linen",
    gsm: "GSM: 160",
    fitType: "Fit Type: Relaxed",
    rating: 4.5,
    reviews: 410,
    verified: false,
    images: [
      "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?w=400&h=500&fit=crop",
    ],
  },
  {
    id: "6",
    name: "Women's Floral Dress",
    category: "Women's Dresses",
    subType: "Casual Dress",
    price: "₹899",
    moq: "MOQ: 3",
    enquiries: "900+ Enquiries",
    manufacturer: "Bloom Designs",
    location: "Jaipur, IND",
    fabric: "Chiffon",
    gsm: "GSM: 120",
    fitType: "Fit Type: A-Line",
    rating: 4.8,
    reviews: 530,
    verified: true,
    images: [
      "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=500&fit=crop",
    ],
  },
];

const categories = ["All", "Men's T-shirts", "Men's Shirts", "Women's Tops", "Women's Dresses"];

// Product card component
const ProductCard = ({ product, index }: { product: typeof allProducts[0]; index: number }) => {
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();
  const callVendor = useCallVendor();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="flex flex-col rounded-xl border border-border bg-card overflow-hidden"
    >
      {/* Image */}
      <div
        className="relative aspect-[3/4] overflow-hidden bg-muted cursor-pointer"
        onClick={() => navigate(`/product/${product.id}`)}
      >
        <img
          src={product.images[0]}
          alt={product.name}
          className="h-full w-full object-cover"
        />

        {/* Bookmark button */}
        <button
          onClick={(e) => { e.stopPropagation(); setSaved(!saved); }}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition-all hover:scale-110"
        >
          <Heart className={cn("h-4 w-4 transition-colors", saved ? "fill-accent text-accent" : "text-muted-foreground")} />
        </button>

        {/* Verified badge */}
        {product.verified && (
          <div className="absolute left-2 top-2">
            <Badge className="bg-accent text-accent-foreground text-[10px] px-1.5 py-0.5">
              ✓ Verified
            </Badge>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-2.5 gap-1.5">
        {/* Rating + MOQ row */}
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-0.5 text-muted-foreground font-medium">
            <Star className="h-3 w-3 fill-accent text-accent" />
            <span>{product.rating}</span>
            <span className="text-muted-foreground/60 ml-0.5">| {product.reviews}</span>
          </div>
          <span className="text-muted-foreground">{product.moq}</span>
        </div>

        {/* Price */}
        <p className="text-base font-bold text-foreground leading-none">{product.price}</p>

        {/* Enquiries */}
        <p className="text-[10px] text-muted-foreground">{product.enquiries}</p>

        {/* Manufacturer */}
        <p className="text-[11px] font-semibold text-foreground truncate leading-tight">
          {product.manufacturer}
        </p>

        {/* Location */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          <span>{product.location}</span>
        </div>

        {/* Specs */}
        <div className="text-[10px] text-muted-foreground leading-snug">
          <p>Fabric: {product.fabric} | {product.gsm}</p>
          <p>{product.fitType}</p>
        </div>

        {/* Call Now button */}
        <Button
          size="sm"
          className="mt-1 w-full bg-accent hover:bg-accent/90 text-accent-foreground h-9 rounded-lg gap-1.5 text-sm font-semibold shadow-sm"
          onClick={(e) => { e.stopPropagation(); callVendor(String(product.id), product.name); }}
        >
          <Phone className="h-3.5 w-3.5" />
          Call Now
        </Button>
      </div>
    </motion.div>
  );
};

const BrowseProducts = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredProducts = useMemo(() => {
    return allProducts.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.manufacturer.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === "All" || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <DashboardLayout>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-3"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground sm:text-xl">
              Today's New In
            </h1>
            <p className="text-xs text-muted-foreground">New Everyday Fashion</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "rounded-lg p-2 transition-colors",
                viewMode === "grid" ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-lg p-2 transition-colors",
                viewMode === "list" ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search for items or brands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 text-sm"
            />
          </div>
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 mb-4">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border transition-all",
              selectedCategory === cat
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:border-foreground/40"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results count + view all */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          {filteredProducts.length} products
        </p>
        <button className="flex items-center gap-0.5 text-xs font-medium text-accent hover:underline">
          View All <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Products grid */}
      {filteredProducts.length > 0 ? (
        <div className={cn(
          "grid gap-3",
          viewMode === "grid"
            ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
            : "grid-cols-1 sm:grid-cols-2"
        )}>
          {filteredProducts.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="text-base font-medium text-foreground mb-1">No products found</h3>
          <p className="text-sm text-muted-foreground mb-4">Try adjusting your search or filters</p>
          <Button variant="outline" size="sm" onClick={() => { setSearchQuery(""); setSelectedCategory("All"); }}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Load more */}
      {filteredProducts.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 flex justify-center"
        >
          <Button variant="outline" className="w-full sm:w-auto gap-2">
            Load More Products
          </Button>
        </motion.div>
      )}
    </DashboardLayout>
  );
};

export default BrowseProducts;
