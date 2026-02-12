import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  Star,
  MapPin,
  MessageCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Package,
  Users,
  Award,
  Mail,
  Phone,
  Instagram,
  Globe,
} from "lucide-react";

const allPhotographers = [
  {
    id: 1,
    name: "Aarav Mehta Studios",
    location: "Mumbai, India",
    rating: 4.9,
    reviews: 127,
    specialties: ["Apparel Shoot", "Model Shoot", "Accessories Shoot"],
    startingAt: "₹8,000",
    perLook: true,
    verified: true,
    featured: true,
    description: "10+ years in fashion photography. Specialized in high-end lookbooks and editorial campaigns for leading brands.",
    productsShot: 2400,
    turnaround: "3-5 days",
    languages: ["English", "Hindi"],
    experience: "10+ years",
    portfolio: [
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1504703395950-b89145a5425b?w=600&h=700&fit=crop",
    ],
    packages: [
      { name: "Basic", price: "₹8,000", details: "5 looks, 20 edited images, 3-day delivery" },
      { name: "Standard", price: "₹18,000", details: "12 looks, 50 edited images, model included, 5-day delivery" },
      { name: "Premium", price: "₹35,000", details: "25 looks, 100+ edited images, 2 models, styling, 7-day delivery" },
    ],
    clientBrands: ["Myntra", "Ajio", "FabIndia", "W for Woman"],
  },
  {
    id: 2,
    name: "Priya Lens Co.",
    location: "Delhi, India",
    rating: 4.8,
    reviews: 94,
    specialties: ["Footwear Shoot", "Flat Lay", "Jewelry Shoot"],
    startingAt: "₹5,000",
    perLook: true,
    verified: true,
    featured: false,
    description: "E-commerce product photography experts. Clean, conversion-focused images for online stores.",
    productsShot: 5200,
    turnaround: "2-3 days",
    languages: ["English", "Hindi"],
    experience: "7 years",
    portfolio: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1581044777550-4cfa60707998?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=600&h=700&fit=crop",
    ],
    packages: [
      { name: "Basic", price: "₹5,000", details: "10 products, white background, 2-day delivery" },
      { name: "Standard", price: "₹12,000", details: "25 products, styled shots, 3-day delivery" },
      { name: "Premium", price: "₹22,000", details: "50 products, lifestyle + flat lay, 5-day delivery" },
    ],
    clientBrands: ["Amazon", "Flipkart", "Nykaa Fashion"],
  },
  {
    id: 3,
    name: "Studio Luxe",
    location: "Bangalore, India",
    rating: 4.7,
    reviews: 68,
    specialties: ["Apparel Shoot", "Lifestyle Shoot", "Model Shoot"],
    startingAt: "₹12,000",
    perLook: true,
    verified: true,
    featured: true,
    description: "Premium lifestyle and editorial photography. Cinematic visuals that tell your brand story.",
    productsShot: 1800,
    turnaround: "5-7 days",
    languages: ["English", "Hindi", "Kannada"],
    experience: "12 years",
    portfolio: [
      "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1506634572416-48cdfe530110?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1502716119720-b23a1e3b3c35?w=600&h=700&fit=crop",
    ],
    packages: [
      { name: "Basic", price: "₹12,000", details: "5 looks, cinematic edits, 5-day delivery" },
      { name: "Standard", price: "₹25,000", details: "15 looks, model + styling, 7-day delivery" },
      { name: "Premium", price: "₹50,000", details: "Full campaign, 30+ looks, video BTS, 10-day delivery" },
    ],
    clientBrands: ["Levi's India", "UCB", "Allen Solly"],
  },
  {
    id: 4,
    name: "ClickCraft Studio",
    location: "Surat, India",
    rating: 4.6,
    reviews: 53,
    specialties: ["Fabric Shoot", "Flat Lay", "Footwear Shoot"],
    startingAt: "₹3,500",
    perLook: true,
    verified: false,
    featured: false,
    description: "Affordable product photography for textile manufacturers. Quick turnaround, bulk discounts available.",
    productsShot: 8700,
    turnaround: "1-2 days",
    languages: ["English", "Hindi", "Gujarati"],
    experience: "5 years",
    portfolio: [
      "https://images.unsplash.com/photo-1434389677669-e08b4cda3a0d?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1495385794356-15371f348c31?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?w=600&h=700&fit=crop",
    ],
    packages: [
      { name: "Basic", price: "₹3,500", details: "15 products, white bg, 1-day delivery" },
      { name: "Standard", price: "₹8,000", details: "40 products, styled, 2-day delivery" },
      { name: "Premium", price: "₹15,000", details: "100 products, lifestyle + flat lay, 3-day delivery" },
    ],
    clientBrands: ["Local Textile Mills", "Surat Exporters"],
  },
  {
    id: 5,
    name: "Vogue Visuals",
    location: "Jaipur, India",
    rating: 4.9,
    reviews: 112,
    specialties: ["Apparel Shoot", "Accessories Shoot", "Lifestyle Shoot"],
    startingAt: "₹15,000",
    perLook: true,
    verified: true,
    featured: true,
    description: "Award-winning fashion photographer. Featured in Vogue India, Harper's Bazaar. Luxury brand specialist.",
    productsShot: 1200,
    turnaround: "5-7 days",
    languages: ["English", "Hindi"],
    experience: "15 years",
    portfolio: [
      "https://images.unsplash.com/photo-1504703395950-b89145a5425b?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1502716119720-b23a1e3b3c35?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&h=700&fit=crop",
    ],
    packages: [
      { name: "Basic", price: "₹15,000", details: "5 looks, editorial style, 5-day delivery" },
      { name: "Standard", price: "₹30,000", details: "12 looks, model + HMUA, 7-day delivery" },
      { name: "Premium", price: "₹60,000", details: "Full campaign, 25+ looks, location shoot, 10-day delivery" },
    ],
    clientBrands: ["Sabyasachi", "Anita Dongre", "Good Earth"],
  },
  {
    id: 6,
    name: "Frame & Focus",
    location: "Tirupur, India",
    rating: 4.5,
    reviews: 41,
    specialties: ["Fabric Shoot", "Flat Lay", "Model Shoot"],
    startingAt: "₹2,500",
    perLook: true,
    verified: true,
    featured: false,
    description: "Budget-friendly studio in the heart of Tirupur's textile hub. Specialized in bulk product photography.",
    productsShot: 15000,
    turnaround: "1-2 days",
    languages: ["English", "Tamil", "Hindi"],
    experience: "6 years",
    portfolio: [
      "https://images.unsplash.com/photo-1495385794356-15371f348c31?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1475180098004-ca77a66827be?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1434389677669-e08b4cda3a0d?w=600&h=700&fit=crop",
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&h=700&fit=crop",
    ],
    packages: [
      { name: "Basic", price: "₹2,500", details: "20 products, white bg, same-day delivery" },
      { name: "Standard", price: "₹6,000", details: "50 products, styled, 2-day delivery" },
      { name: "Premium", price: "₹12,000", details: "100+ products, model + styling, 3-day delivery" },
    ],
    clientBrands: ["Tirupur Exporters Assoc.", "KPR Mill"],
  },
];

export { allPhotographers };

const PhotographerProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const photographer = allPhotographers.find((p) => p.id === Number(id));

  if (!photographer) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <Camera className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Photographer not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/cosora-studio")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Studios
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-24 lg:pb-6">
        {/* Back Button */}
        <Button variant="ghost" size="sm" onClick={() => navigate("/cosora-studio")} className="text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Studios
        </Button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between"
        >
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
                {photographer.name}
              </h1>
              {photographer.verified && <CheckCircle2 className="h-5 w-5 text-accent" />}
              {photographer.featured && (
                <Badge className="bg-accent/10 text-accent border-accent/20">Featured</Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {photographer.location}</span>
              <span className="flex items-center gap-1"><Star className="h-4 w-4 fill-accent text-accent" /> {photographer.rating} ({photographer.reviews} reviews)</span>
              <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {photographer.turnaround} delivery</span>
              <span className="flex items-center gap-1"><Award className="h-4 w-4" /> {photographer.experience}</span>
            </div>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{photographer.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {photographer.specialties.map((s) => (
                <Badge key={s} variant="secondary">{s}</Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">{photographer.startingAt}</p>
              <p className="text-xs text-muted-foreground">Starting price /look</p>
            </div>
            <Button onClick={() => navigate("/cosora-studio")} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <MessageCircle className="mr-2 h-4 w-4" /> Chat to Book
            </Button>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { icon: Camera, label: "Products Shot", value: photographer.productsShot.toLocaleString() },
            { icon: Users, label: "Happy Clients", value: photographer.reviews.toString() },
            { icon: Clock, label: "Turnaround", value: photographer.turnaround },
            { icon: Package, label: "Languages", value: photographer.languages.join(", ") },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-border bg-card p-4 text-center"
            >
              <stat.icon className="mx-auto mb-2 h-5 w-5 text-accent" />
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Portfolio Grid */}
        <div>
          <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Portfolio</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {photographer.portfolio.map((img, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-xl"
                onClick={() => setSelectedImage(img)}
              >
                <img src={img} alt={`Portfolio ${i + 1}`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Pricing Packages */}
        <div>
          <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Packages</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {photographer.packages.map((pkg, i) => (
              <motion.div
                key={pkg.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`rounded-xl border p-5 ${i === 1 ? "border-accent bg-accent/5" : "border-border bg-card"}`}
              >
                {i === 1 && <Badge className="mb-2 bg-accent text-accent-foreground text-[10px]">Most Popular</Badge>}
                <h3 className="font-display text-base font-semibold text-foreground">{pkg.name}</h3>
                <p className="mt-1 text-2xl font-bold text-foreground">{pkg.price}</p>
                <p className="mt-2 text-xs text-muted-foreground">{pkg.details}</p>
                <Button
                  className={`mt-4 w-full ${i === 1 ? "bg-accent text-accent-foreground hover:bg-accent/90" : "bg-foreground text-background hover:bg-foreground/90"}`}
                  size="sm"
                  onClick={() => navigate("/cosora-studio")}
                >
                  <MessageCircle className="mr-2 h-4 w-4" /> Book This Package
                </Button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Client Brands */}
        {photographer.clientBrands && (
          <div>
            <h2 className="mb-3 font-display text-lg font-semibold text-foreground">Trusted By</h2>
            <div className="flex flex-wrap gap-2">
              {photographer.clientBrands.map((brand) => (
                <Badge key={brand} variant="outline" className="text-xs">{brand}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <img src={selectedImage} alt="Portfolio" className="max-h-[85vh] max-w-full rounded-lg object-contain" />
        </motion.div>
      )}
    </DashboardLayout>
  );
};

export default PhotographerProfile;
