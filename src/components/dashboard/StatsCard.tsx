import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  delay?: number;
}

export const StatsCard = ({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  delay = 0,
}: StatsCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="group rounded-xl border border-border bg-card p-3 shadow-sm transition-all duration-300 hover:shadow-elegant sm:p-4 lg:p-6"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1 sm:space-y-2">
          <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{title}</p>
          <p className="font-display text-xl font-semibold tracking-tight text-card-foreground sm:text-2xl lg:text-3xl">
            {value}
          </p>
          {change && (
            <p
              className={cn(
                "truncate text-xs font-medium sm:text-sm",
                changeType === "positive" && "text-green-600",
                changeType === "negative" && "text-red-600",
                changeType === "neutral" && "text-muted-foreground"
              )}
            >
              {change}
            </p>
          )}
        </div>
        <div className="shrink-0 rounded-lg bg-secondary p-2 transition-colors group-hover:bg-accent/10 sm:p-3">
          <Icon className="h-4 w-4 text-accent sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
        </div>
      </div>
    </motion.div>
  );
};
