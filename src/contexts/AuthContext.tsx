import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { fetchMyContactInfo } from "@/lib/queries/myContact";

// ─────────────────────────────────────────────────────────────
// Auth context — the real session + profile for the signed-in user.
//
// Mobile number + OTP is the primary sign-in (Login → /auth/otp-verify). It
// goes through the single seam src/lib/auth/otp.ts, whose verifyOtp()
// establishes an ordinary Supabase session, so it lands here like any other.
// SMS delivery is not live yet (see that file). Meanwhile Google works, and in
// dev the switcher signs in as three seeded demo accounts (buyer / vendor /
// admin). All are genuine Supabase auth users, so auth.uid() and RLS work for
// real and the session, profile and role keep the same shape whichever path
// signed you in.
// ─────────────────────────────────────────────────────────────

export type DemoRole = "buyer" | "vendor" | "admin";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  active_role: string;
  onboarded: boolean;
  avatar_url: string | null;
}

// Seeded in the DB (see migrations/seed). Dev-server only: the passwords come
// from the gitignored .env through vite.config.ts, which defines
// __DEMO_PASSWORDS__ for `vite` (serve) and as null for every build. So no
// build, of any mode, can contain them. Master Prompt 8, Phase 1: this
// constant used to hold demo-admin's (super_admin) password as a literal, and
// the production bundle shipped it.
const DEMO_PASSWORDS = import.meta.env.DEV ? __DEMO_PASSWORDS__ : null;

export const DEMO_ACCOUNTS: Record<DemoRole, { email: string; password: string; label: string }> | null =
  DEMO_PASSWORDS
    ? {
        buyer:  { email: "demo-buyer@cosora.dev",  password: DEMO_PASSWORDS.buyer,  label: "Demo Buyer" },
        vendor: { email: "demo-vendor@cosora.dev", password: DEMO_PASSWORDS.vendor, label: "Demo Vendor" },
        admin:  { email: "demo-admin@cosora.dev",  password: DEMO_PASSWORDS.admin,  label: "Demo Admin" },
      }
    : null;

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signInAsDemo: (role: DemoRole) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  chooseRole: (role: "buyer" | "seller") => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Admin status comes from the is_admin() RPC, which reads admin.admin_users —
  // the only source of truth since admin-schema separation Phase 5c dropped
  // profiles.is_admin (2026-09-22). It resolves in parallel with the profile row
  // and is applied in the same tick. An RPC error counts as not-admin (fail
  // closed), and this flag only gates what the UI shows: Postgres enforces every
  // admin action itself.
  //
  // `email` is not selectable on profiles (MPF-3): it comes from
  // my_contact_info(). A failure there leaves email null rather than dropping
  // the whole profile, because the rest of the app routes on active_role.
  const loadProfile = useCallback(async (uid: string) => {
    const [{ data }, contact, { data: adminFlag, error: adminError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, active_role, onboarded, avatar_url")
        .eq("id", uid)
        .maybeSingle(),
      fetchMyContactInfo().catch(() => null),
      supabase.rpc("is_admin"),
    ]);
    setProfile(data ? ({ ...data, email: contact?.email ?? null } as Profile) : null);
    setIsAdmin(!adminError && adminFlag === true);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) loadProfile(data.session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Never call other Supabase methods synchronously inside this callback.
      if (next?.user) void loadProfile(next.user.id);
      else { setProfile(null); setIsAdmin(false); }
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signInAsDemo = useCallback(async (role: DemoRole) => {
    if (!DEMO_ACCOUNTS) throw new Error("Demo sign-in needs the dev server and DEMO_*_PASSWORD in .env");
    const acct = DEMO_ACCOUNTS[role];
    const { error } = await supabase.auth.signInWithPassword({ email: acct.email, password: acct.password });
    if (error) throw error;
  }, []);

  // Google OAuth. Supabase redirects to Google, then back to `redirectTo`;
  // because the client has detectSessionInUrl:true, the session is established
  // automatically on return and the handle_new_user trigger provisions a
  // profile for first-time Google sign-ups (default active_role 'buyer').
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  }, []);

  // Persist the role a first-time user picks and mark them onboarded, so every
  // later sign-in routes straight to their chosen side.
  const chooseRole = useCallback(async (role: "buyer" | "seller") => {
    if (!session?.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ active_role: role, onboarded: true })
      .eq("id", session.user.id);
    if (error) throw error;
    await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        isAdmin,
        signInAsDemo,
        signInWithGoogle,
        chooseRole,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
