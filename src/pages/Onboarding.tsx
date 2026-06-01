import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, ChevronRight, Menu, MessageCircle, MapPin, Upload as UploadIcon,
  Check, CheckCircle2, Building2, FileText, Package, FileSignature,
  X, Crop, RotateCw, Eraser, Info, Mail, AlertCircle, BarChart3, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";
import { CategorySelector } from "@/components/upload/CategorySelector";
import { useVendorOnboardingSummary, vendorOnboardingSummaryFixture } from "@/hooks/useVendorData";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";

const TOTAL_STEPS = 8;

const FABRICS = ["Cotton", "Linen", "Silk", "Polyester", "Wool", "Denim", "Rayon", "Blend"];
const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Free Size"];
const COLORS = ["Black", "White", "Red", "Blue", "Green", "Yellow", "Pink", "Beige", "Navy", "Grey"];
const UNITS = ["pieces", "kg", "meters", "sets", "pairs"];

const onboardingMenuLinks = [
  { label: "Cosora FAQ", href: "/help" },
  { label: "About Us", href: "/about" },
  { label: "Terms and conditions", href: "/auth/terms" },
  { label: "Report Fraud", href: "/report-fraud" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 2
  const [businessName, setBusinessName] = useState("");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(27);
  const [otpAutoFilled, setOtpAutoFilled] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [countryCode, setCountryCode] = useState("+91");
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);
  const [sameContact, setSameContact] = useState(true);
  const [primaryContact, setPrimaryContact] = useState("");
  const [hasWebsite, setHasWebsite] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Step 3
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("Delhi NCR");
  const [landmark, setLandmark] = useState("");
  const [addressConfirmed, setAddressConfirmed] = useState(false);

  // Step 4
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [country, setCountry] = useState("IN");
  const [step4Success, setStep4Success] = useState(false);

  // Step 5
  const [businessImages, setBusinessImages] = useState<string[]>([]);
  const [businessImagePickerOpen, setBusinessImagePickerOpen] = useState(false);
  const [businessImageGuidelinesOpen, setBusinessImageGuidelinesOpen] = useState(false);
  const [businessImageUploads, setBusinessImageUploads] = useState<string[]>([]);

  // Step 6
  const [pan, setPan] = useState("");
  const [panStatus, setPanStatus] = useState<"idle" | "verifying" | "success" | "fail">("idle");
  const [panNameStatus, setPanNameStatus] = useState<"idle" | "verifying" | "success" | "fail">("idle");
  const [cin, setCin] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [hasGstin, setHasGstin] = useState(false);
  const [gstin, setGstin] = useState("");
  const [panFullName, setPanFullName] = useState("Fearce Textiles Pvt Ltd");
  const [panAddress, setPanAddress] = useState("");
  const [panDocumentUploads, setPanDocumentUploads] = useState<string[]>([]);
  const [panGuidelinesOpen, setPanGuidelinesOpen] = useState(false);
  const [step6Success, setStep6Success] = useState(false);

  // Step 7
  const [productImages, setProductImages] = useState<string[]>([]);
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("pieces");
  const [moq, setMoq] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [fabric, setFabric] = useState("");
  const [gsm, setGsm] = useState("");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [step7Success, setStep7Success] = useState(false);

  // Step 8
  const [signature, setSignature] = useState("");
  const [editingSig, setEditingSig] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [locationMode, setLocationMode] = useState<"automatic" | "manual" | null>(null);
  const [manualLocation, setManualLocation] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const { data: onboardingSummary } = useVendorOnboardingSummary();
  const summary = onboardingSummary ?? vendorOnboardingSummaryFixture;
  const businessImageInputRef = useRef<HTMLInputElement | null>(null);
  const panDocumentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ownerName && !signature) setSignature(ownerName);
  }, [ownerName, signature]);

  useEffect(() => {
    if (showWelcome) {
      const t = setTimeout(() => navigate("/seller-home"), 5000);
      return () => clearTimeout(t);
    }
  }, [showWelcome, navigate]);

  useEffect(() => {
    if (!otpModalOpen) return;
    const interval = setInterval(() => {
      setOtpCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpModalOpen]);

  useEffect(() => {
    if (!otpModalOpen || otpAutoFilled) return;
    const autoTimer = setTimeout(() => {
      setOtp("482931");
      setOtpAutoFilled(true);
    }, 900);
    return () => clearTimeout(autoTimer);
  }, [otpModalOpen, otpAutoFilled]);

  useEffect(() => {
    if (sameContact) setPrimaryContact(mobile);
  }, [sameContact, mobile]);

  const startOtpFlow = () => {
    if (!mobile || mobile.length < 10) return toast.error("Enter valid mobile");
    setOtp("");
    setOtpAutoFilled(false);
    setOtpCountdown(27);
    setOtpModalOpen(true);
    setIsVerifying(true);
    toast.success("OTP sent");
  };
  const confirmOtp = () => {
    if (otp.length !== 6) return;
    setOtpVerified(true);
    setOtpModalOpen(false);
    setIsVerifying(false);
    toast.success("Mobile verified");
  };

  const resendOtp = () => {
    setOtp("");
    setOtpAutoFilled(false);
    setOtpCountdown(27);
    toast.success("OTP resent");
  };

  const verifyPan = () => {
    if (!pan || pan.length < 10) return setPanStatus("fail");
    setPanStatus("verifying");
    setTimeout(() => setPanStatus(/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase()) ? "success" : "fail"), 1200);
  };

  const verifyPanName = () => {
    if (!panFullName.trim()) return setPanNameStatus("fail");
    setPanNameStatus("verifying");
    setTimeout(() => setPanNameStatus(panFullName.toLowerCase().includes("fearce") ? "fail" : "success"), 1200);
  };

  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>, setter: (urls: string[]) => void, current: string[], max: number) => {
    const files = Array.from(e.target.files || []);
    const urls = files.slice(0, max - current.length).map((f) => URL.createObjectURL(f));
    setter([...current, ...urls]);
  };

  const toggleChip = (val: string, list: string[], setter: (l: string[]) => void) => {
    setter(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const goNext = () => {
    if (currentStep === 4 && !step4Success) { setStep4Success(true); return; }
    if (currentStep === 6 && !step6Success) { setStep6Success(true); return; }
    if (currentStep === 7 && !step7Success) { setStep7Success(true); return; }
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((s) => s + 1);
      setStep4Success(false); setStep6Success(false); setStep7Success(false);
    }
  };
  const goPrev = () => currentStep > 1 && setCurrentStep((s) => s - 1);

  const submitContract = () => {
    if (!agreed) return toast.error("Please accept the agreement");
    setShowWelcome(true);
  };

  const businessInfoComplete = currentStep > 4;
  const overviewSteps = [
    {
      label: "Business information",
      helper: "Edit details >",
      icon: Building2,
      state: "done",
    },
    {
      label: "Business documents",
      helper: "Continue >",
      icon: FileText,
      state: businessInfoComplete ? "active" : "locked",
    },
    {
      label: "Products details",
      helper: "Category, Products.",
      icon: Package,
      state: currentStep > 6 ? "locked" : "locked",
    },
    {
      label: "Partner contract",
      helper: "",
      icon: FileSignature,
      state: "locked",
    },
  ];

  const maskedMobile = mobile
    ? mobile.replace(/(\d{2})\d+(\d{2})/, "$1******$2")
    : "XXXXXXXXXX";
  const canContinueStep2 =
    businessName.trim().length > 0 &&
    mobile.trim().length >= 10 &&
    otpVerified &&
    (!hasWebsite || websiteUrl.trim().length > 0) &&
    (sameContact || primaryContact.trim().length >= 10);
  const canAddAddress = area.trim().length > 0;
  const canSaveOwner =
    ownerName.trim().length > 0 &&
    ownerEmail.trim().length > 0 &&
    country.trim().length > 0;
  const canUploadBusinessImages = businessImageUploads.length > 0;
  const canSubmitPanDocuments =
    pan.trim().length > 0 &&
    panFullName.trim().length > 0 &&
    panAddress.trim().length > 0 &&
    panDocumentUploads.length > 0;

  if (showWelcome) {
    return (
      <div className="vendor-shell fixed inset-0 bg-[#256fef] text-white flex items-center justify-center overflow-hidden z-50">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-sm"
            style={{
              backgroundColor: ["#fff", "#ffd700", "#ff6b6b", "#4ade80"][i % 4],
              left: `${Math.random() * 100}%`,
            }}
            initial={{ y: -20, opacity: 1 }}
            animate={{ y: "100vh", rotate: 360, opacity: 0 }}
            transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() }}
          />
        ))}
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative z-10 w-full max-w-4xl px-4 sm:px-6">
          <div className="rounded-[2rem] border border-[#d0d4dc] bg-white p-6 shadow-2xl backdrop-blur-md sm:p-8">
            <div className="text-center">
              <img
                src="/cosoravendorlogo.png"
                alt="Cosora For Sellers"
                className="mx-auto mb-4 h-14 w-auto object-contain sm:h-16"
                draggable={false}
              />
              <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">The Good Times Start Now.</h1>
              <p className="text-lg md:text-xl">Welcome to Cosora 🎉</p>
              <p className="mt-2 text-sm text-white/80">Your seller profile is live and we are surfacing the next actions that will improve your reach.</p>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[#d0d4dc] bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Profile completion score</p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-4xl font-bold">{summary.profileScore}%</p>
                    <p className="text-sm text-[#363636]">Add email, website, and more product detail to improve trust.</p>
                  </div>
                  <div className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium">Needs attention</div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#d0d4dc] bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#363636]">Email ID alert</p>
                </div>
                <p className="mt-2 text-sm text-[#363636]">{ownerEmail ? "Email captured during onboarding." : "Email is missing. Add it now to receive buyer notifications and order updates."}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!ownerEmail ? (
                    <Button type="button" size="sm" className="h-8 bg-[#256fef] text-white rounded-full font-medium" onClick={() => navigate("/my-store")}> 
                      <Mail className="mr-2 h-4 w-4" />
                      Add Email Now
                    </Button>
                  ) : (
                    <div className="rounded-full bg-[#f5f5f5] px-3 py-1 text-xs text-[#363636]">Email added</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#d0d4dc] bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#363636]">Demand signal</p>
                </div>
                <p className="mt-2 text-sm text-[#363636]">{summary.demandSignal}. This is a strong time to complete the missing profile fields.</p>
              </div>

              <div className="rounded-2xl border border-[#d0d4dc] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#363636]">Location access</p>
                  </div>
                  {locationMode && (
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide">{locationMode}</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-[#363636]">{summary.locationPrompt}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" className="h-8 bg-[#256fef] text-white rounded-full" onClick={() => { setLocationMode("automatic"); toast.success("Location access enabled via automatic popup"); }}>
                    Automatic
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 border border-[#256fef] text-[#256fef] rounded-full" onClick={() => setLocationMode("manual")}> 
                    Manual
                  </Button>
                </div>
                {locationMode === "manual" && (
                  <div className="mt-3 space-y-2">
                    <Input
                      value={manualLocation}
                      onChange={(e) => setManualLocation(e.target.value)}
                      placeholder="Enter city or locality"
                      className="bg-background/90 text-foreground placeholder:text-muted-foreground"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 bg-background text-foreground hover:bg-background/90"
                      onClick={() => toast.success(`Manual location saved${manualLocation ? `: ${manualLocation}` : ""}`)}
                    >
                      Save Location
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                className="flex-1 bg-background text-foreground hover:bg-background/90"
                onClick={() => navigate("/seller-home")}
              >
                Continue to Dashboard
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 border border-[#256fef] text-[#256fef] rounded-full"
                onClick={() => navigate("/my-store")}
              >
                Finish Profile Details
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (currentStep === 4 && step4Success) {
    return (
      <BusinessInfoSuccessScreen
        text="Business information added"
        onContinue={() => {
          setStep4Success(false);
          setCurrentStep(5);
        }}
      />
    );
  }

  const isBusinessInfoStep = currentStep >= 2 && currentStep <= 4;

  return (
    <div className="vendor-shell min-h-screen bg-background pb-32">
      {isBusinessInfoStep ? (
        <header className="sticky top-0 z-50 border-b border-[#d0d4dc] bg-[#ffffff]">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#363636]"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Link to="/help" className="text-sm font-medium text-[#256fef]">
              Help?
            </Link>
          </div>
          <BusinessInfoStepper currentStep={currentStep} />
        </header>
      ) : (
        <header className="sticky top-0 z-50 border-b border-[#d0d4dc] bg-[#ffffff]/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link to="/" className="block">
              <img
                src="/cosoravendorlogo.png"
                alt="Cosora For Sellers"
                className="block h-9 w-auto object-contain sm:h-10"
                draggable={false}
              />
            </Link>
            <div className="flex items-center gap-2">
              <Link to="/login">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md border-[#d0d4dc] px-3 text-xs text-[#363636] hover:bg-[#f5f5f5]"
                >
                  Login
                </Button>
              </Link>
              <Sheet>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#d0d4dc] text-[#363636] transition-colors hover:bg-[#f5f5f5]"
                    aria-label="Open menu"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72 border-l border-[#d0d4dc] bg-[#ffffff] p-4">
                  <SheetHeader>
                    <SheetTitle className="text-left text-base font-semibold text-[#363636]">
                      Cosora Menu
                    </SheetTitle>
                  </SheetHeader>
                  <nav className="mt-4 space-y-2">
                    {onboardingMenuLinks.map((item) => (
                      <Link
                        key={item.label}
                        to={item.href}
                        className="flex items-center justify-between rounded-xl border border-[#d0d4dc] px-3 py-2 text-sm font-medium text-[#363636] transition-colors hover:bg-[#f5f5f5]"
                      >
                        {item.label}
                        <ChevronRight className="h-4 w-4 text-[#363636]/60" />
                      </Link>
                    ))}
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>
      )}

      {/* Progress */}
      {currentStep > 4 && (
        <div className="sticky top-16 z-40 border-b bg-background/95 p-4 backdrop-blur">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <button onClick={goPrev} disabled={currentStep === 1} className="text-sm text-[#363636] disabled:opacity-30 flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <span className="text-sm font-medium text-[#363636]">Step {currentStep} of {TOTAL_STEPS}</span>
            </div>
            <Progress value={(currentStep / TOTAL_STEPS) * 100} className="h-2 [&>div]:bg-[#256fef]" />
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep + "-" + (step4Success ? "s4" : step6Success ? "s6" : step7Success ? "s7" : "main")}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {/* STEP 1 */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-[#363636] p-5 text-white">
                  <h1 className="font-display text-2xl font-bold">Get started, it takes only 10 minutes</h1>
                  <p className="mt-2 text-sm text-[#ef4d62]">0% commission, get sales across globe.</p>
                </div>

                <div className="space-y-3">
                  {overviewSteps.map((item) => {
                    const Icon = item.icon;
                    const isLocked = item.state === "locked";
                    const iconStyle = isLocked
                      ? "bg-[#f5f5f5] text-[#d0d4dc] border-[#d0d4dc]"
                      : "bg-[#256fef]/10 text-[#256fef] border-[#256fef]/30";
                    const labelStyle = isLocked ? "text-[#d0d4dc]" : "text-[#363636]";
                    const helperStyle = isLocked ? "text-[#d0d4dc]" : "text-[#256fef]";

                    return (
                      <div key={item.label} className="flex items-center gap-3 rounded-xl border border-[#d0d4dc] bg-white p-4 shadow-sm">
                        <div className={cn("h-10 w-10 rounded-full border flex items-center justify-center", iconStyle)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <p className={cn("text-sm font-semibold", labelStyle)}>{item.label}</p>
                          {item.helper && <p className={cn("text-xs", helperStyle)}>{item.helper}</p>}
                        </div>
                      </div>
                    );
                  })}

                  <Dialog>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl border border-[#d0d4dc] bg-white p-4 text-left text-sm font-medium text-[#363636] shadow-sm"
                      >
                        Documents required for registration
                        <ChevronRight className="h-4 w-4 text-[#363636]/70" />
                      </button>
                    </DialogTrigger>
                    <DialogContent className="rounded-2xl border border-[#d0d4dc] bg-white p-5">
                      <DialogHeader>
                        <DialogTitle className="text-sm font-semibold text-[#363636]">
                          Please be ready with the following for a smooth registration
                        </DialogTitle>
                      </DialogHeader>
                      <div className="mt-4 space-y-3 text-sm text-[#363636]">
                        {[
                          "PAN card",
                          "CIN details",
                          "Aadhaar card",
                          "GST number, if applicable",
                          "Primary information",
                        ].map((item) => (
                          <div key={item} className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#14ae5c]">
                              <Check className="h-3 w-3 text-white" />
                            </span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                      <Button className="mt-5 w-full rounded-full bg-[#256fef] text-white">Okay</Button>
                    </DialogContent>
                  </Dialog>
                </div>

                <Button onClick={goNext} className="w-full rounded-full bg-[#256fef] text-white font-semibold hover:bg-[#1f5fe0]">
                  Edit details
                </Button>
              </div>
            )}

            {/* STEP 2 */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <h2 className="font-display text-2xl font-bold text-[#363636]">Business Details</h2>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#363636]">Business name*</Label>
                  <p className="text-xs text-[#363636]/70">Customers will see this name on Cosora</p>
                  <Input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Business name"
                    className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#363636]">Mobile Number*</Label>
                  <div className="flex items-center gap-2">
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger className="h-11 w-24 rounded-xl border-[#d0d4dc] text-xs">
                        <SelectValue placeholder="+91" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="+91">🇮🇳 +91</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="Phone number"
                      className="h-11 flex-1 rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                      inputMode="numeric"
                      maxLength={10}
                      disabled={otpVerified}
                    />
                    {!otpVerified && (
                      <Button
                        type="button"
                        className="h-11 rounded-full bg-[#256fef] px-4 text-white"
                        onClick={startOtpFlow}
                        disabled={isVerifying}
                      >
                        {isVerifying ? "Verifying..." : "Verify"}
                      </Button>
                    )}
                    {otpVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#14ae5c] px-3 py-1 text-xs font-medium text-white">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Verified
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="wa" checked={whatsappOptIn} onCheckedChange={(v) => setWhatsappOptIn(!!v)} />
                    <Label htmlFor="wa" className="cursor-pointer text-sm text-[#363636]">Get business updates via WhatsApp</Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#363636]">Business's primary contact number*</Label>
                  <p className="text-xs text-[#363636]/70">Customers, support team may call you on this number</p>
                  <Input
                    value={primaryContact}
                    onChange={(e) => setPrimaryContact(e.target.value)}
                    placeholder="Primary contact number"
                    className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                    inputMode="numeric"
                    maxLength={10}
                    disabled={sameContact}
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox id="same" checked={sameContact} onCheckedChange={(v) => setSameContact(!!v)} />
                    <Label htmlFor="same" className="cursor-pointer text-sm text-[#363636]">Same as owner mobile number</Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#363636]">Website</Label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setHasWebsite(true)}
                      className={cn(
                        "rounded-full border px-4 py-1.5 text-sm",
                        hasWebsite ? "border-[#256fef] text-[#256fef]" : "border-[#d0d4dc] text-[#363636]",
                      )}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasWebsite(false)}
                      className={cn(
                        "rounded-full border px-4 py-1.5 text-sm",
                        !hasWebsite ? "border-[#256fef] text-[#256fef]" : "border-[#d0d4dc] text-[#363636]",
                      )}
                    >
                      None
                    </button>
                  </div>
                  {hasWebsite && (
                    <Input
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://yourwebsite.com"
                      className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                    />
                  )}
                </div>

                <Button
                  onClick={goNext}
                  disabled={!canContinueStep2}
                  className="w-full rounded-full bg-[#256fef] text-white font-semibold hover:bg-[#1f5fe0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </Button>
              </div>
            )}

            {/* STEP 3 */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <h2 className="font-display text-2xl font-bold text-[#363636]">Business Address</h2>

                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#363636]/60" />
                    <Input
                      placeholder="Search for area, street name"
                      className="h-11 rounded-xl border-[#d0d4dc] pl-9 focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                    />
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-[#d0d4dc]">
                    <iframe
                      title="Business location"
                      className="h-56 w-full"
                      src="https://maps.google.com/maps?q=Delhi%20NCR&t=&z=13&ie=UTF8&iwloc=&output=embed"
                      loading="lazy"
                    />
                    <div className="pointer-events-none absolute inset-0">
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                        <div className="mb-2 rounded-full bg-white px-3 py-1 text-[10px] font-medium text-[#363636] shadow">
                          This is your business location
                          <span className="ml-1 text-[#363636]/70">Move pin to add to exact location</span>
                        </div>
                        <div className="flex items-center justify-center">
                          <div className="h-10 w-10 rounded-full bg-[#256fef]/15 flex items-center justify-center">
                            <MapPin className="h-6 w-6 text-[#256fef]" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-medium text-[#363636] shadow"
                    >
                      <MapPin className="h-4 w-4 text-[#256fef]" />
                      Use current location
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#d0d4dc] bg-white p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#363636]">Complete business address</h3>
                    <button type="button" className="text-[#363636]/70">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#363636]">Shop no. / building no. (optional)</Label>
                    <Input
                      value={building}
                      onChange={(e) => setBuilding(e.target.value)}
                      placeholder="Shop no. / building no. (optional)"
                      className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#363636]">Floor / tower (optional)</Label>
                    <Input
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      placeholder="Floor / tower (optional)"
                      className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#363636]">Area / Sector / Locality*</Label>
                    <Input
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      placeholder="Area / Sector / Locality*"
                      className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#363636]">City</Label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#363636]">Add any nearby landmark (optional)</Label>
                    <Input
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      placeholder="Add any nearby landmark (optional)"
                      className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                    />
                  </div>
                  <p className="text-xs text-[#ef4d62]">
                    Please ensure that this address is the same as mentioned on your licence
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      if (!canAddAddress) return;
                      setAddressConfirmed(true);
                      toast.success("Business address added");
                    }}
                    disabled={!canAddAddress}
                    className="w-full rounded-full bg-[#256fef] text-white font-semibold hover:bg-[#1f5fe0] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add business address
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goNext}
                    disabled={!addressConfirmed}
                    className="w-full rounded-full border border-[#256fef] text-[#256fef] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save business address
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 4 */}
            {currentStep === 4 && !step4Success && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-2xl font-bold text-[#363636]">Owner details</h2>
                  <p className="mt-1 text-xs text-[#363636]/70">
                    Cosora will use these details for all business communications and updates
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#363636]">Full name*</Label>
                  <Input
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Full name"
                    className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#363636]">Email address*</Label>
                  <Input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#363636]">Registered country*</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger className="rounded-xl border-[#d0d4dc]">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN">India</SelectItem>
                      <SelectItem value="US">United States</SelectItem>
                      <SelectItem value="UK">United Kingdom</SelectItem>
                      <SelectItem value="AE">United Arab Emirates</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={goNext}
                  disabled={!canSaveOwner}
                  className="w-full rounded-full bg-[#256fef] text-white font-semibold hover:bg-[#1f5fe0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save
                </Button>
              </div>
            )}

            {/* STEP 5 */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={goPrev} className="mt-1 text-[#363636]" aria-label="Back">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="text-center flex-1">
                    <img src="/cosoravendorlogo.png" alt="Cosora For Sellers" className="mx-auto h-10 w-auto object-contain" draggable={false} />
                    <p className="text-xs text-[#363636]/70">For Sellers</p>
                  </div>
                  <div className="w-4" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-[#363636]">Add business images</h2>
                  <p className="text-sm font-normal text-[#363636]">
                    Upload at least one entrance image of your business along with interior images, for your Cosora page.
                  </p>
                </div>

                <button
                  type="button"
                  className="w-full rounded-2xl border-2 border-dashed border-[#d0d4dc] bg-[#f5f5f5] px-4 py-10 text-center"
                  onClick={() => setBusinessImagePickerOpen(true)}
                >
                  <UploadIcon className="mx-auto h-10 w-10 text-[#256fef]" />
                  <p className="mt-3 font-semibold text-[#256fef]">Add business images</p>
                  <p className="mt-1 text-xs text-[#363636]/70">jpeg, png or jpg formats up to 5MB</p>
                </button>

                <Dialog open={businessImagePickerOpen} onOpenChange={setBusinessImagePickerOpen}>
                  <DialogContent className="rounded-2xl border border-[#d0d4dc] bg-white p-5">
                    <DialogHeader>
                      <DialogTitle className="text-base font-semibold text-[#363636]">Select images</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        className="flex h-24 flex-col items-center justify-center rounded-xl bg-[#f5f5f5] text-[#363636]"
                        onClick={() => businessImageInputRef.current?.click()}
                      >
                        <UploadIcon className="h-6 w-6 text-[#256fef]" />
                        <span className="mt-2 text-sm font-medium">Camera</span>
                      </button>
                      <button
                        type="button"
                        className="flex h-24 flex-col items-center justify-center rounded-xl bg-[#f5f5f5] text-[#363636]"
                        onClick={() => businessImageInputRef.current?.click()}
                      >
                        <UploadIcon className="h-6 w-6 text-[#256fef]" />
                        <span className="mt-2 text-sm font-medium">Browse</span>
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {Array.from({ length: 9 }).map((_, index) => (
                        <button key={index} type="button" className="aspect-square rounded-xl bg-[#eef0f3] border border-[#d0d4dc] relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent" />
                        </button>
                      ))}
                    </div>
                    <Button className="mt-4 w-full rounded-full bg-[#256fef] text-white font-semibold" onClick={() => setBusinessImagePickerOpen(false)}>
                      Done
                    </Button>
                  </DialogContent>
                </Dialog>

                <Dialog open={businessImageGuidelinesOpen} onOpenChange={setBusinessImageGuidelinesOpen}>
                  <DialogContent className="rounded-2xl border border-[#d0d4dc] bg-white p-5">
                    <DialogHeader>
                      <DialogTitle className="text-base font-semibold text-[#363636]">Image upload guidelines</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 space-y-3">
                      {[
                        {
                          text: "A clear entrance image of your business is required, showing only your business.",
                          type: "check",
                        },
                        {
                          text: "The entrance image should not show a closed shutter; otherwise, it will be rejected.",
                          type: "cross",
                        },
                        {
                          text: "Submit clear HD photos of your business interiors. Ensure they are authentic and not stock images.",
                          type: "check",
                        },
                        {
                          text: "Blurry, clipped, low-quality photos, or those with human elements will be rejected.",
                          type: "cross",
                        },
                      ].map((item) => (
                        <div key={item.text} className="grid grid-cols-[88px_1fr] gap-3 rounded-xl border border-[#d0d4dc] p-2">
                          <div className="relative h-20 overflow-hidden rounded-lg bg-gradient-to-br from-[#dbeafe] to-[#f5f5f5]">
                            <div className={cn("absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full", item.type === "check" ? "bg-[#14ae5c]" : "bg-[#ef4d62]") }>
                              {item.type === "check" ? <Check className="h-3.5 w-3.5 text-white" /> : <X className="h-3.5 w-3.5 text-white" />}
                            </div>
                          </div>
                          <p className="text-sm text-[#363636]">{item.text}</p>
                        </div>
                      ))}
                    </div>
                    <Button
                      className="mt-4 w-full rounded-full bg-[#256fef] text-white font-semibold"
                      onClick={() => {
                        setBusinessImageGuidelinesOpen(false);
                        setBusinessImagePickerOpen(true);
                      }}
                    >
                      Upload now
                    </Button>
                  </DialogContent>
                </Dialog>

                <button
                  type="button"
                  className="text-sm text-[#256fef] underline"
                  onClick={() => setBusinessImageGuidelinesOpen(true)}
                >
                  Guidelines to upload business images
                </button>

                {businessImageUploads.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {businessImageUploads.map((src, i) => (
                      <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-[#d0d4dc]">
                        <img src={src} alt="Business upload" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded-full bg-white p-1 shadow"
                          onClick={() => setBusinessImageUploads((items) => items.filter((_, index) => index !== i))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  onClick={() => setCurrentStep(6)}
                  disabled={!canUploadBusinessImages}
                  className="w-full rounded-full bg-[#256fef] text-white font-semibold hover:bg-[#1f5fe0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </Button>

                <input
                  ref={businessImageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const urls = files.map((file) => URL.createObjectURL(file));
                    setBusinessImageUploads((current) => [...current, ...urls]);
                    if (files.length > 0) {
                      setBusinessImageGuidelinesOpen(false);
                      setBusinessImagePickerOpen(false);
                    }
                  }}
                />
              </div>
            )}

            {/* STEP 6 */}
            {currentStep === 6 && !step6Success && (
              <div className="space-y-6 pb-14">
                <div className="flex items-center justify-between">
                  <button type="button" onClick={goPrev} className="flex h-8 w-8 items-center justify-center rounded-full text-[#363636]" aria-label="Back">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <h2 className="text-base font-semibold text-[#363636]">Business documents</h2>
                  <span className="rounded-full bg-[#f5f5f5] px-3 py-1 text-sm text-[#363636]">1 of 4</span>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-[#363636]">PAN details</h3>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#363636]">PAN number*</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={pan}
                      onChange={(e) => setPan(e.target.value.toUpperCase())}
                      placeholder=""
                      maxLength={10}
                      className={cn(
                        "h-11 rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]",
                        panStatus === "success" && "border-[#14ae5c]",
                        panStatus === "fail" && "border-red-500",
                      )}
                      disabled={panStatus === "verifying"}
                    />
                    {panStatus === "verifying" ? (
                      <span className="text-sm text-[#363636]/70">Verifying...</span>
                    ) : panStatus === "success" ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[#14ae5c]">
                        <Check className="h-4 w-4" /> Verified
                      </span>
                    ) : panStatus === "fail" ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[#ef4d62]">
                        <AlertCircle className="h-4 w-4" /> Verification failed
                      </span>
                    ) : (
                      <Button type="button" variant="outline" className="rounded-full border-[#256fef] text-[#256fef]" onClick={verifyPan}>
                        Verify
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#363636]">Full name as per PAN*</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={panFullName}
                      onChange={(e) => setPanFullName(e.target.value)}
                      className={cn(
                        "h-11 rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]",
                        panNameStatus === "fail" && "border-red-500",
                        panNameStatus === "success" && "border-[#14ae5c]",
                      )}
                    />
                    {panNameStatus === "verifying" ? (
                      <span className="text-sm text-[#363636]/70">Verifying...</span>
                    ) : panNameStatus === "fail" ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[#ef4d62]">
                        <AlertCircle className="h-4 w-4" /> Verification failed
                      </span>
                    ) : panNameStatus === "success" ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[#14ae5c]">
                        <Check className="h-4 w-4" /> Verified
                      </span>
                    ) : (
                      <Button type="button" variant="outline" className="rounded-full border-[#256fef] text-[#256fef]" onClick={verifyPanName}>
                        Verify
                      </Button>
                    )}
                  </div>
                  {panNameStatus === "fail" && (
                    <p className="text-xs text-[#ef4d62]">We couldn't verify your PAN name. Please enter it exactly as shown on your PAN card.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#363636]">Full address of your registered business*</Label>
                  <Input
                    value={panAddress}
                    onChange={(e) => setPanAddress(e.target.value)}
                    className="h-11 rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                  />
                </div>

                <div className="space-y-3 rounded-2xl border border-[#d0d4dc] p-4">
                  <button
                    type="button"
                    className="block w-full rounded-2xl border-2 border-dashed border-[#d0d4dc] bg-[#f5f5f5] px-4 py-10 text-center"
                    onClick={() => panDocumentInputRef.current?.click()}
                  >
                    <UploadIcon className="mx-auto h-10 w-10 text-[#256fef]" />
                    <p className="mt-3 font-semibold text-[#256fef]">Upload your PAN</p>
                    <p className="mt-1 text-xs text-[#363636]/70">jpeg, png or pdf formats up to 5MB</p>
                  </button>
                  <button type="button" className="text-sm text-[#256fef] underline" onClick={() => setPanGuidelinesOpen(true)}>
                    Guidelines to upload PAN
                  </button>
                  {panDocumentUploads.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {panDocumentUploads.map((src, i) => (
                        <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-[#d0d4dc]">
                          <img src={src} alt="PAN upload" className="h-full w-full object-cover" />
                          <button type="button" className="absolute right-1 top-1 rounded-full bg-white p-1 shadow" onClick={() => setPanDocumentUploads((items) => items.filter((_, index) => index !== i))}>
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Dialog open={panGuidelinesOpen} onOpenChange={setPanGuidelinesOpen}>
                    <DialogContent className="rounded-2xl border border-[#d0d4dc] bg-white p-5">
                      <DialogHeader>
                        <DialogTitle className="text-base font-semibold text-[#363636]">Image upload guidelines</DialogTitle>
                      </DialogHeader>
                      <div className="mt-4 space-y-3">
                        {[
                          "Click a clear image. Make sure all details are visible.",
                          "Image should not be blurry",
                          "Image should not be zoomed in or cropped",
                        ].map((item, index) => (
                          <div key={item} className="grid grid-cols-[88px_1fr] gap-3 rounded-xl border border-[#d0d4dc] p-2">
                            <div className="relative h-20 overflow-hidden rounded-lg bg-gradient-to-br from-[#dbeafe] to-[#f5f5f5]">
                              <div className={cn("absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full", index === 0 ? "bg-[#14ae5c]" : "bg-[#ef4d62]") }>
                                {index === 0 ? <Check className="h-3.5 w-3.5 text-white" /> : <X className="h-3.5 w-3.5 text-white" />}
                              </div>
                            </div>
                            <p className="text-sm text-[#363636]">{item}</p>
                          </div>
                        ))}
                      </div>
                      <Button
                        className="mt-4 w-full rounded-full bg-[#256fef] text-white font-semibold"
                        onClick={() => {
                          setPanGuidelinesOpen(false);
                          panDocumentInputRef.current?.click();
                        }}
                      >
                        Upload now
                      </Button>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-[#363636]">GST details (if applicable)</h4>
                  <p className="text-xs text-[#363636]/70">This should be linked to the PAN provided earlier for tax calculations</p>
                  <div className="flex items-center gap-4">
                    <Label className="flex items-center gap-2 text-sm font-medium text-[#363636]">
                      <input type="radio" name="gst" checked={hasGstin} onChange={() => setHasGstin(true)} /> Yes
                    </Label>
                    <Label className="flex items-center gap-2 text-sm font-medium text-[#363636]">
                      <input type="radio" name="gst" checked={!hasGstin} onChange={() => setHasGstin(false)} /> No
                    </Label>
                  </div>
                  {hasGstin && (
                    <Input
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value)}
                      placeholder="GSTIN"
                      className="h-11 rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                    />
                  )}
                </div>

                <Button
                  onClick={() => setStep6Success(true)}
                  disabled={!canSubmitPanDocuments}
                  className="w-full rounded-full bg-[#256fef] text-white font-semibold hover:bg-[#1f5fe0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </Button>

                <p className="text-xs text-[#d0d4dc]">Vendor ID: 21935326</p>

                <input
                  ref={panDocumentInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const urls = files.map((file) => URL.createObjectURL(file));
                    setPanDocumentUploads((current) => [...current, ...urls]);
                  }}
                />
              </div>
            )}
            {currentStep === 6 && step6Success && (
              <BusinessInfoSuccessScreen text="Business documents added" onContinue={() => { setStep6Success(false); setCurrentStep(7); }} />
            )}

            {/* STEP 7 */}
            {currentStep === 7 && !step7Success && (
              <div className="space-y-5">
                <h2 className="font-display text-2xl font-bold">Add your first product</h2>
                <div className="space-y-2">
                  <Label>Product Images (up to 6)</Label>
                  <label className="block rounded-xl border-2 border-dashed border-[#d0d4dc] bg-[#f5f5f5] p-6 text-center cursor-pointer hover:bg-[#eef0f3]">
                    <UploadIcon className="w-6 h-6 mx-auto text-[#363636] mb-2" />
                    <p className="text-sm">Click to upload</p>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickImages(e, setProductImages, productImages, 6)} />
                  </label>
                  {productImages.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {productImages.map((src, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border group">
                          <img src={src} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
                            <button className="p-1.5 bg-background rounded-full" title="Remove BG"><Eraser className="w-3 h-3" /></button>
                            <button className="p-1.5 bg-background rounded-full" title="Crop"><Crop className="w-3 h-3" /></button>
                            <button className="p-1.5 bg-background rounded-full" title="Rotate"><RotateCw className="w-3 h-3" /></button>
                            <button onClick={() => setProductImages(productImages.filter((_, j) => j !== i))} className="p-1.5 bg-background rounded-full"><X className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2"><Label>Product / Service Name</Label><Input value={productName} onChange={(e) => setProductName(e.target.value)} /></div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2 col-span-2"><Label>Price</Label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={unit} onValueChange={setUnit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label>MOQ (Minimum Order Qty)</Label><Input type="number" value={moq} onChange={(e) => setMoq(e.target.value)} /></div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <CategorySelector selectedCategory={category} onSelectCategory={setCategory} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Fabric</Label>
                    <Select value={fabric} onValueChange={setFabric}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{FABRICS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>GSM</Label><Input value={gsm} onChange={(e) => setGsm(e.target.value)} /></div>
                </div>
                <div className="space-y-2">
                  <Label>Sizes</Label>
                  <div className="flex flex-wrap gap-2">
                    {SIZES.map((s) => (
                      <button key={s} onClick={() => toggleChip(s, selectedSizes, setSelectedSizes)} className={cn("px-3 py-1.5 rounded-full text-sm border", selectedSizes.includes(s) ? "bg-[#256fef] text-white border-[#256fef]" : "bg-white hover:bg-[#256fef]/10 border border-[#d0d4dc]")}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Colors</Label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map((c) => (
                      <button key={c} onClick={() => toggleChip(c, selectedColors, setSelectedColors)} className={cn("px-3 py-1.5 rounded-full text-sm border", selectedColors.includes(c) ? "bg-[#256fef] text-white border-[#256fef]" : "bg-white hover:bg-[#256fef]/10 border border-[#d0d4dc]")}>{c}</button>
                    ))}
                  </div>
                </div>
                <Button onClick={goNext} className="w-full bg-[#256fef] text-white rounded-full font-semibold hover:bg-[#1f5fe0]">Submit</Button>
              </div>
            )}
            {currentStep === 7 && step7Success && (
              <SuccessScreen text="Product details uploaded" onContinue={() => { setStep7Success(false); setCurrentStep(8); }} />
            )}

            {/* STEP 8 */}
            {currentStep === 8 && (
              <div className="space-y-5">
                <h2 className="font-display text-2xl font-bold">Partner Contract</h2>
                <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
                  <p className="text-xs uppercase text-[#363636] mb-2">E-Signature</p>
                  {!editingSig ? (
                    <p className="font-display italic text-3xl text-[#256fef]">{signature || "Your signature"}</p>
                  ) : (
                    <Input value={signature} onChange={(e) => setSignature(e.target.value)} className="text-center font-display italic text-2xl" autoFocus onBlur={() => setEditingSig(false)} />
                  )}
                  <button onClick={() => setEditingSig(true)} className="text-xs text-[#256fef] underline mt-2">Change Signature</button>
                </div>
                <div className="rounded-xl border bg-[#f5f5f5] p-4 max-h-56 overflow-y-auto text-xs text-[#363636] space-y-2">
                  <p className="font-semibold text-foreground">Cosora Supplier Agreement</p>
                  <p>By signing below, you agree to all terms of the Cosora Supplier Agreement, including product authenticity, fair trade, on-time fulfillment, accurate listings, and Cosora's commission and payment terms.</p>
                  <p>You represent that all submitted information is accurate and that you have the legal right to sell the listed products.</p>
                  <p>Cosora reserves the right to review, suspend, or terminate seller accounts that violate these terms. Disputes shall be resolved per the governing law specified in the full agreement.</p>
                  <p>Continued use of the platform constitutes acceptance of any updated terms communicated via email or in-app notice.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="agree" checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} />
                  <Label htmlFor="agree" className="cursor-pointer text-sm">I agree to comply with Cosora's Supplier Agreement</Label>
                </div>
                <Button onClick={submitContract} className="w-full bg-[#256fef] text-white rounded-full font-semibold hover:bg-[#1f5fe0]">Submit</Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <Dialog
          open={otpModalOpen}
          onOpenChange={(open) => {
            setOtpModalOpen(open);
            if (!open) setIsVerifying(false);
          }}
        >
          <DialogContent className="max-w-sm rounded-2xl border border-[#d0d4dc] bg-white p-5">
            <DialogHeader className="text-left">
              <DialogTitle className="text-base font-semibold text-[#363636]">Enter verification code</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-[#363636]/70">
              6 digit OTP has been sent to {countryCode} {maskedMobile}
            </p>
            <div className="mt-4 flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp} containerClassName="justify-center">
                <InputOTPGroup className="gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="h-12 w-12 rounded-xl border border-[#d0d4dc] text-base ring-[#256fef]"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <div className="mt-3 text-xs text-[#363636]/70">
              {otpCountdown > 0 ? (
                <span>Resend OTP (in {otpCountdown} seconds)</span>
              ) : (
                <button type="button" className="text-[#256fef]" onClick={resendOtp}>
                  Resend OTP
                </button>
              )}
            </div>
            <Button
              onClick={confirmOtp}
              disabled={otp.length !== 6}
              className="mt-4 w-full rounded-full bg-[#256fef] text-white font-semibold hover:bg-[#1f5fe0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Verify
            </Button>
          </DialogContent>
        </Dialog>

        {/* Nav */}
        {currentStep > 4 && currentStep < TOTAL_STEPS && !step6Success && !step7Success && (
          <div className="flex items-center justify-between mt-8">
            <Button variant="outline" onClick={goPrev}><ArrowLeft className="w-4 h-4 mr-1" /> Previous</Button>
            <Button variant="ghost" onClick={goNext}>Skip <ArrowRight className="w-4 h-4 ml-1" /></Button>
          </div>
        )}
      </div>

      {!showWelcome && (
        <button
          type="button"
          onClick={() => window.open("https://wa.me/918821826465", "_blank")}
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#14ae5c] text-white shadow-lg"
          aria-label="WhatsApp help"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

function BusinessInfoStepper({ currentStep }: { currentStep: number }) {
  const steps = [
    "Business Details",
    "Business Address",
    "Supplier Details",
  ];
  const activeIndex = Math.min(Math.max(currentStep - 2, 0), steps.length - 1);

  return (
    <div className="mx-auto max-w-2xl px-6 pb-4">
      <div className="flex items-start justify-between">
        {steps.map((label, index) => {
          const isDone = index < activeIndex;
          const isActive = index === activeIndex;
          return (
            <div key={label} className="flex flex-1 flex-col items-center text-center gap-2">
              {isDone ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#14ae5c]">
                  <Check className="h-4 w-4 text-white" />
                </div>
              ) : isActive ? (
                <div className="h-8 w-8 rounded-full bg-[#256fef]" />
              ) : (
                <div className="h-8 w-8 rounded-full border border-[#d0d4dc]" />
              )}
              <span
                className={cn(
                  "text-[11px] font-medium",
                  isActive ? "text-[#256fef]" : isDone ? "text-[#14ae5c]" : "text-[#d0d4dc]",
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BusinessInfoSuccessScreen({ text, onContinue }: { text: string; onContinue: () => void }) {
  useEffect(() => {
    const t = setTimeout(onContinue, 1800);
    return () => clearTimeout(t);
  }, [onContinue]);

  return (
    <div
      className="vendor-shell fixed inset-0 z-50 flex items-center justify-center bg-[#f0fdf4]"
      onClick={onContinue}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onContinue();
      }}
    >
      <div className="flex flex-col items-center px-6 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#14ae5c]">
          <Check className="h-12 w-12 text-white" />
        </div>
        <p className="mt-4 text-xl font-semibold text-[#363636]">{text}</p>
      </div>
    </div>
  );
}

function SuccessScreen({ text, onContinue }: { text: string; onContinue: () => void }) {
  useEffect(() => {
    const t = setTimeout(onContinue, 1600);
    return () => clearTimeout(t);
  }, [onContinue]);
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="w-20 h-20 rounded-full bg-[#14ae5c]/15 flex items-center justify-center mb-4"
      >
        <CheckCircle2 className="w-12 h-12 text-[#14ae5c]" />
      </motion.div>
      <h3 className="font-display text-2xl font-bold mb-1">{text} ✓</h3>
      <p className="text-sm text-[#363636]">Continuing...</p>
    </div>
  );
}
