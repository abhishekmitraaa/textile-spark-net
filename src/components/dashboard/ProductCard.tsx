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
        
        {/* Quick actions overlay */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 p-4 opacity-0 transition-all duration-300 group-hover:opacity-100">
          <Button size="sm" variant="secondary" className="backdrop-blur">
            <Eye className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="secondary" className="backdrop-blur">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-start justify-between">
          <div>
            <h3 className="font-medium text-card-foreground line-clamp-1">{name}</h3>
            <p className="text-sm text-muted-foreground">{category}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
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
          <span className="font-display text-lg font-semibold text-card-foreground">
            {price}
          </span>
          <span className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
            statusStyles[status]
          )}>
            {status}
          </span>
        </div>

        <div className="flex items-center gap-4 border-t border-border pt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Eye size={14} />
            {views} views
          </span>
          <span>{inquiries} inquiries</span>
        </div>
      </div>
    </motion.div>
  );
};
