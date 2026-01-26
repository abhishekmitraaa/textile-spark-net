import { motion } from "framer-motion";
import { TrendingUp, Users, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface BusinessProfileScoreProps {
  score?: number;
}

export const BusinessProfileScore = ({ score = 45 }: BusinessProfileScoreProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-start gap-4">
        {/* Score Circle */}
        <div className="relative flex-shrink-0">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-accent/20 to-accent/40 sm:h-20 sm:w-20">
            <span className="font-display text-2xl font-bold text-accent sm:text-3xl">
              {score}%
            </span>
          </div>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: "spring" }}
            className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground"
          >
            <TrendingUp className="h-3 w-3" />
          </motion.div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="mb-1 font-display text-base font-semibold text-card-foreground sm:text-lg">
            Increase Business Profile Score
          </h3>
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>Reach out to more customers</span>
          </div>
          
          {/* Progress bar */}
          <div className="mb-3">
            <Progress value={score} className="h-2" />
          </div>

          <Link to="/profile">
            <Button 
              size="sm" 
              variant="outline" 
              className="gap-1 border-accent/50 text-accent hover:bg-accent/10"
            >
              Increase Score
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
};
