import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CosoraLogo from "@/components/CosoraLogo";
import { useAuth } from "@/contexts/AuthContext";
import { saveAccountInfo } from "@/lib/queries/profile";

const AccountInfo = () => {
  const navigate = useNavigate();
  const { profile, session, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    pincode: "",
    businessName: "",
  });
  const [useLocation, setUseLocation] = useState(false);
  const [locLoading, setLocLoading] = useState(false);

  // Prefill name + email from the signed-in (e.g. Google) account, without
  // clobbering anything the user has already typed.
  useEffect(() => {
    const gName = profile?.full_name ?? "";
    const gEmail = profile?.email ?? session?.user?.email ?? "";
    if (!gName && !gEmail) return;
    setForm(prev => ({
      ...prev,
      name: prev.name || gName,
      email: prev.email || gEmail,
    }));
  }, [profile, session]);

  const isValid = form.name && form.email && form.businessName;

  const update = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // Real geolocation → reverse-geocode to a pincode (BigDataCloud, keyless + CORS-friendly).
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
          const pin = String(data.postcode ?? "").replace(/\D/g, "").slice(0, 6);
          const place = data.city || data.locality || data.principalSubdivision || "your area";
          setForm(prev => ({ ...prev, pincode: pin }));
          if (pin) {
            setUseLocation(true);
            toast.success(`Location set — ${place} (${pin})`);
          } else {
            setUseLocation(false); // keep the field editable so they can type it
            toast.info(`Detected ${place}, but no pincode found — enter it manually`);
          }
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
            ? "Location permission denied — allow it or enter a pincode"
            : "Couldn't get your location"
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="min-h-screen bg-white flex flex-col px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col max-w-sm mx-auto w-full"
      >
        {/* COSORA wordmark */}
        <CosoraLogo height={30} className="mb-6" />
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
            <label className="text-sm font-semibold text-gray-800 mb-1.5 block">Name</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={form.name}
              onChange={e => update("name", e.target.value)}
              className="w-full px-3.5 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#a4172c] transition-colors"
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-sm font-semibold text-gray-800 mb-1.5 block">Email Address</label>
            <input
              type="email"
              placeholder="Please enter a valid email address."
              value={form.email}
              onChange={e => update("email", e.target.value)}
              className="w-full px-3.5 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#a4172c] transition-colors"
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-sm font-semibold text-gray-800 mb-1.5 block">Select Your Location</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locLoading}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-3 rounded-xl border text-sm font-medium shrink-0 transition-colors disabled:opacity-70",
                  useLocation
                    ? "border-[#a4172c] bg-[#fdf0f1] text-[#a4172c]"
                    : "border-[#a4172c]/40 text-[#a4172c] hover:bg-[#fdf0f1]"
                )}
              >
                {locLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                {locLoading ? "Locating…" : "Use current location"}
              </button>
              <span className="text-xs text-gray-400 shrink-0">or</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Enter Pincode"
                value={form.pincode}
                disabled={useLocation}
                onChange={e => { setUseLocation(false); update("pincode", e.target.value.replace(/\D/g, "").slice(0, 6)); }}
                className="flex-1 px-3.5 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#a4172c] transition-colors disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>

          {/* Business Name */}
          <div>
            <label className="text-sm font-semibold text-gray-800 mb-1.5 block">Business Name</label>
            <input
              type="text"
              placeholder="Your company or brand name"
              value={form.businessName}
              onChange={e => update("businessName", e.target.value)}
              className="w-full px-3.5 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#a4172c] transition-colors"
            />
          </div>
        </div>

        <button
          onClick={async () => {
            if (!isValid || saving) return;
            // Persist to the DB so the Profile page shows the real user.
            if (session?.user) {
              setSaving(true);
              try {
                await saveAccountInfo(session.user.id, { name: form.name, email: form.email, businessName: form.businessName });
                await refreshProfile();
              } catch (e) {
                setSaving(false);
                toast.error("Couldn't save your details", { description: e instanceof Error ? e.message : String(e) });
                return;
              }
              setSaving(false);
            }
            navigate("/auth/interest-preference");
          }}
          disabled={!isValid || saving}
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