import { motion } from "framer-motion";
import { ArrowRight, Crown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export const PromoBanner = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-accent/90 via-accent to-accent/80 p-4 sm:p-6"
    >
      {/* Background decorations */}
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-white/10 blur-xl" />
      
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <Crown className="h-4 w-4 text-accent-foreground" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-foreground/80">
              Premium Feature
            </span>
          </div>
          <h3 className="mb-1 text-lg font-bold text-accent-foreground sm:text-xl">
            Get Prime Placement Above Competitors
          </h3>
          <p className="text-sm text-accent-foreground/80">
            Boost your visibility and get 3x more inquiries with featured listings
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link to="/advertisements">
            <Button 
              size="sm" 
              className="gap-2 bg-accent-foreground text-accent hover:bg-accent-foreground/90 shadow-lg"
            >
              <Sparkles className="h-4 w-4" />
              Claim This Banner
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
      
      {/* Preview card mockup */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        className="absolute -right-4 top-1/2 hidden -translate-y-1/2 lg:block"
      >
        <div className="h-24 w-32 rotate-6 rounded-lg bg-white/20 p-2 shadow-lg backdrop-blur-sm">
          <div className="h-full w-full rounded bg-white/30" />
        </div>
      </motion.div>
    </motion.div>
  );
};
