import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, Lightbulb } from "lucide-react";

const AppFeedback = () => {
  const [bugText, setBugText] = useState("");
  const [featureText, setFeatureText] = useState("");
  const [activeCard, setActiveCard] = useState<"bug" | "feature" | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-6 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl font-semibold font-display text-foreground lg:text-2xl">App Feedback</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your feedback helps us build a better Cosora</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className={activeCard === "bug" ? "border-destructive/40" : ""}>
            <CardContent className="p-4">
              <div className="w-12 h-12 bg-destructive/10 rounded-xl flex items-center justify-center mb-3">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-base font-semibold text-foreground">Report a Bug</p>
              <p className="text-sm text-muted-foreground mt-0.5">Found something broken or unexpected?</p>
              <Button
                variant={activeCard === "bug" ? "destructive" : "outline"}
                className="mt-3 w-full h-9 text-sm"
                onClick={() => setActiveCard(activeCard === "bug" ? null : "bug")}
                type="button"
              >
                {activeCard === "bug" ? "Close ✕" : "Report a Bug"}
              </Button>

              <AnimatePresence>
                {activeCard === "bug" ? (
                  <motion.div
                    key="bug"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-2">
                      <Textarea
                        placeholder="Describe the bug... What happened? What did you expect? Which page were you on?"
                        rows={4}
                        value={bugText}
                        onChange={(e) => setBugText(e.target.value)}
                        className="resize-none text-sm"
                      />
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">{bugText.length}/500</span>
                        <Button
                          className="h-9 text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={!bugText.trim()}
                          onClick={() => {
                            toast.success("Bug reported! Thank you for helping us improve.");
                            setBugText("");
                            setActiveCard(null);
                          }}
                          type="button"
                        >
                          Submit Report
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </CardContent>
          </Card>

          <Card className={activeCard === "feature" ? "border-accent/40" : ""}>
            <CardContent className="p-4">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-3">
                <Lightbulb className="h-6 w-6 text-accent" />
              </div>
              <p className="text-base font-semibold text-foreground">Suggest a Feature</p>
              <p className="text-sm text-muted-foreground mt-0.5">Have a great idea for Cosora?</p>
              <Button
                variant={activeCard === "feature" ? "default" : "outline"}
                className="mt-3 w-full h-9 text-sm"
                onClick={() => setActiveCard(activeCard === "feature" ? null : "feature")}
                type="button"
              >
                {activeCard === "feature" ? "Close ✕" : "Suggest a Feature"}
              </Button>

              <AnimatePresence>
                {activeCard === "feature" ? (
                  <motion.div
                    key="feature"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-2">
                      <Textarea
                        placeholder="Describe your idea... What should Cosora do next?"
                        rows={4}
                        value={featureText}
                        onChange={(e) => setFeatureText(e.target.value)}
                        className="resize-none text-sm"
                      />
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">{featureText.length}/500</span>
                        <Button
                          className="h-9 text-sm bg-accent text-accent-foreground hover:bg-accent/90"
                          disabled={!featureText.trim()}
                          onClick={() => {
                            toast.success("Thanks for the suggestion! We read all feedback carefully.");
                            setFeatureText("");
                            setActiveCard(null);
                          }}
                          type="button"
                        >
                          Submit Suggestion
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <p className="text-xs text-muted-foreground text-center">
            We read all feedback carefully. Due to high volume, we may not respond to each submission individually.
          </p>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default AppFeedback;