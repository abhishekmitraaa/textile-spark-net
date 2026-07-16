import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useProfileScore } from "@/lib/queries/vendorDashboard";

interface BusinessProfileScoreProps {
  /** Optional override; defaults to the shared live profile score. */
  score?: number;
}

export const BusinessProfileScore = ({ score: scoreOverride }: BusinessProfileScoreProps) => {
  const navigate = useNavigate();
  const liveScore = useProfileScore();
  const score = scoreOverride ?? liveScore;
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
        <div className="relative flex-shrink-0 w-24 h-24">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={radius} fill="none" strokeWidth="6" className="stroke-border" />
            <motion.circle
              cx="48" cy="48" r={radius} fill="none" strokeWidth="6" strokeLinecap="round"
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

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground mb-0.5">Increase Business Profile Score</h3>
          <p className="text-xs text-muted-foreground mb-3">Reach out to more customers</p>
          <Button
            onClick={() => navigate("/business-profile-score")}
            className="bg-accent text-accent-foreground text-xs px-4 py-1.5 rounded-full h-auto hover:bg-accent/90"
          >
            INCREASE SCORE
          </Button>
        </div>
      </div>
    </motion.div>
  );
};