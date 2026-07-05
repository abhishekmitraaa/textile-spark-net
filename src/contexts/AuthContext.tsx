import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Auth context — the real session + profile for the signed-in user.
//
// Phone-OTP is deferred; for now we sign in against three seeded demo
// accounts (buyer / vendor / admin) via the dev switcher. Because these
// are genuine Supabase auth users, auth.uid() and RLS work for real, and
// swapping in phone-OTP later changes nothing downstream — the session,
// profile, and role all keep the same shape.
// ─────────────────────────────────────────────────────────────

export type DemoRole = "buyer" | "vendor" | "admin";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  active_role: string;
  is_admin: boolean;
  onboarded: boolean;
  avatar_url: string | null;
}

// Seeded in the DB (see migrations/seed). Password is the same for all three.
export const DEMO_ACCOUNTS: Record<DemoRole, { email: string; password: string; label: string }> = {
  buyer:  { email: "demo-buyer@cosora.dev",  password: "cosora123", label: "Demo Buyer" },
  vendor: { email: "demo-vendor@cosora.dev", password: "cosora123", label: "Demo Vendor" },
  admin:  { email: "demo-admin@cosora.dev",  password: "cosora123", label: "Demo Admin" },
};

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
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, active_role, is_admin, onboarded, avatar_url")
      .eq("id", uid)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
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
      else setProfile(null);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signInAsDemo = useCallback(async (role: DemoRole) => {
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
        isAdmin: Boolean(profile?.is_admin),
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
