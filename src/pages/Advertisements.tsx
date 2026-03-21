import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Phone,
  Eye,
  Users,
  TrendingUp,
  PhoneMissed,
  MousePointerClick,
  Pause,
  Play,
  Copy,
  Edit,
  Megaphone,
  Search,
  Star,
  Store,
  Radio,
  ShoppingBag,
  Award,
  Globe,
  Smartphone,
  Monitor,
  Facebook,
  BarChart3,
  Shield,
  BadgeCheck,
  ChevronRight,
  Check,
} from "lucide-react";

// ── Data ──

const liveStats = [
  { label: "Phone Calls", value: "142", icon: Phone },
  { label: "Profile Views", value: "2.8K", icon: Eye },
  { label: "Leads Contacted", value: "86", icon: Users },
  { label: "Avg. Cost/Lead", value: "₹3.2", icon: TrendingUp },
  { label: "Missed Calls", value: "12", icon: PhoneMissed },
  { label: "Ad Clicks", value: "1.4K", icon: MousePointerClick },
];

interface Campaign {
  id: string;
  name: string;
  status: "active" | "paused" | "ended";
  startDate: string;
  endDate: string;
  targeting: string;
  views: number;
  leads: number;
  calls: number;
  inquiries: number;
  costPerLead: number;
  budgetTotal: number;
  budgetUsed: number;
}

const campaigns: Campaign[] = [
  {
    id: "1", name: "Premium Silk Collection", status: "active",
    startDate: "01 Jan", endDate: "31 Jan", targeting: "Retailers & Wholesalers",
    views: 12450, leads: 86, calls: 34, inquiries: 52, costPerLead: 2.73,
    budgetTotal: 500, budgetUsed: 235,
  },
  {
    id: "2", name: "Sustainable Cotton Line", status: "active",
    startDate: "05 Jan", endDate: "05 Feb", targeting: "Eco-conscious Brands",
    views: 8920, leads: 62, calls: 28, inquiries: 34, costPerLead: 2.9,
    budgetTotal: 300, budgetUsed: 180,
  },
  {
    id: "3", name: "Winter Wool Promo", status: "paused",
    startDate: "10 Jan", endDate: "10 Feb", targeting: "Fashion Brands",
    views: 5600, leads: 38, calls: 15, inquiries: 23, costPerLead: 4.1,
    budgetTotal: 400, budgetUsed: 156,
  },
];

interface AdType {
  id: string;
  name: string;
  price: string;
  unit: string;
  icon: typeof Phone;
  description: string;
}

const adTypes: AdType[] = [
  { id: "open", name: "Open Listing", price: "₹22", unit: "/day", icon: Megaphone, description: "Basic visibility in open listings" },
  { id: "search", name: "Search Listing", price: "₹35", unit: "/day", icon: Search, description: "Appear in buyer search results" },
  { id: "featured", name: "Featured Product", price: "₹55", unit: "/day", icon: Star, description: "Top placement on category pages" },
  { id: "store", name: "Store Promotion", price: "₹99", unit: "/day", icon: Store, description: "Promote your entire store" },
  { id: "broadcast", name: "Direct Broadcast", price: "₹15", unit: "/msg", icon: Radio, description: "Send direct messages to buyers" },
  { id: "wholesaler", name: "Wholesaler Pick", price: "₹59", unit: "", icon: ShoppingBag, description: "Featured for wholesaler buyers" },
  { id: "brand", name: "Brand Ad", price: "₹69", unit: "", icon: Award, description: "Brand awareness campaign" },
  { id: "web-banner", name: "Website Banner", price: "₹89", unit: "/day", icon: Globe, description: "Banner ad on Cosora website" },
  { id: "mobile-banner", name: "Mobile Banner", price: "₹99", unit: "/day", icon: Smartphone, description: "Banner ad on mobile app" },
  { id: "web-mobile", name: "Web & Mobile Combo", price: "₹129", unit: "", icon: Monitor, description: "Combined web & mobile banners" },
  { id: "fb-insta", name: "Facebook & Instagram", price: "₹59", unit: "", icon: Facebook, description: "Social media ad placement" },
  { id: "google", name: "Google Product Ad", price: "₹59", unit: "", icon: BarChart3, description: "Google shopping ad listing" },
  { id: "social-combo", name: "Social Media Combo", price: "₹99", unit: "", icon: Facebook, description: "All social media platforms" },
  { id: "trusted", name: "TrustedSeal Badge", price: "₹44", unit: "", icon: Shield, description: "Trust badge on your profile" },
  { id: "verified", name: "Cosora Verified", price: "₹199", unit: "", icon: BadgeCheck, description: "Verified certificate & badge" },
];

const vendorProducts = [
  { id: "p1", name: "Italian Silk Fabric", image: "/placeholder.svg" },
  { id: "p2", name: "Premium Cotton Blend", image: "/placeholder.svg" },
  { id: "p3", name: "Organic Linen", image: "/placeholder.svg" },
  { id: "p4", name: "Merino Wool Fabric", image: "/placeholder.svg" },
  { id: "p5", name: "Recycled Polyester", image: "/placeholder.svg" },
  { id: "p6", name: "Bamboo Jersey", image: "/placeholder.svg" },
];

const durationOptions = ["3 days", "7 days", "14 days", "30 days"];
const genderOptions = ["All", "Men", "Women"];
const cityOptions = ["Mumbai", "Delhi", "Bangalore", "Chennai", "Ahmedabad", "Jaipur", "Surat", "Kolkata"];
const categoryOptions = ["Mens Wear", "Women's Ethnic", "Denim", "Sarees", "Kids Wear", "Bridal"];
const goalOptions = ["Get more leads", "Increase profile views", "Drive phone calls", "Brand awareness", "Promote new products"];

const statusStyles: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 border-green-500/20",
  paused: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  ended: "bg-muted text-muted-foreground",
};

const Advertisements = () => {
  const navigate = useNavigate();
  const [wizardStep, setWizardStep] = useState(0); // 0 = not started
  const [selectedAdType, setSelectedAdType] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [gender, setGender] = useState("All");
  const [duration, setDuration] = useState("7 days");
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set(["Mumbai"]));
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedGoal, setSelectedGoal] = useState("");

  const toggleSet = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  const toggleProduct = (id: string) => {
    const next = new Set(selectedProducts);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedProducts(next);
  };

  const selectedAd = adTypes.find((a) => a.id === selectedAdType);
  const priceNum = selectedAd ? parseInt(selectedAd.price.replace("₹", "")) : 0;
  const daysNum = parseInt(duration) || 7;
  const totalCost = priceNum * daysNum;

  const handleCreate = () => {
    toast.success("Ad campaign created!", { description: "Your ad is now live." });
    setWizardStep(0);
    setSelectedAdType("");
    setSelectedProducts(new Set());
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-20">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-xl font-bold text-foreground">Advertise</h1>
          <p className="text-sm text-muted-foreground">Boost Your Visibility</p>
        </motion.div>

        {/* Live Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-3 gap-2"
        >
          {liveStats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-3 text-center">
              <stat.icon className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-xl font-bold text-accent">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Your Campaigns */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-display text-lg font-semibold text-foreground">Your Campaigns</h2>
            <Badge className="bg-accent/10 text-accent border-accent/20">
              {campaigns.filter((c) => c.status === "active").length} Active
            </Badge>
          </div>

          <div className="space-y-3">
            {campaigns.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05 }}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize border", statusStyles[c.status])}>
                        {c.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{c.startDate} – {c.endDate}</span>
                    </div>
                    <p className="font-medium text-sm text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">Targeting: {c.targeting}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-5 gap-2 my-3 text-center">
                  {[
                    { l: "Views", v: c.views > 999 ? `${(c.views / 1000).toFixed(1)}K` : c.views },
                    { l: "Leads", v: c.leads },
                    { l: "Calls", v: c.calls },
                    { l: "Inquiries", v: c.inquiries },
                    { l: "₹/Lead", v: `₹${c.costPerLead.toFixed(0)}` },
                  ].map((s) => (
                    <div key={s.l}>
                      <p className="text-sm font-semibold text-foreground">{s.v}</p>
                      <p className="text-[10px] text-muted-foreground">{s.l}</p>
                    </div>
                  ))}
                </div>

                {/* Budget */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Budget used</span>
                    <span>₹{c.budgetUsed} / ₹{c.budgetTotal}</span>
                  </div>
                  <Progress value={(c.budgetUsed / c.budgetTotal) * 100} className="h-2" />
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    {c.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Create Your Ad — 3-Step Wizard */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-display text-lg font-semibold text-foreground">Create Your Ad</h2>
            <span className="rounded-full bg-accent/10 text-accent text-[10px] font-semibold px-2 py-0.5">PAY PER AD</span>
          </div>

          {/* Step indicators */}
          <div className="flex gap-2 mb-4">
            {["Ad Type", "Products", "Target"].map((label, i) => (
              <button
                key={label}
                onClick={() => { if (i + 1 <= wizardStep) setWizardStep(i + 1); }}
                className={cn(
                  "flex-1 rounded-full py-1.5 text-xs font-medium transition-colors",
                  wizardStep === i + 1 ? "bg-accent text-accent-foreground" :
                  wizardStep > i + 1 ? "bg-accent/20 text-accent" :
                  "bg-muted text-muted-foreground"
                )}
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>

          {/* Step 1: Ad Type */}
          {(wizardStep === 0 || wizardStep === 1) && (
            <div className="space-y-2">
              {wizardStep === 0 && (
                <Button className="w-full bg-accent text-accent-foreground" onClick={() => setWizardStep(1)}>
                  <Megaphone className="mr-2 h-4 w-4" /> Start Creating Your Ad
                </Button>
              )}
              {wizardStep === 1 && (
                <>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                    {adTypes.map((ad) => (
                      <button
                        key={ad.id}
                        onClick={() => setSelectedAdType(ad.id)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-all hover:border-accent",
                          selectedAdType === ad.id ? "border-2 border-accent bg-accent/5" : "border-border bg-card"
                        )}
                      >
                        <ad.icon className="h-5 w-5 text-accent mb-1" />
                        <p className="text-xs font-medium text-foreground leading-tight">{ad.name}</p>
                        <p className="text-accent font-bold text-sm">{ad.price}<span className="text-[10px] font-normal text-muted-foreground">{ad.unit}</span></p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{ad.description}</p>
                      </button>
                    ))}
                  </div>
                  <Button
                    className="w-full bg-accent text-accent-foreground mt-3"
                    disabled={!selectedAdType}
                    onClick={() => setWizardStep(2)}
                  >
                    Next: Select Products <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Step 2: Products */}
          {wizardStep === 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {vendorProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => toggleProduct(p.id)}
                    className={cn(
                      "relative rounded-xl border overflow-hidden transition-all",
                      selectedProducts.has(p.id) ? "border-2 border-accent" : "border-border"
                    )}
                  >
                    <div className="aspect-square bg-muted flex items-center justify-center">
                      <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                    </div>
                    {selectedProducts.has(p.id) && (
                      <div className="absolute top-1 right-1 bg-accent text-accent-foreground rounded-full w-5 h-5 flex items-center justify-center">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    <p className="p-1.5 text-[10px] text-foreground text-center truncate">{p.name}</p>
                  </button>
                ))}
              </div>
              <Button variant="outline" className="w-full text-xs">+ Add More Products</Button>
              <Button
                className="w-full bg-accent text-accent-foreground"
                disabled={selectedProducts.size === 0}
                onClick={() => setWizardStep(3)}
              >
                Next: Target Audience <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 3: Target Audience */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              {/* Gender */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Gender</p>
                <div className="flex gap-2">
                  {genderOptions.map((g) => (
                    <button
                      key={g}
                      onClick={() => setGender(g)}
                      className={cn(
                        "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                        gender === g ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >{g}</button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Duration</p>
                <div className="flex gap-2">
                  {durationOptions.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        duration === d ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >{d}</button>
                  ))}
                </div>
              </div>

              {/* Cities */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">City / Area</p>
                <div className="flex flex-wrap gap-2">
                  {cityOptions.map((c) => (
                    <button
                      key={c}
                      onClick={() => toggleSet(selectedCities, c, setSelectedCities)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs transition-colors",
                        selectedCities.has(c)
                          ? "bg-accent/10 text-accent border border-accent/30"
                          : "bg-muted text-muted-foreground"
                      )}
                    >{c}</button>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Category</p>
                <div className="flex flex-wrap gap-2">
                  {categoryOptions.map((c) => (
                    <button
                      key={c}
                      onClick={() => toggleSet(selectedCategories, c, setSelectedCategories)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs transition-colors",
                        selectedCategories.has(c)
                          ? "bg-accent/10 text-accent border border-accent/30"
                          : "bg-muted text-muted-foreground"
                      )}
                    >{c}</button>
                  ))}
                </div>
              </div>

              {/* Goal */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Goal</p>
                <div className="space-y-2">
                  {goalOptions.map((g) => (
                    <button
                      key={g}
                      onClick={() => setSelectedGoal(g)}
                      className={cn(
                        "w-full text-left rounded-xl border px-3 py-2.5 text-sm transition-colors",
                        selectedGoal === g ? "border-accent bg-accent/5 text-accent" : "border-border text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                          selectedGoal === g ? "border-accent" : "border-muted-foreground/40"
                        )}>
                          {selectedGoal === g && <div className="w-2 h-2 rounded-full bg-accent" />}
                        </div>
                        {g}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Estimated Cost (sticky-ish) */}
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-2">
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">
                    {selectedAd?.price}{selectedAd?.unit ? selectedAd.unit : ""} × {daysNum} days = <span className="text-accent">₹{totalCost}</span> total
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    No minimum spend • Start from ₹22/day • Go live instantly
                  </p>
                </div>
                <Button className="w-full bg-accent text-accent-foreground h-11" onClick={handleCreate}>
                  Create Your Ad
                </Button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Competitor Ads Link */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-border bg-card p-4"
        >
          <h3 className="font-semibold text-foreground text-sm">Competitor's Advertisements</h3>
          <button
            onClick={() => navigate("/competitor-ads")}
            className="mt-1 flex items-center gap-1 text-xs text-accent hover:underline"
          >
            See what your competitors are doing <ChevronRight className="h-3 w-3" />
          </button>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default Advertisements;
