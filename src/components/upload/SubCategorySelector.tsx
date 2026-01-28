import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getCategoryById } from "@/data/sellerCategories";
import { Check } from "lucide-react";

interface SubCategorySelectorProps {
  categoryId: string;
  selectedSubCategory: string | null;
  onSelectSubCategory: (subCategoryId: string) => void;
}

export const SubCategorySelector = ({
  categoryId,
  selectedSubCategory,
  onSelectSubCategory,
}: SubCategorySelectorProps) => {
  const category = getCategoryById(categoryId);
  
  if (!category) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Select a sub-category for <span className="font-medium text-foreground">{category.name}</span>
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {category.subCategories.map((subCategory, index) => {
          const isSelected = selectedSubCategory === subCategory.id;
          
          return (
            <motion.button
              key={subCategory.id}
              type="button"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.02 }}
              onClick={() => onSelectSubCategory(subCategory.id)}
              className={cn(
                "relative flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                isSelected
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-card text-foreground hover:border-accent/50 hover:bg-accent/5"
              )}
            >
              <span className="truncate">{subCategory.name}</span>
              {isSelected && (
                <Check className="h-4 w-4 shrink-0 text-accent" />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
