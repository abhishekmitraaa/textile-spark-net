import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { fetchMyContactInfo } from "@/lib/queries/myContact";
import { readProfileRow } from "@/lib/auth/profileRead";

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
  /** The Terms version this account last accepted (accept_buyer_terms); null when none is recorded. */
  terms_version: string | null;
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
  /** The signed-in account's profile couldn't be read, even after retrying: show Retry (refreshProfile), never guess. */
  profileError: boolean;
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
  const [profileError, setProfileError] = useState(false);
  // Only the latest read may set the profile: a sign-out or a second sign-in can overtake a retrying one.
  const readSeq = useRef(0);
  // The account whose profile is loaded (or loading) and whether that load worked. Auth events repeat the session
  // (INITIAL_SESSION right after getSession(), TOKEN_REFRESHED every hour, SIGNED_IN when a tab regains focus); each one
  // used to read the profile, is_admin and the contact details again: 29 calls on Home, twice the sign-in reads at
  // scale (buyer sign-up audit, Low item 7). A new account, a signed-out session, a failed load or USER_UPDATED reads.
  const loadedFor = useRef<string | null>(null);
  const loadFailed = useRef(false);
  const inflight = useRef<Promise<void> | null>(null);
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
  //
  // The profile row is read again a few times when it fails (lib/auth/profileRead.ts); if it still fails,
  // profileError says so, and the pages that route on it offer Retry instead of guessing (audit item 6).
  const loadProfile = useCallback((uid: string): Promise<void> => {
    loadedFor.current = uid;
    const p = readAccountProfile(uid);
    inflight.current = p;
    return p;
  }, []);

  const readAccountProfile = async (uid: string) => {
    const seq = ++readSeq.current;
    const [data, contact, { data: adminFlag, error: adminError }] = await Promise.all([
      readProfileRow(uid),
      fetchMyContactInfo().catch(() => null),
      supabase.rpc("is_admin"),
    ]);
    if (seq !== readSeq.current) return;
    setProfile(data ? ({ ...data, email: contact?.email ?? null } as Profile) : null);
    setProfileError(!data);
    loadFailed.current = !data;
    setIsAdmin(!adminError && adminFlag === true);
  };

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      const uid = data.session?.user?.id;
      if (!uid) { setLoading(false); return; }
      // The INITIAL_SESSION event may have started this account's load already: wait for that one.
      const load = loadedFor.current === uid && inflight.current ? inflight.current : loadProfile(uid);
      load.finally(() => setLoading(false));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Never call other Supabase methods synchronously inside this callback.
      if (next?.user) {
        const same = loadedFor.current === next.user.id && !loadFailed.current;
        if (!same || event === "USER_UPDATED") void loadProfile(next.user.id);
      } else {
        readSeq.current++;
        loadedFor.current = null;
        loadFailed.current = false;
        setProfile(null); setProfileError(false); setIsAdmin(false);
      }
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

  // Persist the role a first-time user picks. It no longer marks them onboarded (2026-10-19): that was step 2 of 7,
  // so anyone who stopped there was never shown the rest. A buyer is onboarded when they accept the Terms
  // (accept_buyer_terms, lib/buyerTerms.ts), a seller when vendor onboarding finishes (vendorOnboarding.ts); until then every sign-in
  // goes back to role selection.
  const chooseRole = useCallback(async (role: "buyer" | "seller") => {
    if (!session?.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ active_role: role })
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
        profileError,
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
