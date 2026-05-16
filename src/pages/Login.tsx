import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, ArrowRight, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const languages = [
  "English", "Hindi", "Bengali", "Assamese", "Marathi", "Gujarati",
  "Tamil", "Telugu", "Kannada", "Malayalam", "Punjabi", "Odia",
  "Urdu", "Rajasthani/Marwari", "Bhojpuri",
];

const countryCodes = [
  { flag: "🇮🇳", code: "+91", name: "India" },
  { flag: "🇺🇸", code: "+1", name: "USA" },
  { flag: "🇬🇧", code: "+44", name: "UK" },
  { flag: "🇦🇪", code: "+971", name: "UAE" },
  { flag: "🇧🇩", code: "+880", name: "Bangladesh" },
  { flag: "🇱🇰", code: "+94", name: "Sri Lanka" },
  { flag: "🇳🇵", code: "+977", name: "Nepal" },
  { flag: "🇸🇬", code: "+65", name: "Singapore" },
  { flag: "🇩🇪", code: "+49", name: "Germany" },
  { flag: "🇨🇳", code: "+86", name: "China" },
];

const Login = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [selectedLang, setSelectedLang] = useState("English");
  const [selectedCountry, setSelectedCountry] = useState(countryCodes[0]);

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/auth/otp-verify", {
      state: { phone, countryCode: selectedCountry.code, flag: selectedCountry.flag },
    });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPhone(value);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-foreground flex-col justify-between p-12 relative overflow-hidden">
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
          <Link to="/">
            <span className="font-logo text-2xl font-bold italic uppercase tracking-[-0.08em] text-background">Cosora</span>
          </Link>
        </div>

        <div className="relative z-10 space-y-4">
          <h2 className="text-4xl font-bold italic text-background leading-tight">
            Welcome back.
          </h2>
          <p className="text-background/60 text-lg max-w-xs">
            India's leading B2B fashion marketplace. Source smarter, scale faster.
          </p>
        </div>

        <p className="relative z-10 text-background/30 text-xs">
          Trusted by 10,000+ brands & manufacturers
        </p>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex flex-col p-6 sm:p-10 lg:p-16 overflow-y-auto">
        {/* Top bar: mobile logo + language selector */}
        <div className="flex items-center justify-between mb-8">
          <div className="lg:hidden">
            <Link to="/">
              <span className="font-logo text-2xl font-bold italic uppercase tracking-[-0.08em] text-foreground">Cosora</span>
            </Link>
          </div>
          <div className="lg:block hidden" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <Globe className="h-4 w-4" />
                <span className="text-xs">{selectedLang}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
              {languages.map((lang) => (
                <DropdownMenuItem
                  key={lang}
                  onClick={() => setSelectedLang(lang)}
                  className={lang === selectedLang ? "bg-accent/10 text-accent" : ""}
                >
                  {lang}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <div className="w-full max-w-md mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Sign in</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your phone number to continue
                </p>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">
                {/* Phone input with country code */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Phone Number</label>
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          type="button"
                          className="h-11 px-3 gap-1 shrink-0 min-w-[90px]"
                        >
                          <span className="text-base">{selectedCountry.flag}</span>
                          <span className="text-sm">{selectedCountry.code}</span>
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                        {countryCodes.map((c) => (
                          <DropdownMenuItem
                            key={c.code}
                            onClick={() => setSelectedCountry(c)}
                            className="gap-2"
                          >
                            <span>{c.flag}</span>
                            <span>{c.name}</span>
                            <span className="text-muted-foreground ml-auto">{c.code}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Input
                      type="tel"
                      inputMode="numeric"
                      placeholder="Enter phone number"
                      value={phone}
                      onChange={handlePhoneChange}
                      className="h-11 flex-1"
                      autoFocus
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={phone.length < 10}
                  className="w-full h-11 gap-2 text-base bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  Send OTP <ArrowRight className="h-4 w-4" />
                </Button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">Or continue with</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Google Sign-in */}
              <Button
                variant="outline"
                className="w-full h-11 gap-2.5 text-sm font-medium"
                onClick={() => navigate("/browse")}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </Button>

              {/* Explore as Guest */}
              <div className="text-center">
                <button
                  onClick={() => navigate("/browse")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Explore as Guest →
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
