import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search,
  Star,
  MapPin,
  BadgeCheck,
  Phone,
  MessageCircle,
  Building2,
  Wrench,
  Truck,
  Palette,
  Camera,
  Calculator,
  Monitor,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Service categories
const serviceCategories = [
  { id: "all", label: "All Services", icon: Building2 },
  { id: "printing", label: "Printing & Manufacturing", icon: Palette },
  { id: "logistics", label: "Logistics & Supply Chain", icon: Truck },
  { id: "it", label: "IT/Software & SaaS", icon: Monitor },
  { id: "finance", label: "Finance & Compliance", icon: Calculator },
  { id: "marketing", label: "Marketing/PR/Photography", icon: Camera },
  { id: "machinery", label: "Machinery & Equipment", icon: Wrench },
];

// Sample service vendors data
const serviceVendors = [
  {
    id: "sv1",
    name: "PrintMasters India",
    category: "printing",
    description: "Full-service textile printing including screen, digital, and sublimation printing with 20+ years experience",
    services: ["Screen Printing", "Digital Printing", "Sublimation", "Embroidery"],
    rating: 4.9,
    reviews: 234,
    location: "Tiruppur, India",
    verified: true,
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop",
    startingPrice: "₹15/pc",
    turnaround: "3-5 days",
  },
  {
    id: "sv2",
    name: "FastTrack Logistics",
    category: "logistics",
    description: "End-to-end supply chain solutions for apparel industry with warehousing and last-mile delivery",
    services: ["Warehousing", "Last-mile Delivery", "Export Services", "Inventory Management"],
    rating: 4.7,
    reviews: 189,
    location: "Mumbai, India",
    verified: true,
    image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=400&h=300&fit=crop",
    startingPrice: "₹50/order",
    turnaround: "Same day",
  },
  {
    id: "sv3",
    name: "TechFashion Solutions",
    category: "it",
    description: "ERP, inventory management, and e-commerce solutions tailored for fashion businesses",
    services: ["ERP Systems", "E-commerce", "Inventory Software", "POS Solutions"],
    rating: 4.8,
    reviews: 156,
    location: "Bangalore, India",
    verified: true,
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop",
    startingPrice: "₹10,000/mo",
    turnaround: "Custom",
  },
  {
    id: "sv4",
    name: "FashionSnap Studio",
    category: "marketing",
    description: "Professional product photography, lookbooks, and social media content for fashion brands",
    services: ["Product Photography", "Lookbook Shoots", "Video Content", "Social Media"],
    rating: 4.9,
    reviews: 312,
    location: "Delhi NCR, India",
    verified: true,
    image: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=400&h=300&fit=crop",
    startingPrice: "₹500/product",
    turnaround: "2-3 days",
  },
  {
    id: "sv5",
    name: "ComplianceFirst",
    category: "finance",
    description: "GST filing, export documentation, and financial compliance services for textile exporters",
    services: ["GST Filing", "Export Documentation", "Audit Services", "Tax Planning"],
    rating: 4.6,
    reviews: 98,
    location: "Surat, India",
    verified: true,
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop",
    startingPrice: "₹5,000/mo",
    turnaround: "As needed",
  },
  {
    id: "sv6",
    name: "TextileMach Pro",
    category: "machinery",
    description: "Industrial sewing machines, cutting equipment sales and maintenance services",
    services: ["Machine Sales", "Maintenance", "Spare Parts", "Training"],
    rating: 4.7,
    reviews: 145,
    location: "Ludhiana, India",
    verified: true,
    image: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&h=300&fit=crop",
    startingPrice: "₹25,000",
    turnaround: "1-2 weeks",
  },
  {
    id: "sv7",
    name: "DyeCraft Industries",
    category: "printing",
    description: "Eco-friendly fabric dyeing and color matching services with sustainable practices",
    services: ["Fabric Dyeing", "Color Matching", "Finishing", "Eco-friendly Processing"],
    rating: 4.8,
    reviews: 201,
    location: "Tiruppur, India",
    verified: true,
    image: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=300&fit=crop",
    startingPrice: "₹30/meter",
    turnaround: "5-7 days",
  },
  {
    id: "sv8",
    name: "Brand360 Agency",
    category: "marketing",
    description: "Full-service branding, PR, and digital marketing for emerging fashion brands",
    services: ["Brand Strategy", "PR Services", "Digital Marketing", "Influencer Management"],
    rating: 4.5,
    reviews: 87,
    location: "Mumbai, India",
    verified: true,
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&h=300&fit=crop",
    startingPrice: "₹50,000/mo",
    turnaround: "Ongoing",
  },
];

const ServiceVendors = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredVendors = useMemo(() => {
    let vendors = serviceVendors;

    if (searchQuery) {
      vendors = vendors.filter(
        (v) =>
          v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.services.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    if (selectedCategory !== "all") {
      vendors = vendors.filter((v) => v.category === selectedCategory);
    }

    return vendors;
  }, [searchQuery, selectedCategory]);

  const getCategoryIcon = (categoryId: string) => {
    const cat = serviceCategories.find((c) => c.id === categoryId);
    return cat?.icon || Building2;
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 sm:mb-6"
      >
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
            Service Vendors
          </h1>
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Find printing, logistics, IT, and other business services
        </p>
      </motion.div>

      {/* Search & Filter Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4 space-y-3"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search services, vendors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {serviceCategories.map((cat) => {
            const Icon = cat.icon;
            return (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "shrink-0 gap-1.5",
                  selectedCategory === cat.id && "shadow-sm"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs">{cat.label}</span>
              </Button>
            );
          })}
        </div>
      </motion.div>

      {/* Results Count */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredVendors.length} service vendors found
        </p>
      </div>

      {/* Vendor Cards */}
      <div className="space-y-4">
        {filteredVendors.map((vendor, index) => {
          const CategoryIcon = getCategoryIcon(vendor.category);
          return (
            <motion.div
              key={vendor.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="overflow-hidden border-border bg-card transition-shadow hover:shadow-md">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    {/* Image */}
                    <div className="relative h-48 w-full sm:h-auto sm:w-48 shrink-0">
                      <img
                        src={vendor.image}
                        alt={vendor.name}
                        className="h-full w-full object-cover"
                      />
                      <Badge
                        variant="secondary"
                        className="absolute left-2 top-2 gap-1 bg-background/90 backdrop-blur-sm"
                      >
                        <CategoryIcon className="h-3 w-3" />
                        {serviceCategories.find((c) => c.id === vendor.category)?.label}
                      </Badge>
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground">
                              {vendor.name}
                            </h3>
                            {vendor.verified && (
                              <BadgeCheck className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {vendor.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-primary text-primary" />
                              {vendor.rating} ({vendor.reviews})
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {vendor.description}
                      </p>

                      {/* Services Tags */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {vendor.services.slice(0, 4).map((service) => (
                          <Badge
                            key={service}
                            variant="outline"
                            className="text-xs font-normal"
                          >
                            {service}
                          </Badge>
                        ))}
                      </div>

                      {/* Pricing & Actions */}
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                        <div className="flex gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Starting at</p>
                            <p className="font-semibold text-foreground">
                              {vendor.startingPrice}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Turnaround</p>
                            <p className="text-sm font-medium text-foreground">
                              {vendor.turnaround}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Chat</span>
                          </Button>
                          <Button size="sm" className="gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Call Now</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredVendors.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground">No vendors found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your search or filter criteria
          </p>
        </motion.div>
      )}
    </DashboardLayout>
  );
};

export default ServiceVendors;
