import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight, Building2, ShoppingBag, Check, Loader2, MailCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/contexts/UserRoleContext";
import CosoraLogo from "@/components/CosoraLogo";
import { supabase } from "@/lib/supabase";
import { signupMetadata, applyPendingSignupProfile } from "@/lib/queries/signupProfile";

type Role = "buyer" | "seller";

/**
 * Turn a Supabase auth error into something a person can act on.
 *
 * The previous version of this page made zero network calls, so none of these
 * cases could arise and none were handled. They are the ordinary ones.
 */
function describeSignUpError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (m.includes("password")) {
    return "That password is too weak. Use at least 8 characters.";
  }
  if (m.includes("rate limit")) {
    return "Too many sign-up attempts right now. Please try again in a few minutes.";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "That email address wasn't accepted. Check it for typos.";
  }
  return message;
}

const Register = () => {
  const navigate = useNavigate();
  const { setRole } = useUserRole();
  const [selectedRole, setSelectedRole] = useState<Role>("buyer");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the account was created but needs an email confirmation first. */
  const [confirmSent, setConfirmSent] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    brandName: "",
    email: "",
    phone: "",
    password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  /**
   * Step 1 is the role, step 2 is the details, and BOTH roles go through both.
   *
   * Picking "Seller" used to skip step 2 entirely and jump straight to /seller,
   * so a seller never supplied a name, an email or a password — they were not
   * signing up at all, they were being shown the seller landing page.
   */
  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) { setStep(2); return; }
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    const meta = signupMetadata({
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      brandName: form.brandName.trim(),
      role: selectedRole,
    });

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: meta, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (signUpError) {
      setSubmitting(false);
      setError(describeSignUpError(signUpError.message));
      return;
    }

    // No session means email confirmation is switched on: the account exists
    // but cannot be used yet. Routing to a dashboard here would land the user
    // on a page that immediately bounces them back to sign-in.
    if (!data.session) {
      setSubmitting(false);
      setConfirmSent(form.email.trim());
      return;
    }

    // Confirmation is off — we have a session, so finish the profile now.
    // active_role was already applied by handle_new_user() from the metadata.
    if (data.user) await applyPendingSignupProfile(data.user);
    setRole(selectedRole);
    setSubmitting(false);
    navigate(selectedRole === "buyer" ? "/home/new-arrivals" : "/onboarding");
  };

  // Email confirmation is ON for this project, so this is the real end of the
  // signup flow for most users. Saying "check your email" is the honest
  // outcome; routing to a dashboard they cannot load is not.
  if (confirmSent) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 flex justify-center"><CosoraLogo height={26} /></div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
            <MailCheck className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Confirm your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We've sent a confirmation link to <span className="font-medium text-foreground">{confirmSent}</span>.
            Open it to activate your account — you'll come straight back here signed in.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Nothing in your inbox? Check spam, or{" "}
            <button
              onClick={() => { setConfirmSent(null); setStep(2); }}
              className="font-medium text-accent hover:underline"
            >
              try a different address
            </button>.
          </p>
          <Button variant="outline" className="mt-6 w-full" onClick={() => navigate("/auth/login")}>
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

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
                    <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={handleChange}
                      required
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={form.phone}
                      onChange={handleChange}
                      required
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Min. 8 characters"
                        value={form.password}
                        onChange={handleChange}
                        required
                        minLength={8}
                        className="h-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
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
                    <Button type="submit" variant="gold" className="flex-1 gap-2" disabled={submitting}>
                      {submitting
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                        : <>Create Account <ArrowRight className="h-4 w-4" /></>}
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
