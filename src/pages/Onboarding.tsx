import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, MessageCircle, MapPin, Upload as UploadIcon,
  CheckCircle2, Circle, Building2, FileText, Package, FileSignature,
  Rocket, X, Crop, RotateCw, Eraser, Info,
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CategorySelector } from "@/components/upload/CategorySelector";
import { toast } from "sonner";

const TOTAL_STEPS = 8;

const FABRICS = ["Cotton", "Linen", "Silk", "Polyester", "Wool", "Denim", "Rayon", "Blend"];
const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Free Size"];
const COLORS = ["Black", "White", "Red", "Blue", "Green", "Yellow", "Pink", "Beige", "Navy", "Grey"];
const UNITS = ["pieces", "kg", "meters", "sets", "pairs"];

export default function Onboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 2
  const [businessName, setBusinessName] = useState("");
  const [mobile, setMobile] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);
  const [sameContact, setSameContact] = useState(true);
  const [hasWebsite, setHasWebsite] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Step 3
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [landmark, setLandmark] = useState("");
  const [pincode, setPincode] = useState("");

  // Step 4
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [country, setCountry] = useState("IN");
  const [step4Success, setStep4Success] = useState(false);

  // Step 5
  const [businessImages, setBusinessImages] = useState<string[]>([]);

  // Step 6
  const [pan, setPan] = useState("");
  const [panStatus, setPanStatus] = useState<"idle" | "verifying" | "success" | "fail">("idle");
  const [cin, setCin] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [hasGstin, setHasGstin] = useState(false);
  const [gstin, setGstin] = useState("");
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
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (ownerName && !signature) setSignature(ownerName);
  }, [ownerName, signature]);

  useEffect(() => {
    if (showWelcome) {
      const t = setTimeout(() => navigate("/seller-home"), 3500);
      return () => clearTimeout(t);
    }
  }, [showWelcome, navigate]);

  const sendOtp = () => {
    if (!mobile || mobile.length < 10) return toast.error("Enter valid mobile");
    setOtpSent(true);
    toast.success("OTP sent");
  };
  const verifyOtp = () => {
    if (otp.length === 6) { setOtpVerified(true); toast.success("Mobile verified"); }
  };

  const verifyPan = () => {
    if (!pan || pan.length < 10) return setPanStatus("fail");
    setPanStatus("verifying");
    setTimeout(() => setPanStatus(/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase()) ? "success" : "fail"), 1200);
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

  const checklist = [
    { label: "Business Info", icon: Building2, done: currentStep > 4 },
    { label: "Documents", icon: FileText, done: currentStep > 6 },
    { label: "Products", icon: Package, done: currentStep > 7 },
    { label: "Contract", icon: FileSignature, done: currentStep > 8 },
    { label: "Go Live", icon: Rocket, done: false },
  ];

  if (showWelcome) {
    return (
      <div className="fixed inset-0 bg-accent text-accent-foreground flex flex-col items-center justify-center overflow-hidden z-50">
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
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-center px-6 z-10">
          <div className="font-display text-5xl font-bold mb-4">Cosora</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">The Good Times Start Now.</h1>
          <p className="text-xl">Welcome to Cosora 🎉</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Progress */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button onClick={goPrev} disabled={currentStep === 1} className="text-sm text-muted-foreground disabled:opacity-30 flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-sm font-medium">Step {currentStep} of {TOTAL_STEPS}</span>
          </div>
          <Progress value={(currentStep / TOTAL_STEPS) * 100} className="h-2 [&>div]:bg-accent" />
        </div>
      </div>

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
                <div>
                  <h1 className="font-display text-2xl font-bold mb-1">Welcome! Let's set up your business</h1>
                  <p className="text-muted-foreground text-sm">Complete these steps to start selling on Cosora</p>
                </div>
                <div className="space-y-3">
                  {checklist.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div key={i} className={cn("flex items-center gap-3 p-4 rounded-xl border bg-card", item.done && "border-accent/30 bg-accent/5")}>
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", item.done ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                          {item.done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                          <p className={cn("font-medium", item.done ? "text-accent" : "text-foreground")}>{item.label}</p>
                        </div>
                        {item.done && <Badge variant="secondary" className="bg-accent/10 text-accent">Done</Badge>}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <button className="text-sm text-accent underline">Edit Details</button>
                  <Button onClick={goNext} className="bg-accent text-accent-foreground hover:bg-accent/90">Continue</Button>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {currentStep === 2 && (
              <div className="space-y-5">
                <h2 className="font-display text-2xl font-bold">Business Details</h2>
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Enter business name" />
                </div>
                <div className="space-y-2">
                  <Label>Mobile Number</Label>
                  <div className="flex gap-2">
                    <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 XXXXXXXXXX" disabled={otpVerified} />
                    {!otpVerified && <Button type="button" variant="outline" onClick={sendOtp}>{otpSent ? "Resend" : "Verify"}</Button>}
                    {otpVerified && <Badge className="bg-accent/10 text-accent self-center">Verified ✓</Badge>}
                  </div>
                  {otpSent && !otpVerified && (
                    <div className="flex items-center gap-2 pt-2">
                      <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                        <InputOTPGroup>
                          {[0,1,2,3,4,5].map((i) => <InputOTPSlot key={i} index={i} />)}
                        </InputOTPGroup>
                      </InputOTP>
                      <Button size="sm" onClick={verifyOtp}>Confirm</Button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="wa" checked={whatsappOptIn} onCheckedChange={(v) => setWhatsappOptIn(!!v)} />
                  <Label htmlFor="wa" className="cursor-pointer">Get business updates on WhatsApp</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="same" checked={sameContact} onCheckedChange={(v) => setSameContact(!!v)} />
                  <Label htmlFor="same" className="cursor-pointer">Primary contact same as above</Label>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Do you have a website?</Label>
                    <Switch checked={hasWebsite} onCheckedChange={setHasWebsite} />
                  </div>
                  {hasWebsite && <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://yourwebsite.com" />}
                </div>
                <Button onClick={goNext} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Continue</Button>
              </div>
            )}

            {/* STEP 3 */}
            {currentStep === 3 && (
              <div className="space-y-5">
                <h2 className="font-display text-2xl font-bold">Business Address</h2>
                <div className="relative rounded-xl bg-muted h-40 flex items-center justify-center overflow-hidden">
                  <MapPin className="w-10 h-10 text-muted-foreground" />
                  <Button size="sm" className="absolute bottom-3 bg-accent text-accent-foreground hover:bg-accent/90">Mark your business location</Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Building no. (optional)</Label><Input value={building} onChange={(e) => setBuilding(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Floor/Tower (optional)</Label><Input value={floor} onChange={(e) => setFloor(e.target.value)} /></div>
                  <div className="space-y-2 col-span-2"><Label>Area / Locality *</Label><Input value={area} onChange={(e) => setArea(e.target.value)} required /></div>
                  <div className="space-y-2"><Label>City *</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Pincode *</Label><Input value={pincode} onChange={(e) => setPincode(e.target.value)} /></div>
                  <div className="space-y-2 col-span-2"><Label>Landmark (optional)</Label><Input value={landmark} onChange={(e) => setLandmark(e.target.value)} /></div>
                </div>
                <p className="text-xs text-muted-foreground italic">Please ensure this address matches your license</p>
                <Button onClick={goNext} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Continue</Button>
              </div>
            )}

            {/* STEP 4 */}
            {currentStep === 4 && !step4Success && (
              <div className="space-y-5">
                <h2 className="font-display text-2xl font-bold">Owner Details</h2>
                <div className="space-y-2"><Label>Full Name</Label><Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} /></div>
                <div className="space-y-2"><Label>Email Address</Label><Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} /></div>
                <div className="space-y-2">
                  <Label>Registered Country</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN">India</SelectItem>
                      <SelectItem value="US">United States</SelectItem>
                      <SelectItem value="UK">United Kingdom</SelectItem>
                      <SelectItem value="AE">United Arab Emirates</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={goNext} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Submit</Button>
              </div>
            )}
            {currentStep === 4 && step4Success && (
              <SuccessScreen text="Business information added" onContinue={() => { setStep4Success(false); setCurrentStep(5); }} />
            )}

            {/* STEP 5 */}
            {currentStep === 5 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-2xl font-bold">Business Images</h2>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm"><Info className="w-4 h-4 mr-1" />Guidelines</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Image Guidelines</DialogTitle></DialogHeader>
                      <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                        <li>Show a clear entrance of your business</li>
                        <li>Upload HD images only</li>
                        <li>No humans in the frame</li>
                        <li>No blurry or low-light images</li>
                      </ul>
                    </DialogContent>
                  </Dialog>
                </div>
                <p className="text-sm text-muted-foreground">Upload at least one entrance image of your business</p>
                <label className="block rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-center cursor-pointer hover:bg-muted/50">
                  <UploadIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Click to upload or drag &amp; drop</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickImages(e, setBusinessImages, businessImages, 6)} />
                </label>
                {businessImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {businessImages.map((src, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => setBusinessImages(businessImages.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-background/90 rounded-full p-1">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button onClick={goNext} disabled={businessImages.length === 0} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Continue</Button>
              </div>
            )}

            {/* STEP 6 */}
            {currentStep === 6 && !step6Success && (
              <div className="space-y-5">
                <h2 className="font-display text-2xl font-bold">Business Documents</h2>
                <div className="space-y-2">
                  <Label>PAN Number</Label>
                  <div className="flex gap-2">
                    <Input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
                    <Button type="button" variant="outline" onClick={verifyPan} disabled={panStatus === "verifying"}>
                      {panStatus === "verifying" ? "Verifying..." : "Verify"}
                    </Button>
                  </div>
                  {panStatus === "success" && <p className="text-sm text-accent">Verified ✓</p>}
                  {panStatus === "fail" && <p className="text-sm text-destructive">Verification failed: invalid PAN format</p>}
                </div>
                <div className="space-y-2"><Label>CIN Number</Label><Input value={cin} onChange={(e) => setCin(e.target.value)} /></div>
                <div className="space-y-2"><Label>Aadhaar Number</Label><Input value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} placeholder="XXXX XXXX XXXX" /></div>
                <div className="flex items-center justify-between">
                  <Label>Do you have GSTIN?</Label>
                  <Switch checked={hasGstin} onCheckedChange={setHasGstin} />
                </div>
                {hasGstin && <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="GSTIN Number" />}
                <div className="space-y-2">
                  <Label>Upload PAN card scan</Label>
                  <Input type="file" accept="image/*,application/pdf" />
                </div>
                {hasGstin && (
                  <div className="space-y-2">
                    <Label>Upload GST certificate</Label>
                    <Input type="file" accept="image/*,application/pdf" />
                  </div>
                )}
                <Button onClick={goNext} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Submit</Button>
              </div>
            )}
            {currentStep === 6 && step6Success && (
              <SuccessScreen text="Business documents added" onContinue={() => { setStep6Success(false); setCurrentStep(7); }} />
            )}

            {/* STEP 7 */}
            {currentStep === 7 && !step7Success && (
              <div className="space-y-5">
                <h2 className="font-display text-2xl font-bold">Add your first product</h2>
                <div className="space-y-2">
                  <Label>Product Images (up to 6)</Label>
                  <label className="block rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 text-center cursor-pointer hover:bg-muted/50">
                    <UploadIcon className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
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
                      <button key={s} onClick={() => toggleChip(s, selectedSizes, setSelectedSizes)} className={cn("px-3 py-1.5 rounded-full text-sm border", selectedSizes.includes(s) ? "bg-accent text-accent-foreground border-accent" : "bg-card hover:bg-accent/10")}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Colors</Label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map((c) => (
                      <button key={c} onClick={() => toggleChip(c, selectedColors, setSelectedColors)} className={cn("px-3 py-1.5 rounded-full text-sm border", selectedColors.includes(c) ? "bg-accent text-accent-foreground border-accent" : "bg-card hover:bg-accent/10")}>{c}</button>
                    ))}
                  </div>
                </div>
                <Button onClick={goNext} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Submit</Button>
              </div>
            )}
            {currentStep === 7 && step7Success && (
              <SuccessScreen text="Product details uploaded" onContinue={() => { setStep7Success(false); setCurrentStep(8); }} />
            )}

            {/* STEP 8 */}
            {currentStep === 8 && (
              <div className="space-y-5">
                <h2 className="font-display text-2xl font-bold">Partner Contract</h2>
                <div className="rounded-xl border bg-card p-6 text-center">
                  <p className="text-xs uppercase text-muted-foreground mb-2">E-Signature</p>
                  {!editingSig ? (
                    <p className="font-display italic text-3xl text-accent">{signature || "Your signature"}</p>
                  ) : (
                    <Input value={signature} onChange={(e) => setSignature(e.target.value)} className="text-center font-display italic text-2xl" autoFocus onBlur={() => setEditingSig(false)} />
                  )}
                  <button onClick={() => setEditingSig(true)} className="text-xs text-accent underline mt-2">Change Signature</button>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4 max-h-56 overflow-y-auto text-xs text-muted-foreground space-y-2">
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
                <Button onClick={submitContract} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Submit</Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Nav */}
        {currentStep > 1 && currentStep < TOTAL_STEPS && !step4Success && !step6Success && !step7Success && (
          <div className="flex items-center justify-between mt-8">
            <Button variant="outline" onClick={goPrev}><ArrowLeft className="w-4 h-4 mr-1" /> Previous</Button>
            <Button variant="ghost" onClick={goNext}>Skip <ArrowRight className="w-4 h-4 ml-1" /></Button>
          </div>
        )}
      </div>

      {/* WhatsApp FAB */}
      <a
        href="https://wa.me/919999999999"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-50"
        aria-label="WhatsApp support"
      >
        <MessageCircle className="w-6 h-6" />
      </a>
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
        className="w-20 h-20 rounded-full bg-accent/15 flex items-center justify-center mb-4"
      >
        <CheckCircle2 className="w-12 h-12 text-accent" />
      </motion.div>
      <h3 className="font-display text-2xl font-bold mb-1">{text} ✓</h3>
      <p className="text-sm text-muted-foreground">Continuing...</p>
    </div>
  );
}
