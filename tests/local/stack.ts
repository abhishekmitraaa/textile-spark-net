/**
 * Shared helpers for the local-stack specs (plan P7). Everything here refuses to run unless
 * the Supabase API is on this machine: these specs write freely, so they must never reach
 * production.
 *
 * The stack's keys and the test accounts come from the JSON file that
 * scripts/local-stack/bootstrap.mjs writes (LOCAL_STACK_ENV, default
 * .claude/tmp/local-stack-env.json).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Browser, BrowserContext, Page } from "@playwright/test";

export interface LocalStack {
  API: string;
  ANON: string;
  SERVICE: string;
  PASSWORD: string;
  ids: Record<string, string>;
  accounts: { key: string; email: string; name: string }[];
}

let cached: LocalStack | null = null;
export function stack(): LocalStack {
  if (cached) return cached;
  const file = process.env.LOCAL_STACK_ENV ?? ".claude/tmp/local-stack-env.json";
  const s = JSON.parse(readFileSync(file, "utf8")) as LocalStack;
  assertLocal(s.API);
  cached = s;
  return s;
}

export function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to run: ${url} is not a local Supabase stack.`);
  }
}

export const BUYER_URL = process.env.LOCAL_BUYER_URL ?? "http://localhost:8090";
export const ADMIN_URL = process.env.LOCAL_ADMIN_URL ?? "http://localhost:5184";

export function email(key: string): string {
  const a = stack().accounts.find((x) => x.key === key);
  if (!a) throw new Error(`no local account "${key}"`);
  return a.email;
}

/** Service-role client for setup and checks. Local only. */
export function service(): SupabaseClient {
  const s = stack();
  return createClient(s.API, s.SERVICE, { auth: { persistSession: false } });
}

const sessions = new Map<string, Session>();
export async function sessionFor(key: string): Promise<Session> {
  const hit = sessions.get(key);
  if (hit && (hit.expires_at ?? 0) * 1000 > Date.now() + 60_000) return hit;
  const s = stack();
  const db = createClient(s.API, s.ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email: email(key), password: s.PASSWORD });
  if (error || !data.session) throw new Error(`${key}: ${error?.message ?? "no session"}`);
  sessions.set(key, data.session);
  return data.session;
}

/** A client signed in as one of the local accounts. */
export async function clientAs(key: string): Promise<SupabaseClient> {
  const s = stack();
  const session = await sessionFor(key);
  const db = createClient(s.API, s.ANON, { auth: { persistSession: false } });
  await db.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  return db;
}

const storageKey = () => `sb-${new URL(stack().API).hostname.split(".")[0]}-auth-token`;

/** A browser context already signed in as `key` (the session goes into localStorage). */
export async function signedInContext(browser: Browser, key: string, viewport = { width: 390, height: 900 }): Promise<BrowserContext> {
  const session = await sessionFor(key);
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [storageKey(), JSON.stringify(session)]);
  return ctx;
}

/** Collect page errors so a spec can assert the page ran clean. */
export function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) problems.push(`console ${m.text().slice(0, 200)}`);
  });
  return problems;
}

/** Run SQL as postgres inside the local database container; returns the unaligned output. */
export function sql(query: string): string {
  assertLocal(stack().API);
  const container = process.env.LOCAL_DB_CONTAINER ?? "supabase_db_localstack";
  return execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: query,
    encoding: "utf8",
  }).trim();
}

export function setRollout(rollout: "off" | "staff" | "all"): void {
  sql(`update public.support_settings set rollout = '${rollout}';`);
}

/** Support hours open all week, so a spec isn't at the mercy of the clock. */
export function openAllHours(): void {
  sql(`update public.support_hours set is_open = true, open_time = '00:00', close_time = '23:59';`);
}

export function restoreHours(): void {
  sql(`update public.support_hours set is_open = weekday between 1 and 5,
         open_time = case when weekday between 1 and 5 then time '10:00' end,
         close_time = case when weekday between 1 and 5 then time '19:00' end;`);
}

/** Remove every support request a spec created (local only; the append-only guard is bypassed on purpose). */
export function clearSupport(): void {
  sql(`set cosora.support_scrub = 'on';
       set storage.allow_delete_query = 'true';
       delete from public.support_tickets;
       delete from admin.fraud_findings;
       delete from storage.objects where bucket_id = 'support-attachments';`);
}
