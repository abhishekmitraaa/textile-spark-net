import { errorMessage } from "@/lib/errorMessage";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CosoraLogo from "@/components/CosoraLogo";
import { useAuth } from "@/contexts/AuthContext";
import {
  accountInfoFrom, EMPTY_PROFILE, saveAccountInfo, useProfileFull, type AccountInfoValues,
} from "@/lib/queries/profile";
import { lookupPincode } from "@/lib/reverseGeocode";
import { useStepBack } from "@/hooks/useStepBack";

// Something@something.tld, no spaces. Deliverability is the mail server's question, not this form's.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const AccountInfo = () => {
  const navigate = useNavigate();
  const back = useStepBack("/auth/sub-role");
  const { session, refreshProfile } = useAuth();
  const saved = useProfileFull(session?.user.id);
  const [saving, setSaving] = useState(false);
  // What the database holds, once read: the form starts from it (a reload or Back shows every answer again) and a
  // save sends only what differs from it (buyer sign-up audit item 10: every Next wrote the name and business).
  const before = useRef<AccountInfoValues | null>(null);
  const [form, setForm] = useState({ name: "", email: "", pincode: "", businessName: "" });
  // The city and state that go with the pincode: from the saved row, or from "Use current location". Typing a
  // pincode clears them: a bare pincode is not a city, and there is no gazetteer to turn one into a city.
  const [place, setPlace] = useState<{ city: string; state: string }>({ city: "", state: "" });
  const [locLoading, setLocLoading] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);

  useEffect(() => {
    if (before.current || saved.isPending) return;
    // A read that failed starts from nothing: what is typed is saved, and nothing else is touched.
    const b = accountInfoFrom(saved.data ?? EMPTY_PROFILE);
    before.current = b;
    // A Google account brings its address. A mobile-OTP account's is a `p<digits>@phone.cosora.invalid`
    // placeholder nobody can receive mail at, so it is never offered.
    const signInEmail = session?.user?.email ?? "";
    setForm({
      name: b.name,
      email: b.email || (signInEmail.toLowerCase().endsWith(".invalid") ? "" : signInEmail),
      pincode: b.postalCode,
      businessName: b.businessName,
    });
    setPlace({ city: b.city, state: b.state });
  }, [saved.isPending, saved.data, session]);

  // Checked on the trimmed values, which are also what is saved (2026-10-19: only "not empty" was checked, so
  // "   " or "abc" went through as a name and an email). The database checks them again (20261114100100).
  const name = form.name.trim();
  const email = form.email.trim();
  const businessName = form.businessName.trim();
  const errors = {
    name: name.length < 2 ? "Enter your name." : name.length > 120 ? "That name is too long." : null,
    email: !EMAIL_RE.test(email) || email.endsWith(".invalid") || email.length > 254 ? "Enter a valid email address, like name@company.com." : null,
    businessName: businessName.length < 2 ? "Enter your business name." : businessName.length > 120 ? "That name is too long." : null,
    pincode: form.pincode && !/^[1-9]\d{5}$/.test(form.pincode) ? "A pincode is 6 digits." : null,
  };
  const isValid = !errors.name && !errors.email && !errors.businessName && !errors.pincode;
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (field: string) => setTouched(prev => ({ ...prev, [field]: true }));
  const errorFor = (field: keyof typeof errors) =>
    touched[field] && errors[field] ? <p className="mt-1 text-xs text-red-600">{errors[field]}</p> : null;

  const update = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // The device's position → a pincode (lib/reverseGeocode.ts: rounded to about 1 km first, India only). The field
  // stays editable afterwards, so a wrong answer can be corrected.
  const handleUseCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Location isn't supported on this device");
      return;
    }
    setLocLoading(true);
    setLocNote(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const found = await lookupPincode(coords.latitude, coords.longitude);
        setLocLoading(false);
        if ("error" in found) {
          if (found.error === "outside_india") setLocNote("Pincode lookup works for India only. Enter your pincode, or leave it empty.");
          else toast.error("Couldn't look up your location details");
          return;
        }
        const where = found.city || found.state || "your area";
        setPlace({ city: found.city ?? "", state: found.state ?? "" });
        if (found.pincode) {
          setForm(prev => ({ ...prev, pincode: found.pincode }));
          toast.success(`Location set — ${where} (${found.pincode})`);
        } else {
          setLocNote(`Detected ${where}, but no pincode was found. Enter it below.`);
        }
      },
      (err) => {
        setLocLoading(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — allow it or enter a pincode"
            : "Couldn't get your location"
        );
      },
      // A pincode needs no more than about a kilometre.
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const located = Boolean(form.pincode) && Boolean(place.city || place.state);

  const next = async () => {
    if (!isValid) { setTouched({ name: true, email: true, businessName: true, pincode: true }); return; }
    if (saving || !session?.user) return;
    const after: AccountInfoValues = {
      name, email, businessName, postalCode: form.pincode, city: place.city, state: place.state,
    };
    setSaving(true);
    try {
      await saveAccountInfo(session.user.id, before.current ?? accountInfoFrom(EMPTY_PROFILE), after);
      before.current = after;
      await Promise.all([refreshProfile(), saved.refetch()]);
    } catch (e) {
      setSaving(false);
      toast.error("Couldn't save your details", { description: errorMessage(e) });
      return;
    }
    setSaving(false);
    navigate("/auth/interest-preference");
  };

  if (session && saved.isPending) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" aria-busy="true">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col max-w-sm mx-auto w-full"
      >
        <div className="mb-6 flex items-center gap-2">
          <button type="button" onClick={back} aria-label="Back" className="-ml-1.5 p-1.5 rounded-full hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          {/* COSORA wordmark */}
          <CosoraLogo height={30} />
        </div>
        <div className="h-px bg-gray-200 mb-6" />

        <h2 className="text-lg font-bold text-gray-900 mb-3">Account Information</h2>

        {/* Internal use notice */}
        <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 mb-6">
          <p className="text-xs text-gray-500 leading-relaxed">
            This data is being collected solely for internal use and will not be utilised for any commercial purposes.
          </p>
        </div>

        <div className="space-y-5 mb-8">
          {/* Name */}
          <div>
            <label htmlFor="ai-name" className="text-sm font-semibold text-gray-800 mb-1.5 block">Name</label>
            <input
              id="ai-name"
              type="text"
              placeholder="Enter your name"
              value={form.name}
              maxLength={120}
              onChange={e => update("name", e.target.value)}
              onBlur={() => touch("name")}
              className="w-full px-3.5 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#a4172c] transition-colors"
            />
            {errorFor("name")}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="ai-email" className="text-sm font-semibold text-gray-800 mb-1.5 block">Email Address</label>
            <input
              id="ai-email"
              type="email"
              placeholder="Please enter a valid email address."
              value={form.email}
              maxLength={254}
              autoComplete="email"
              onChange={e => update("email", e.target.value)}
              onBlur={() => touch("email")}
              className="w-full px-3.5 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#a4172c] transition-colors"
            />
            {errorFor("email")}
          </div>

          {/* Location */}
          <div>
            <label htmlFor="ai-pincode" className="text-sm font-semibold text-gray-800 mb-1.5 block">Select Your Location</label>
            {/* Said plainly because this is stored and shown to someone. Sellers see aggregate counts by city/state and
                never an individual buyer — enforced in vendor_buyer_geography, which collapses any place with fewer
                than 3 distinct viewers. */}
            <p className="text-xs text-gray-500 -mt-1 mb-1 leading-snug">
              Sellers see which cities their buyer interest comes from — as counts only, never your name or exact address.
            </p>
            <p className="text-xs text-gray-500 mb-2 leading-snug">
              Your approximate location (about 1 km) is looked up by BigDataCloud.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locLoading}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-3 rounded-xl border text-sm font-medium shrink-0 transition-colors disabled:opacity-70",
                  located
                    ? "border-[#a4172c] bg-[#fdf0f1] text-[#a4172c]"
                    : "border-[#a4172c]/40 text-[#a4172c] hover:bg-[#fdf0f1]"
                )}
              >
                {locLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                {locLoading ? "Locating…" : "Use current location"}
              </button>
              <span className="text-xs text-gray-400 shrink-0">or</span>
              <input
                id="ai-pincode"
                type="text"
                inputMode="numeric"
                placeholder="Enter Pincode"
                value={form.pincode}
                onChange={e => {
                  // A typed pincode replaces the located one: the old city and state no longer describe it.
                  setPlace({ city: "", state: "" });
                  setLocNote(null);
                  update("pincode", e.target.value.replace(/\D/g, "").slice(0, 6));
                }}
                onBlur={() => touch("pincode")}
                className="flex-1 min-w-0 px-3.5 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#a4172c] transition-colors"
              />
            </div>
            {locNote && <p className="mt-1 text-xs text-gray-600" role="status">{locNote}</p>}
            {errorFor("pincode")}
          </div>

          {/* Business Name */}
          <div>
            <label htmlFor="ai-business" className="text-sm font-semibold text-gray-800 mb-1.5 block">Business Name</label>
            <input
              id="ai-business"
              type="text"
              placeholder="Your company or brand name"
              value={form.businessName}
              maxLength={120}
              onChange={e => update("businessName", e.target.value)}
              onBlur={() => touch("businessName")}
              className="w-full px-3.5 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#a4172c] transition-colors"
            />
            {errorFor("businessName")}
          </div>
        </div>

        <button
          onClick={next}
          disabled={saving}
          className={cn(
            "w-full py-3.5 text-sm font-bold rounded-xl transition-colors mt-auto",
            isValid && !saving
              ? "bg-[#a4172c] hover:bg-[#8c1325] text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          )}
        >
          {saving ? "Saving…" : "NEXT"}
        </button>
      </motion.div>
    </div>
  );
};

export default AccountInfo;
