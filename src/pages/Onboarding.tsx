import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Clock,
  MessageCircle,
  Globe,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";

const stepSlide = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.2 } },
};

const checklistSteps = [
  { name: "Business Details", desc: "Name, contact, website" },
  { name: "Business Address", desc: "Operational & registered address" },
  { name: "Owner Details", desc: "Owner name, PAN, email" },
  { name: "Business Images", desc: "Logo, banner, factory photos" },
  { name: "Documents", desc: "GST, PAN, Aadhaar verification" },
  { name: "Products & Contract", desc: "Categories, first listing, T&C" },
];

/* ── Step Components ── */

const StepOverview = () => (
  <div>
    <h2 className="font-display text-2xl font-bold text-foreground mb-2">
      Let's set up your Cosora business
    </h2>
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
      <Clock className="h-4 w-4" />
      Estimated time: 10 minutes
    </div>

    <div className="relative">
      {checklistSteps.map((s, i) => (
        <div key={i} className="flex gap-4 relative">
          {/* Dashed connector */}
          {i < checklistSteps.length - 1 && (
            <div className="absolute left-4 top-8 bottom-0 border-l-2 border-dashed border-border" />
          )}
          {/* Number circle */}
          <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 bg-muted text-muted-foreground">
            {i + 1}
          </div>
          {/* Text */}
          <div className="pb-6">
            <p className="font-medium text-foreground text-sm">{s.name}</p>
            <p className="text-xs text-muted-foreground">{s.desc}</p>
          </div>
        </div>
      ))}
    </div>

    <Link to="#" className="text-accent text-sm inline-block mt-2">
      Edit Details
    </Link>
  </div>
);

const StepBusinessDetails = () => {
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(57);
  const [sameAsMobile, setSameAsMobile] = useState(true);
  const [hasWebsite, setHasWebsite] = useState(false);
  const [whatsappUpdates, setWhatsappUpdates] = useState(true);

  const handleSendOtp = () => {
    setOtpSent(true);
    setOtpTimer(57);
    const interval = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-semibold text-foreground">
        Tell us about your business
      </h2>

      {/* Business Name */}
      <div className="space-y-1.5">
        <Label className="text-sm">
          Business Name <span className="text-accent">*</span>
        </Label>
        <Input
          className="h-11"
          placeholder="e.g. Kumar Textiles Pvt Ltd"
        />
      </div>

      {/* Mobile Number + OTP */}
      <div className="space-y-1.5">
        <Label className="text-sm">
          Mobile Number <span className="text-accent">*</span>
        </Label>
        <div className="flex gap-2">
          <Input className="h-11 flex-1" placeholder="+91 9876543210" />
          <Button
            variant="outline"
            className="h-11 text-accent border-accent hover:bg-accent/5 whitespace-nowrap text-sm"
            onClick={handleSendOtp}
          >
            Verify OTP
          </Button>
        </div>
        {otpSent && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-2 pt-2"
          >
            <div className="flex gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Input
                  key={i}
                  className="h-11 w-11 text-center text-lg font-semibold"
                  maxLength={1}
                  inputMode="numeric"
                />
              ))}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                We'll auto-detect OTP from SMS
              </p>
              {otpTimer > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Resend in {otpTimer}s
                </p>
              ) : (
                <button className="text-xs text-accent font-medium">
                  Resend
                </button>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* WhatsApp Updates */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="whatsapp"
          checked={whatsappUpdates}
          onCheckedChange={(v) => setWhatsappUpdates(!!v)}
        />
        <Label htmlFor="whatsapp" className="text-sm text-foreground cursor-pointer">
          Receive business updates and leads on WhatsApp
        </Label>
      </div>

      {/* Primary Contact */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="sameContact"
            checked={sameAsMobile}
            onCheckedChange={(v) => setSameAsMobile(!!v)}
          />
          <Label htmlFor="sameContact" className="text-sm text-foreground cursor-pointer">
            Primary contact same as mobile number above
          </Label>
        </div>
        {!sameAsMobile && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
          >
            <Input className="h-11" placeholder="Primary contact number" />
          </motion.div>
        )}
      </div>

      {/* Website Toggle */}
      <div className="space-y-2">
        <Label className="text-sm">Do you have a website?</Label>
        <div className="inline-flex rounded-full bg-muted p-1">
          <button
            onClick={() => setHasWebsite(true)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              hasWebsite
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground"
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => setHasWebsite(false)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              !hasWebsite
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground"
            }`}
          >
            No
          </button>
        </div>
        {hasWebsite && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
          >
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="h-11 pl-9" placeholder="https://yourwebsite.com" />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

/* ── Placeholder Steps 3-8 ── */
const PlaceholderStep = ({ title }: { title: string }) => (
  <div>
    <h2 className="font-display text-xl font-semibold text-foreground mb-4">
      {title}
    </h2>
    <p className="text-sm text-muted-foreground">This step is coming soon.</p>
  </div>
);

/* ── Main Page ── */
const stepTitles = [
  "Overview",
  "Business Details",
  "Business Address",
  "Owner Details",
  "Business Images",
  "Documents",
  "Products",
  "Contract",
];

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(1);

  const progress = (currentStep / 8) * 100;

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <StepOverview />;
      case 2:
        return <StepBusinessDetails />;
      default:
        return <PlaceholderStep title={stepTitles[currentStep - 1]} />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky Top Bar */}
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/seller">
            <span className="font-display text-accent text-2xl italic font-bold">
              Cosora
            </span>
          </Link>
          <span className="text-sm text-muted-foreground font-medium">
            Step {currentStep} of 8
          </span>
          <a
            href="https://wa.me/919876543210"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-green-500 text-white rounded-full text-xs px-3 py-1 font-medium"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Need help?
          </a>
        </div>
        <Progress value={progress} className="h-1 rounded-none [&>div]:bg-accent" />
      </header>

      {/* Step Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            variants={stepSlide}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex gap-3">
          {currentStep > 1 && (
            <Button
              variant="ghost"
              className="gap-1 text-muted-foreground"
              onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
          )}
          <Button
            className="flex-1 h-11 bg-accent text-accent-foreground hover:bg-accent/90 gap-1"
            onClick={() => setCurrentStep((s) => Math.min(8, s + 1))}
          >
            {currentStep === 8 ? "Submit" : "Continue"}
            {currentStep < 8 && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
