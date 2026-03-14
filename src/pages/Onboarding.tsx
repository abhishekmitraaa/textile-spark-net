import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Clock,
  MessageCircle,
  Globe,
  ChevronLeft,
  ChevronRight,
  Check,
  MapPin,
  Upload,
  X,
  CheckCircle2,
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
          {i < checklistSteps.length - 1 && (
            <div className="absolute left-4 top-8 bottom-0 border-l-2 border-dashed border-border" />
          )}
          <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 bg-muted text-muted-foreground">
            {i + 1}
          </div>
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

      <div className="space-y-1.5">
        <Label className="text-sm">
          Business Name <span className="text-accent">*</span>
        </Label>
        <Input className="h-11" placeholder="e.g. Kumar Textiles Pvt Ltd" />
      </div>

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

/* ── Step 3: Business Address ── */
const StepBusinessAddress = () => (
  <div className="space-y-5">
    <h2 className="font-display text-xl font-semibold text-foreground">
      Where is your business located?
    </h2>

    {/* Map placeholder */}
    <div className="rounded-xl bg-muted h-48 relative flex items-center justify-center">
      <MapPin className="h-10 w-10 text-muted-foreground" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
        <Button className="bg-accent text-accent-foreground rounded-full px-4 py-2 text-sm hover:bg-accent/90">
          Mark your business location
        </Button>
      </div>
    </div>

    {/* Address fields */}
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-sm">
          Shop/Building No. <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input className="h-11" placeholder="e.g. Shop 12, Block A" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">
          Floor/Tower <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input className="h-11" placeholder="e.g. 2nd Floor, Tower B" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">
          Area / Sector / Locality <span className="text-accent">*</span>
        </Label>
        <Input className="h-11" placeholder="e.g. Sector 18, Noida" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">
          City <span className="text-accent">*</span>
        </Label>
        <Input className="h-11" placeholder="e.g. Mumbai" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">
          Landmark <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input className="h-11" placeholder="e.g. Near City Mall" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">
          Pincode <span className="text-accent">*</span>
        </Label>
        <Input
          className="h-11"
          placeholder="e.g. 400001"
          inputMode="numeric"
          maxLength={6}
        />
      </div>
    </div>

    <p className="text-xs text-muted-foreground italic">
      Please ensure this address matches your business license
    </p>
  </div>
);

/* ── Step 4: Owner Details ── */
const StepOwnerDetails = ({ showSuccess }: { showSuccess: boolean }) => {
  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <CheckCircle2 className="w-12 h-12 text-green-600" />
        </motion.div>
        <p className="text-green-600 font-medium">Business information saved ✓</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-semibold text-foreground">
        Who owns this business?
      </h2>

      <div className="space-y-1.5">
        <Label className="text-sm">
          Full Name <span className="text-accent">*</span>
        </Label>
        <Input className="h-11" placeholder="e.g. Rajesh Kumar" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">
          Email Address <span className="text-accent">*</span>
        </Label>
        <Input className="h-11" type="email" placeholder="e.g. rajesh@business.com" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">
          Registered Country <span className="text-accent">*</span>
        </Label>
        <Select defaultValue="india">
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="india">India</SelectItem>
            <SelectItem value="bangladesh">Bangladesh</SelectItem>
            <SelectItem value="nepal">Nepal</SelectItem>
            <SelectItem value="sri-lanka">Sri Lanka</SelectItem>
            <SelectItem value="pakistan">Pakistan</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

/* ── Step 5: Business Images ── */
const StepBusinessImages = () => {
  const [images, setImages] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newUrls = Array.from(files).map((f) => URL.createObjectURL(f));
    setImages((prev) => [...prev, ...newUrls]);
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-foreground">
          Show us your business
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload at least one entrance image of your factory or store
        </p>
      </div>

      {/* Upload zone */}
      <div
        onClick={() => fileRef.current?.click()}
        className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-all"
      >
        <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">
          Click to upload or drag & drop
        </p>
        <p className="text-xs text-muted-foreground">PNG, JPG up to 10MB</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFiles}
        />
      </div>

      {/* Image preview grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((src, i) => (
            <div key={i} className="relative aspect-square">
              <img
                src={src}
                alt={`Upload ${i + 1}`}
                className="rounded-lg aspect-square object-cover w-full h-full"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 bg-foreground/70 text-background rounded-full p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Guidelines dialog */}
      <Dialog>
        <DialogTrigger asChild>
          <button className="text-accent text-sm font-medium">
            View Guidelines
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Photo Guidelines</DialogTitle>
          </DialogHeader>
          <ul className="space-y-3 mt-2">
            {[
              "Clear entrance image required",
              "HD photos only",
              "No people or faces",
              "No blurry or cropped photos",
              "Photo must show business exterior",
            ].map((rule, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                {rule}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ── Placeholder Steps 6-8 ── */
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
  const [step4Success, setStep4Success] = useState(false);

  const progress = (currentStep / 8) * 100;

  const handleContinue = () => {
    if (currentStep === 4) {
      setStep4Success(true);
      setTimeout(() => {
        setStep4Success(false);
        setCurrentStep(5);
      }, 1000);
      return;
    }
    setCurrentStep((s) => Math.min(8, s + 1));
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <StepOverview />;
      case 2:
        return <StepBusinessDetails />;
      case 3:
        return <StepBusinessAddress />;
      case 4:
        return <StepOwnerDetails showSuccess={step4Success} />;
      case 5:
        return <StepBusinessImages />;
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
            key={step4Success ? "step4-success" : currentStep}
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
      {!step4Success && (
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
              onClick={handleContinue}
            >
              {currentStep === 8 ? "Submit" : "Continue"}
              {currentStep < 8 && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
