import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Heart,
  Share2,
  Star,
  MapPin,
  Package,
  Phone,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Play,
  Building2,
  Shield,
  Clock,
  Truck,
  CheckCircle2,
  Users,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock product data - in real app this would come from API
const productData: Record<string, any> = {
  "1": {
    id: "1",
    name: "Premium Cotton Polo T-shirt",
    price: "₹299",
    priceRange: "₹250 - ₹350",
    moq: "100 pcs",
    category: "Men's T-shirts",
    subType: "Polo T-shirt",
    images: [
      "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=600&h=800&fit=crop",
      "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&h=800&fit=crop",
      "https://images.unsplash.com/photo-1622445275576-721325763afe?w=600&h=800&fit=crop",
    ],
    vendor: {
      name: "Fashion Hub Pvt Ltd",
      logo: "FH",
      location: "Mumbai, India",
      verified: true,
      rating: 4.8,
      reviews: 156,
      responseTime: "Usually responds within 2 hours",
      memberSince: "2019",
    },
    specifications: {
      "Fabric": "100% Cotton",
      "GSM": "180 GSM",
      "Fit Type": "Regular Fit",
      "Collar": "Polo Collar",
      "Sleeve": "Half Sleeve",
      "Pattern": "Solid",
      "Wash Care": "Machine Wash",
    },
    availableSizes: ["S", "M", "L", "XL", "XXL"],
    availableColors: ["White", "Black", "Navy", "Grey", "Red", "Green"],
    description: `Premium quality polo t-shirt made from 100% combed cotton. Features a classic polo collar with 3-button placket. Perfect for casual and semi-formal occasions.

• Soft and breathable fabric
• Pre-shrunk to maintain shape
• Ribbed collar and cuffs
• Side vents for comfort
• Available in multiple colors`,
    termsAndConditions: `• Minimum order quantity is 100 pieces per color
• Please make a deposit after confirming the order (Minimum 30% for orders above ₹50,000)
• Products are made to order, so unless the fabric has not been ordered, cancellation is possible
• Refund/exchange will be initiated within 2-3 days
• Custom branding available at additional cost`,
    availableRegions: ["Delhi", "Punjab", "Haryana", "Gujarat", "Maharashtra", "Karnataka", "Tamil Nadu", "West Bengal"],
    rating: 4.8,
    totalReviews: 156,
    reviews: [
      { id: 1, user: "Rahul K.", rating: 5, date: "2 weeks ago", comment: "Excellent quality! The fabric is soft and stitching is perfect.", helpful: 12 },
      { id: 2, user: "Priya S.", rating: 4, date: "1 month ago", comment: "Good product, but delivery took longer than expected.", helpful: 5 },
      { id: 3, user: "Amit M.", rating: 5, date: "1 month ago", comment: "Best quality polo shirts at this price. Ordered 500 pieces!", helpful: 23 },
    ],
    customerPhotos: [
      "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200&h=200&fit=crop",
      "https://images.unsplash.com/photo-1622445275576-721325763afe?w=200&h=200&fit=crop",
      "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=200&h=200&fit=crop",
    ],
    relatedProducts: [
      { id: "7", name: "Men's Casual Chino", price: "₹599", image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=200&h=250&fit=crop", rating: 4.5 },
      { id: "2", name: "Organic Cotton Fabric", price: "₹180/m", image: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=200&h=250&fit=crop", rating: 4.9 },
      { id: "8", name: "Women's Crop Top", price: "₹249", image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=200&h=250&fit=crop", rating: 4.7 },
    ],
  },
};

// Default product for other IDs
const defaultProduct = {
  id: "default",
  name: "Sample Product",
  price: "₹499",
  priceRange: "₹400 - ₹600",
  moq: "50 pcs",
  category: "Apparel",
  subType: "T-shirt",
  images: [
    "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=600&h=800&fit=crop",
  ],
  vendor: {
    name: "Sample Vendor",
    logo: "SV",
    location: "India",
    verified: true,
    rating: 4.5,
    reviews: 100,
    responseTime: "Usually responds within 4 hours",
    memberSince: "2020",
  },
  specifications: {
    "Material": "Cotton Blend",
    "Weight": "150 GSM",
  },
  availableSizes: ["S", "M", "L", "XL"],
  availableColors: ["White", "Black"],
  description: "High quality product from verified manufacturer.",
  termsAndConditions: "Standard terms apply.",
  availableRegions: ["Pan India"],
  rating: 4.5,
  totalReviews: 100,
  reviews: [],
  customerPhotos: [],
  relatedProducts: [],
};

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isWishlisted, setIsWishlisted] = useState(false);

  const product = productData[id || ""] || defaultProduct;

  const nextImage = () => {
    setCurrentImageIndex((prev) => 
      prev === product.images.length - 1 ? 0 : prev + 1
    );
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => 
      prev === 0 ? product.images.length - 1 : prev - 1
    );
  };

  return (
    <DashboardLayout>
      {/* Header with back button */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-center gap-3"
      >
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsWishlisted(!isWishlisted)}
        >
          <Heart className={cn("h-5 w-5", isWishlisted && "fill-destructive text-destructive")} />
        </Button>
        <Button variant="ghost" size="icon">
          <Share2 className="h-5 w-5" />
        </Button>
      </motion.div>

      <div className="space-y-4 pb-24">
        {/* Image carousel */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted sm:aspect-[3/4] lg:aspect-[4/3]"
        >
          <img
            src={product.images[currentImageIndex]}
            alt={product.name}
            className="h-full w-full object-cover"
          />
          
          {/* Image navigation */}
          {product.images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-colors hover:bg-background"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-colors hover:bg-background"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              
              {/* Image indicators */}
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {product.images.map((_: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={cn(
                      "h-2 w-2 rounded-full transition-all",
                      idx === currentImageIndex
                        ? "bg-accent w-4"
                        : "bg-background/60"
                    )}
                  />
                ))}
              </div>
            </>
          )}

          {/* Image count */}
          <div className="absolute bottom-3 right-3 rounded-full bg-background/80 px-2 py-1 text-xs backdrop-blur">
            {currentImageIndex + 1}/{product.images.length}
          </div>
        </motion.div>

        {/* Thumbnail strip */}
        {product.images.length > 1 && (
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2">
              {product.images.map((img: string, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={cn(
                    "relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                    idx === currentImageIndex
                      ? "border-accent"
                      : "border-transparent opacity-60 hover:opacity-100"
                  )}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}

        {/* Price and basic info */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{product.category}</p>
                <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
                  {product.name}
                </h1>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-accent sm:text-3xl">{product.price}</p>
                <p className="text-xs text-muted-foreground">{product.priceRange}</p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-accent text-accent" />
                <span className="font-medium text-foreground">{product.rating}</span>
                <span>({product.totalReviews} reviews)</span>
              </div>
              <div className="flex items-center gap-1">
                <Package className="h-4 w-4" />
                <span>MOQ: {product.moq}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Manufacturer/Vendor info */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-accent/40 text-lg font-bold text-foreground">
                {product.vendor.logo}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground truncate">
                    {product.vendor.name}
                  </h3>
                  {product.vendor.verified && (
                    <Badge variant="outline" className="border-accent/50 text-accent text-[10px] shrink-0">
                      <Shield className="mr-1 h-3 w-3" /> Verified
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-accent text-accent" />
                    {product.vendor.rating}
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {product.vendor.location}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(`/vendor/${product.id}`)}>
                View Profile
              </Button>
            </div>

            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {product.vendor.responseTime}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for details */}
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
            <TabsTrigger value="reviews" className="flex-1">Reviews</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-4">
            {/* Specifications */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Specifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(product.specifications).map(([key, value]) => (
                  <div key={key} className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-sm text-muted-foreground">{key}</span>
                    <span className="text-sm font-medium text-foreground">{value as string}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Available sizes */}
            {product.availableSizes && product.availableSizes.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Available Sizes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {product.availableSizes.map((size: string) => (
                      <Badge key={size} variant="secondary" className="px-3 py-1">
                        {size}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Available colors */}
            {product.availableColors && product.availableColors.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Available Colors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {product.availableColors.map((color: string) => (
                      <Badge key={color} variant="outline" className="px-3 py-1">
                        {color}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Description */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Product Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {product.description}
                </p>
              </CardContent>
            </Card>

            {/* Terms & Conditions */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Terms & Conditions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {product.termsAndConditions}
                </p>
              </CardContent>
            </Card>

            {/* Available regions */}
            {product.availableRegions && product.availableRegions.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Available Regions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {product.availableRegions.map((region: string) => (
                      <Badge key={region} variant="secondary" className="bg-accent/10 text-accent">
                        {region}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="reviews" className="mt-4 space-y-4">
            {/* Rating summary */}
            <Card className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-foreground">{product.rating}</p>
                    <div className="flex items-center gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={cn(
                            "h-4 w-4",
                            star <= Math.round(product.rating)
                              ? "fill-accent text-accent"
                              : "text-muted"
                          )}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {product.totalReviews} reviews
                    </p>
                  </div>
                  <Separator orientation="vertical" className="h-16" />
                  <div className="flex-1 space-y-1">
                    {[5, 4, 3, 2, 1].map((rating) => (
                      <div key={rating} className="flex items-center gap-2">
                        <span className="text-xs w-3">{rating}</span>
                        <Star className="h-3 w-3 fill-accent text-accent" />
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-accent"
                            style={{ width: `${rating === 5 ? 70 : rating === 4 ? 20 : 10}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Customer photos */}
            {product.customerPhotos && product.customerPhotos.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Customer Photos & Videos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="w-full whitespace-nowrap">
                    <div className="flex gap-2">
                      {product.customerPhotos.map((photo: string, idx: number) => (
                        <div
                          key={idx}
                          className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg"
                        >
                          <img src={photo} alt="" className="h-full w-full object-cover" />
                        </div>
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Reviews list */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Customer Reviews</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {product.reviews.length > 0 ? (
                  product.reviews.map((review: any) => (
                    <div key={review.id} className="border-b border-border/50 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-xs font-medium">{review.user.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium">{review.user}</p>
                            <p className="text-xs text-muted-foreground">{review.date}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={cn(
                                "h-3 w-3",
                                star <= review.rating
                                  ? "fill-accent text-accent"
                                  : "text-muted"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{review.comment}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {review.helpful} people found this helpful
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No reviews yet
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Related products */}
        {product.relatedProducts && product.relatedProducts.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">You might also like</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-3">
                  {product.relatedProducts.map((related: any) => (
                    <div
                      key={related.id}
                      onClick={() => navigate(`/product/${related.id}`)}
                      className="w-32 flex-shrink-0 cursor-pointer group"
                    >
                      <div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted mb-2">
                        <img
                          src={related.image}
                          alt={related.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      </div>
                      <p className="text-xs font-medium text-foreground truncate">
                        {related.name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-sm font-semibold text-foreground">
                          {related.price}
                        </span>
                        <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Star className="h-3 w-3 fill-accent text-accent" />
                          {related.rating}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Fixed bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur p-3 lg:left-64">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <Button variant="outline" className="flex-1 gap-2">
            <MessageCircle className="h-4 w-4" />
            Chat
          </Button>
          <Button variant="gold" className="flex-1 gap-2">
            <Phone className="h-4 w-4" />
            Call Now
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProductDetail;
