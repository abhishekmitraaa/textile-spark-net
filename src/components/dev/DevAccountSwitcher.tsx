import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UserCog, X, LogOut, Loader2 } from "lucide-react";
import { useAuth, DEMO_ACCOUNTS, type DemoRole } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────
// Dev-only account switcher. Stands in for real login while phone-OTP is
// deferred: signs into one of the three seeded demo accounts so the whole
// vendor↔buyer↔admin data flow is testable with real auth/RLS. Rendered
// only in dev builds — it must never ship to production.
// ─────────────────────────────────────────────────────────────

const ROLES: { role: DemoRole; color: string }[] = [
  { role: "buyer", color: "#ef4d62" },
  { role: "vendor", color: "#256fef" },
  { role: "admin", color: "#111827" },
];

export default function DevAccountSwitcher() {
  const { profile, user, loading, signInAsDemo, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<DemoRole | "out" | null>(null);

  if (!import.meta.env.DEV) return null;

  const current = user?.email ?? null;

  const pick = async (role: DemoRole) => {
    setBusy(role);
    try {
      await signInAsDemo(role);
      toast.success(`Signed in as ${DEMO_ACCOUNTS[role].label}`);
    } catch (e) {
      toast.error("Sign-in failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const out = async () => {
    setBusy("out");
    try { await signOut(); toast.success("Signed out"); } finally { setBusy(null); }
  };

  return (
    <div className="fixed bottom-4 left-4 z-[100]">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="mb-2 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Dev · Sign in as</span>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="space-y-1.5">
              {ROLES.map(({ role, color }) => {
                const active = current === DEMO_ACCOUNTS[role].email;
                return (
                  <button
                    key={role}
                    onClick={() => pick(role)}
                    disabled={busy !== null}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-2.5 py-2 text-left text-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="font-semibold text-gray-800">{DEMO_ACCOUNTS[role].label}</span>
                    </span>
                    {busy === role ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                      : active ? <span className="text-[10px] font-bold text-green-600">ACTIVE</span> : null}
                  </button>
                );
              })}
            </div>
            {current && (
              <button
                onClick={out}
                disabled={busy !== null}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-100 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-50"
              >
                {busy === "out" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                Sign out
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 shadow-lg hover:shadow-xl"
        aria-label="Dev account switcher"
      >
        <UserCog className="h-4 w-4 text-gray-700" />
        <span className="max-w-[120px] truncate text-xs font-semibold text-gray-700">
          {loading ? "…" : profile?.full_name ?? "Signed out"}
        </span>
      </button>
    </div>
  );
}
