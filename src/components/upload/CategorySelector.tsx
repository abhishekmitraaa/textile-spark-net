import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { sellerCategories, SellerCategory } from "@/data/sellerCategories";
import { Badge } from "@/components/ui/badge";
import {
  Gem, Layers, Scissors, Tag, Package, Shirt, Cog, FlaskConical,
  Printer, Wrench, Truck, Monitor, Calculator, Camera, User, Sparkles
} from "lucide-react";

interface CategorySelectorProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string) => void;
}

const iconMap: Record<string, React.ElementType> = {
  Gem: Gem,
  Layers: Layers,
  Scissors: Scissors,
  Tag: Tag,
  Package: Package,
  Shirt: Shirt,
  Cog: Cog,
  Flask: FlaskConical,
  Printer: Printer,
  Wrench: Wrench,
  Truck: Truck,
  Monitor: Monitor,
  Calculator: Calculator,
  Camera: Camera,
  User: User,
  Sparkles: Sparkles,
};

const typeColors: Record<string, { bg: string; text: string; border: string }> = {
  product: { bg: "bg-emerald-500/10", text: "text-emerald-600", border: "border-emerald-500/30" },
  service: { bg: "bg-blue-500/10", text: "text-blue-600", border: "border-blue-500/30" },
  freelancer: { bg: "bg-purple-500/10", text: "text-purple-600", border: "border-purple-500/30" },
};

const typeLabels: Record<string, string> = {
  product: "Products",
  service: "Services",
  freelancer: "Freelancer",
};

export const CategorySelector = ({ selectedCategory, onSelectCategory }: CategorySelectorProps) => {
  // Group categories by type
  const groupedCategories = sellerCategories.reduce((acc, category) => {
    if (!acc[category.type]) {
      acc[category.type] = [];
    }
    acc[category.type].push(category);
    return acc;
  }, {} as Record<string, SellerCategory[]>);

  return (
    <div className="space-y-6">
      {(["product", "service", "freelancer"] as const).map((type) => (
        <div key={type}>
          <div className="mb-3 flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-medium",
                typeColors[type].bg,
                typeColors[type].text,
                typeColors[type].border
              )}
            >
              {typeLabels[type]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {groupedCategories[type]?.length || 0} categories
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {groupedCategories[type]?.map((category, index) => {
              const Icon = iconMap[category.icon] || Package;
              const isSelected = selectedCategory === category.id;
              
              return (
                <motion.button
                  key={category.id}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => onSelectCategory(category.id)}
                  className={cn(
                    "group relative flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-all sm:gap-2 sm:p-3 lg:p-4 min-h-[100px] sm:min-h-[110px]",
                    isSelected
                      ? "border-accent bg-accent/10 ring-2 ring-accent/30"
                      : "border-border bg-card hover:border-accent/50 hover:bg-accent/5"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-colors sm:h-10 sm:w-10 lg:h-12 lg:w-12",
                      isSelected
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary text-muted-foreground group-hover:bg-accent/20 group-hover:text-accent"
                    )}
                  >
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium leading-tight sm:text-xs lg:text-sm line-clamp-2 px-0.5",
                      isSelected ? "text-accent" : "text-foreground"
                    )}
                  >
                    {category.name}
                  </span>
                  <span className="text-[9px] text-muted-foreground sm:text-[10px] lg:text-xs">
                    {category.subCategories.length} sub-cat
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
