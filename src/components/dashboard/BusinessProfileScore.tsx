import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";

interface BusinessProfileScoreProps {
  score?: number;
}

const checklistItems = [
  { label: "Add Email", done: true, href: "/my-store" },
  { label: "Add Website", done: false, href: "/my-store" },
  { label: "Add Social Links", done: false, href: "/my-store" },
  { label: "Upload Catalogue", done: false, href: "/upload" },
  { label: "Add Profile Photo", done: true, href: "/my-store" },
  { label: "Get First Review", done: false, href: "/reviews" },
];

export const BusinessProfileScore = ({ score = 45 }: BusinessProfileScoreProps) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-center gap-4">
        {/* SVG Circular Progress Ring */}
        <div className="relative flex-shrink-0 w-24 h-24">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              strokeWidth="6"
              className="stroke-border"
            />
            <motion.circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              className="stroke-accent"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1, delay: 0.3 }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{score}%</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground mb-0.5">
            Increase Business Profile Score
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Reach out to more customers
          </p>

          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground text-xs px-4 py-1.5 rounded-full h-auto hover:bg-accent/90">
                INCREASE SCORE
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Complete Your Profile</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                {checklistItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          item.done
                            ? "bg-green-500/10 text-green-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Check className="h-3 w-3" />
                      </div>
                      <span className="text-sm text-foreground">{item.label}</span>
                    </div>
                    {!item.done && (
                      <Link to={item.href} className="text-accent text-xs font-medium">
                        Add Now
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </motion.div>
  );
};
