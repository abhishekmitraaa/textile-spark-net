import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { toast } from "@/hooks/use-toast";

const fadeIn = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" as const },
};

type FeedbackType = "bug" | "feature" | null;

const AppFeedback = () => {
  const [expanded, setExpanded] = useState<FeedbackType>(null);
  const [bugText, setBugText] = useState("");
  const [featureText, setFeatureText] = useState("");

  const handleSubmit = (type: FeedbackType) => {
    toast({ title: "Feedback Submitted", description: "Thank you for helping us improve Cosora!" });
    if (type === "bug") setBugText("");
    else setFeatureText("");
    setExpanded(null);
  };

  const cards: { type: FeedbackType; icon: typeof AlertTriangle; label: string; sub: string; iconClass: string; bgClass: string; btnClass: string; text: string; setText: (v: string) => void }[] = [
    {
      type: "bug",
      icon: AlertTriangle,
      label: "Report a Bug",
      sub: "Found something broken?",
      iconClass: "text-destructive",
      bgClass: "bg-destructive/10",
      btnClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      text: bugText,
      setText: setBugText,
    },
    {
      type: "feature",
      icon: Lightbulb,
      label: "Suggest a Feature",
      sub: "Have an idea?",
      iconClass: "text-accent",
      bgClass: "bg-accent/10",
      btnClass: "bg-accent text-accent-foreground hover:bg-accent/90",
      text: featureText,
      setText: setFeatureText,
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto pb-24">
        <motion.div {...fadeIn}>
          <h1 className="font-display text-2xl font-bold text-foreground">App Feedback</h1>
          <p className="text-muted-foreground text-sm mt-1 mb-6">Help us improve Cosora</p>
        </motion.div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {cards.map((card) => (
            <motion.div
              key={card.type}
              {...fadeIn}
              transition={{ ...fadeIn.transition, delay: card.type === "bug" ? 0.05 : 0.1 }}
            >
              <button
                onClick={() => setExpanded(expanded === card.type ? null : card.type)}
                className={`w-full rounded-xl border bg-card p-4 text-left transition-all ${
                  expanded === card.type ? "border-accent ring-1 ring-accent/20" : "hover:border-accent/30"
                }`}
              >
                <div className={`${card.bgClass} rounded-xl w-12 h-12 flex items-center justify-center mb-3`}>
                  <card.icon className={`w-6 h-6 ${card.iconClass}`} />
                </div>
                <p className="font-semibold text-foreground text-sm">{card.label}</p>
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </button>

              <AnimatePresence>
                {expanded === card.type && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-2">
                      <div className="relative">
                        <Textarea
                          rows={4}
                          maxLength={500}
                          placeholder={card.type === "bug" ? "Describe the bug..." : "Describe your idea..."}
                          value={card.text}
                          onChange={(e) => card.setText(e.target.value)}
                        />
                        <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">
                          {card.text.length}/500
                        </span>
                      </div>
                      <Button
                        onClick={() => handleSubmit(card.type)}
                        disabled={!card.text.trim()}
                        className={`w-full h-10 ${card.btnClass} disabled:opacity-40`}
                      >
                        Submit
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        <motion.p {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.15 }} className="text-xs text-muted-foreground text-center">
          We read all feedback carefully, but we may not respond to each submission individually.
        </motion.p>
      </div>
    </DashboardLayout>
  );
};

export default AppFeedback;
