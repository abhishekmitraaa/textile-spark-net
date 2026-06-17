import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Building2,
  Megaphone,
  Package,
  Star,
  FileText,
  Globe,
  Share2,
  HelpCircle,
  Camera,
  Mail,
  Video,
  Upload,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface QuickActionItem {
  name: string;
  icon: React.ElementType;
  href: string;
  color: string;
  bgColor: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

const primaryActions: QuickActionItem[] = [
  { name: "Business Profile", icon: Building2, href: "/business-profile", color: "text-[#256fef]", bgColor: "bg-[#f0f4ff]" },
  { name: "Advertise", icon: Megaphone, href: "/advertisement-slideshow", color: "text-purple-600", bgColor: "bg-purple-100" },
  { name: "Add Products", icon: Package, href: "/upload", color: "text-emerald-600", bgColor: "bg-emerald-100" },
  { name: "Reviews", icon: Star, href: "/reviews", color: "text-amber-600", bgColor: "bg-amber-100" },
];

const secondaryActions: QuickActionItem[] = [
  { name: "My Quotes", icon: FileText, href: "/quotes", color: "text-rose-600", bgColor: "bg-rose-100" },
  { name: "Add Website", icon: Globe, href: "/my-store", color: "text-cyan-600", bgColor: "bg-cyan-100" },
  { name: "Add Social Links", icon: Share2, href: "/add-social-links", color: "text-orange-600", bgColor: "bg-orange-100" },
  { name: "Upload Catalogue", icon: Upload, href: "/upload-catalogue", color: "text-green-600", bgColor: "bg-green-100", badge: "FREE", badgeVariant: "secondary" },
];

const tertiaryActions: QuickActionItem[] = [
  { name: "Help/Connect", icon: HelpCircle, href: "/help", color: "text-indigo-600", bgColor: "bg-indigo-100" },
  { name: "Photo Studio", icon: Camera, href: "/cosora-studio", color: "text-pink-600", bgColor: "bg-pink-100" },
  { name: "Add Email", icon: Mail, href: "/my-store", color: "text-teal-600", bgColor: "bg-teal-100" },
  { name: "Video Closeup", icon: Video, href: "/upload-video", color: "text-red-600", bgColor: "bg-red-100" },
];

const QuickActionButton = ({ item, index }: { item: QuickActionItem; index: number }) => {
  const Icon = item.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Link
        to={item.href}
        className="group flex flex-col items-center gap-2 rounded-xl p-3 transition-all hover:bg-muted/50 sm:p-4"
      >
        <div className="relative">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${item.bgColor} transition-transform group-hover:scale-110 sm:h-14 sm:w-14`}
          >
            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${item.color}`} />
          </div>
          {item.badge && (
            <Badge
              variant={item.badgeVariant}
              className="absolute -right-2 -top-1 px-1.5 py-0 text-[10px]"
            >
              {item.badge}
            </Badge>
          )}
        </div>
        <span className="text-center text-xs font-medium text-muted-foreground group-hover:text-foreground sm:text-sm">
          {item.name}
        </span>
      </Link>
    </motion.div>
  );
};

export const SellerQuickActionsGrid = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="grid grid-cols-4 gap-2 sm:gap-4">
        {primaryActions.map((item, index) => (
          <QuickActionButton key={item.name} item={item} index={index} />
        ))}
      </div>
      <div className="h-px bg-border" />
      <div className="grid grid-cols-4 gap-2 sm:gap-4">
        {secondaryActions.map((item, index) => (
          <QuickActionButton key={item.name} item={item} index={index + 4} />
        ))}
      </div>
      <div className="h-px bg-border" />
      <div className="grid grid-cols-4 gap-2 sm:gap-4">
        {tertiaryActions.map((item, index) => (
          <QuickActionButton key={item.name} item={item} index={index + 8} />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Link
          to="/upload-catalogue"
          className="flex items-center justify-between rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 p-4 transition-all hover:border-accent hover:bg-accent/10"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
              <Upload className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Upload Catalogue</h4>
              <p className="text-xs text-muted-foreground">Share your full product range as a PDF</p>
            </div>
          </div>
          <BookOpen className="h-5 w-5 text-accent" />
        </Link>
      </motion.div>
    </motion.div>
  );
};
