import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Building2, ShoppingBag, Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import CosoraLogo from "@/components/CosoraLogo";
import { signupMetadata } from "@/lib/queries/signupProfile";
import { COUNTRY_CODES, PHONE_DIGITS, cleanPhoneDigits, toE164 } from "@/lib/auth/phone";
import { sendOtp } from "@/lib/auth/otp";
import type { OtpVerifyState } from "@/pages/OtpVerify";

type Role = "buyer" | "seller";

const Register = () => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<Role>("buyer");
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countryIndex, setCountryIndex] = useState(0);
  const [form, setForm] = useState({
    fullName: "",
    brandName: "",
    phone: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.name === "phone" ? cleanPhoneDigits(e.target.value) : e.target.value;
    setForm({ ...form, [e.target.name]: value });
    setError(null);
  };

  /**
   * Step 1 is the role, step 2 is the details, and BOTH roles go through both.
   * The account is created by mobile number + OTP, the same path as sign-in.
   *
   * Picking "Seller" used to skip step 2 entirely and jump straight to /seller,
   * so a seller never supplied their details — they were not signing up at all.
   *
   * Email + password signup (auth.signUp + a "confirm your email" screen) was
   * removed when mobile + OTP was restored as the primary path. The metadata
   * is unchanged: handle_new_user() applies active_role/full_name/phone from
   * it, and applyPendingSignupProfile() moves brand_name once the code screen
   * has a session.
   */
  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) { setStep(2); return; }
    if (submitting || form.phone.length < PHONE_DIGITS) return;

    setSubmitting(true);
    setError(null);

    const country = COUNTRY_CODES[countryIndex];
    const e164 = toE164(country.code, form.phone);
    const data = signupMetadata({
      fullName: form.fullName.trim(),
      phone: e164,
      brandName: form.brandName.trim(),
      role: selectedRole,
    });

    const delivery = await sendOtp(e164, { signupData: data });
    setSubmitting(false);

    // "sent" and "not_live" both continue: the code screen says which one it
    // was. Only a plain failure stays here.
    if (delivery.status === "error") { setError(delivery.message); return; }

    const state: OtpVerifyState = {
      phone: form.phone,
      countryCode: country.code,
      e164,
      delivery,
      signup: { role: selectedRole, data },
    };
    navigate("/auth/otp-verify", { state });
  };

  const buyerBenefits = ["Browse 50,000+ manufacturers", "Post unlimited RFQs", "Get quotes in 24 hours", "Verified supplier network"];
  const sellerBenefits = ["List unlimited products", "Get matched with buyers", "Manage quotes & leads", "Analytics dashboard"];
  const benefits = selectedRole === "buyer" ? buyerBenefits : sellerBenefits;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-foreground flex-col justify-between p-12 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-background"
              style={{
                width: `${200 + i * 120}px`,
                height: `${200 + i * 120}px`,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>

        <div className="relative z-10">
          <Link to="/" className="inline-block">
            <CosoraLogo height={26} variant="white" />
          </Link>
        </div>

        <div className="relative z-10 space-y-6">
          <div>
            <h2 className="text-4xl font-bold italic text-background leading-tight mb-3">
              {selectedRole === "buyer"
                ? "Source smarter, scale faster."
                : "Reach thousands of buyers."}
            </h2>
            <p className="text-background/60 text-lg">
              {selectedRole === "buyer"
                ? "The B2B fashion marketplace connecting clothing brands with top manufacturers."
                : "List your products and get discovered by premium clothing brands globally."}
            </p>
          </div>

          <div className="space-y-3">
            {benefits.map((b, i) => (
              <motion.div
                key={b}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent">
                  <Check className="h-3.5 w-3.5 text-accent-foreground" />
                </div>
                <span className="text-background/80 text-sm">{b}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-background/40 text-xs">
            Trusted by 10,000+ brands & manufacturers worldwide
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex flex-col justify-center p-6 sm:p-10 lg:p-16 overflow-y-auto">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8">
          <Link to="/">
            <CosoraLogo height={26} />
          </Link>
        </div>

        <div className="w-full max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                Create your account
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/auth/login" className="font-medium text-accent hover:underline">
                  Sign in
                </Link>
              </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2">
              {[1, 2].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                      step >= s
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {step > s ? <Check className="h-3.5 w-3.5" /> : s}
                  </div>
                  <span className={cn("text-xs", step >= s ? "text-foreground font-medium" : "text-muted-foreground")}>
                    {s === 1 ? "Your role" : "Your details"}
                  </span>
                  {s < 2 && <div className={cn("h-px w-8 transition-all", step > s ? "bg-accent" : "bg-border")} />}
                </div>
              ))}
            </div>

            <form onSubmit={handleNext} className="space-y-5">
              {step === 1 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div>
                    <Label className="text-sm font-medium text-foreground mb-3 block">
                      I am joining as a...
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Buyer card */}
                      <button
                        type="button"
                        onClick={() => setSelectedRole("buyer")}
                        className={cn(
                          "relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 text-center transition-all duration-200",
                          selectedRole === "buyer"
                            ? "border-accent bg-accent/5"
                            : "border-border bg-card hover:border-accent/40"
                        )}
                      >
                        {selectedRole === "buyer" && (
                          <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-accent flex items-center justify-center">
                            <Check className="h-3 w-3 text-accent-foreground" />
                          </div>
                        )}
                        <div className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
                          selectedRole === "buyer" ? "bg-accent/20" : "bg-muted"
                        )}>
                          <ShoppingBag className={cn("h-6 w-6", selectedRole === "buyer" ? "text-accent" : "text-muted-foreground")} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">Buyer</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Clothing Brand / Retailer</p>
                        </div>
                      </button>

                      {/* Seller card */}
                      <button
                        type="button"
                        onClick={() => setSelectedRole("seller")}
                        className={cn(
                          "relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 text-center transition-all duration-200",
                          selectedRole === "seller"
                            ? "border-accent bg-accent/5"
                            : "border-border bg-card hover:border-accent/40"
                        )}
                      >
                        {selectedRole === "seller" && (
                          <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-accent flex items-center justify-center">
                            <Check className="h-3 w-3 text-accent-foreground" />
                          </div>
                        )}
                        <div className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
                          selectedRole === "seller" ? "bg-accent/20" : "bg-muted"
                        )}>
                          <Building2 className={cn("h-6 w-6", selectedRole === "seller" ? "text-accent" : "text-muted-foreground")} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">Seller</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Manufacturer / Supplier</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <Button type="submit" variant="gold" className="w-full gap-2">
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
                      <Input
                        id="fullName"
                        name="fullName"
                        placeholder="John Doe"
                        value={form.fullName}
                        onChange={handleChange}
                        required
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brandName" className="text-sm font-medium">
                        {selectedRole === "buyer" ? "Brand Name" : "Company Name"}
                      </Label>
                      <Input
                        id="brandName"
                        name="brandName"
                        placeholder={selectedRole === "buyer" ? "My Brand" : "My Factory"}
                        value={form.brandName}
                        onChange={handleChange}
                        required
                        className="h-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-sm font-medium">Mobile Number</Label>
                    <div className="flex gap-2">
                      <select
                        aria-label="Country code"
                        value={countryIndex}
                        onChange={(e) => setCountryIndex(Number(e.target.value))}
                        className="h-10 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {COUNTRY_CODES.map((c, i) => (
                          <option key={c.name + i} value={i}>{c.flag} {c.code}</option>
                        ))}
                      </select>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="Phone Number"
                        value={form.phone}
                        onChange={handleChange}
                        required
                        className="h-10"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">We'll verify this number with a one-time code.</p>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    By creating an account, you agree to our{" "}
                    <a href="#" className="text-accent hover:underline">Terms of Service</a>
                    {" "}and{" "}
                    <a href="#" className="text-accent hover:underline">Privacy Policy</a>.
                  </p>

                  {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <p className="text-xs text-foreground">{error}</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={submitting}
                      onClick={() => setStep(1)}
                    >
                      Back
                    </Button>
                    <Button type="submit" variant="gold" className="flex-1 gap-2" disabled={submitting || form.phone.length < PHONE_DIGITS}>
                      {submitting
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                        : <>Send Code <ArrowRight className="h-4 w-4" /></>}
                    </Button>
                  </div>
                </motion.div>
              )}
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Register;
