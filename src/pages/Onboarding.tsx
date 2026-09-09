import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, ChevronRight, Menu, MessageCircle, MapPin, Upload as UploadIcon,
  Check, CheckCircle2, Building2, FileText, Package, FileSignature,
  X, Info, AlertCircle, Search, PenLine, Tag, Clock, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CategorySelector } from "@/components/upload/CategorySelector";
import { AddBusinessCategoriesModal } from "@/components/vendor/AddBusinessCategoriesModal";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useProfileFull } from "@/lib/queries/profile";
import {
  saveVendorOnboarding, uploadKycDocument, uploadOnboardingProductImage, uploadSignature,
} from "@/lib/queries/vendorOnboarding";
import { SUPPLIER_AGREEMENT_CLAUSES, SUPPLIER_AGREEMENT_VERSION } from "@/lib/supplierAgreement";
import { uploadVendorGalleryImage } from "@/lib/queries/vendorStore";

// 1 overview · 2 details · 3 address · 4 owner · 5 category · 6 images
// · 7 documents · 8 product · 9 contract
const TOTAL_STEPS = 9;

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
  const { user } = useAuth();
  const { setRole, setVendorRegistered } = useUserRole();
  const [currentStep, setCurrentStep] = useState(1);

  // Vendor registration is complete: flag it (so future Buyer→Seller switches
  // skip onboarding) and flip the active role to seller before leaving.
  const finishVendorRegistration = () => {
    setVendorRegistered(true);
    setRole("seller");
  };

  // Step 2
  const [businessName, setBusinessName] = useState("");
  const [mobile, setMobile] = useState("");
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
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [landmark, setLandmark] = useState("");
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [locLoading, setLocLoading] = useState(false);

  // Step 4
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [country, setCountry] = useState("IN");
  const [ownerSuccess, setOwnerSuccess] = useState(false);

  // Step 5 — business categories (vendor_profiles.category)
  const [businessCategories, setBusinessCategories] = useState<string[]>([]);
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);

  // Step 6 — premises photos. Holds PUBLIC STORAGE URLS, not blob: URLs:
  // these are uploaded as they are picked so they survive a reload and mean
  // something to everyone else.
  const [businessImagePickerOpen, setBusinessImagePickerOpen] = useState(false);
  const [businessImageGuidelinesOpen, setBusinessImageGuidelinesOpen] = useState(false);
  const [businessImageUploads, setBusinessImageUploads] = useState<string[]>([]);
  const [uploadingBusinessImages, setUploadingBusinessImages] = useState(0);

  // Step 7 — KYC. `checked` means "the format is well-formed and it has been
  // queued for review", never "verified": nothing in this app can verify a PAN.
  const [pan, setPan] = useState("");
  const [panStatus, setPanStatus] = useState<"idle" | "invalid" | "submitted">("idle");
  const [panNameStatus, setPanNameStatus] = useState<"idle" | "invalid" | "submitted">("idle");
  const [cin, setCin] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [hasGstin, setHasGstin] = useState(false);
  const [gstin, setGstin] = useState("");
  const [panFullName, setPanFullName] = useState("");
  const [panAddress, setPanAddress] = useState("");
  const [panDocumentUrl, setPanDocumentUrl] = useState<string | null>(null);
  const [panDocumentName, setPanDocumentName] = useState("");
  const [uploadingPanDocument, setUploadingPanDocument] = useState(false);
  const [panGuidelinesOpen, setPanGuidelinesOpen] = useState(false);
  const [documentsSuccess, setDocumentsSuccess] = useState(false);

  // Step 8 — first product. Also public storage URLs.
  const [productImages, setProductImages] = useState<string[]>([]);
  const [uploadingProductImages, setUploadingProductImages] = useState(0);
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("pieces");
  const [moq, setMoq] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [fabric, setFabric] = useState("");
  const [gsm, setGsm] = useState("");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [productSuccess, setProductSuccess] = useState(false);

  // Step 9
  const [contractStage, setContractStage] = useState<"overview" | "contract">("overview");
  const [contractName, setContractName] = useState("");
  const [manualSignatureDataUrl, setManualSignatureDataUrl] = useState<string | null>(null);
  const [signatureDrawerOpen, setSignatureDrawerOpen] = useState(false);
  const [agreementModalOpen, setAgreementModalOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Blocks the success screen when the registration could not be saved. An
  // 8-step form that shows "Welcome to Cosora" while having written nothing is
  // worse than an error — the vendor believes they are registered.
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const businessImageInputRef = useRef<HTMLInputElement | null>(null);
  const panDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureStrokeRef = useRef<{ x: number; y: number }[][]>([]);
  const signatureIsDrawingRef = useRef(false);
  const keepManualSignatureRef = useRef(false);

  useEffect(() => {
    if (ownerName.trim()) {
      setContractName(ownerName);
    }
  }, [ownerName]);

  useEffect(() => {
    if (!signatureDrawerOpen) return;
    const frame = window.requestAnimationFrame(syncSignatureCanvasSize);
    return () => window.cancelAnimationFrame(frame);
  }, [signatureDrawerOpen]);


  useEffect(() => {
    if (sameContact) setPrimaryContact(mobile);
  }, [sameContact, mobile]);

  // ── KYC checks ────────────────────────────────────────────────
  // These are FORMAT checks and nothing more. There is no PAN lookup service
  // wired to this app, so the only honest outcomes are "that isn't a PAN" and
  // "queued for a human to verify". vendor_documents.verified stays false until
  // an admin flips it; showing a green "Verified" here would be the app
  // vouching for a document nobody has looked at.
  const PAN_FORMAT = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

  const checkPanFormat = () => setPanStatus(PAN_FORMAT.test(pan.toUpperCase()) ? "submitted" : "invalid");

  const checkPanName = () => {
    const name = panFullName.trim();
    // A name has no checkable format beyond "looks like a name" — letters,
    // spaces and the punctuation Indian entity names actually use.
    setPanNameStatus(name.length >= 3 && /^[A-Za-z][A-Za-z\s.&'()-]*$/.test(name) ? "submitted" : "invalid");
  };

  // ── Uploads ───────────────────────────────────────────────────
  // Every picker here uploads to Supabase storage and keeps the PUBLIC URL.
  // They used to keep URL.createObjectURL() blobs, which are alive only in the
  // tab that made them: the vendor saw their photos, the database got nothing,
  // and a reload lost them.
  const requireSession = (what: string): boolean => {
    if (user) return true;
    toast.error(`Sign in to upload ${what}`, { description: "Your registration is saved to your account." });
    return false;
  };

  const handleBusinessImageFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // let the same file be re-picked after a failure
    if (files.length === 0) return;
    if (!requireSession("business images")) return;
    setBusinessImageGuidelinesOpen(false);
    setBusinessImagePickerOpen(false);
    setUploadingBusinessImages(files.length);
    try {
      const urls = await Promise.all(files.map((f) => uploadVendorGalleryImage(user!.id, f)));
      setBusinessImageUploads((current) => [...current, ...urls]);
    } catch (err) {
      toast.error("Couldn't upload business images", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploadingBusinessImages(0);
    }
  };

  const handlePanDocumentFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!requireSession("your PAN")) return;
    setUploadingPanDocument(true);
    try {
      const url = await uploadKycDocument(user!.id, file);
      setPanDocumentUrl(url);
      setPanDocumentName(file.name);
    } catch (err) {
      toast.error("Couldn't upload your PAN", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploadingPanDocument(false);
    }
  };

  const MAX_PRODUCT_IMAGES = 6;
  const handleProductImageFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    const files = picked.slice(0, MAX_PRODUCT_IMAGES - productImages.length);
    if (files.length === 0) return;
    if (!requireSession("product images")) return;
    setUploadingProductImages(files.length);
    try {
      const urls = await Promise.all(files.map((f) => uploadOnboardingProductImage(user!.id, f)));
      setProductImages((current) => [...current, ...urls]);
    } catch (err) {
      toast.error("Couldn't upload product images", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploadingProductImages(0);
    }
  };

  const toggleChip = (val: string, list: string[], setter: (l: string[]) => void) => {
    setter(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const goNext = () => {
    if (currentStep === 4 && !ownerSuccess) { setOwnerSuccess(true); return; }
    if (currentStep === 7 && !documentsSuccess) { setDocumentsSuccess(true); return; }
    if (currentStep === 8 && !productSuccess) { setProductSuccess(true); return; }
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((s) => s + 1);
      setOwnerSuccess(false); setDocumentsSuccess(false); setProductSuccess(false);
    }
  };
  const goPrev = () => currentStep > 1 && setCurrentStep((s) => s - 1);

  // Prefill from what the buyer already gave at signup (name, email, business
  // name, phone verified via OTP, address) so the vendor never re-types it.
  // Only fills blank fields, so it never clobbers anything typed here.
  const { data: prefill } = useProfileFull(user?.id);
  useEffect(() => {
    if (!prefill) return;
    if (prefill.businessName) setBusinessName((v) => v || prefill.businessName);
    if (prefill.fullName) setOwnerName((v) => v || prefill.fullName);
    if (prefill.email) setOwnerEmail((v) => v || prefill.email);
    if (prefill.street) setArea((v) => v || prefill.street);
    const cityGuess = prefill.businessCity || prefill.city;
    if (cityGuess) setCity((v) => v || cityGuess);
    if (prefill.phone) {
      const local = prefill.phone.replace(/\D/g, "").slice(-10);
      if (local.length === 10) setMobile((v) => v || local);
    }
  }, [prefill]);

  // Real geolocation → reverse-geocode (BigDataCloud, keyless + CORS-friendly)
  // to fill the business city/area on the address step.
  const handleUseCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Location isn't supported on this device");
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=en`
          );
          const data = await res.json();
          const detectedCity = data.city || data.locality || data.principalSubdivision || "";
          const detectedArea = data.locality || data.city || "";
          const detectedState = data.principalSubdivision || "";
          const detectedPostcode = (data.postcode || "").replace(/\D/g, "").slice(0, 6);
          if (detectedCity) setCity(detectedCity);
          if (detectedArea) setArea((v) => v || detectedArea);
          // State and pincode are new required fields; the reverse geocode
          // already returns both, so filling them here saves the vendor typing
          // what the browser just told us.
          if (detectedState) setState((v) => v || detectedState);
          if (detectedPostcode.length === 6) setPincode((v) => v || detectedPostcode);
          toast.success(detectedCity ? `Location set — ${detectedCity}` : "Location detected");
        } catch {
          toast.error("Couldn't look up your location details");
        } finally {
          setLocLoading(false);
        }
      },
      (err) => {
        setLocLoading(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — allow it or enter your address"
            : "Couldn't get your location"
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const submitContract = async () => {
    if (!agreed || !contractName.trim()) return toast.error("Complete the name and agreement to continue");

    // No session, no registration. This used to be `if (user) { ...save... }`
    // followed by an unconditional success screen: a signed-out vendor filled
    // in eight steps, saw "Welcome to Cosora", and had written nothing
    // anywhere. Block here and keep them on this step instead.
    if (!user) {
      const msg = "You're signed out, so this registration can't be saved. Sign in or create an account, then submit again — your answers stay on this page.";
      setSubmitError(msg);
      toast.error("Sign in to finish registering", { description: msg });
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      // The drawn signature, if there is one, goes to private storage first —
      // saveVendorOnboarding stores a path, never a data: URL.
      let signatureUrl: string | undefined;
      if (manualSignatureDataUrl) {
        signatureUrl = await uploadSignature(user.id, manualSignatureDataUrl);
      }

      await saveVendorOnboarding(user.id, {
        businessName: businessName || contractName,
        phone: mobile ? `${countryCode} ${mobile}` : (primaryContact || undefined),
        whatsapp: whatsappOptIn && mobile ? `${countryCode} ${mobile}` : undefined,
        website: hasWebsite ? websiteUrl : undefined,
        addressLine: [building, floor].filter(Boolean).join(", ") || undefined,
        area: area || undefined,
        city: city || undefined,
        state: state || undefined,
        postalCode: pincode || undefined,
        landmark: landmark || undefined,
        ownerName: ownerName || contractName,
        ownerEmail: ownerEmail || undefined,
        country: country === "IN" ? "India" : country || undefined,
        pan: pan || undefined,
        gstin: hasGstin ? gstin : undefined,
        cin: cin || undefined,
        aadhaar: aadhaar || undefined,
        category: businessCategories.length ? businessCategories : undefined,
        officePhotos: businessImageUploads.length ? businessImageUploads : undefined,
        panFileUrl: panDocumentUrl ?? undefined,
        contract: { signedName: contractName.trim(), signatureUrl },
        product: productName
          ? {
              name: productName,
              price: price || undefined,
              unit: unit || undefined,
              moq: moq || undefined,
              fabric: fabric || undefined,
              gsm: gsm || undefined,
              category,
              sizes: selectedSizes,
              colours: selectedColors,
              images: productImages,
            }
          : undefined,
      });
    } catch (err) {
      // Same reasoning as the signed-out case: a write that failed is a
      // registration that does not exist, so it must not look like one that
      // succeeded. Everything typed stays on screen and Submit can be retried.
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(`We couldn't save your registration: ${msg}`);
      toast.error("Couldn't save your registration", { description: msg });
      return;
    } finally {
      setSubmitting(false);
    }
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
      state: businessInfoComplete ? "done" : "locked",
    },
    {
      label: "Products details",
      helper: "Category, Products.",
      icon: Package,
      state: currentStep > 8 ? "done" : "locked",
    },
    {
      label: "Partner contract",
      helper: "",
      icon: FileSignature,
      state: currentStep >= TOTAL_STEPS ? "active" : "locked",
    },
  ];
  const canSubmitContract = contractName.trim().length > 0 && agreed && !submitting;

  const contractDisplayName = contractName.trim() || "Your full name";
  const syncSignatureCanvasSize = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(rect.width * scale, 1);
    canvas.height = Math.max(rect.height * scale, 1);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.strokeStyle = "#256fef";
    context.lineWidth = 2.8;
    context.lineJoin = "round";
    context.lineCap = "round";
    signatureStrokeRef.current.forEach((stroke) => {
      if (stroke.length < 2) return;
      context.beginPath();
      context.moveTo(stroke[0].x, stroke[0].y);
      stroke.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
    });
  };
  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };
  const startDrawingSignature = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);
    if (!point) return;
    signatureIsDrawingRef.current = true;
    signatureStrokeRef.current.push([point]);
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.setPointerCapture(event.pointerId);
    syncSignatureCanvasSize();
  };
  const drawSignatureStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!signatureIsDrawingRef.current) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    const stroke = signatureStrokeRef.current[signatureStrokeRef.current.length - 1];
    stroke.push(point);
    syncSignatureCanvasSize();
  };
  const endDrawingSignature = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!signatureIsDrawingRef.current) return;
    signatureIsDrawingRef.current = false;
    const canvas = signatureCanvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  const clearSignatureCanvas = () => {
    signatureStrokeRef.current = [];
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
  };
  const saveManualSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || signatureStrokeRef.current.length === 0) {
      toast.error("Draw your signature before saving");
      return;
    }
    keepManualSignatureRef.current = true;
    setManualSignatureDataUrl(canvas.toDataURL("image/png"));
    setSignatureDrawerOpen(false);
  };

  const canContinueStep2 =
    businessName.trim().length > 0 &&
    mobile.trim().length >= 10 &&
    (!hasWebsite || websiteUrl.trim().length > 0) &&
    (sameContact || primaryContact.trim().length >= 10);
  // State and pincode are required, not optional: `state` feeds the location
  // line buyers see on /vendor/:id and `postal_code` is the only thing that
  // makes an address deliverable. Both columns existed and were written by
  // saveVendorOnboarding all along — the form simply never asked.
  const pincodeValid = /^\d{6}$/.test(pincode);
  // What the embedded map should actually point at. Pincode first — it is the
  // most precise thing this form has — then the city/state the vendor typed.
  const mapQuery = pincodeValid
    ? [pincode, city, state].filter(Boolean).join(", ")
    : [city, state].filter((v) => v && v.trim()).join(", ");
  const canAddAddress = area.trim().length > 0 && state.trim().length > 0 && pincodeValid;
  const canSaveOwner =
    ownerName.trim().length > 0 &&
    ownerEmail.trim().length > 0 &&
    country.trim().length > 0;
  const canContinueCategories = businessCategories.length > 0;
  const canUploadBusinessImages = businessImageUploads.length > 0 && uploadingBusinessImages === 0;
  const canSubmitPanDocuments =
    pan.trim().length > 0 &&
    panFullName.trim().length > 0 &&
    panAddress.trim().length > 0 &&
    panDocumentUrl !== null &&
    !uploadingPanDocument;

  if (showWelcome) {
    return (
      <div
        className="vendor-shell fixed inset-0 z-50 flex items-center justify-center bg-[#f0fdf4] px-6 text-center"
        role="button"
        tabIndex={0}
        onClick={() => { finishVendorRegistration(); navigate("/seller-home"); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { finishVendorRegistration(); navigate("/seller-home"); }
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#14ae5c] shadow-lg shadow-[#14ae5c]/25">
            <Check className="h-12 w-12 text-white" />
          </div>
          <div className="space-y-1">
            <p className="text-xl font-semibold text-[#363636]">The Good Times Start Now.</p>
            <p className="text-xl font-semibold text-[#363636]">Welcome to Cosora</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (currentStep === TOTAL_STEPS) {
    if (contractStage === "overview") {
      return (
        <div className="vendor-shell min-h-screen bg-[#ffffff] pb-24">
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

          <div className="mx-auto max-w-2xl px-4 pt-5">
            <div className="rounded-[1.75rem] bg-[#f5f5f5] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256fef]">Registration Set 4</p>
              <h1 className="mt-2 text-2xl font-bold text-[#363636]">Partner contract checkpoint</h1>
              <p className="mt-2 text-sm text-[#363636]">
                All prior steps are complete. Review the final contract details before signing the supplier agreement.
              </p>

              <div className="mt-5 space-y-3">
                {overviewSteps.map((item, index) => {
                  const Icon = item.icon;
                  const isActive = index === 3;
                  return (
                    <div
                      key={item.label}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm transition-all",
                        isActive ? "border-[#256fef] ring-1 ring-[#256fef]/20" : "border-[#d0d4dc]",
                      )}
                    >
                      <div className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-full border",
                        isActive ? "border-[#256fef] bg-[#256fef]/10 text-[#256fef]" : "border-[#256fef] bg-[#256fef]/10 text-[#256fef]",
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#363636]">{item.label}</p>
                        <p className={cn("text-xs", isActive ? "text-[#256fef]" : "text-[#14ae5c]")}>
                          {isActive ? "Unlocked and ready" : "Completed"}
                        </p>
                      </div>
                      <Check className="h-5 w-5 text-[#14ae5c]" />
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 rounded-2xl border border-[#d0d4dc] bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[#363636]">
                  <FileSignature className="h-4 w-4 text-[#256fef]" />
                  Edit the final contract details
                </div>
                <p className="mt-2 text-sm text-[#6b7280]">
                  The partner contract is now unlocked. Tap the button below to enter the e-signature screen.
                </p>
                <Button
                  type="button"
                  className="mt-4 w-full rounded-full bg-[#256fef] text-white font-semibold"
                  onClick={() => setContractStage("contract")}
                >
                  Edit details
                </Button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => window.open("https://wa.me/918821826465", "_blank")}
            className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#14ae5c] text-white shadow-lg"
            aria-label="WhatsApp help"
          >
            <MessageCircle className="h-5 w-5" />
          </button>
        </div>
      );
    }

    return (
      <div className="vendor-shell min-h-screen bg-[#ffffff] pb-28">
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

        <div className="mx-auto max-w-2xl px-4 pt-5">
          <div className="rounded-[1.75rem] border border-[#d0d4dc] bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256fef]">Partner Contract</p>
                <h1 className="mt-1 text-2xl font-bold text-[#363636]">E-Signature</h1>
                <p className="mt-2 text-sm text-[#6b7280]">Your signature is auto-generated from your name and can be changed manually.</p>
              </div>
              <div className="rounded-full bg-[#f0fdf4] px-3 py-1 text-xs font-medium text-[#14ae5c]">Final step</div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contract-name" className="text-sm font-medium text-[#363636]">
                  Your Full Name
                </Label>
                <Input
                  id="contract-name"
                  value={contractName}
                  onChange={(e) => setContractName(e.target.value)}
                  className="h-12 rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                  placeholder="Enter your full name"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-[#363636]">Generated E-Signature</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f5f5f5] hover:text-[#256fef]"
                          aria-label="What is an e-signature?"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">
                        This signature is used on invoices and credit notes and is generated from the name above.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <div className="rounded-xl border border-[#d0d4dc] bg-[#f8fafc] p-4">
                  {manualSignatureDataUrl ? (
                    <img
                      src={manualSignatureDataUrl}
                      alt="Manual signature"
                      className="h-16 w-full object-contain object-left"
                    />
                  ) : (
                    <div className="flex min-h-16 items-center">
                      <span
                        className="text-4xl font-semibold text-[#363636]"
                        style={{ fontFamily: "'Dancing Script', cursive" }}
                      >
                        {contractDisplayName}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-[#363636]">Want to change the signature?</p>
                  <button
                    type="button"
                    onClick={() => {
                      signatureStrokeRef.current = [];
                      setSignatureDrawerOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-sm font-medium text-[#256fef] underline underline-offset-2"
                  >
                    Change
                    <PenLine className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs leading-5 text-[#6b7280]">
                  By clicking "submit" my e-signature is recorded for issuing invoices/credit notes to my customers
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-[#d0d4dc] bg-white p-4">
                <Checkbox
                  id="supplier-agreement"
                  checked={agreed}
                  onCheckedChange={(value) => setAgreed(!!value)}
                  className="mt-1 border-[#d0d4dc] data-[state=checked]:border-[#256fef] data-[state=checked]:bg-[#256fef]"
                />
                <Label htmlFor="supplier-agreement" className="cursor-pointer text-sm leading-6 text-[#363636]">
                  I agree to comply with Cosora's{" "}
                  <button
                    type="button"
                    onClick={() => setAgreementModalOpen(true)}
                    className="text-[#256fef] underline underline-offset-2"
                  >
                    Supplier Agreement
                  </button>
                </Label>
              </div>

              {submitError && (
                <div className="flex items-start gap-2 rounded-2xl border border-[#ef4d62]/40 bg-[#ef4d62]/5 p-4">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#ef4d62]" />
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-[#363636]">Registration not saved</p>
                    <p className="text-sm text-[#363636]">{submitError}</p>
                    {!user && (
                      <Link to="/login" className="inline-block text-sm font-semibold text-[#256fef] underline underline-offset-2">
                        Go to sign in
                      </Link>
                    )}
                  </div>
                </div>
              )}

              <Button
                type="button"
                onClick={submitContract}
                disabled={!canSubmitContract}
                className="h-12 w-full rounded-full bg-[#256fef] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Saving your registration…" : "Submit"}
              </Button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.open("https://wa.me/918821826465", "_blank")}
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#14ae5c] text-white shadow-lg"
          aria-label="WhatsApp help"
        >
          <MessageCircle className="h-5 w-5" />
        </button>

        <Drawer
          open={signatureDrawerOpen}
          onOpenChange={(open) => {
            setSignatureDrawerOpen(open);
            if (open) {
              keepManualSignatureRef.current = false;
              setTimeout(syncSignatureCanvasSize, 0);
              return;
            }
            if (!keepManualSignatureRef.current) {
              setManualSignatureDataUrl(null);
            }
            keepManualSignatureRef.current = false;
          }}
        >
          <DrawerContent className="border-[#d0d4dc] bg-white">
            <DrawerHeader className="space-y-2 px-4 pt-4 text-left">
              <DrawerTitle className="text-base font-semibold text-[#363636]">Draw your signature</DrawerTitle>
              <p className="text-sm text-[#6b7280]">Use your finger or mouse to draw a signature that matches your legal name.</p>
            </DrawerHeader>
            <div className="px-4 pb-4">
              <div className="rounded-2xl border border-[#d0d4dc] bg-white p-3">
                {/* data-vaul-no-drag is load-bearing, not a hint. This canvas
                    lives inside a vaul Drawer, which reads a pointer drag
                    across its content as swipe-to-dismiss. `touch-none` stops
                    that for a finger; the browser ignores touch-action for a
                    MOUSE, so on desktop the first stroke dismissed the drawer —
                    and onOpenChange nulls manualSignatureDataUrl when it closes
                    unsaved, so the signature was discarded with no error. A
                    desktop vendor could not draw a signature at all. */}
                <canvas
                  ref={signatureCanvasRef}
                  data-vaul-no-drag
                  width={320}
                  height={220}
                  className="h-56 w-full touch-none rounded-xl bg-white"
                  onPointerDown={startDrawingSignature}
                  onPointerMove={drawSignatureStroke}
                  onPointerUp={endDrawingSignature}
                  onPointerLeave={endDrawingSignature}
                />
              </div>
            </div>
            <DrawerFooter className="gap-3 px-4 pb-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={clearSignatureCanvas}
                  className="text-sm font-medium text-[#256fef] underline underline-offset-2"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualSignatureDataUrl(null);
                    keepManualSignatureRef.current = false;
                    setSignatureDrawerOpen(false);
                  }}
                  className="text-sm font-medium text-[#6b7280]"
                >
                  Close
                </button>
              </div>
              <Button
                type="button"
                onClick={saveManualSignature}
                className="h-12 w-full rounded-full bg-[#256fef] font-semibold text-white"
              >
                Save Signature
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        <Dialog open={agreementModalOpen} onOpenChange={setAgreementModalOpen}>
          <DialogContent className="max-h-[80vh] rounded-2xl border border-[#d0d4dc] bg-white p-5">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-[#363636]">Cosora Supplier Agreement</DialogTitle>
            </DialogHeader>
            {/* Rendered from the SAME constant whose version is written to
                vendor_contracts.agreement_version, so the record always names
                the wording the vendor actually read. */}
            <div className="mt-4 max-h-[56vh] space-y-3 overflow-y-auto text-sm leading-6 text-[#363636]">
              {SUPPLIER_AGREEMENT_CLAUSES.map((clause) => <p key={clause}>{clause}</p>)}
              <p className="pt-1 text-xs text-[#363636]/60">Version {SUPPLIER_AGREEMENT_VERSION}</p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (currentStep === 4 && ownerSuccess) {
    return (
      <BusinessInfoSuccessScreen
        text="Business information added"
        onContinue={() => {
          setOwnerSuccess(false);
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
            key={currentStep + "-" + (ownerSuccess ? "owner" : documentsSuccess ? "docs" : productSuccess ? "product" : "main")}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {/* STEP 1 */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="w-full rounded-2xl overflow-hidden">
                  <img
                    src="/vendorhelp.png"
                    alt="Vendor help"
                    className="w-full h-auto object-contain"
                  />
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
                <h2 className="text-2xl font-bold text-[#363636]">Business Details</h2>

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
                    {/* A plain contact field. There was a "Verify" button here
                        that opened an OTP modal, accepted ANY six digits and
                        then showed a green "Verified" tick — while
                        startOtpFlow toasted "OTP sent" and sent nothing. This
                        project has no SMS provider (signInWithOtp returns
                        phone_provider_disabled), so there is nothing to verify
                        against and the tick was a claim the app could not
                        support. */}
                    <Input
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Phone number"
                      className="h-11 flex-1 rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                      inputMode="numeric"
                      maxLength={10}
                    />
                  </div>
                  <p className="text-xs text-[#363636]/70">
                    Buyers and our support team use this number to reach you.
                  </p>
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
                <h2 className="text-2xl font-bold text-[#363636]">Business Address</h2>

                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#363636]/60" />
                    <Input
                      placeholder="Search for area, street name"
                      className="h-11 rounded-xl border-[#d0d4dc] pl-9 focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                    />
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-[#d0d4dc]">
                    {/* Follows what the vendor has actually typed. It was
                        hardcoded to `q=Delhi%20NCR`, so a Surat mill filling in
                        this form was shown a map of Delhi — the same invented
                        content removed everywhere else, in the step that
                        collects the address. No city yet, no map. */}
                    {mapQuery ? (
                      <iframe
                        title="Business location"
                        className="h-56 w-full"
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&t=&z=13&ie=UTF8&iwloc=&output=embed`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-56 w-full flex-col items-center justify-center gap-2 bg-[#f5f5f5] px-6 text-center">
                        <MapPin className="h-6 w-6 text-[#d0d4dc]" />
                        <p className="text-xs text-[#363636]/60">
                          Enter your city or pincode below and the map will find you.
                        </p>
                      </div>
                    )}
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
                      onClick={handleUseCurrentLocation}
                      disabled={locLoading}
                      className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-medium text-[#363636] shadow disabled:opacity-70"
                    >
                      <MapPin className="h-4 w-4 text-[#256fef]" />
                      {locLoading ? "Locating…" : "Use current location"}
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium text-[#363636]">City*</Label>
                      <Input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="City"
                        className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium text-[#363636]">State*</Label>
                      <Input
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="State"
                        className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-[#363636]">Pincode*</Label>
                    <Input
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit pincode"
                      inputMode="numeric"
                      maxLength={6}
                      className="rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                    />
                    {pincode.length > 0 && !pincodeValid && (
                      <p className="text-xs text-[#ef4d62]">Enter all 6 digits of your pincode.</p>
                    )}
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
            {currentStep === 4 && !ownerSuccess && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-[#363636]">Owner details</h2>
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

            {/* STEP 5 — BUSINESS CATEGORY
                Writes vendor_profiles.category. Without it a finished vendor
                is invisible to every category search on the platform, which is
                why this step exists at all: the column was only reachable from
                /business-profile, after registration, if the vendor happened to
                find it. Same component as /business-profile — one picker, one
                list of categories, no drift. */}
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
                  <h2 className="text-lg font-semibold text-[#363636]">What kind of business are you?</h2>
                  <p className="text-sm font-normal text-[#363636]">
                    Buyers browse and filter by these categories. Pick every one that describes what you make, trade or provide.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCategoriesModalOpen(true)}
                  className="w-full rounded-2xl border-2 border-dashed border-[#d0d4dc] bg-[#f5f5f5] px-4 py-10 text-center"
                >
                  <Tag className="mx-auto h-10 w-10 text-[#256fef]" />
                  <p className="mt-3 font-semibold text-[#256fef]">
                    {businessCategories.length > 0 ? "Edit business categories" : "Add business categories"}
                  </p>
                  <p className="mt-1 text-xs text-[#363636]/70">Manufacturer, wholesaler, retailer, services and more</p>
                </button>

                {businessCategories.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-[#363636]/70">
                      Selected ({businessCategories.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {businessCategories.map((cat) => (
                        <span key={cat} className="flex items-center gap-1.5 rounded-full bg-[#256fef] px-3 py-1.5 text-xs font-medium text-white">
                          {cat}
                          <button
                            type="button"
                            aria-label={`Remove ${cat}`}
                            onClick={() => setBusinessCategories((prev) => prev.filter((c) => c !== cat))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => setCurrentStep(6)}
                  disabled={!canContinueCategories}
                  className="w-full rounded-full bg-[#256fef] text-white font-semibold hover:bg-[#1f5fe0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </Button>

                <AddBusinessCategoriesModal
                  isOpen={categoriesModalOpen}
                  onClose={() => setCategoriesModalOpen(false)}
                  categories={businessCategories}
                  onCategoriesChange={setBusinessCategories}
                />
              </div>
            )}

            {/* STEP 6 — BUSINESS IMAGES */}
            {currentStep === 6 && (
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
                    {/* The nine grey squares that used to sit here were a
                        drawing of a device photo gallery — not a picker, not
                        clickable, not the vendor's photos. Removed: the two
                        buttons above open the real file picker. */}
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

                {(businessImageUploads.length > 0 || uploadingBusinessImages > 0) && (
                  <div className="grid grid-cols-3 gap-2">
                    {businessImageUploads.map((src, i) => (
                      <div key={src} className="relative aspect-square overflow-hidden rounded-xl border border-[#d0d4dc]">
                        <img src={src} alt={`Business photo ${i + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded-full bg-white p-1 shadow"
                          aria-label="Remove photo"
                          onClick={() => setBusinessImageUploads((items) => items.filter((item) => item !== src))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {Array.from({ length: uploadingBusinessImages }).map((_, i) => (
                      <div key={`uploading-${i}`} className="flex aspect-square animate-pulse items-center justify-center rounded-xl bg-[#eef0f3]">
                        <span className="text-[10px] text-[#363636]/60">Uploading…</span>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  onClick={() => setCurrentStep(7)}
                  disabled={!canUploadBusinessImages}
                  className="w-full rounded-full bg-[#256fef] text-white font-semibold hover:bg-[#1f5fe0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadingBusinessImages > 0 ? "Uploading…" : "Next"}
                </Button>

                <input
                  ref={businessImageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleBusinessImageFiles}
                />
              </div>
            )}

            {/* STEP 7 — BUSINESS DOCUMENTS */}
            {currentStep === 7 && !documentsSuccess && (
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
                  <Label htmlFor="pan-number" className="text-sm font-medium text-[#363636]">PAN number*</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="pan-number"
                      value={pan}
                      onChange={(e) => setPan(e.target.value.toUpperCase())}
                      placeholder="ABCDE1234F"
                      maxLength={10}
                      className={cn(
                        "h-11 rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]",
                        panStatus === "submitted" && "border-[#256fef]",
                        panStatus === "invalid" && "border-[#ef4d62]",
                      )}
                    />
                    {panStatus === "submitted" ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[#256fef]">
                        <Clock className="h-4 w-4" /> Submitted for review
                      </span>
                    ) : panStatus === "invalid" ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[#ef4d62]">
                        <AlertCircle className="h-4 w-4" /> Check the format
                      </span>
                    ) : (
                      <Button type="button" variant="outline" className="rounded-full border-[#256fef] text-[#256fef]" onClick={checkPanFormat}>
                        Check
                      </Button>
                    )}
                  </div>
                  {panStatus === "invalid" && (
                    <p className="text-xs text-[#ef4d62]">A PAN is 5 letters, 4 digits, then 1 letter — for example ABCDE1234F.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pan-full-name" className="text-sm font-medium text-[#363636]">Full name as per PAN*</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="pan-full-name"
                      value={panFullName}
                      onChange={(e) => setPanFullName(e.target.value)}
                      placeholder="Name exactly as printed on the PAN card"
                      className={cn(
                        "h-11 rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]",
                        panNameStatus === "invalid" && "border-[#ef4d62]",
                        panNameStatus === "submitted" && "border-[#256fef]",
                      )}
                    />
                    {panNameStatus === "invalid" ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[#ef4d62]">
                        <AlertCircle className="h-4 w-4" /> Check the name
                      </span>
                    ) : panNameStatus === "submitted" ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[#256fef]">
                        <Clock className="h-4 w-4" /> Submitted for review
                      </span>
                    ) : (
                      <Button type="button" variant="outline" className="rounded-full border-[#256fef] text-[#256fef]" onClick={checkPanName}>
                        Check
                      </Button>
                    )}
                  </div>
                  {panNameStatus === "invalid" && (
                    <p className="text-xs text-[#ef4d62]">Enter the name exactly as shown on your PAN card.</p>
                  )}
                </div>

                {/* Says out loud what actually happens to these documents.
                    The form previously rendered a green "Verified" tick from a
                    regex and a 1.2s timer, which is the app vouching for a
                    document nobody had looked at. */}
                <div className="flex items-start gap-2 rounded-2xl border border-[#d0d4dc] bg-[#f5f5f5] p-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#256fef]" />
                  <p className="text-xs leading-5 text-[#363636]">
                    Cosora checks the format here and queues your documents for review. A member of our team verifies them
                    against your uploads, usually within 24–48 hours, and your profile is marked verified once that is done.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pan-address" className="text-sm font-medium text-[#363636]">Full address of your registered business*</Label>
                  <Input
                    id="pan-address"
                    value={panAddress}
                    onChange={(e) => setPanAddress(e.target.value)}
                    className="h-11 rounded-xl border-[#d0d4dc] focus-visible:border-[#256fef] focus-visible:ring-[#256fef]"
                  />
                </div>

                <div className="space-y-3 rounded-2xl border border-[#d0d4dc] p-4">
                  <button
                    type="button"
                    disabled={uploadingPanDocument}
                    className="block w-full rounded-2xl border-2 border-dashed border-[#d0d4dc] bg-[#f5f5f5] px-4 py-10 text-center disabled:opacity-60"
                    onClick={() => panDocumentInputRef.current?.click()}
                  >
                    <UploadIcon className="mx-auto h-10 w-10 text-[#256fef]" />
                    <p className="mt-3 font-semibold text-[#256fef]">
                      {uploadingPanDocument ? "Uploading…" : panDocumentUrl ? "Replace your PAN" : "Upload your PAN"}
                    </p>
                    <p className="mt-1 text-xs text-[#363636]/70">jpeg, png or pdf formats up to 5MB</p>
                  </button>
                  <button type="button" className="text-sm text-[#256fef] underline" onClick={() => setPanGuidelinesOpen(true)}>
                    Guidelines to upload PAN
                  </button>
                  {/* One document, one row. The old grid rendered every pick as
                      an <img> — which paints a broken-image glyph for the PDF
                      the copy above invites — and none of them were uploaded
                      anywhere, so vendor_documents.file_url was always null. */}
                  {panDocumentUrl && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#d0d4dc] bg-white px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#256fef]/10">
                          <FileText className="h-4 w-4 text-[#256fef]" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-[#363636]">{panDocumentName || "PAN document"}</p>
                          <p className="text-[10px] text-[#363636]/60">Uploaded · awaiting review</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove PAN document"
                        className="shrink-0 rounded-full p-1 text-[#363636]/60 hover:bg-[#f5f5f5]"
                        onClick={() => { setPanDocumentUrl(null); setPanDocumentName(""); }}
                      >
                        <X className="h-4 w-4" />
                      </button>
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
                  onClick={() => setDocumentsSuccess(true)}
                  disabled={!canSubmitPanDocuments}
                  className="w-full rounded-full bg-[#256fef] text-white font-semibold hover:bg-[#1f5fe0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </Button>

                {/* "Vendor ID: 21935326" was here — a constant, the same for
                    every vendor, and not any id this system issues. */}

                <input
                  ref={panDocumentInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handlePanDocumentFile}
                />
              </div>
            )}
            {currentStep === 7 && documentsSuccess && (
              <BusinessInfoSuccessScreen text="Business documents added" onContinue={() => { setDocumentsSuccess(false); setCurrentStep(8); }} />
            )}

            {/* STEP 8 — FIRST PRODUCT */}
            {currentStep === 8 && !productSuccess && (
              <div className="space-y-5">
                <h2 className="text-2xl font-bold">Add your first product</h2>
                <div className="space-y-2">
                  <Label>Product Images (up to {MAX_PRODUCT_IMAGES})</Label>
                  <label
                    className={cn(
                      "block rounded-xl border-2 border-dashed border-[#d0d4dc] bg-[#f5f5f5] p-6 text-center hover:bg-[#eef0f3]",
                      productImages.length >= MAX_PRODUCT_IMAGES || uploadingProductImages > 0
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer",
                    )}
                  >
                    <UploadIcon className="w-6 h-6 mx-auto text-[#363636] mb-2" />
                    <p className="text-sm">
                      {uploadingProductImages > 0
                        ? "Uploading…"
                        : productImages.length >= MAX_PRODUCT_IMAGES
                          ? `${MAX_PRODUCT_IMAGES} images added`
                          : "Click to upload"}
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={productImages.length >= MAX_PRODUCT_IMAGES || uploadingProductImages > 0}
                      onChange={handleProductImageFiles}
                    />
                  </label>
                  {(productImages.length > 0 || uploadingProductImages > 0) && (
                    <div className="grid grid-cols-3 gap-2">
                      {productImages.map((src, i) => (
                        /* The "Remove BG" / "Crop" / "Rotate" buttons that used
                           to live in this overlay had no handlers at all — three
                           icons that did nothing on hover. Remove is the one
                           action that was real, so it is the one that stayed. */
                        <div key={src} className="relative aspect-square rounded-lg overflow-hidden border group">
                          <img src={src} alt={`Product image ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            aria-label="Remove image"
                            onClick={() => setProductImages((items) => items.filter((item) => item !== src))}
                            className="absolute right-1 top-1 rounded-full bg-white p-1.5 shadow"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {Array.from({ length: uploadingProductImages }).map((_, i) => (
                        <div key={`puploading-${i}`} className="flex aspect-square animate-pulse items-center justify-center rounded-lg bg-[#eef0f3]">
                          <span className="text-[10px] text-[#363636]/60">Uploading…</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2"><Label htmlFor="product-name">Product / Service Name</Label><Input id="product-name" value={productName} onChange={(e) => setProductName(e.target.value)} /></div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2 col-span-2"><Label htmlFor="product-price">Price</Label><Input id="product-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={unit} onValueChange={setUnit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label htmlFor="product-moq">MOQ (Minimum Order Qty)</Label><Input id="product-moq" type="number" value={moq} onChange={(e) => setMoq(e.target.value)} /></div>
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
                  <div className="space-y-2"><Label htmlFor="product-gsm">GSM</Label><Input id="product-gsm" value={gsm} onChange={(e) => setGsm(e.target.value)} /></div>
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
                  {/* `products.colour` is a single text column across this
                      codebase (Upload.tsx truncates the same way and warns the
                      same way). Say so rather than accepting four picks and
                      quietly storing one. */}
                  {selectedColors.length > 1 && (
                    <p className="text-xs text-[#363636]/70">
                      A listing carries one colour, so <span className="font-semibold">{selectedColors[0]}</span> will be saved.
                      Add the others as separate listings from your catalogue later.
                    </p>
                  )}
                </div>
                <Button
                  onClick={goNext}
                  disabled={uploadingProductImages > 0}
                  className="w-full bg-[#256fef] text-white rounded-full font-semibold hover:bg-[#1f5fe0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Submit
                </Button>
              </div>
            )}
            {currentStep === 8 && productSuccess && (
              <SuccessScreen
                text="Product details uploaded"
                onContinue={() => {
                  setProductSuccess(false);
                  setContractStage("overview");
                  setManualSignatureDataUrl(null);
                  setSignatureDrawerOpen(false);
                  setCurrentStep(9);
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* The OTP dialog stood here. It asked for a code nothing had sent
            and accepted any six digits — see the phone field in step 2. */}

        {/* Nav */}
        {currentStep > 4 && currentStep < TOTAL_STEPS && !documentsSuccess && !productSuccess && (
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
      <h3 className="text-2xl font-bold mb-1">{text} ✓</h3>
      <p className="text-sm text-[#363636]">Continuing...</p>
    </div>
  );
}
