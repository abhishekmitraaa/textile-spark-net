import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ArrowLeft,
  Search,
  Filter,
  Grid3X3,
  List,
  Heart,
  Star,
  MessageSquare,
  ChevronDown,
  Check,
  X,
  SlidersHorizontal,
  MapPin,
  Package,
  Gem,
  Layers,
  Scissors,
  Tag,
  Box,
  Shirt,
  Wrench,
  Palette,
  Printer,
  Headphones,
  Truck,
  Monitor,
  Landmark,
  Camera,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sellerCategories } from "@/data/sellerCategories";

// Icon mapping for categories
const categoryIcons: Record<string, React.ElementType> = {
  Gem: Gem,
  Layers: Layers,
  Scissors: Scissors,
  Tag: Tag,
  Box: Box,
  Shirt: Shirt,
  Wrench: Wrench,
  Palette: Palette,
  Printer: Printer,
  Headphones: Headphones,
  Truck: Truck,
  Monitor: Monitor,
  Landmark: Landmark,
  Camera: Camera,
  User: User,
};

// Sub-types mapping (same as upload page)
const subTypesBySubCategory: Record<string, string[]> = {
  // Men's Apparel
  "mens-tshirts": ["Round Neck T-shirt", "V-Neck T-shirt", "Polo T-shirt", "Henley T-shirt", "Full Sleeve T-shirt", "Graphic T-shirt", "Oversized T-shirt"],
  "mens-shirts": ["Formal Shirt", "Casual Shirt", "Denim Shirt", "Linen Shirt", "Oxford Shirt", "Flannel Shirt", "Party Wear Shirt"],
  "mens-pants": ["Formal Trousers", "Chinos", "Cargo Pants", "Joggers", "Track Pants", "Pleated Pants"],
  "mens-jeans": ["Slim Fit Jeans", "Regular Fit Jeans", "Skinny Jeans", "Straight Fit Jeans", "Bootcut Jeans", "Relaxed Fit Jeans", "Tapered Jeans"],
  "mens-shorts": ["Cargo Shorts", "Denim Shorts", "Chino Shorts", "Sports Shorts", "Swim Shorts", "Lounge Shorts"],
  // Women's Apparel
  "womens-tops": ["Crop Top", "Tank Top", "Blouse", "Peplum Top", "Off-shoulder Top", "Wrap Top", "Shirt Top"],
  "womens-dresses": ["Maxi Dress", "Mini Dress", "Midi Dress", "A-line Dress", "Bodycon Dress", "Wrap Dress", "Shift Dress", "Shirt Dress"],
  "womens-ethnic": ["Kurti", "Salwar Suit", "Anarkali", "Lehenga", "Saree", "Palazzo Set", "Sharara"],
  // Machinery
  "sewing-machines": ["Single Needle Lockstitch", "Double Needle", "Overlock Machine", "Flatlock Machine", "Bartack Machine", "Button Attach", "Buttonhole Machine"],
  "cutting-machines": ["Straight Knife", "Round Knife", "Band Knife", "Die Cutting", "Laser Cutting", "Automatic Spreading"],
  "printing-machines": ["Screen Printing", "DTG Printer", "Heat Press", "Sublimation Printer", "Rotary Printer"],
};

// Sample products data
const sampleProducts = [
  {
    id: "1",
    name: "Premium Cotton Polo T-shirt",
    category: "apparel-home",
    subCategory: "mens-tshirts",
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
    category: "raw-materials",
    subCategory: "knitted-fabrics",
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
    category: "machinery",
    subCategory: "sewing-machines",
    subType: "Single Needle Lockstitch",
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
    category: "trims-accessories",
    subCategory: "buttons",
    subType: "Metal",
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
    category: "apparel-home",
    subCategory: "womens-ethnic",
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
    category: "raw-materials",
    subCategory: "denim",
    subType: "Stretch",
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
];

type BrowseStep = "category" | "subcategory" | "products";

const BrowseProducts = () => {
  const [currentStep, setCurrentStep] = useState<BrowseStep>("category");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [selectedSubType, setSelectedSubType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [subCategorySearch, setSubCategorySearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [subTypeOpen, setSubTypeOpen] = useState(false);

  // Get current category data
  const currentCategory = useMemo(() => {
    return sellerCategories.find((cat) => cat.id === selectedCategory);
  }, [selectedCategory]);

  // Filter sub-categories based on search
  const filteredSubCategories = useMemo(() => {
    if (!currentCategory) return [];
    return currentCategory.subCategories.filter((sub) =>
      sub.name.toLowerCase().includes(subCategorySearch.toLowerCase())
    );
  }, [currentCategory, subCategorySearch]);

  // Get sub-types for selected sub-category
  const availableSubTypes = useMemo(() => {
    if (!selectedSubCategory) return [];
    return subTypesBySubCategory[selectedSubCategory] || [];
  }, [selectedSubCategory]);

  // Filter products based on selections
  const filteredProducts = useMemo(() => {
    return sampleProducts.filter((product) => {
      if (selectedCategory && product.category !== selectedCategory) return false;
      if (selectedSubCategory && product.subCategory !== selectedSubCategory) return false;
      if (selectedSubType && product.subType !== selectedSubType) return false;
      if (searchQuery && !product.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [selectedCategory, selectedSubCategory, selectedSubType, searchQuery]);

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setSelectedSubCategory(null);
    setSelectedSubType(null);
    setSubCategorySearch("");
    setCurrentStep("subcategory");
  };

  const handleSubCategorySelect = (subCategoryId: string) => {
    setSelectedSubCategory(subCategoryId);
    setSelectedSubType(null);
    setCurrentStep("products");
  };

  const handleBack = () => {
    if (currentStep === "products") {
      setCurrentStep("subcategory");
      setSelectedSubCategory(null);
      setSelectedSubType(null);
    } else if (currentStep === "subcategory") {
      setCurrentStep("category");
      setSelectedCategory(null);
    }
  };

  const clearFilters = () => {
    setSelectedCategory(null);
    setSelectedSubCategory(null);
    setSelectedSubType(null);
    setSearchQuery("");
    setCurrentStep("category");
  };

  // Get step progress
  const getStepNumber = () => {
    switch (currentStep) {
      case "category":
        return 1;
      case "subcategory":
        return 2;
      case "products":
        return 3;
      default:
        return 1;
    }
  };

  return (
    <DashboardLayout>
      {/* Header with back button and progress */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 sm:mb-6"
      >
        <div className="flex items-center gap-3 mb-4">
          {currentStep !== "category" && (
            <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
              {currentStep === "category" && "Browse Products"}
              {currentStep === "subcategory" && currentCategory?.name}
              {currentStep === "products" && (
                currentCategory?.subCategories.find((s) => s.id === selectedSubCategory)?.name || "Products"
              )}
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {currentStep === "category" && "Select a category to explore products"}
              {currentStep === "subcategory" && "Choose a sub-category to narrow down"}
              {currentStep === "products" && `${filteredProducts.length} products found`}
            </p>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors",
                  step <= getStepNumber()
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step}
              </div>
              {step < 3 && (
                <div
                  className={cn(
                    "h-0.5 w-8 sm:w-12 transition-colors",
                    step < getStepNumber() ? "bg-accent" : "bg-muted"
                  )}
                />
              )}
            </div>
          ))}
          <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
            {currentStep === "category" && "Category"}
            {currentStep === "subcategory" && "Sub-category"}
            {currentStep === "products" && "Products"}
          </span>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* Step 1: Category Selection */}
        {currentStep === "category" && (
          <motion.div
            key="category"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-border/50">
              <CardContent className="p-4 sm:p-6">
                <h3 className="mb-4 text-base font-medium text-foreground sm:text-lg">
                  What are you looking for?
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 lg:gap-4">
                  {sellerCategories.map((category, index) => {
                    const IconComponent = categoryIcons[category.icon] || Package;
                    return (
                      <motion.button
                        key={category.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        onClick={() => handleCategorySelect(category.id)}
                        className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center transition-all hover:border-accent/50 hover:bg-accent/5 hover:shadow-md sm:gap-3 sm:p-4"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground sm:h-12 sm:w-12">
                          <IconComponent className="h-5 w-5 sm:h-6 sm:w-6" />
                        </div>
                        <span className="text-xs font-medium text-foreground line-clamp-2 sm:text-sm">
                          {category.name}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Step 2: Sub-Category Selection */}
        {currentStep === "subcategory" && currentCategory && (
          <motion.div
            key="subcategory"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-border/50">
              <CardContent className="p-4 sm:p-6">
                {/* Search bar */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search sub-categories..."
                    value={subCategorySearch}
                    onChange={(e) => setSubCategorySearch(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <h3 className="mb-4 text-base font-medium text-foreground sm:text-lg">
                  Select sub-category
                </h3>

                <ScrollArea className="h-[400px] sm:h-[450px]">
                  <div className="grid grid-cols-2 gap-2 pr-4 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                    {filteredSubCategories.map((subCategory, index) => (
                      <motion.button
                        key={subCategory.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                        onClick={() => handleSubCategorySelect(subCategory.id)}
                        className="group rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-accent/50 hover:bg-accent/5 hover:shadow-md sm:p-4"
                      >
                        <span className="text-xs font-medium text-foreground line-clamp-2 sm:text-sm">
                          {subCategory.name}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Step 3: Products Grid */}
        {currentStep === "products" && (
          <motion.div
            key="products"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Filters bar */}
            <Card className="border-border/50">
              <CardContent className="p-3 sm:p-4">
                {/* Search and filters */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search products..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Sub-type dropdown */}
                  {availableSubTypes.length > 0 && (
                    <Popover open={subTypeOpen} onOpenChange={setSubTypeOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-between gap-2 min-w-[160px]">
                          {selectedSubType || "Select type"}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[250px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search type..." />
                          <CommandList>
                            <CommandEmpty>No type found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  setSelectedSubType(null);
                                  setSubTypeOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    !selectedSubType ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                All Types
                              </CommandItem>
                              {availableSubTypes.map((type) => (
                                <CommandItem
                                  key={type}
                                  onSelect={() => {
                                    setSelectedSubType(type);
                                    setSubTypeOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedSubType === type ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {type}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon">
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>

                    {/* View toggle */}
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
                  </div>
                </div>

                {/* Active filters */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1">
                    {currentCategory?.name}
                    <button onClick={clearFilters} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                  {selectedSubCategory && (
                    <Badge variant="secondary" className="gap-1">
                      {currentCategory?.subCategories.find((s) => s.id === selectedSubCategory)?.name}
                      <button
                        onClick={() => {
                          setSelectedSubCategory(null);
                          setSelectedSubType(null);
                          setCurrentStep("subcategory");
                        }}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {selectedSubType && (
                    <Badge variant="secondary" className="gap-1">
                      {selectedSubType}
                      <button onClick={() => setSelectedSubType(null)} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

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
                      <button className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground">
                        <Heart className="h-4 w-4" />
                      </button>

                      {/* Verified badge */}
                      {product.verified && (
                        <Badge className="absolute left-2 top-2 bg-accent text-accent-foreground text-[10px]">
                          ✓ Verified
                        </Badge>
                      )}

                      {/* Quick actions on hover */}
                      <div className="absolute inset-x-0 bottom-0 hidden items-center justify-center gap-2 p-3 opacity-0 transition-all duration-300 group-hover:opacity-100 sm:flex">
                        <Button size="sm" variant="secondary" className="backdrop-blur text-xs">
                          <MessageSquare className="mr-1 h-3 w-3" />
                          Inquire
                        </Button>
                        <Button size="sm" variant="gold" className="text-xs">
                          Get Quote
                        </Button>
                      </div>
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
                    Try adjusting your filters or search query
                  </p>
                  <Button variant="outline" onClick={clearFilters}>
                    Clear all filters
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Pagination */}
            {filteredProducts.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
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
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
};

export default BrowseProducts;
