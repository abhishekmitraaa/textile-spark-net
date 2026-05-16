import { useState } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Flag, AlertTriangle, Upload, CheckCircle2 } from "lucide-react";

const initialFields = {
  name: "",
  email: "",
  phone: "",
  fraudPhone: "",
  city: "",
  message: "",
};

type Fields = typeof initialFields;

const ReportFraud = () => {
  const [fields, setFields] = useState<Fields>(initialFields);
  const [hasFile, setHasFile] = useState(false);

  const update = (k: keyof Fields, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const formFields: Array<{ label: string; key: keyof Fields; type: string; placeholder: string }> = [
    { label: "Your Name", key: "name", type: "text", placeholder: "Your full name" },
    { label: "Your Email", key: "email", type: "email", placeholder: "your@email.com" },
    { label: "Your Mobile Number", key: "phone", type: "tel", placeholder: "+91 XXXXX XXXXX" },
    { label: "Suspected Phone Number", key: "fraudPhone", type: "tel", placeholder: "Number you want to report" },
    { label: "City", key: "city", type: "text", placeholder: "Your city" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-6 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-5 text-center">
            <Flag className="h-8 w-8 text-destructive mx-auto mb-2" />
            <h1 className="font-display text-xl font-bold text-destructive">Report a Potential Fraud</h1>
            <Link to="/help">
              <p className="text-xs text-destructive/70 mt-1 hover:underline cursor-pointer inline-block">← Back to Help</p>
            </Link>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-4 space-y-4">
              {formFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-sm font-medium">{field.label}</Label>
                  <Input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={fields[field.key]}
                    onChange={(e) => update(field.key, e.target.value)}
                    className="h-11"
                  />
                </div>
              ))}

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Message *</Label>
                <Textarea
                  placeholder="Describe the fraud in detail — what happened, amounts involved, dates, and any other relevant information."
                  rows={5}
                  value={fields.message}
                  onChange={(e) => update("message", e.target.value)}
                  className="resize-none"
                />
              </div>

              <div
                className="rounded-xl border-2 border-dashed border-border p-5 text-center cursor-pointer hover:border-accent/40 transition-colors"
                onClick={() => setHasFile(!hasFile)}
              >
                {hasFile ? (
                  <>
                    <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-1" />
                    <p className="text-sm text-green-600 font-medium">File attached</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-1" />
                    <p className="text-sm text-muted-foreground">Attach Image or Screenshot</p>
                    <p className="text-xs text-muted-foreground">(optional) PNG, JPG, PDF up to 10MB</p>
                  </>
                )}
              </div>

              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-700 space-y-1">
                  <p>Please use this form only for reporting potential fraud.</p>
                  <p>
                    For general queries, <Link to="/help" className="underline font-medium">contact Help & Support</Link>
                  </p>
                  <p>All reports are reviewed within 48 hours.</p>
                </div>
              </div>

              <Button
                className="w-full bg-destructive text-destructive-foreground h-11 hover:bg-destructive/90 gap-2"
                onClick={() => {
                  if (!fields.name || !fields.phone || !fields.message) {
                    toast.error("Please fill all required fields");
                    return;
                  }
                  toast.success("Report submitted. Our team will review it within 48 hours.");
                  setFields({ ...initialFields });
                  setHasFile(false);
                }}
                type="button"
              >
                <Flag className="h-4 w-4" />
                Submit Fraud Report
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default ReportFraud;