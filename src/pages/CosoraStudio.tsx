import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Camera,
  Star,
  MapPin,
  MessageCircle,
  Search,
  Filter,
  Heart,
  Eye,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  X,
} from "lucide-react";
import heroImage from "@/assets/cosora-studio-hero.jpg";

const shootCategories = [
  "All",
  "Lookbook",
  "E-Commerce",
  "Editorial",
  "Flat Lay",
  "Model Shoot",
  "Lifestyle",
  "360° Product",
];

const photographers = [
  {
    id: 1,
    name: "Aarav Mehta Studios",
    location: "Mumbai, India",
    rating: 4.9,
    reviews: 127,
    specialties: ["Lookbook", "Editorial", "Model Shoot"],
    startingAt: "₹8,000",
    perLook: true,
    portfolio: [
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400&h=500&fit=crop",
    ],
    verified: true,
    featured: true,
    description: "10+ years in fashion photography. Specialized in high-end lookbooks and editorial campaigns for leading brands.",
    productsShot: 2400,
  },
  {
    id: 2,
    name: "Priya Lens Co.",
    location: "Delhi, India",
    rating: 4.8,
    reviews: 94,
    specialties: ["E-Commerce", "Flat Lay", "360° Product"],
    startingAt: "₹5,000",
    perLook: true,
    portfolio: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1581044777550-4cfa60707998?w=400&h=500&fit=crop",
    ],
    verified: true,
    featured: false,
    description: "E-commerce product photography experts. Clean, conversion-focused images for online stores.",
    productsShot: 5200,
  },
  {
    id: 3,
    name: "Studio Luxe",
    location: "Bangalore, India",
    rating: 4.7,
    reviews: 68,
    specialties: ["Lifestyle", "Model Shoot", "Lookbook"],
    startingAt: "₹12,000",
    perLook: true,
    portfolio: [
      "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1506634572416-48cdfe530110?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=500&fit=crop",
    ],
    verified: true,
    featured: true,
    description: "Premium lifestyle and editorial photography. Cinematic visuals that tell your brand story.",
    productsShot: 1800,
  },
  {
    id: 4,
    name: "ClickCraft Studio",
    location: "Surat, India",
    rating: 4.6,
    reviews: 53,
    specialties: ["E-Commerce", "Flat Lay", "360° Product"],
    startingAt: "₹3,500",
    perLook: true,
    portfolio: [
      "https://images.unsplash.com/photo-1434389677669-e08b4cda3a0d?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=400&h=500&fit=crop",
    ],
    verified: false,
    featured: false,
    description: "Affordable product photography for textile manufacturers. Quick turnaround, bulk discounts available.",
    productsShot: 8700,
  },
  {
    id: 5,
    name: "Vogue Visuals",
    location: "Jaipur, India",
    rating: 4.9,
    reviews: 112,
    specialties: ["Editorial", "Lookbook", "Lifestyle"],
    startingAt: "₹15,000",
    perLook: true,
    portfolio: [
      "https://images.unsplash.com/photo-1504703395950-b89145a5425b?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1502716119720-b23a1e3b3c35?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=500&fit=crop",
    ],
    verified: true,
    featured: true,
    description: "Award-winning fashion photographer. Featured in Vogue India, Harper's Bazaar. Luxury brand specialist.",
    productsShot: 1200,
  },
  {
    id: 6,
    name: "Frame & Focus",
    location: "Tirupur, India",
    rating: 4.5,
    reviews: 41,
    specialties: ["E-Commerce", "Flat Lay", "Model Shoot"],
    startingAt: "₹2,500",
    perLook: true,
    portfolio: [
      "https://images.unsplash.com/photo-1495385794356-15371f348c31?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1475180098004-ca77a66827be?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=500&fit=crop",
    ],
    verified: true,
    featured: false,
    description: "Budget-friendly studio in the heart of Tirupur's textile hub. Specialized in bulk product photography.",
    productsShot: 15000,
  },
];

const CosoraStudio = () => {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<{ from: string; text: string }[]>([
    { from: "cosora", text: "Hi! 👋 Welcome to Cosora Studio. Tell us about your product shoot requirements and we'll match you with the perfect photographer." },
  ]);

  const filteredPhotographers = photographers.filter((p) => {
    const matchesCategory = selectedCategory === "All" || p.specialties.includes(selectedCategory);
    const matchesSearch =
      searchQuery === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;
    setChatMessages((prev) => [...prev, { from: "user", text: chatMessage }]);
    setChatMessage("");
    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        { from: "cosora", text: "Thanks for reaching out! Our team will review your requirements and get back to you shortly with the best photographer options. 📸" },
      ]);
    }, 1200);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-24 lg:pb-6">
        {/* Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl"
        >
          <div className="relative h-[280px] md:h-[360px]">
            <img
              src={heroImage}
              alt="Cosora Studio - Professional Fashion Photography"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/50 to-transparent" />
            <div className="absolute inset-0 flex flex-col justify-center p-6 md:p-10">
              <Badge className="mb-3 w-fit bg-accent/90 text-accent-foreground border-none text-xs">
                <Sparkles className="mr-1 h-3 w-3" /> Premium Studio Service
              </Badge>
              <h1 className="font-display text-3xl font-bold text-white md:text-5xl">
                Cosora Studio
              </h1>
              <p className="mt-2 max-w-lg text-sm text-white/80 md:text-base">
                Get professional model shoots for your products. Browse top photographers, pick your style, and we'll handle the booking for you.
              </p>
              <div className="mt-4 flex gap-3">
                <Button
                  onClick={() => setShowChat(true)}
                  className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Chat & Book Now
                </Button>
                <Button variant="outline" className="border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:text-white">
                  <Eye className="mr-2 h-4 w-4" />
                  View Portfolio
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* How it Works */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { step: "01", title: "Browse Studios", desc: "Explore verified photographers and their portfolios" },
            { step: "02", title: "Chat with Us", desc: "Tell us your requirements, budget and preferred style" },
            { step: "03", title: "We Book for You", desc: "We handle scheduling, coordination and delivery" },
          ].map((item, i) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-start gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 font-display text-lg font-bold text-accent">
                {item.step}
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search studios or locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {shootCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Photographer Grid */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredPhotographers.map((photographer, index) => (
            <motion.div
              key={photographer.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-lg"
            >
              {/* Portfolio Preview - 4 image grid like reference */}
              <div className="grid grid-cols-4 gap-0.5">
                {photographer.portfolio.map((img, i) => (
                  <div key={i} className="relative aspect-[3/4] overflow-hidden">
                    <img
                      src={img}
                      alt={`${photographer.name} portfolio ${i + 1}`}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-base font-semibold text-foreground">
                        {photographer.name}
                      </h3>
                      {photographer.verified && (
                        <CheckCircle2 className="h-4 w-4 text-accent" />
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {photographer.location}
                    </div>
                  </div>
                  <button className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent">
                    <Heart className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {photographer.description}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {photographer.specialties.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px] font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-semibold text-foreground">{photographer.rating}</span>
                      <span className="text-xs text-muted-foreground">({photographer.reviews})</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      <Camera className="mr-0.5 inline h-3 w-3" />
                      {photographer.productsShot.toLocaleString()} shots
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-foreground">{photographer.startingAt}</span>
                    <span className="text-[10px] text-muted-foreground"> /look</span>
                  </div>
                </div>

                <Button
                  onClick={() => setShowChat(true)}
                  className="mt-3 w-full bg-foreground text-background hover:bg-foreground/90"
                  size="sm"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Chat to Book
                  <ArrowRight className="ml-auto h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredPhotographers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Camera className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No studios found</p>
            <p className="text-xs text-muted-foreground/70">Try a different category or search term</p>
          </div>
        )}
      </div>

      {/* Floating Chat Widget */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-20 right-4 z-50 flex h-[420px] w-[340px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl lg:bottom-6 lg:right-6"
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between bg-foreground px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
                  <Camera className="h-4 w-4 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-background">Cosora Studio</p>
                  <p className="text-[10px] text-background/60">Usually replies within 5 min</p>
                </div>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="rounded-full p-1 text-background/60 transition-colors hover:text-background"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                      msg.from === "user"
                        ? "bg-accent text-accent-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <div className="border-t border-border p-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Type your requirements..."
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  className="text-xs"
                />
                <Button size="sm" onClick={handleSendMessage} className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0">
                  Send
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Chat Button (when chat is closed) */}
      {!showChat && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setShowChat(true)}
          className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition-transform hover:scale-105 lg:bottom-6 lg:right-6"
        >
          <MessageCircle className="h-6 w-6" />
        </motion.button>
      )}
    </DashboardLayout>
  );
};

export default CosoraStudio;
