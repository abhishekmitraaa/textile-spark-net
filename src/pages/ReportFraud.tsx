import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Flag, Upload, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { toast } from "@/hooks/use-toast";

const fadeIn = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" as const },
};

const ReportFraud = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile: "",
    fraudPhone: "",
    city: "",
    message: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: "Report Submitted", description: "Our team will review your report carefully." });
  };

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto pb-24">
        <motion.div {...fadeIn} className="bg-destructive text-destructive-foreground rounded-xl p-4 mb-6 text-center">
          <Flag className="w-8 h-8 mx-auto mb-2" />
          <h1 className="font-display text-xl font-bold">Report a Potential Fraud</h1>
          <Link to="/help" className="text-destructive-foreground/70 text-sm mt-1 inline-block hover:underline">
            ← Back to Help
          </Link>
        </motion.div>

        <motion.form
          {...fadeIn}
          transition={{ ...fadeIn.transition, delay: 0.05 }}
          onSubmit={handleSubmit}
          className="rounded-xl border bg-card p-4 space-y-4"
        >
          {[
            { label: "Your Name", name: "name", type: "text", placeholder: "" },
            { label: "Your Email", name: "email", type: "email", placeholder: "" },
            { label: "Your Mobile Number", name: "mobile", type: "tel", placeholder: "" },
            { label: "Phone number of potential fraud target", name: "fraudPhone", type: "tel", placeholder: "Number you suspect is fraudulent" },
            { label: "City", name: "city", type: "text", placeholder: "" },
          ].map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label className="text-sm">{field.label}*</Label>
              <Input
                name={field.name}
                type={field.type}
                placeholder={field.placeholder}
                value={form[field.name as keyof typeof form]}
                onChange={handleChange}
                required
                className="h-11"
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label className="text-sm">Message*</Label>
            <Textarea
              name="message"
              rows={4}
              placeholder="Describe the fraud in detail..."
              value={form.message}
              onChange={handleChange}
              required
            />
          </div>

          {/* Attach Evidence */}
          <div className="space-y-2">
            <Label className="text-sm">Attach Evidence</Label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            {!preview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-20 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-accent/40 transition-colors"
              >
                <Upload className="w-5 h-5" />
                <span className="text-xs">Attach Image or Screenshot (optional)</span>
              </button>
            ) : (
              <div className="relative inline-block">
                <img src={preview} alt="Evidence" className="w-24 h-24 object-cover rounded-xl border" />
                <button
                  type="button"
                  onClick={() => { setPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-700 space-y-1">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p>Please use this form only for reporting potential frauds.</p>
                <p>
                  For order or general queries,{" "}
                  <Link to="/help" className="underline font-medium">contact us here</Link>.
                </p>
                <p>All reports are reviewed carefully by our team.</p>
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Submit Report
          </Button>
        </motion.form>
      </div>
    </DashboardLayout>
  );
};

export default ReportFraud;
