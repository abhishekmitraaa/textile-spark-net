import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Single Supabase client for the whole app. URL + anon key come from Vite env
// (see .env / .env.example). The anon key is safe to ship to the browser — row
// level security is what actually protects the data.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fail loudly in dev rather than silently making unauthenticated requests.
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in."
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
