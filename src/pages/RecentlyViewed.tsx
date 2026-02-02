import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { 
  ArrowLeft, 
  Heart, 
  MessageCircle, 
  Phone, 
  Star, 
  Clock, 
  Trash2,
  Filter,
  ChevronRight,
  BadgeCheck,
  MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Mock recently viewed products
const recentlyViewedProducts = [
  {
    id: "1",
    name: "Premium Cotton Polo T-Shirt",
    vendor: "Tirupur Textiles",
    vendorVerified: true,
    location: "Tirupur, Tamil Nadu",
    price: "₹320",
    priceUnit: "per piece",
    moq: "100 pieces",
    rating: 4.8,
    reviews: 156,
    image: "https://images.unsplash.com/photo-1625910513413-5fc4e5e3d7a0?w=400",
    viewedAt: "2 hours ago",
    category: "Men's T-shirts",
  },
  {
    id: "2",
    name: "Women's Casual Kurta Set",
    vendor: "Delhi Fashion Hub",
    vendorVerified: true,
    location: "Delhi NCR",
    price: "₹850",
    priceUnit: "per set",
    moq: "50 sets",
    rating: 4.6,
    reviews: 89,
    image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400",
    viewedAt: "5 hours ago",
    category: "Women's Ethnic",
  },
  {
    id: "3",
    name: "Kids Cotton Shorts",
    vendor: "Gujarat Garments",
    vendorVerified: false,
    location: "Ahmedabad, Gujarat",
    price: "₹180",
    priceUnit: "per piece",
    moq: "200 pieces",
    rating: 4.3,
    reviews: 45,
    image: "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=400",
    viewedAt: "Yesterday",
    category: "Kids Wear",
  },
  {
    id: "4",
    name: "Denim Jeans - Slim Fit",
    vendor: "Mumbai Denim Co.",
    vendorVerified: true,
    location: "Mumbai, Maharashtra",
    price: "₹650",
    priceUnit: "per piece",
    moq: "75 pieces",
    rating: 4.7,
    reviews: 203,
    image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400",
    viewedAt: "Yesterday",
    category: "Men's Bottoms",
  },
  {
    id: "5",
    name: "Formal Cotton Shirt",
    vendor: "Bangalore Apparel",
    vendorVerified: true,
    location: "Bangalore, Karnataka",
    price: "₹420",
    priceUnit: "per piece",
    moq: "100 pieces",
    rating: 4.5,
    reviews: 78,
    image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400",
    viewedAt: "2 days ago",
    category: "Men's Shirts",
  },
  {
    id: "6",
    name: "Sports Track Pants",
    vendor: "Active Wear India",
    vendorVerified: false,
    location: "Ludhiana, Punjab",
    price: "₹380",
    priceUnit: "per piece",
    moq: "150 pieces",
    rating: 4.2,
    reviews: 34,
    image: "https://images.unsplash.com/photo-1556906781-9a412961c28c?w=400",
    viewedAt: "3 days ago",
    category: "Sportswear",
  },
];

const RecentlyViewed = () => {
  const [products, setProducts] = useState(recentlyViewedProducts);
  const [wishlist, setWishlist] = useState<string[]>([]);

  const toggleWishlist = (id: string) => {
    setWishlist(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const removeFromHistory = (id: string) => {
    setProducts(prev => prev.filter(item => item.id !== id));
  };

  const clearAllHistory = () => {
    setProducts([]);
  };

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary lg:hidden">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Recently Viewed</h1>
              <p className="text-xs text-muted-foreground">{products.length} products</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {products.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 size={16} className="mr-1" />
                    <span className="hidden sm:inline">Clear All</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear viewing history?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all recently viewed products. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={clearAllHistory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Clear All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {products.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Clock size={32} className="text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-foreground">No recently viewed products</h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Products you view will appear here so you can easily find them again.
            </p>
            <Link to="/browse">
              <Button>
                Browse Products
              </Button>
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                  {/* Product Image */}
                  <Link to={`/product/${product.id}`} className="shrink-0">
                    <div className="relative h-24 w-24 overflow-hidden rounded-lg bg-muted sm:h-28 sm:w-28">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      {/* Wishlist button */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          toggleWishlist(product.id);
                        }}
                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-colors hover:bg-background"
                      >
                        <Heart
                          size={14}
                          className={wishlist.includes(product.id) ? "fill-red-500 text-red-500" : "text-muted-foreground"}
                        />
                      </button>
                    </div>
                  </Link>

                  {/* Product Details */}
                  <div className="flex flex-1 flex-col justify-between overflow-hidden">
                    <div>
                      <Link to={`/product/${product.id}`}>
                        <h3 className="line-clamp-2 text-sm font-medium text-card-foreground transition-colors hover:text-primary sm:text-base">
                          {product.name}
                        </h3>
                      </Link>
                      
                      {/* Vendor Info */}
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground sm:text-sm">{product.vendor}</span>
                        {product.vendorVerified && (
                          <BadgeCheck size={14} className="text-primary" />
                        )}
                      </div>

                      {/* Location */}
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin size={12} />
                        <span>{product.location}</span>
                      </div>

                      {/* Rating */}
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex items-center gap-0.5">
                          <Star size={12} className="fill-amber-400 text-amber-400" />
                          <span className="text-xs font-medium">{product.rating}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">({product.reviews} reviews)</span>
                      </div>
                    </div>

                    {/* Price & MOQ */}
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-card-foreground sm:text-base">{product.price}</p>
                        <p className="text-xs text-muted-foreground">MOQ: {product.moq}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock size={12} />
                        <span>{product.viewedAt}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-2.5 sm:px-4">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5">
                    <MessageCircle size={14} />
                    <span>Chat</span>
                  </Button>
                  <Button size="sm" className="flex-1 gap-1.5">
                    <Phone size={14} />
                    <span>Call Now</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFromHistory(product.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentlyViewed;
