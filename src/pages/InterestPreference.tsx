import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Local preference thumbnails (src/assets/Buyer/Preference/*.png). Loaded via
// glob so filenames with spaces / "&" / curly apostrophes resolve cleanly.
const prefFiles = import.meta.glob("../assets/Buyer/Preference/*.png", { eager: true, import: "default" }) as Record<string, string>;
const localImg = (basename: string) => {
  const hit = Object.entries(prefFiles).find(([p]) => p.split("/").pop() === basename);
  return hit?.[1];
};

// Buyer registration interests. `file` → provided local asset; `img` → Unsplash
// fallback for the few interests without a provided image.
const categories: { name: string; file?: string; img?: string }[] = [
  { name: "Fabrics",             file: "fabrics.png" },
  { name: "Women's Clothing",    file: "Women’s clothing.png" },
  { name: "Men's Clothing",      file: "Men’s Clothing.png" },
  { name: "Unisex Clothing",     file: "Unisex Clothing.png" },
  { name: "Kidswear",            file: "Kidswear.png" },
  { name: "Accessories",         file: "Accessories.png" },
  { name: "Raw Materials",       file: "Raw Materials.png" },
  { name: "Trims & Accessories", file: "Trims & Accessories.png" },
  { name: "Labels & Tags",       file: "Labels & Tags.png" },
  { name: "Packaging",           file: "Packaging.png" },
  { name: "IT & Software",       file: "IT &  Software.png" },
  { name: "Freelance",           file: "Freelance.png" },
  { name: "Exporter",            file: "Exporter.png" },
  { name: "Cosmetics",           img: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=200&h=200&fit=crop" },
  { name: "Fashion Designer",    img: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=200&h=200&fit=crop&q=80" },
  { name: "Marketing PR",        img: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=200&h=200&fit=crop" },
  { name: "Photography",         img: "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=200&h=200&fit=crop" },
];

const InterestPreference = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState("");

  const toggle = (name: string) => {
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const isValid = selected.length > 0 || (showOther && otherText.trim().length > 0);

  return (
    <div className="min-h-screen bg-white flex flex-col px-5 py-6">
      {/* Back arrow */}
      <button onClick={() => navigate("/auth/account-info")} className="mb-2 -ml-1 p-1.5 self-start">
        <ArrowLeft className="w-5 h-5 text-gray-700" />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col max-w-lg mx-auto w-full"
      >
        <h2 className="text-lg font-bold text-gray-900 mb-1">Interest Preference</h2>

        <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 mb-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Select your preferred brands or product information. We will recommend brands and products based on your selections.
          </p>
        </div>

        <p className="text-sm font-bold text-gray-800 mb-3">Your Interest</p>

        <div className="grid grid-cols-4 gap-x-3 gap-y-4 mb-2">
          {categories.map(cat => {
            const isSelected = selected.includes(cat.name);
            const src = (cat.file && localImg(cat.file)) || cat.img;
            return (
              <button key={cat.name} onClick={() => toggle(cat.name)} className="text-center">
                <div className={cn(
                  "relative aspect-square rounded-full overflow-hidden mb-1.5 ring-2 transition-all",
                  isSelected ? "ring-[#a4172c]" : "ring-transparent"
                )}>
                  <img src={src} alt={cat.name} className="w-full h-full object-cover" loading="lazy" />
                  {isSelected && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-[#a4172c] flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-gray-600 font-medium leading-tight line-clamp-2">
                  {cat.name}
                </span>
              </button>
            );
          })}

          {/* Others tile */}
          <button onClick={() => setShowOther(p => !p)} className="text-center">
            <div className={cn(
              "aspect-square rounded-full bg-gray-50 flex items-center justify-center mb-1.5 ring-2 transition-all",
              showOther ? "ring-[#a4172c]" : "ring-transparent"
            )}>
              <span className="text-xl text-gray-400">+</span>
            </div>
            <span className="text-[10px] text-gray-600 font-medium">Others</span>
          </button>
        </div>

        {showOther && (
          <input
            type="text"
            placeholder="Type your category..."
            value={otherText}
            onChange={e => setOtherText(e.target.value)}
            autoFocus
            className="w-full px-3.5 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#a4172c] transition-colors mb-2"
          />
        )}

        <button
          onClick={() => navigate("/auth/terms")}
          disabled={!isValid}
          className={cn(
            "w-full py-3.5 text-sm font-bold rounded-xl transition-colors mt-6",
            isValid
              ? "bg-[#a4172c] hover:bg-[#8c1325] text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          )}
        >
          Save
        </button>
      </motion.div>
    </div>
  );
};

export default InterestPreference;