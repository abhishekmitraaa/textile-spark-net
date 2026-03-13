import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";

const categories = [
  { name: "Fabrics", img: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=200&h=200&fit=crop" },
  { name: "Women's Clothing", img: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=200&h=200&fit=crop" },
  { name: "Men's Clothing", img: "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=200&h=200&fit=crop" },
  { name: "Cosmetics", img: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=200&h=200&fit=crop" },
  { name: "Unisex Clothing", img: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&h=200&fit=crop" },
  { name: "Kidswear", img: "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=200&h=200&fit=crop" },
  { name: "Accessories", img: "https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=200&h=200&fit=crop" },
  { name: "Labels & Tags", img: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=200&h=200&fit=crop" },
  { name: "IT & Software", img: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=200&h=200&fit=crop" },
  { name: "Raw Materials", img: "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=200&h=200&fit=crop" },
  { name: "Packaging", img: "https://images.unsplash.com/photo-1607166452427-7e4477c2cc4e?w=200&h=200&fit=crop" },
  { name: "Trims & Accessories", img: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=200&h=200&fit=crop&q=80" },
  { name: "Fashion Designer", img: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=200&h=200&fit=crop&q=80" },
  { name: "Marketing PR", img: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=200&h=200&fit=crop" },
  { name: "Freelance", img: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=200&h=200&fit=crop" },
  { name: "Exporter", img: "https://images.unsplash.com/photo-1494412574643-ff11b0a5eb19?w=200&h=200&fit=crop" },
  { name: "Photography", img: "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=200&h=200&fit=crop" },
];

const InterestPreference = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState("");

  const toggle = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <h1 className="font-display text-accent text-2xl italic text-center mb-6">Cosora</h1>

        <h2 className="font-display text-2xl font-bold text-foreground text-center mb-2">
          What are you interested in sourcing?
        </h2>
        <p className="text-muted-foreground text-sm text-center mb-8">
          Select categories to personalise your feed. You can change this later.
        </p>

        <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-4">
          {categories.map((cat) => {
            const isSelected = selected.includes(cat.name);
            return (
              <button
                key={cat.name}
                onClick={() => toggle(cat.name)}
                className="relative text-center group"
              >
                <div
                  className={`aspect-square rounded-xl overflow-hidden mb-1.5 transition-all ${
                    isSelected ? "ring-2 ring-accent" : "ring-0"
                  }`}
                >
                  <img
                    src={cat.img}
                    alt={cat.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                      <Check className="w-3 h-3 text-accent-foreground" />
                    </div>
                  )}
                </div>
                <span className="text-xs text-foreground font-medium leading-tight line-clamp-2">
                  {cat.name}
                </span>
              </button>
            );
          })}

          {/* Others tile */}
          <button
            onClick={() => setShowOther(!showOther)}
            className={`relative text-center ${showOther ? "ring-2 ring-accent rounded-xl" : ""}`}
          >
            <div className="aspect-square rounded-xl bg-muted/50 flex items-center justify-center mb-1.5">
              <span className="text-2xl text-muted-foreground">+</span>
            </div>
            <span className="text-xs text-foreground font-medium">Others</span>
          </button>
        </div>

        {showOther && (
          <Input
            className="h-11 mb-6"
            placeholder="Type your category..."
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
          />
        )}

        <Button
          onClick={() => navigate("/auth/terms")}
          className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 mt-4"
        >
          Save & Continue
        </Button>
      </motion.div>
    </div>
  );
};

export default InterestPreference;
