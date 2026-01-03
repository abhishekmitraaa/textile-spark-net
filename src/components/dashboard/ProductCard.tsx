import { motion } from "framer-motion";
import { Eye, Edit, Trash2, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  id: string;
  name: string;
  category: string;
  price: string;
  image: string;
  status: "active" | "draft" | "pending";
  views: number;
  inquiries: number;
  delay?: number;
}

const statusStyles = {
  active: "bg-green-100 text-green-700",
  draft: "bg-muted text-muted-foreground",
  pending: "bg-amber-100 text-amber-700",
};

export const ProductCard = ({
  name,
  category,
  price,
  image,
  status,
  views,
  inquiries,
  delay = 0,
}: ProductCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-elegant"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        <img
          src={image}
          alt={name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        
        {/* Quick actions overlay - hidden on mobile */}
        <div className="absolute inset-x-0 bottom-0 hidden items-center justify-center gap-2 p-4 opacity-0 transition-all duration-300 group-hover:opacity-100 sm:flex">
          <Button size="sm" variant="secondary" className="backdrop-blur">
            <Eye className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="secondary" className="backdrop-blur">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium text-card-foreground">{name}</h3>
            <p className="text-sm text-muted-foreground">{category}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <MoreVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Eye className="mr-2 h-4 w-4" /> View Details
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Edit className="mr-2 h-4 w-4" /> Edit Product
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-base font-semibold text-card-foreground sm:text-lg">
            {price}
          </span>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
            statusStyles[status]
          )}>
            {status}
          </span>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground sm:gap-4 sm:text-sm">
          <span className="flex items-center gap-1">
            <Eye size={14} />
            {views}
          </span>
          <span>{inquiries} inquiries</span>
        </div>
      </div>
    </motion.div>
  );
};
