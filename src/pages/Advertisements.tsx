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
  MousePointer,
  TrendingUp,
  Calendar,
  MoreVertical,
  Edit,
  Trash2,
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

interface Advertisement {
  id: string;
  title: string;
  status: "active" | "paused" | "ended";
  type: "banner" | "featured" | "spotlight";
  impressions: number;
  clicks: number;
  budget: number;
  spent: number;
  startDate: string;
  endDate: string;
  image: string;
}

const advertisements: Advertisement[] = [
  {
    id: "1",
    title: "Premium Silk Collection Launch",
    status: "active",
    type: "banner",
    impressions: 12450,
    clicks: 342,
    budget: 500,
    spent: 235,
    startDate: "2024-01-01",
    endDate: "2024-01-31",
    image: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&h=300&fit=crop",
  },
  {
    id: "2",
    title: "Sustainable Fabrics Spotlight",
    status: "active",
    type: "spotlight",
    impressions: 8920,
    clicks: 198,
    budget: 300,
    spent: 180,
    startDate: "2024-01-05",
    endDate: "2024-02-05",
    image: "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=600&h=300&fit=crop",
  },
  {
    id: "3",
    title: "Winter Collection Featured",
    status: "paused",
    type: "featured",
    impressions: 5600,
    clicks: 124,
    budget: 400,
    spent: 156,
    startDate: "2024-01-10",
    endDate: "2024-02-10",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=300&fit=crop",
  },
];

const statusStyles = {
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  ended: "bg-muted text-muted-foreground",
};

const Advertisements = () => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleCreateAd = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Advertisement created!", {
      description: "Your ad is now under review.",
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Advertisements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your promotional campaigns
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="gold" size="sm" className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Create Ad
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-lg sm:text-xl">
                Create New Advertisement
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAd} className="mt-4 space-y-4 sm:space-y-6">
              <div className="space-y-2">
                <Label htmlFor="ad-title">Campaign Title</Label>
                <Input
                  id="ad-title"
                  placeholder="e.g., Summer Collection Launch"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ad-type">Ad Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="banner">Banner Ad</SelectItem>
                      <SelectItem value="featured">Featured Listing</SelectItem>
                      <SelectItem value="spotlight">Spotlight</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ad-budget">Daily Budget</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input id="ad-budget" className="pl-7" placeholder="50" />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input id="start-date" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">End Date</Label>
                  <Input id="end-date" type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ad-description">Description</Label>
                <Textarea
                  id="ad-description"
                  placeholder="Describe your advertisement..."
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Target Products</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    <SelectItem value="silk">Italian Silk Collection</SelectItem>
                    <SelectItem value="cotton">Premium Cotton Blend</SelectItem>
                  </SelectContent>
                </Select>
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
                  Create Campaign
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Stats overview */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-3 lg:mb-8 lg:grid-cols-4 lg:gap-4"
      >
        {[
          { label: "Impressions", value: "26.9K", icon: Eye },
          { label: "Clicks", value: "664", icon: MousePointer },
          { label: "Avg. CTR", value: "2.47%", icon: TrendingUp },
          { label: "Spent", value: "$571", icon: Calendar },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card p-3 sm:p-4"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="rounded-lg bg-secondary p-1.5 sm:p-2">
                <stat.icon className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="font-display text-base font-semibold text-card-foreground sm:text-lg lg:text-xl">
                  {stat.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Advertisements list */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="space-y-3 sm:space-y-4"
      >
        {advertisements.map((ad, index) => (
          <motion.div
            key={ad.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            className="group overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:shadow-elegant"
          >
            <div className="flex flex-col sm:flex-row">
              {/* Image */}
              <div className="relative h-32 overflow-hidden sm:h-auto sm:w-48 lg:w-64">
                <img
                  src={ad.image}
                  alt={ad.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>

              {/* Content */}
              <div className="flex flex-1 flex-col p-3 sm:p-4 lg:p-6">
                <div className="mb-3 flex items-start justify-between gap-2 sm:mb-4">
                  <div>
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 sm:mb-2 sm:gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize sm:text-xs",
                          statusStyles[ad.status]
                        )}
                      >
                        {ad.status}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-secondary-foreground sm:text-xs">
                        {ad.type}
                      </span>
                    </div>
                    <h3 className="font-display text-sm font-semibold text-card-foreground sm:text-base lg:text-lg">
                      {ad.title}
                    </h3>
                    <p className="text-xs text-muted-foreground sm:text-sm">
                      {ad.startDate} - {ad.endDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 sm:h-8 sm:w-8"
                    >
                      {ad.status === "active" ? (
                        <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
                      ) : (
                        <Play className="h-3 w-3 sm:h-4 sm:w-4" />
                      )}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8">
                          <MoreVertical className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Eye className="mr-2 h-4 w-4" /> Analytics
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Stats */}
                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-4 sm:gap-4 sm:pt-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground sm:text-xs">Impressions</p>
                    <p className="text-xs font-medium text-card-foreground sm:text-sm">
                      {ad.impressions.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground sm:text-xs">Clicks</p>
                    <p className="text-xs font-medium text-card-foreground sm:text-sm">{ad.clicks}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground sm:text-xs">CTR</p>
                    <p className="text-xs font-medium text-card-foreground sm:text-sm">
                      {((ad.clicks / ad.impressions) * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground sm:text-xs">
                      Budget (${ad.spent}/${ad.budget})
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary sm:h-2">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${(ad.spent / ad.budget) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </DashboardLayout>
  );
};

export default Advertisements;
