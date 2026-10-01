import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Flag, AlertTriangle, ArrowLeft, Mail, Phone } from "lucide-react";
import { useUserRole } from "@/contexts/UserRoleContext";
import { SUPPORT_EMAIL, SUPPORT_HOURS_LABEL, SUPPORT_PHONE, SUPPORT_PHONE_LABEL, supportMailto } from "@/lib/supportContact";

/**
 * Report a potential fraud (Help & Support plan P1, 2026-10-01).
 *
 * Until the in-app report exists (plan P3), the honest path is email: the form fills
 * an email to Cosora and the person's own mail app sends it. Nothing is submitted
 * from this page, so it says so. It used to toast "Report submitted. Our team will
 * review it within 48 hours." and discard everything (securityflags.md, 2026-09-30).
 *
 * Reachable signed out (the landing page's footer), so the frame follows the role,
 * as Chat.tsx does: the seller dashboard for sellers, the plain back header otherwise.
 */

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

type Fields = { name: string; phone: string; reported: string; fraudPhone: string; city: string; message: string };

const FIELDS: { label: string; key: keyof Fields; type: string; placeholder: string }[] = [
  { label: "Who are you reporting?", key: "reported", type: "text", placeholder: "Their name, store name or a link" },
  { label: "Their phone number", key: "fraudPhone", type: "tel", placeholder: "The number you suspect" },
  { label: "City", key: "city", type: "text", placeholder: "Where it happened" },
  { label: "Your name", key: "name", type: "text", placeholder: "Your full name" },
  { label: "Your mobile number", key: "phone", type: "tel", placeholder: "+91 XXXXX XXXXX" },
];

// The email Cosora receives. Staff read it, so its labels stay in English whatever
// language the page is shown in.
function emailBody(f: Fields): string {
  const line = (label: string, value: string) => `${label}: ${value.trim() || "-"}`;
  return [
    line("Reported", f.reported),
    line("Their phone", f.fraudPhone),
    line("City", f.city),
    "",
    "What happened:",
    f.message.trim(),
    "",
    line("My name", f.name),
    line("My mobile", f.phone),
    "",
    "(Screenshots attached, if any.)",
  ].join("\n");
}

const ReportFraud = () => {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const { role } = useUserRole();
  const [fields, setFields] = useState<Fields>({ name: "", phone: "", reported: "", fraudPhone: "", city: "", message: "" });
  const [opened, setOpened] = useState(false);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  const openEmail = () => {
    if (!fields.message.trim()) {
      toast.error("Describe what happened first.");
      return;
    }
    window.location.href = supportMailto("Fraud report", emailBody(fields));
    setOpened(true);
  };

  const body = (
    <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 max-w-lg mx-auto pb-8">
      <motion.div variants={section}>
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-center">
          <Flag className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-xl font-bold text-destructive">Report a Potential Fraud</p>
          <p className="text-xs text-destructive/80 mt-1">
            Fill this in and we'll open an email to Cosora with it. Your report is sent when you send that email.
          </p>
        </div>
      </motion.div>
      <motion.div variants={section}>
        <Card>
          <CardContent className="p-4 space-y-4">
            {FIELDS.map(({ label, key, type, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`fraud-${key}`} className="text-sm font-medium">{label}</Label>
                <Input
                  id={`fraud-${key}`}
                  type={type}
                  placeholder={placeholder}
                  value={fields[key]}
                  onChange={set(key)}
                  className="h-11"
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="fraud-message" className="text-sm font-medium">What happened? *</Label>
              <Textarea
                id="fraud-message"
                placeholder="Include what happened, amounts involved, dates, and anything else that helps."
                rows={5}
                value={fields.message}
                onChange={set("message")}
                className="resize-none"
              />
            </div>
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700 space-y-0.5">
                <p>Have screenshots? Attach them to the email before you send it.</p>
                <p>
                  Please use this only to report fraud. For anything else, see{" "}
                  <Link to="/help" className="underline">Help &amp; Support</Link>.
                </p>
              </div>
            </div>
            <motion.div whileTap={TAP} transition={TAP_T}>
              <Button
                className="w-full bg-destructive text-destructive-foreground h-11 hover:bg-destructive/90"
                onClick={openEmail}
              >
                <Mail className="h-4 w-4 mr-2" /> Email this report
              </Button>
            </motion.div>
            {opened && (
              <p className="text-xs text-muted-foreground text-center" role="status">
                Your email app should open with the report filled in. Nothing reaches Cosora until you send it.
                If it didn't open, email {SUPPORT_EMAIL}.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
      <motion.div variants={section}>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <Phone className="h-4 w-4 text-gray-600 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              Rather talk? Call us on{" "}
              <a href={`tel:${SUPPORT_PHONE}`} className="font-medium underline">{SUPPORT_PHONE_LABEL}</a>.{" "}
              <span className="text-gray-500">{SUPPORT_HOURS_LABEL}</span>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );

  if (role === "seller") return <DashboardLayout>{body}</DashboardLayout>;
  return <BuyerFrame onBack={() => navigate(-1)}>{body}</BuyerFrame>;
};

function BuyerFrame({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Report fraud</h1>
        </div>
      </div>
      <div className="px-4 py-6 pb-28">{children}</div>
      <MobileBottomNav />
    </div>
  );
}

export default ReportFraud;
