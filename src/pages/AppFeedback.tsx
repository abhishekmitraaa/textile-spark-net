import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, Lightbulb } from "lucide-react";

const AppFeedback = () => {
  const [active, setActive] = useState<"bug"|"feature"|null>(null);
  const [bugText, setBugText] = useState("");
  const [featureText, setFeatureText] = useState("");

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-lg mx-auto pb-8">
        <motion.div initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }}>
          <h1 className="text-xl font-semibold font-display">App Feedback</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your feedback helps us build a better Cosora</p>
        </motion.div>
        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { key: "bug" as const, Icon: AlertTriangle, iconColor: "text-destructive", iconBg: "bg-destructive/10", title: "Report a Bug", subtitle: "Found something broken or unexpected?", btnLabel: "Report Bug", activeBtnClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90", placeholder: "Describe the bug... What happened? What page were you on?", text: bugText, setText: setBugText, successMsg: "Bug reported! Thanks for helping us improve." },
            { key: "feature" as const, Icon: Lightbulb, iconColor: "text-accent", iconBg: "bg-accent/10", title: "Suggest a Feature", subtitle: "Have a great idea for Cosora?", btnLabel: "Suggest Feature", activeBtnClass: "bg-accent text-accent-foreground hover:bg-accent/90", placeholder: "What feature would you love to see? How would it help your business?", text: featureText, setText: setFeatureText, successMsg: "Thanks for the suggestion! We read all feedback carefully." },
          ].map(({ key, Icon, iconColor, iconBg, title, subtitle, btnLabel, activeBtnClass, placeholder, text, setText, successMsg }) => (
            <Card key={key} className={active === key ? "border-accent/40" : ""}>
              <CardContent className="p-4">
                <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon className={`h-6 w-6 ${iconColor}`}/>
                </div>
                <p className="text-base font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
                <Button variant={active === key ? "default" : "outline"} className={`mt-3 w-full h-9 text-sm ${active === key ? activeBtnClass : ""}`} onClick={() => setActive(active === key ? null : key)}>
                  {active === key ? "Close ✕" : btnLabel}
                </Button>
                <AnimatePresence>
                  {active === key && (
                    <motion.div initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.2 }} className="overflow-hidden">
                      <div className="mt-3 space-y-2">
                        <Textarea placeholder={placeholder} value={text} onChange={e => setText(e.target.value)} rows={4} className="resize-none text-sm"/>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">{text.length}/500</span>
                          <Button size="sm" className={`h-8 text-xs ${activeBtnClass}`} disabled={!text.trim()} onClick={() => { toast.success(successMsg); setText(""); setActive(null); }}>Submit</Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          ))}
        </motion.div>
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }}>
          <p className="text-xs text-muted-foreground text-center">We read all feedback carefully. Due to high volume, we may not respond to each submission individually.</p>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};
export default AppFeedback;