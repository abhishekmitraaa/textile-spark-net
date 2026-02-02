import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  Grid3X3,
  List,
  Heart,
  Star,
  MapPin,
  Package,
  SlidersHorizontal,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Category options with icons (matching reference)
const categoryOptions = [
  { id: "tshirts", label: "T-Shirts", icon: "👕" },
  { id: "shirts", label: "Shirts", icon: "👔" },
  { id: "coords", label: "Co-ords", icon: "👗" },
  { id: "dresses", label: "Dresses", icon: "👗" },
  { id: "bottomwear", label: "Bottomwear", icon: "👖" },
  { id: "fabrics", label: "Fabrics", icon: "🧵" },
  { id: "accessories", label: "Fashion Accessories", icon: "👜" },
  { id: "kidswear", label: "Kidswear", icon: "🧒" },
  { id: "activewear", label: "Activewear", icon: "🏃" },
];

// Location options
const locationOptions = [
  { id: "tiruppur", label: "Tiruppur" },
  { id: "surat", label: "Surat" },
  { id: "ludhiana", label: "Ludhiana" },
  { id: "delhi", label: "Delhi NCR" },
  { id: "bangalore", label: "Bangalore" },
  { id: "mumbai", label: "Mumbai" },
  { id: "nopreference", label: "No preference" },
];

// Sample products data
const allProducts = [
  {
    id: "1",
    name: "Premium Cotton Polo T-shirt",
    category: "tshirts",
    price: "₹299",
    moq: "100 pcs",
    image: "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=400&h=500&fit=crop",
    rating: 4.8,
    reviews: 156,
    vendor: "Fashion Hub Pvt Ltd",
    location: "tiruppur",
    locationLabel: "Tiruppur, India",
    verified: true,
  },
  {
    id: "2",
    name: "100% Organic Cotton Fabric",
    category: "fabrics",
    price: "₹180/meter",
    moq: "500 meters",
    image: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=500&fit=crop",
    rating: 4.9,
    reviews: 234,
    vendor: "Textile Mills India",
    location: "surat",
    locationLabel: "Surat, India",
    verified: true,
  },
  {
    id: "3",
    name: "Designer Silk Saree",
    category: "dresses",
    price: "₹2,499",
    moq: "50 pcs",
    image: "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=400&h=500&fit=crop",
    rating: 4.9,
    reviews: 312,
    vendor: "Silk House",
    location: "mumbai",
    locationLabel: "Mumbai, India",
    verified: true,
  },
  {
    id: "4",
    name: "Men's Casual Chino Pants",
    category: "bottomwear",
    price: "₹599",
    moq: "50 pcs",
    image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400&h=500&fit=crop",
    rating: 4.5,
    reviews: 98,
    vendor: "Urban Style Co",
    location: "delhi",
    locationLabel: "Delhi NCR, India",
    verified: true,
  },
  {
    id: "5",
    name: "Women's Crop Top",
    category: "tshirts",
    price: "₹249",
    moq: "100 pcs",
    image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=500&fit=crop",
    rating: 4.7,
    reviews: 203,
    vendor: "Trendy Fashion",
    location: "bangalore",
    locationLabel: "Bangalore, India",
    verified: true,
  },
  {
    id: "6",
    name: "Kids Cotton T-Shirt Set",
    category: "kidswear",
    price: "₹399",
    moq: "200 pcs",
    image: "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=400&h=500&fit=crop",
    rating: 4.6,
    reviews: 89,
    vendor: "Little Stars Apparel",
    location: "tiruppur",
    locationLabel: "Tiruppur, India",
    verified: true,
  },
  {
    id: "7",
    name: "Sports Active Wear Set",
    category: "activewear",
    price: "₹799",
    moq: "100 pcs",
    image: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=400&h=500&fit=crop",
    rating: 4.8,
    reviews: 145,
    vendor: "FitStyle India",
    location: "bangalore",
    locationLabel: "Bangalore, India",
    verified: true,
  },
  {
    id: "8",
    name: "Premium Linen Shirt",
    category: "shirts",
    price: "₹549",
    moq: "75 pcs",
    image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&h=500&fit=crop",
    rating: 4.7,
    reviews: 167,
    vendor: "Classic Wear",
    location: "ludhiana",
    locationLabel: "Ludhiana, India",
    verified: true,
  },
];

type OnboardingStep = "welcome" | "categories" | "locations";

const PREFERENCES_KEY = "cosora_buyer_preferences";

interface BuyerPreferences {
  categories: string[];
  locations: string[];
  hasCompleted: boolean;
}

const ForYou = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  // Preference state
  const [preferences, setPreferences] = useState<BuyerPreferences | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("welcome");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);

  // Load preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(PREFERENCES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as BuyerPreferences;
      setPreferences(parsed);
      setSelectedCategories(parsed.categories);
      setSelectedLocations(parsed.locations);
    }
  }, []);

  const showOnboarding = !preferences?.hasCompleted;

  // Save preferences
  const savePreferences = (skip = false) => {
    const prefs: BuyerPreferences = {
      categories: skip ? [] : selectedCategories,
      locations: skip ? [] : selectedLocations,
      hasCompleted: true,
    };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
    setPreferences(prefs);
  };

  // Toggle category selection
  const toggleCategory = (id: string) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // Toggle location selection
  const toggleLocation = (id: string) => {
    if (id === "nopreference") {
      setSelectedLocations(["nopreference"]);
    } else {
      setSelectedLocations(prev => {
        const filtered = prev.filter(l => l !== "nopreference");
        return filtered.includes(id) 
          ? filtered.filter(l => l !== id) 
          : [...filtered, id];
      });
    }
  };

  // Remove preference chip
  const removePreference = (type: "category" | "location", id: string) => {
    if (type === "category") {
      const updated = selectedCategories.filter(c => c !== id);
      setSelectedCategories(updated);
      setPreferences(prev => prev ? { ...prev, categories: updated } : prev);
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
        ...preferences,
        categories: updated,
      }));
    } else {
      const updated = selectedLocations.filter(l => l !== id);
      setSelectedLocations(updated);
      setPreferences(prev => prev ? { ...prev, locations: updated } : prev);
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
        ...preferences,
        locations: updated,
      }));
    }
  };

  // Filter products based on preferences
  const filteredProducts = useMemo(() => {
    let products = allProducts;

    // Search filter
    if (searchQuery) {
      products = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.vendor.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Category preference filter
    if (selectedCategories.length > 0) {
      products = products.filter(p => selectedCategories.includes(p.category));
    }

    // Location preference filter
    if (selectedLocations.length > 0 && !selectedLocations.includes("nopreference")) {
      products = products.filter(p => selectedLocations.includes(p.location));
    }

    return products;
  }, [searchQuery, selectedCategories, selectedLocations]);

  const handleProductClick = (productId: string) => {
    navigate(`/product/${productId}`);
  };

  // Onboarding screens
  if (showOnboarding) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[70vh] items-center justify-center px-4">
          <AnimatePresence mode="wait">
            {/* Welcome Screen */}
            {onboardingStep === "welcome" && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full max-w-md text-center"
              >
                <div className="mb-6">
                  <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-accent/10">
                    <Sparkles className="h-12 w-12 text-accent" />
                  </div>
                  <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
                    Welcome to Cosora 👋
                  </h1>
                  <p className="mt-3 text-muted-foreground">
                    Tell us what you usually source so we can match you with the right manufacturers.
                  </p>
                </div>

                {/* Step indicators */}
                <div className="mb-8 flex justify-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-accent" />
                  <div className="h-2 w-2 rounded-full bg-muted" />
                  <div className="h-2 w-2 rounded-full bg-muted" />
                </div>

                <Button
                  onClick={() => setOnboardingStep("categories")}
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  size="lg"
                >
                  Start
                </Button>
                <button
                  onClick={() => savePreferences(true)}
                  className="mt-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  Skip for now
                </button>
              </motion.div>
            )}

            {/* Categories Screen */}
            {onboardingStep === "categories" && (
              <motion.div
                key="categories"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full max-w-md"
              >
                <div className="mb-6 text-center">
                  <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
                    What are you looking to source?
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Select all that apply
                  </p>
                </div>

                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {categoryOptions.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => toggleCategory(cat.id)}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                        selectedCategories.includes(cat.id)
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-accent/50"
                      )}
                    >
                      <span className="text-2xl">{cat.icon}</span>
                      <span className="text-xs font-medium text-foreground sm:text-sm">
                        {cat.label}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Step indicators */}
                <div className="mb-6 flex justify-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-accent" />
                  <div className="h-2 w-2 rounded-full bg-accent" />
                  <div className="h-2 w-2 rounded-full bg-muted" />
                </div>

                <Button
                  onClick={() => setOnboardingStep("locations")}
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  size="lg"
                >
                  Next
                </Button>
              </motion.div>
            )}

            {/* Locations Screen */}
            {onboardingStep === "locations" && (
              <motion.div
                key="locations"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full max-w-md"
              >
                <div className="mb-6 text-center">
                  <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
                    Where do you prefer to source from?
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Choose one or more locations
                  </p>
                </div>

                <div className="mb-6 space-y-2">
                  {locationOptions.map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() => toggleLocation(loc.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border-2 p-4 transition-all",
                        selectedLocations.includes(loc.id)
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-accent/50"
                      )}
                    >
                      <span className="font-medium text-foreground">
                        {loc.label}
                      </span>
                      <div
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
                          selectedLocations.includes(loc.id)
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-muted-foreground"
                        )}
                      >
                        {selectedLocations.includes(loc.id) && (
                          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Step indicators */}
                <div className="mb-6 flex justify-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-accent" />
                  <div className="h-2 w-2 rounded-full bg-accent" />
                  <div className="h-2 w-2 rounded-full bg-accent" />
                </div>

                <Button
                  onClick={() => savePreferences(false)}
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  size="lg"
                >
                  Done
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DashboardLayout>
    );
  }

  // Main For You feed
  return (
    <DashboardLayout>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 sm:mb-6"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
            For You
          </h1>
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Personalized recommendations based on your preferences
        </p>
      </motion.div>

      {/* Editable Preference Chips */}
      {(selectedCategories.length > 0 || selectedLocations.length > 0) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4 flex flex-wrap gap-2"
        >
          {selectedCategories.map((catId) => {
            const cat = categoryOptions.find(c => c.id === catId);
            return cat ? (
              <Badge
                key={catId}
                variant="secondary"
                className="flex items-center gap-1 pr-1"
              >
                {cat.icon} {cat.label}
                <button
                  onClick={() => removePreference("category", catId)}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null;
          })}
          {selectedLocations.filter(l => l !== "nopreference").map((locId) => {
            const loc = locationOptions.find(l => l.id === locId);
            return loc ? (
              <Badge
                key={locId}
                variant="outline"
                className="flex items-center gap-1 pr-1"
              >
                <MapPin className="h-3 w-3" /> {loc.label}
                <button
                  onClick={() => removePreference("location", locId)}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null;
          })}
        </motion.div>
      )}

      {/* Search bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4 flex gap-2 sm:mb-6"
      >
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
        {/* View toggle - hidden on mobile */}
        <div className="hidden gap-1 rounded-lg border border-border p-1 sm:flex">
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

      {/* Results count */}
      <p className="mb-4 text-xs text-muted-foreground">
        {filteredProducts.length} products for you
      </p>

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
                    <span className="truncate">{product.locationLabel}</span>
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
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No matches found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Try adjusting your preferences or search
            </p>
            <Button 
              variant="outline" 
              onClick={() => {
                setSearchQuery("");
                setSelectedCategories([]);
                setSelectedLocations([]);
                localStorage.removeItem(PREFERENCES_KEY);
                setPreferences(null);
              }}
            >
              Reset preferences
            </Button>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
};

export default ForYou;
