import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, ChevronDown, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CosoraLogo from "@/components/CosoraLogo";
import { useAuth } from "@/contexts/AuthContext";
import { useLang, setLang, langCodeFromName } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const LANGUAGES = [
  "English", "Hindi", "Bengali", "Assamese", "Marathi", "Gujarati",
  "Tamil", "Telugu", "Kannada", "Malayalam", "Punjabi", "Odia",
  "Urdu", "Rajasthani/Marwari", "Bhojpuri",
];

const COUNTRY_CODES = [
  { flag: "🇮🇳", code: "+91",  name: "India" },
  { flag: "🇨🇳", code: "+86",  name: "China" },
  { flag: "🇹🇼", code: "+886", name: "Taiwan" },
  { flag: "🇯🇵", code: "+81",  name: "Japan" },
  { flag: "🇺🇸", code: "+1",   name: "United States" },
  { flag: "🇭🇰", code: "+852", name: "Hong Kong" },
  { flag: "🇦🇺", code: "+61",  name: "Australia" },
  { flag: "🇨🇦", code: "+1",   name: "Canada" },
  { flag: "🇻🇳", code: "+84",  name: "Vietnam" },
  { flag: "🇬🇧", code: "+44",  name: "United Kingdom" },
  { flag: "🇹🇭", code: "+66",  name: "Thailand" },
  { flag: "🇦🇷", code: "+54",  name: "Argentina" },
];

// Mock "already registered" phone numbers — in a real app this is an API call
const REGISTERED_PHONES = new Set(["9876543210", "9000000001"]);

// ─────────────────────────────────────────────────────────────
// LANGUAGE SELECTOR MODAL
// ─────────────────────────────────────────────────────────────

function LanguageModal({
  isOpen, onClose, selected, onSelect,
}: { isOpen: boolean; onClose: () => void; selected: string; onSelect: (l: string) => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[70vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Language</h3>
              <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="overflow-y-auto py-2">
              {LANGUAGES.map(lang => (
                <button
                  key={lang}
                  onClick={() => { onSelect(lang); onClose(); }}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <span className={cn("text-sm", selected === lang ? "text-[#a4172c] font-semibold" : "text-gray-700")}>
                    {lang}
                  </span>
                  {selected === lang && <span className="text-[#a4172c]">✓</span>}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────
// COUNTRY CODE MODAL
// ─────────────────────────────────────────────────────────────

function CountryModal({
  isOpen, onClose, onSelect,
}: { isOpen: boolean; onClose: () => void; onSelect: (c: typeof COUNTRY_CODES[0]) => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[70vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Country</h3>
              <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="overflow-y-auto py-2">
              {COUNTRY_CODES.map((c, i) => (
                <button
                  key={c.name + i}
                  onClick={() => { onSelect(c); onClose(); }}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="text-lg">{c.flag}</span>
                  <span className="text-sm text-gray-700 flex-1">{c.name}</span>
                  <span className="text-sm text-gray-400">({c.code})</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const Login = () => {
  const navigate = useNavigate();
  const { signInWithGoogle } = useAuth();
  const lang = useLang();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [selectedLang, setSelectedLang] = useState(lang === "hi" ? "Hindi" : "English");
  // Selecting a language here also switches the whole app's UI language.
  const handleSelectLang = (l: string) => { setSelectedLang(l); setLang(langCodeFromName(l)); };
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      // Redirects to Google; the session is picked up automatically on return.
      await signInWithGoogle();
    } catch (err) {
      setGoogleLoading(false);
      toast.error("Google sign-in unavailable", {
        description: err instanceof Error ? err.message : "Enable the Google provider in Supabase Auth settings.",
      });
    }
  };

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) return;

    setChecking(true);

    // Mock check: "Sign in automatically if already registered"
    setTimeout(() => {
      if (REGISTERED_PHONES.has(phone)) {
        navigate("/home/new-arrivals");
        return;
      }
      navigate("/auth/otp-verify", {
        state: { phone, countryCode: selectedCountry.code, flag: selectedCountry.flag },
      });
    }, 400);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Top bar: language selector ── */}
      <div className="flex justify-end px-4 pt-4">
        <button
          onClick={() => setLangModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Globe className="w-3.5 h-3.5" />
          {selectedLang}
          <ChevronDown className="w-3 h-3 text-gray-400" />
        </button>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          {/* COSORA wordmark */}
          <div className="flex justify-center mb-12">
            <CosoraLogo height={38} />
          </div>

          <form onSubmit={handleSendCode} className="space-y-4">
            {/* Phone input row */}
            <div className="flex items-center gap-2 border border-gray-300 rounded-xl px-2 py-1 focus-within:border-[#a4172c] transition-colors">
              <button
                type="button"
                onClick={() => setCountryModalOpen(true)}
                className="flex items-center gap-1 px-2 py-2.5 shrink-0 border-r border-gray-200"
              >
                <span className="text-base">{selectedCountry.flag}</span>
                <span className="text-sm text-gray-700">{selectedCountry.code}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="Phone Number"
                value={phone}
                onChange={handlePhoneChange}
                autoFocus
                className="flex-1 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
              />
            </div>

            {/* Send Code button */}
            <button
              type="submit"
              disabled={phone.length < 10 || checking}
              className="w-full py-3.5 bg-[#a4172c] hover:bg-[#8c1325] disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {checking ? "Checking..." : "Send Code"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">Or continue with</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            )}
            {googleLoading ? "Connecting…" : "Google"}
          </button>

          {/* Explore as Guest */}
          <div className="text-center mt-5">
            <button
              onClick={() => navigate("/home/new-arrivals")}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Explore as Guest
            </button>
          </div>
        </motion.div>
      </div>

      <LanguageModal
        isOpen={langModalOpen}
        onClose={() => setLangModalOpen(false)}
        selected={selectedLang}
        onSelect={handleSelectLang}
      />
      <CountryModal
        isOpen={countryModalOpen}
        onClose={() => setCountryModalOpen(false)}
        onSelect={setSelectedCountry}
      />
    </div>
  );
};

export default Login;