import { test, expect, type Browser, type BrowserContext } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Profile → Calls stat is counted, not hardcoded.
 *
 * The stat used to render a literal "0". It now reads useCallCount(), which
 * filters `calls` on buyer_id explicitly (calls_select also admits vendor_id
 * and is_admin(), so an RLS-only count would over-report). Three numbers must
 * agree for the signed-in buyer:
 *   1. the database: this buyer's rows in `calls`, counted outside the app;
 *   2. the Calls stat on /profile;
 *   3. the rows on /chats?tab=calls, rendered by useCalls(), a separate query.
 * (2) against (3) is the one that is not tautological: two code paths, one answer.
 *
 * ACCOUNT: demo-buyer@cosora.dev, which has call history. Read-only: this spec
 * creates, mutates and deletes nothing. Requires `npm run dev` on :8080.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const BUYER = "demo-buyer@cosora.dev";
test.skip(!hasCredentials("DEMO_BUYER_PASSWORD"), "set DEMO_BUYER_PASSWORD in .env (see .env.example)");
const SHOTS = path.join(REPO_ROOT, "screenshots");

async function signIn(email: string) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: demoPasswordFor(email) });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, session: data.session };
}

async function contextWith(browser: Browser, session: unknown, viewport: { width: number; height: number }): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [STORAGE_KEY, JSON.stringify(session)] as const,
  );
  return ctx;
}

test("Profile Calls stat equals the buyer's real call count and the Calls tab", async ({ browser }) => {
  const { db, session } = await signIn(BUYER);
  const uid = session.user.id;

  const { count: own, error } = await db.from("calls").select("*", { count: "exact", head: true }).eq("buyer_id", uid);
  if (error) throw error;
  const expected = own ?? 0;
  // A buyer with no calls would make "0" pass, which is the value the bug hardcoded.
  expect(expected, "demo-buyer needs call history for this check to mean anything").toBeGreaterThan(0);

  // 2. The stat on /profile.
  const profileCtx = await contextWith(browser, session, { width: 1440, height: 1100 });
  const profile = await profileCtx.newPage();
  await profile.goto("/profile", { waitUntil: "networkidle" });
  const cell = profile.locator("button").filter({ has: profile.locator("span", { hasText: /^Calls$/ }) });
  await expect(cell).toHaveCount(1);
  await expect(cell.locator("span").first(), "Calls stat").toHaveText(String(expected));
  await profile.screenshot({ path: path.join(SHOTS, "profile-calls-stat.png") });
  await profileCtx.close();

  // 3. The Calls tab the stat links to. Mobile width keeps the list single-column.
  const chatsCtx = await contextWith(browser, session, { width: 390, height: 844 });
  const chats = await chatsCtx.newPage();
  await chats.goto("/chats?tab=calls", { waitUntil: "networkidle" });
  await expect(chats.locator('button[aria-label^="Call "]'), "rows on the Calls tab").toHaveCount(expected);
  await chatsCtx.close();
});
