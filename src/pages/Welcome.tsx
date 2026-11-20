import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ClipboardList, Heart, LayoutGrid } from "lucide-react";
import CosoraLogo from "@/components/CosoraLogo";
import { useAuth } from "@/contexts/AuthContext";
import { BUYER_LANDING, landingFor, peekLandingFor } from "@/lib/returnTo";

/**
 * The end of buyer sign-up: what to do next (review L-53). It used to show the logo for 2 seconds and move on, so most
 * buyers never saw it and were never told what Cosora is for. It now waits for a choice.
 *
 * Only a signed-in buyer who has finished sign-up sees it (L-54): signed out goes to sign-in, an unfinished account to
 * role selection, a seller to Seller Home.
 */
const Welcome = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { session, profile, profileError, loading, refreshProfile } = useAuth();
  // The page a prompt or the sign-up gate left for sign-up (review M-59); New Arrivals otherwise. Only looked at here;
  // it is taken when the buyer chooses (code review: taken on arrival, a redirect below lost it).
  const [next] = useState(() => peekLandingFor(BUYER_LANDING));
  const [retrying, setRetrying] = useState(false);

  if (!loading && !session) return <Navigate to="/auth/login" replace />;
  if (!loading && session && profile) {
    if (profile.active_role === "seller") return <Navigate to="/seller-home" replace />;
    if (!profile.onboarded) return <Navigate to="/auth/role-selection" replace />;
  }
  // A profile that couldn't be read doesn't hold the buttons (code review: they stayed greyed with no word why).
  const ready = !loading && Boolean(session);
  const go = (path: string) => {
    landingFor(BUYER_LANDING); // the remembered page is used up whichever way the buyer goes
    navigate(path, { replace: true });
  };
  const returning = next !== BUYER_LANDING;

  const actions = [
    { icon: ClipboardList, label: "Post a requirement", hint: "Tell sellers what you need and get quotes", to: "/requirement/post-requirement" },
    { icon: LayoutGrid, label: "Browse categories", hint: "Fabrics, clothing, trims and services", to: "/categories" },
    // The interests were just picked at step 4: this changes them (code review: /home/for-you showed the feed).
    { icon: Heart, label: "Change your interests", hint: "So For You shows what you source", to: "/profile/interest-preference" },
  ];

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-brand-buyer-deep to-brand-buyer-deeper flex flex-col items-center justify-center px-4 py-10">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm text-center"
      >
        <p className="text-white/80 text-sm font-medium mb-2">Welcome to</p>
        <div className="flex justify-center mb-2">
          <CosoraLogo height={40} variant="white" />
        </div>
        <h1 className="text-white text-lg font-bold">You're all set</h1>
        <p className="mt-1 text-white/80 text-sm">Here's where to start.</p>
        {!loading && session && !profile && profileError && (
          <p role="alert" className="mt-3 text-sm text-white">
            Your account details didn't load.{" "}
            <button
              type="button"
              disabled={retrying}
              onClick={async () => { setRetrying(true); try { await refreshProfile(); } finally { setRetrying(false); } }}
              className="font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </p>
        )}

        <div className="mt-6 space-y-2.5 text-left">
          {actions.map(({ icon: Icon, label, hint, to }) => (
            <button
              key={to}
              type="button"
              disabled={!ready}
              onClick={() => go(to)}
              className="w-full flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm hover:bg-white/95 active:scale-[0.99] transition disabled:opacity-60"
            >
              <span className="w-10 h-10 shrink-0 rounded-full bg-brand-buyer/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-brand-buyer" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{label}</span>
                <span className="block text-xs text-gray-500">{hint}</span>
              </span>
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => go(next)}
          className="mt-6 w-full rounded-xl border border-white/60 py-3 text-sm font-bold text-white hover:bg-white/10 transition disabled:opacity-60"
        >
          {returning ? "Continue where you were" : "Go to Home"}
        </button>
      </motion.div>
    </div>
  );
};

export default Welcome;
