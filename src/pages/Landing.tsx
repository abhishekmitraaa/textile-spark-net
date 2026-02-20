import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ShoppingBag, Building2, Sparkles, Shield, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const Landing = () => {
  return (
    <div className="min-h-screen bg-foreground flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 lg:px-12">
        <span className="font-display text-2xl font-bold italic text-background tracking-tight">
          Cosora
        </span>
        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" className="text-background/70 hover:text-background hover:bg-background/10 text-sm">
              Sign In
            </Button>
          </Link>
          <Link to="/register">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 text-sm px-5">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 lg:py-20">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-background/20 bg-background/10 px-4 py-1.5"
        >
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-medium text-background/80">India's #1 B2B Fashion Marketplace</span>
        </motion.div>

        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-display text-4xl font-bold italic text-background leading-tight sm:text-5xl lg:text-7xl max-w-4xl"
        >
          Where Fashion
          <br />
          <span className="text-accent">Meets Scale</span>
        </motion.h1>

        {/* Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-5 max-w-xl text-base text-background/60 lg:text-lg"
        >
          Connect clothing brands with verified manufacturers. Source fabrics, get quotes, and grow your fashion business — all in one platform.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4"
        >
          <Link to="/register">
            <Button
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 px-8 text-base font-semibold w-full sm:w-auto"
            >
              Start for Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button
              size="lg"
              variant="outline"
              className="border-background/20 text-background hover:bg-background/10 hover:border-background/40 gap-2 px-8 text-base w-full sm:w-auto"
            >
              Sign In
            </Button>
          </Link>
        </motion.div>

        {/* Role Cards */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl w-full"
        >
          {/* Buyer card */}
          <Link to="/register" className="group">
            <div className="rounded-2xl border border-background/10 bg-background/5 p-6 text-left transition-all duration-300 hover:bg-background/10 hover:border-accent/40 cursor-pointer">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20">
                <ShoppingBag className="h-6 w-6 text-accent" />
              </div>
              <h3 className="font-semibold text-background text-lg mb-1">I'm a Buyer</h3>
              <p className="text-sm text-background/50 mb-4">Clothing brand, retailer, or designer looking to source products</p>
              <div className="space-y-2">
                {["Browse 50,000+ products", "Post RFQs & get quotes", "Verified manufacturer network"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-background/60">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-1 text-accent text-sm font-medium group-hover:gap-2 transition-all">
                Join as Buyer <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </Link>

          {/* Seller card */}
          <Link to="/register" className="group">
            <div className="rounded-2xl border border-background/10 bg-background/5 p-6 text-left transition-all duration-300 hover:bg-background/10 hover:border-accent/40 cursor-pointer">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-background/10">
                <Building2 className="h-6 w-6 text-background/70" />
              </div>
              <h3 className="font-semibold text-background text-lg mb-1">I'm a Seller</h3>
              <p className="text-sm text-background/50 mb-4">Manufacturer, supplier, or factory looking to reach buyers</p>
              <div className="space-y-2">
                {["List unlimited products", "Get matched with brands", "Analytics & lead management"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-background/60">
                    <div className="h-1.5 w-1.5 rounded-full bg-background/40 flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-1 text-background/60 text-sm font-medium group-hover:gap-2 group-hover:text-background transition-all">
                Join as Seller <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-8 lg:gap-16"
        >
          {[
            { value: "50K+", label: "Products Listed", icon: ShoppingBag },
            { value: "10K+", label: "Verified Brands", icon: Shield },
            { value: "5K+", label: "Manufacturers", icon: Building2 },
            { value: "₹500Cr+", label: "GMV Processed", icon: TrendingUp },
          ].map(({ value, label, icon: Icon }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold text-background lg:text-3xl">{value}</p>
              <p className="mt-0.5 text-xs text-background/50">{label}</p>
            </div>
          ))}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 text-center">
        <p className="text-xs text-background/30">
          © 2024 Cosora. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default Landing;
