import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getCategoryById } from "@/data/sellerCategories";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SubCategorySelectorProps {
  categoryId: string;
  selectedSubCategory: string | null;
  onSelectSubCategory: (subCategoryId: string) => void;
  selectedSubType?: string | null;
  onSelectSubType?: (subType: string) => void;
}

// Sub-types mapping based on the category filter document
const subTypesBySubCategory: Record<string, string[]> = {
  // Men's T-Shirts
  "mens-tshirts": ["Basic T-shirt", "Oversized T-shirt", "Polo T-Shirt", "Henley T-Shirt", "V-Neck T-Shirt", "Graphic T-Shirt", "Polyester T-shirt", "Sports T-shirt"],
  // Men's Shirts
  "mens-shirts": ["Casual Shirt", "Formal Shirt", "Denim Shirt", "Linen Shirt", "Mandarin Collar Shirt", "Outdoor Wear", "Sports Wear"],
  // Men's Pants/Trousers
  "mens-pants": ["Denim Jeans", "Chinos", "Formal Trousers", "Joggers", "Cargo Pants", "Track Pants"],
  // Men's Jeans
  "mens-jeans": ["Skinny Jeans", "Slim Fit Jeans", "Regular Jeans", "Relaxed Jeans", "Bootcut Jeans", "Straight Jeans", "Tapered Jeans"],
  // Shorts
  "mens-shorts": ["Bermuda", "Cargo Shorts", "Chino Shorts", "Sports Shorts", "Lounge Shorts"],
  // Women's Tops
  "womens-tops": ["Basic Tops", "Blouses", "Crop Tops", "Camisoles", "Tunics"],
  // Women's Dresses
  "womens-dresses": ["A-Line Dress", "Bodycon Dress", "Maxi Dress", "Midi Dress", "Wrap Dress", "Shirt Dress"],
  // Women's Ethnic
  "womens-ethnic": ["Kurta", "Kurti", "Kurta Sets", "Saree", "Lehenga", "Salwar Suit", "Anarkali", "Palazzo Set", "Indo-Western", "Bridal Lehenga"],
  // Kids Wear
  "kids-wear": ["T-Shirt", "Shirt", "Dress", "Shorts", "Pants", "Set", "Romper", "Onesie", "Ethnic Wear"],
  // Bags
  "bags": ["Tote Bag", "Backpack", "Clutch", "Sling Bag", "Messenger Bag", "Duffle Bag", "Laptop Bag", "Travel Bag", "Handbag"],
  // Sewing Machines
  "sewing-machines": ["Single Needle Lockstitch", "Double Needle", "Overlock", "Flatlock", "Bartack", "Buttonhole", "Button Attach", "Feed Off Arm", "Post Bed"],
  // Cutting Machines
  "cutting-machines": ["Straight Knife", "Band Knife", "Round Knife", "Die Cutting", "Laser Cutting", "Automatic Spreading", "CNC Cutter"],
  // Knitted Fabrics
  "knitted-fabrics": ["Single Jersey", "Double Jersey", "Interlock", "Rib", "Pique", "Fleece", "Terry"],
  // Woven Fabrics
  "woven-fabrics": ["Plain Weave", "Twill", "Satin", "Dobby", "Jacquard", "Oxford", "Poplin", "Chambray"],
  // Denim
  "denim": ["Raw/Rigid", "Stretch Denim", "Super Stretch", "Selvedge", "Colored Denim", "Coated Denim"],
  // Buttons
  "buttons": ["2-hole Button", "4-hole Button", "Shank Button", "Snap Button", "Toggle Button", "Horn Button", "Metal Button", "Pearl Button"],
  // Zippers
  "zippers": ["Metal Zipper", "Nylon Coil Zipper", "Vislon/Plastic Zipper", "Invisible Zipper", "Water-resistant Zipper", "Two-way Zipper"],
  // Labels
  "woven-labels": ["Main Label", "Size Label", "Care Label", "Flag Label", "Brand Label"],
  // Footwear
  "footwear": ["Sneakers", "Formal Shoes", "Sandals", "Slippers", "Boots", "Loafers", "Heels", "Flats", "Sports Shoes"],
  // Home Textiles
  "home-textiles": ["Bedsheet", "Duvet Cover", "Curtains", "Cushion Cover", "Towel", "Table Linen", "Blanket", "Rug"],
  // Ready-made Garments
  "ready-made-garments": ["Jackets", "Blazers", "Suits", "Activewear", "Sportswear", "Uniforms", "Workwear", "Swimwear"],
};

export const SubCategorySelector = ({
  categoryId,
  selectedSubCategory,
  onSelectSubCategory,
  selectedSubType,
  onSelectSubType,
}: SubCategorySelectorProps) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const category = getCategoryById(categoryId);
  
  const subTypes = selectedSubCategory ? subTypesBySubCategory[selectedSubCategory] || [] : [];
  
  const filteredSubCategories = useMemo(() => {
    if (!category) return [];
    if (!searchQuery) return category.subCategories;
    return category.subCategories.filter(sub => 
      sub.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [category, searchQuery]);

  if (!category) return null;

  const selectedSubCategoryName = category.subCategories.find(
    (s) => s.id === selectedSubCategory
  )?.name;

  return (
    <div className="space-y-6">
      {/* Sub-category Selection */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Select a sub-category for <span className="font-medium text-foreground">{category.name}</span>
        </p>
        
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search sub-categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Sub-category grid */}
        <ScrollArea className="h-[280px] pr-2 sm:h-auto sm:max-h-none">
          <div className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {filteredSubCategories.map((subCategory, index) => {
              const isSelected = selectedSubCategory === subCategory.id;
              
              return (
                <motion.button
                  key={subCategory.id}
                  type="button"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => {
                    onSelectSubCategory(subCategory.id);
                    setSearchQuery("");
                  }}
                  className={cn(
                    "relative flex items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left text-sm transition-all min-h-[48px]",
                    isSelected
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-card text-foreground hover:border-accent/50 hover:bg-accent/5"
                  )}
                >
                  <span className="line-clamp-2 text-xs sm:text-sm leading-tight">{subCategory.name}</span>
                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-accent" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </ScrollArea>
        
        {filteredSubCategories.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            No sub-categories found matching "{searchQuery}"
          </p>
        )}
      </div>

      {/* Sub-type Dropdown - Only show if sub-category is selected and has sub-types */}
      {selectedSubCategory && subTypes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <p className="text-sm text-muted-foreground">
            Select product type for <span className="font-medium text-foreground">{selectedSubCategoryName}</span>
          </p>
          
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between h-11 text-left font-normal"
              >
                <span className={cn(!selectedSubType && "text-muted-foreground")}>
                  {selectedSubType || "Select product type..."}
                </span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0 z-50 bg-popover" align="start">
              <Command>
                <CommandInput placeholder="Search product type..." className="h-10" />
                <CommandList>
                  <CommandEmpty>No product type found.</CommandEmpty>
                  <CommandGroup>
                    {subTypes.map((subType) => (
                      <CommandItem
                        key={subType}
                        value={subType}
                        onSelect={() => {
                          onSelectSubType?.(subType);
                          setOpen(false);
                        }}
                        className="cursor-pointer"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedSubType === subType ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {subType}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </motion.div>
      )}
    </div>
  );
};
