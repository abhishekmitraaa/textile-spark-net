 import { useState } from "react";
 import { DashboardLayout } from "@/components/layout/DashboardLayout";
 import { Card, CardContent } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Input } from "@/components/ui/input";
 import {
   Heart,
   Search,
   Phone,
   MessageCircle,
   Trash2,
   MapPin,
   Star,
   BadgeCheck,
   Package,
   Grid3X3,
   List,
 } from "lucide-react";
 import { motion, AnimatePresence } from "framer-motion";
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
 import { toast } from "@/hooks/use-toast";
 
 const initialWishlistItems = [
   {
     id: 1,
     name: "Premium Cotton Jersey Fabric",
     vendor: "Tirupur Textiles Co.",
     location: "Tirupur, Tamil Nadu",
     price: "₹285/meter",
     moq: "500 meters",
     rating: 4.8,
     reviews: 156,
     verified: true,
     image: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400",
     category: "Fabrics",
     addedDate: "2 days ago",
   },
   {
     id: 2,
     name: "Organic Linen Collection",
     vendor: "Gujarat Fabrics Ltd.",
     location: "Ahmedabad, Gujarat",
     price: "₹420/meter",
     moq: "300 meters",
     rating: 4.6,
     reviews: 89,
     verified: true,
     image: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=400",
     category: "Fabrics",
     addedDate: "3 days ago",
   },
   {
     id: 3,
     name: "Handcrafted Brass Buttons Set",
     vendor: "Jaipur Accessories Hub",
     location: "Jaipur, Rajasthan",
     price: "₹45/piece",
     moq: "1000 pieces",
     rating: 4.9,
     reviews: 234,
     verified: true,
     image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400",
     category: "Trims",
     addedDate: "1 week ago",
   },
   {
     id: 4,
     name: "Sustainable Bamboo Fabric",
     vendor: "EcoWeave Industries",
     location: "Coimbatore, Tamil Nadu",
     price: "₹380/meter",
     moq: "200 meters",
     rating: 4.7,
     reviews: 112,
     verified: false,
     image: "https://images.unsplash.com/photo-1620799140188-3b2a02fd9a77?w=400",
     category: "Fabrics",
     addedDate: "1 week ago",
   },
   {
     id: 5,
     name: "Designer Zippers Collection",
     vendor: "Delhi Notions Co.",
     location: "Delhi NCR",
     price: "₹25/piece",
     moq: "2000 pieces",
     rating: 4.5,
     reviews: 78,
     verified: true,
     image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400",
     category: "Trims",
     addedDate: "2 weeks ago",
   },
 ];
 
 const Wishlist = () => {
   const [wishlistItems, setWishlistItems] = useState(initialWishlistItems);
   const [searchQuery, setSearchQuery] = useState("");
   const [viewMode, setViewMode] = useState<"grid" | "list">("list");
   const [selectedCategory, setSelectedCategory] = useState<string>("all");
 
   const categories = ["all", ...new Set(initialWishlistItems.map((item) => item.category))];
 
   const filteredItems = wishlistItems.filter((item) => {
     const matchesSearch =
       item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
       item.vendor.toLowerCase().includes(searchQuery.toLowerCase());
     const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
     return matchesSearch && matchesCategory;
   });
 
   const handleRemoveItem = (id: number) => {
     setWishlistItems((prev) => prev.filter((item) => item.id !== id));
     toast({
       title: "Removed from Wishlist",
       description: "Product has been removed from your wishlist.",
     });
   };
 
   const handleClearAll = () => {
     setWishlistItems([]);
     toast({
       title: "Wishlist Cleared",
       description: "All products have been removed from your wishlist.",
     });
   };
 
   const handleChat = (vendorName: string) => {
     toast({
       title: "Opening Chat",
       description: `Starting conversation with ${vendorName}`,
     });
   };
 
   const handleCall = (vendorName: string) => {
     toast({
       title: "Initiating Call",
       description: `Connecting you with ${vendorName}`,
     });
   };
 
   return (
     <DashboardLayout>
       <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6">
         {/* Header */}
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/10 rounded-lg">
               <Heart className="h-6 w-6 text-primary" />
             </div>
             <div>
               <h1 className="text-2xl font-bold text-foreground">My Wishlist</h1>
               <p className="text-muted-foreground text-sm">
                 {wishlistItems.length} saved products
               </p>
             </div>
           </div>
 
           {wishlistItems.length > 0 && (
             <AlertDialog>
               <AlertDialogTrigger asChild>
                 <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                   <Trash2 className="h-4 w-4 mr-2" />
                   Clear All
                 </Button>
               </AlertDialogTrigger>
               <AlertDialogContent>
                 <AlertDialogHeader>
                   <AlertDialogTitle>Clear Wishlist?</AlertDialogTitle>
                   <AlertDialogDescription>
                     This will remove all {wishlistItems.length} products from your wishlist. This action cannot be undone.
                   </AlertDialogDescription>
                 </AlertDialogHeader>
                 <AlertDialogFooter>
                   <AlertDialogCancel>Cancel</AlertDialogCancel>
                   <AlertDialogAction onClick={handleClearAll} className="bg-destructive hover:bg-destructive/90">
                     Clear All
                   </AlertDialogAction>
                 </AlertDialogFooter>
               </AlertDialogContent>
             </AlertDialog>
           )}
         </div>
 
         {/* Search and Filters */}
         <div className="flex flex-col md:flex-row gap-4">
           <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input
               placeholder="Search saved products..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="pl-10 bg-background border-border"
             />
           </div>
 
           <div className="flex items-center gap-2">
             {/* Category Pills */}
             <div className="flex gap-2 overflow-x-auto pb-1">
               {categories.map((category) => (
                 <Badge
                   key={category}
                   variant={selectedCategory === category ? "default" : "secondary"}
                   className={`cursor-pointer whitespace-nowrap capitalize ${
                     selectedCategory === category
                       ? "bg-primary text-primary-foreground"
                       : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                   }`}
                   onClick={() => setSelectedCategory(category)}
                 >
                   {category === "all" ? "All" : category}
                 </Badge>
               ))}
             </div>
 
             {/* View Toggle */}
             <div className="flex border border-border rounded-lg overflow-hidden">
               <Button
                 variant="ghost"
                 size="sm"
                 className={`rounded-none ${viewMode === "grid" ? "bg-primary/10" : ""}`}
                 onClick={() => setViewMode("grid")}
               >
                 <Grid3X3 className="h-4 w-4" />
               </Button>
               <Button
                 variant="ghost"
                 size="sm"
                 className={`rounded-none ${viewMode === "list" ? "bg-primary/10" : ""}`}
                 onClick={() => setViewMode("list")}
               >
                 <List className="h-4 w-4" />
               </Button>
             </div>
           </div>
         </div>
 
         {/* Empty State */}
         {filteredItems.length === 0 && (
           <div className="flex flex-col items-center justify-center py-16 text-center">
             <div className="p-4 bg-muted rounded-full mb-4">
               <Heart className="h-8 w-8 text-muted-foreground" />
             </div>
             <h3 className="text-lg font-semibold text-foreground mb-2">
               {wishlistItems.length === 0 ? "Your wishlist is empty" : "No matching products"}
             </h3>
             <p className="text-muted-foreground text-sm max-w-sm">
               {wishlistItems.length === 0
                 ? "Save products you're interested in to easily find them later."
                 : "Try adjusting your search or filter criteria."}
             </p>
           </div>
         )}
 
         {/* Wishlist Items */}
         <AnimatePresence mode="popLayout">
           {viewMode === "list" ? (
             <div className="space-y-4">
               {filteredItems.map((item, index) => (
                 <motion.div
                   key={item.id}
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, x: -100 }}
                   transition={{ delay: index * 0.05 }}
                 >
                   <Card className="overflow-hidden border-border hover:shadow-md transition-shadow">
                     <CardContent className="p-0">
                       <div className="flex flex-col md:flex-row">
                         {/* Image */}
                         <div className="relative w-full md:w-48 h-48 md:h-auto flex-shrink-0">
                           <img
                             src={item.image}
                             alt={item.name}
                             className="w-full h-full object-cover"
                           />
                           <Badge className="absolute top-2 left-2 bg-secondary text-secondary-foreground text-xs">
                             {item.category}
                           </Badge>
                         </div>
 
                         {/* Content */}
                         <div className="flex-1 p-4 flex flex-col justify-between">
                           <div className="space-y-2">
                             <div className="flex items-start justify-between gap-2">
                               <div>
                                 <h3 className="font-semibold text-foreground line-clamp-1">
                                   {item.name}
                                 </h3>
                                 <div className="flex items-center gap-2 mt-1">
                                   <span className="text-sm text-muted-foreground">
                                     {item.vendor}
                                   </span>
                                   {item.verified && (
                                     <BadgeCheck className="h-4 w-4 text-primary" />
                                   )}
                                 </div>
                               </div>
                               <span className="text-xs text-muted-foreground whitespace-nowrap">
                                 Added {item.addedDate}
                               </span>
                             </div>
 
                             <div className="flex items-center gap-4 text-sm text-muted-foreground">
                               <span className="flex items-center gap-1">
                                 <MapPin className="h-3 w-3" />
                                 {item.location}
                               </span>
                               <span className="flex items-center gap-1">
                                 <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                 {item.rating} ({item.reviews})
                               </span>
                             </div>
 
                             <div className="flex items-center gap-4">
                               <span className="text-lg font-bold text-primary">
                                 {item.price}
                               </span>
                               <span className="flex items-center gap-1 text-sm text-muted-foreground">
                                 <Package className="h-3 w-3" />
                                 MOQ: {item.moq}
                               </span>
                             </div>
                           </div>
 
                           {/* Actions */}
                           <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                             <Button
                               size="sm"
                               className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                               onClick={() => handleChat(item.vendor)}
                             >
                               <MessageCircle className="h-4 w-4 mr-2" />
                               Chat
                             </Button>
                             <Button
                               size="sm"
                               variant="outline"
                               className="flex-1 border-primary text-primary hover:bg-primary/10"
                               onClick={() => handleCall(item.vendor)}
                             >
                               <Phone className="h-4 w-4 mr-2" />
                               Call Now
                             </Button>
                             <Button
                               size="sm"
                               variant="ghost"
                               className="text-destructive hover:bg-destructive/10"
                               onClick={() => handleRemoveItem(item.id)}
                             >
                               <Trash2 className="h-4 w-4" />
                             </Button>
                           </div>
                         </div>
                       </div>
                     </CardContent>
                   </Card>
                 </motion.div>
               ))}
             </div>
           ) : (
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
               {filteredItems.map((item, index) => (
                 <motion.div
                   key={item.id}
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.9 }}
                   transition={{ delay: index * 0.05 }}
                 >
                   <Card className="overflow-hidden border-border hover:shadow-md transition-shadow h-full">
                     <div className="relative aspect-square">
                       <img
                         src={item.image}
                         alt={item.name}
                         className="w-full h-full object-cover"
                       />
                       <Button
                         size="icon"
                         variant="ghost"
                         className="absolute top-2 right-2 bg-background/80 hover:bg-destructive/10 text-destructive"
                         onClick={() => handleRemoveItem(item.id)}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                       <Badge className="absolute bottom-2 left-2 bg-secondary text-secondary-foreground text-xs">
                         {item.category}
                       </Badge>
                     </div>
                     <CardContent className="p-3 space-y-2">
                       <h3 className="font-medium text-foreground text-sm line-clamp-2">
                         {item.name}
                       </h3>
                       <div className="flex items-center gap-1 text-xs text-muted-foreground">
                         <span className="truncate">{item.vendor}</span>
                         {item.verified && (
                           <BadgeCheck className="h-3 w-3 text-primary flex-shrink-0" />
                         )}
                       </div>
                       <div className="flex items-center justify-between">
                         <span className="font-bold text-primary text-sm">{item.price}</span>
                         <span className="flex items-center gap-1 text-xs text-muted-foreground">
                           <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                           {item.rating}
                         </span>
                       </div>
                       <div className="flex gap-2 pt-2">
                         <Button
                           size="sm"
                           className="flex-1 h-8 text-xs bg-primary hover:bg-primary/90"
                           onClick={() => handleChat(item.vendor)}
                         >
                           <MessageCircle className="h-3 w-3 mr-1" />
                           Chat
                         </Button>
                         <Button
                           size="sm"
                           variant="outline"
                           className="flex-1 h-8 text-xs border-primary text-primary"
                           onClick={() => handleCall(item.vendor)}
                         >
                           <Phone className="h-3 w-3 mr-1" />
                           Call
                         </Button>
                       </div>
                     </CardContent>
                   </Card>
                 </motion.div>
               ))}
             </div>
           )}
         </AnimatePresence>
       </div>
     </DashboardLayout>
   );
 };
 
 export default Wishlist;