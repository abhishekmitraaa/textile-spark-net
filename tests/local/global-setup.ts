/**
 * Before any local spec runs: the Supabase stack must be on this machine, and both dev
 * servers must be pointed at it. A dev server started from a normal .env would point at
 * production, so its Supabase URL is read back from the module Vite serves.
 */
import { ADMIN_URL, BUYER_URL, assertLocal, stack } from "./stack";

async function servedSupabaseUrl(base: string): Promise<string> {
  const res = await fetch(`${base}/src/lib/supabase.ts`);
  if (!res.ok) throw new Error(`${base} isn't serving the app (HTTP ${res.status}). Start it as scripts/local-stack/README.md says.`);
  const text = await res.text();
  const m = text.match(/"VITE_SUPABASE_URL":\s*"([^"]+)"/);
  if (!m) throw new Error(`${base}: couldn't read VITE_SUPABASE_URL from the served module.`);
  return m[1];
}

export default async function globalSetup(): Promise<void> {
  const s = stack();
  const health = await fetch(`${s.API}/auth/v1/health`, { headers: { apikey: s.ANON } }).catch(() => null);
  if (!health?.ok) throw new Error(`The local stack at ${s.API} isn't answering. Run the stack first.`);
  for (const base of [BUYER_URL, ADMIN_URL]) {
    const url = await servedSupabaseUrl(base);
    assertLocal(url);
    if (url.replace(/\/$/, "") !== s.API.replace(/\/$/, "")) {
      throw new Error(`${base} points at ${url}, not the local stack ${s.API}.`);
    }
  }
}
