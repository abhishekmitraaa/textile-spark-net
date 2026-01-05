import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import {
  Plus,
  Play,
  Pause,
  Eye,
  Phone,
  TrendingUp,
  Users,
  MoreVertical,
  Edit,
  Trash2,
  Sparkles,
  Target,
  Megaphone,
  Search,
  Crown,
  Zap,
  ArrowUpRight,
  MessageSquare,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";

interface Advertisement {
  id: string;
  title: string;
  status: "active" | "paused" | "ended";
  type: "featured" | "search-boost" | "category-spotlight" | "premium-listing";
  views: number;
  leads: number;
  calls: number;
  inquiries: number;
  budget: number;
  spent: number;
  costPerLead: number;
  startDate: string;
  endDate: string;
  products: string[];
  targetAudience: string;
}

const advertisements: Advertisement[] = [
  {
    id: "1",
    title: "Premium Silk Collection - Featured",
    status: "active",
    type: "featured",
    views: 12450,
    leads: 86,
    calls: 34,
    inquiries: 52,
    budget: 500,
    spent: 235,
    costPerLead: 2.73,
    startDate: "2024-01-01",
    endDate: "2024-01-31",
    products: ["Italian Silk Fabric", "Silk Blend Premium"],
    targetAudience: "Retailers & Wholesalers",
  },
  {
    id: "2",
    title: "Sustainable Cotton - Category Spotlight",
    status: "active",
    type: "category-spotlight",
    views: 8920,
    leads: 62,
    calls: 28,
    inquiries: 34,
    budget: 300,
    spent: 180,
    costPerLead: 2.90,
    startDate: "2024-01-05",
    endDate: "2024-02-05",
    products: ["Organic Cotton Blend", "Recycled Cotton"],
    targetAudience: "Eco-conscious Brands",
  },
  {
    id: "3",
    title: "Winter Wool Collection - Search Boost",
    status: "paused",
    type: "search-boost",
    views: 5600,
    leads: 38,
    calls: 15,
    inquiries: 23,
    budget: 400,
    spent: 156,
    costPerLead: 4.10,
    startDate: "2024-01-10",
    endDate: "2024-02-10",
    products: ["Merino Wool", "Wool Blend Fabric"],
    targetAudience: "Fashion Brands",
  },
];

const adTypeInfo = {
  "featured": { 
    icon: Crown, 
    label: "Featured Listing", 
    color: "bg-amber-100 text-amber-700",
    description: "Top placement on homepage & category pages"
  },
  "search-boost": { 
    icon: Search, 
    label: "Search Boost", 
    color: "bg-blue-100 text-blue-700",
    description: "Appear first in buyer search results"
  },
  "category-spotlight": { 
    icon: Target, 
    label: "Category Spotlight", 
    color: "bg-purple-100 text-purple-700",
    description: "Dominate your product category"
  },
  "premium-listing": { 
    icon: Zap, 
    label: "Premium Listing", 
    color: "bg-emerald-100 text-emerald-700",
    description: "Enhanced visibility with verified badge"
  },
};

const statusStyles = {
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  ended: "bg-muted text-muted-foreground",
};

const Advertisements = () => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedAdType, setSelectedAdType] = useState<string>("");

  const totalLeads = advertisements.reduce((acc, ad) => acc + ad.leads, 0);
  const totalCalls = advertisements.reduce((acc, ad) => acc + ad.calls, 0);
  const totalViews = advertisements.reduce((acc, ad) => acc + ad.views, 0);
  const avgCostPerLead = advertisements.reduce((acc, ad) => acc + ad.costPerLead, 0) / advertisements.length;

  const handleCreateAd = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Campaign created!", {
      description: "Your promotion is now live and reaching buyers.",
    });
    setIsCreateOpen(false);
  };

  return (
    <DashboardLayout>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between lg:mb-8"
      >
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Boost Your Visibility
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Promote your products to reach more buyers and get quality leads
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="gold" size="sm" className="w-full sm:w-auto">
              <Megaphone className="mr-2 h-4 w-4" />
              Create Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-lg sm:text-xl">
                Boost Your Products
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Get more visibility and connect with potential buyers
              </p>
            </DialogHeader>
            <form onSubmit={handleCreateAd} className="mt-4 space-y-5 sm:space-y-6">
              {/* Ad Type Selection */}
              <div className="space-y-3">
                <Label>Choose Promotion Type</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(adTypeInfo).map(([key, info]) => (
                    <div
                      key={key}
                      onClick={() => setSelectedAdType(key)}
                      className={cn(
                        "cursor-pointer rounded-xl border-2 p-3 transition-all hover:border-accent sm:p-4",
                        selectedAdType === key 
                          ? "border-accent bg-accent/5" 
                          : "border-border"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("rounded-lg p-2", info.color)}>
                          <info.icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{info.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{info.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign Name</Label>
                <Input
                  id="campaign-name"
                  placeholder="e.g., Summer Collection Promotion"
                />
              </div>

              {/* Select Products to Promote */}
              <div className="space-y-3">
                <Label>Select Products to Promote</Label>
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {["Italian Silk Fabric", "Premium Cotton Blend", "Organic Linen", "Merino Wool Fabric"].map((product) => (
                    <div key={product} className="flex items-center space-x-3">
                      <Checkbox id={product} />
                      <label 
                        htmlFor={product}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {product}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Target Audience */}
              <div className="space-y-2">
                <Label>Target Buyer Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Who should see your products?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Buyers</SelectItem>
                    <SelectItem value="retailers">Retailers</SelectItem>
                    <SelectItem value="wholesalers">Wholesalers</SelectItem>
                    <SelectItem value="brands">Fashion Brands</SelectItem>
                    <SelectItem value="exporters">Exporters</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ad-budget">Daily Budget</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      ₹
                    </span>
                    <Input id="ad-budget" className="pl-7" placeholder="500" />
                  </div>
                  <p className="text-xs text-muted-foreground">Recommended: ₹300-₹1000/day</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 Days</SelectItem>
                      <SelectItem value="14">14 Days</SelectItem>
                      <SelectItem value="30">30 Days</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Estimated Results */}
              <div className="rounded-xl bg-secondary/50 p-4">
                <p className="mb-3 text-sm font-medium text-foreground">Estimated Results</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="font-display text-lg font-semibold text-accent">2K-5K</p>
                    <p className="text-xs text-muted-foreground">Views</p>
                  </div>
                  <div>
                    <p className="font-display text-lg font-semibold text-accent">50-120</p>
                    <p className="text-xs text-muted-foreground">Leads</p>
                  </div>
                  <div>
                    <p className="font-display text-lg font-semibold text-accent">20-50</p>
                    <p className="text-xs text-muted-foreground">Calls</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:gap-3 sm:pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="order-2 flex-1 sm:order-1"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="gold" className="order-1 flex-1 sm:order-2">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Launch Campaign
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Key Metrics - Lead Focused */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-3 lg:mb-8 lg:grid-cols-4 lg:gap-4"
      >
        {[
          { label: "Total Leads", value: totalLeads.toString(), icon: Users, trend: "+12% this week", color: "text-green-600" },
          { label: "Phone Calls", value: totalCalls.toString(), icon: Phone, trend: "+8 today", color: "text-blue-600" },
          { label: "Profile Views", value: `${(totalViews / 1000).toFixed(1)}K`, icon: Eye, trend: "+24% this month", color: "text-purple-600" },
          { label: "Avg. Cost/Lead", value: `₹${avgCostPerLead.toFixed(0)}`, icon: TrendingUp, trend: "Great performance!", color: "text-accent" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card p-3 sm:p-4"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-secondary p-1.5 sm:p-2">
                <stat.icon className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
              </div>
              <ArrowUpRight className={cn("h-4 w-4", stat.color)} />
            </div>
            <div className="mt-3">
              <p className="font-display text-xl font-semibold text-card-foreground sm:text-2xl lg:text-3xl">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={cn("mt-1 text-[10px] font-medium sm:text-xs", stat.color)}>{stat.trend}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Active Campaigns */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">Your Campaigns</h2>
          <span className="text-sm text-muted-foreground">{advertisements.length} campaigns</span>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {advertisements.map((ad, index) => {
            const typeInfo = adTypeInfo[ad.type];
            return (
              <motion.div
                key={ad.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="group overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:shadow-elegant"
              >
                <div className="p-4 sm:p-5 lg:p-6">
                  {/* Header */}
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={cn("rounded-lg p-2", typeInfo.color)}>
                        <typeInfo.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize sm:text-xs",
                              statusStyles[ad.status]
                            )}
                          >
                            {ad.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {ad.startDate} - {ad.endDate}
                          </span>
                        </div>
                        <h3 className="font-display text-sm font-semibold text-card-foreground sm:text-base lg:text-lg">
                          {ad.title}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Targeting: {ad.targetAudience} • {ad.products.length} products
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                      >
                        {ad.status === "active" ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" /> Edit Campaign
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <TrendingUp className="mr-2 h-4 w-4" /> View Analytics
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Lead-focused Stats */}
                  <div className="grid grid-cols-2 gap-3 rounded-lg bg-secondary/30 p-3 sm:grid-cols-5 sm:gap-4 sm:p-4">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="font-display text-base font-semibold text-card-foreground sm:text-lg">
                          {ad.views.toLocaleString()}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground sm:text-xs">Views</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-green-600" />
                        <p className="font-display text-base font-semibold text-green-600 sm:text-lg">
                          {ad.leads}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground sm:text-xs">Leads</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-blue-600" />
                        <p className="font-display text-base font-semibold text-blue-600 sm:text-lg">
                          {ad.calls}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground sm:text-xs">Calls</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-purple-600" />
                        <p className="font-display text-base font-semibold text-purple-600 sm:text-lg">
                          {ad.inquiries}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground sm:text-xs">Inquiries</p>
                    </div>
                    <div className="col-span-2 text-center sm:col-span-1">
                      <p className="font-display text-base font-semibold text-accent sm:text-lg">
                        ₹{ad.costPerLead.toFixed(0)}
                      </p>
                      <p className="text-[10px] text-muted-foreground sm:text-xs">Cost/Lead</p>
                    </div>
                  </div>

                  {/* Budget Progress */}
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted-foreground">Budget Used</span>
                        <span className="font-medium text-card-foreground">₹{ad.spent} / ₹{ad.budget}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${(ad.spent / ad.budget) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Empty State / CTA */}
      {advertisements.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card/50 py-16 text-center"
        >
          <div className="mb-4 rounded-full bg-secondary p-4">
            <Megaphone className="h-8 w-8 text-accent" />
          </div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            Get More Buyers to Call You
          </h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Boost your products to appear at the top of search results and get quality leads from verified buyers.
          </p>
          <Button variant="gold" className="mt-6" onClick={() => setIsCreateOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            Create Your First Campaign
          </Button>
        </motion.div>
      )}
    </DashboardLayout>
  );
};

export default Advertisements;
