import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// The signed-in user's own email and phone.
//
// Clients cannot select profiles.email or profiles.phone (MPF-3, migration
// 20260923171821): until then anyone holding the public anon key could list
// every user's. The caller's own pair comes from my_contact_info(), which only
// ever returns auth.uid()'s row, so this takes no user id. Every other profiles
// column is still selected directly.
//
// Someone else's phone is call_buyer_contact(), behind the call rules, in
// queries/calls.ts. Nothing else in the app reads another user's contact
// details.
// ─────────────────────────────────────────────────────────────

export interface MyContactInfo {
  email: string | null;
  phone: string | null;
}

export async function fetchMyContactInfo(): Promise<MyContactInfo> {
  const { data, error } = await supabase.rpc("my_contact_info").maybeSingle();
  if (error) throw error;
  return { email: data?.email ?? null, phone: data?.phone ?? null };
}
