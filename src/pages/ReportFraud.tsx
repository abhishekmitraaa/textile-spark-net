import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Flag, AlertTriangle, CheckCircle2, Upload } from "lucide-react";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};
const listContainer = {
  show: { transition: { staggerChildren: 0.055 } },
};
const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};

const ReportFraud = () => {
  const reduced = useReducedMotion();
  const [fields, setFields] = useState({ name:"", email:"", phone:"", fraudPhone:"", city:"", message:"" });
  const [hasFile, setHasFile] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields(f => ({...f, [k]: e.target.value}));

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 max-w-lg mx-auto pb-8">
        <motion.div variants={section}>
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-center">
            <Flag className="h-8 w-8 text-destructive mx-auto mb-2"/>
            <p className="text-xl font-bold text-destructive">Report a Potential Fraud</p>
            <Link to="/help"><p className="text-xs text-destructive/70 mt-1 hover:underline cursor-pointer">← Back to Help</p></Link>
          </div>
        </motion.div>
        <motion.div variants={section}>
          <Card><CardContent className="p-4 space-y-4">
            {[
              ["Your Name","name","text","Your full name"],
              ["Your Email","email","email","your@email.com"],
              ["Your Mobile Number","phone","tel","+91 XXXXX XXXXX"],
              ["Phone Number to Report","fraudPhone","tel","Number you suspect is fraudulent"],
              ["City","city","text","Your city"],
            ].map(([label, key, type, placeholder]) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-sm font-medium">{label}</Label>
                <Input type={type} placeholder={placeholder} value={fields[key as keyof typeof fields]} onChange={set(key)} className="h-11"/>
              </div>
            ))}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Message *</Label>
              <Textarea placeholder="Describe the fraud in detail — include what happened, amounts involved, dates, and any other relevant information." rows={5} value={fields.message} onChange={set("message")} className="resize-none"/>
            </div>
            <div className="rounded-xl border-2 border-dashed border-border p-4 text-center cursor-pointer hover:border-accent/40 transition-colors" onClick={() => setHasFile(h => !h)}>
              {hasFile ? (
                <><CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-1"/><p className="text-sm text-green-600 font-medium">File attached</p></>
              ) : (
                <><Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-1"/><p className="text-sm text-muted-foreground">Attach Image or Screenshot (optional)</p><p className="text-xs text-muted-foreground">PNG, JPG, PDF up to 10MB</p></>
              )}
            </div>
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5"/>
              <div className="text-sm text-amber-700 space-y-0.5">
                <p>Please use this form only for reporting potential fraud.</p>
                <p>For general queries, contact us at <Link to="/help" className="underline">Help & Support</Link>.</p>
                <p>All reports are reviewed within 48 hours.</p>
              </div>
            </div>
            <motion.div whileTap={TAP} transition={TAP_T}><Button className="w-full bg-destructive text-destructive-foreground h-11 hover:bg-destructive/90" onClick={() => toast.success("Report submitted. Our team will review it within 48 hours.") }>
              <Flag className="h-4 w-4 mr-2"/> Submit Fraud Report
            </Button></motion.div>
          </CardContent></Card>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};
export default ReportFraud;