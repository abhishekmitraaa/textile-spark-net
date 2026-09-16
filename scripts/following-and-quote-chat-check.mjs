/**
 * Following + quote chat — no fabricated brands, no scripted conversation.
 * Real app, real DB, real login.
 *
 * Until 2026-09-16:
 *   - followingStore.ts returned seven invented brands whenever localStorage was
 *     empty, and useFollowing() falls back to that store whenever the visitor is
 *     signed out. Worse, load() treated an EMPTY array as missing, so a visitor
 *     who unfollowed all seven got them all back on the next load.
 *   - VendorChatModal.tsx reset to two hardcoded messages on every open, one of
 *     them written in the buyer's own voice, and anything typed was component
 *     state that vanished on close.
 *
 *   A. Signed out, empty storage      → no fake brands, real empty state.
 *   B. Storage holding old seed rows  → dropped on load, storage rewritten.
 *   C. Storage holding "[]"           → STAYS empty (the unfollow-everyone bug).
 *   D. Signed in                      → brands come from `follows`, no fakes.
 *   E. Quote chat, signed in          → real history, no scripted lines, and a
 *                                       typed message survives close → reopen.
 *
 * E writes one message to the demo buyer's real thread. Two things learned the
 * hard way on the first run, both now guarded:
 *   - `messages` has no DELETE policy, so the buyer cannot remove what this
 *     wrote. The delete below reports 0 rows rather than failing loudly; the
 *     row needs service_role (or the SQL editor) to clear.
 *   - The message body must contain NO DIGITS. A Date.now() token tripped chat
 *     moderation's phone-number flag pattern and put the thread into
 *     `under_review`, which then blocks every further send until an admin
 *     resumes it.
 * E is skipped automatically when the thread is already locked, since nothing
 * can be sent on it.
 *
 * Run: node scripts/following-and-quote-chat-check.mjs [baseUrl]   (default :8090)
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { credential } from "./lib/test-credentials.mjs";

const BASE = process.argv[2] || "http://localhost:8090";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const AUTH_KEY = `sb-${new URL(URL_).hostname.split(".")[0]}-auth-token`;
const FOLLOW_KEY = "cosora.following.v2";

const EMAIL = "demo-buyer@cosora.dev";
const PASSWORD = credential("DEMO_BUYER_PASSWORD");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The removed seed brands. "Mickey Mouse Chuck" was one of their products.
const FAKE = ["prezel", "Maison Lyra", "Studio Kintsugi", "Atelier Noor", "LUNE", "Okra Mills", "VOYA Studio", "Mickey Mouse Chuck"];
// The removed scripted chat lines.
const SCRIPTED = ["Thank you for your interest in our quote", "I wanted to discuss the MOQ"];
const EMPTY_FOLLOW_TEXT = "You aren't following any brands yet.";

let pass = 0, total = 0;
const check = (name, ok, detail = "") => { total++; if (ok) pass++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

const brandRow = (id, name) => ({
  id, name, handle: `${name} 1F A-01`, logo: "", location: "Seoul, KR", followers: "9,999+",
  items: 100, verified: true, isFollowing: true, isHidden: false,
  topProducts: [{ name: "Tiered Maxi Dress", price: "$12.40", image: "" }],
});

const storedIds = (page) => page.evaluate((k) => {
  try { return (JSON.parse(localStorage.getItem(k) || "null") || []).map((b) => b.id); }
  catch { return ["<unparseable>"]; }
}, FOLLOW_KEY);
const rawStored = (page) => page.evaluate((k) => localStorage.getItem(k), FOLLOW_KEY);
const leaked = (text) => FAKE.filter((f) => text.includes(f));

// ── DB facts, as the buyer ────────────────────────────────────────────────────
const db = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) throw new Error(`demo buyer sign-in failed: ${authErr.message}`);
const uid = auth.user.id;
const { data: followRows } = await db.from("follows").select("vendor_id").eq("follower_id", uid);
const dbFollows = (followRows ?? []).length;
// A real vendor id, used as the "legitimate row" in case B.
const { data: vendors } = await db.from("vendor_profiles").select("id, brand_name").limit(1);
const REAL_VENDOR = vendors?.[0];
if (!REAL_VENDOR) throw new Error("no vendor_profiles row to test with");
console.log(`   demo buyer follows ${dbFollows} vendor(s) in the DB; real vendor for case B: ${REAL_VENDOR.id}`);

const browser = await chromium.launch();
const errors = [];
let sentBody = null;
try {
  // ── A. Signed out, empty storage ───────────────────────────────────────────
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`A: ${e}`));
    await page.goto(`${BASE}/home/followings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const text = await page.locator("body").innerText();
    check("A. signed out, empty storage: no fabricated brands", leaked(text).length === 0, leaked(text).join(", "));
    check("A. real empty state is shown", text.includes(EMPTY_FOLLOW_TEXT));
    await page.screenshot({ path: "screenshots/following-signed-out-empty.png", fullPage: true });
    await ctx.close();
  }

  // ── B. Storage holding the old seed rows ───────────────────────────────────
  {
    const ctx = await browser.newContext();
    const legacy = [brandRow("prezel", "prezel"), brandRow("lune", "LUNE"), brandRow(REAL_VENDOR.id, REAL_VENDOR.brand_name ?? "Real Vendor")];
    await ctx.addInitScript(([k, v]) => {
      if (!sessionStorage.getItem("__f_seeded")) { localStorage.setItem(k, v); sessionStorage.setItem("__f_seeded", "1"); }
    }, [FOLLOW_KEY, JSON.stringify(legacy)]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`B: ${e}`));
    await page.goto(`${BASE}/home/followings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const text = await page.locator("body").innerText();
    const ids = await storedIds(page);
    check("B. legacy seed brands are not rendered", leaked(text).length === 0, leaked(text).join(", "));
    check("B. storage rewritten to the real id only", ids.length === 1 && ids[0] === REAL_VENDOR.id, JSON.stringify(ids));
    check("B. every surviving id is a UUID", ids.every((i) => UUID_RE.test(i)), JSON.stringify(ids));
    await ctx.close();
  }

  // ── C. The unfollow-everyone bug ───────────────────────────────────────────
  {
    const ctx = await browser.newContext();
    await ctx.addInitScript(([k]) => {
      if (!sessionStorage.getItem("__f_empty")) { localStorage.setItem(k, "[]"); sessionStorage.setItem("__f_empty", "1"); }
    }, [FOLLOW_KEY]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`C: ${e}`));
    await page.goto(`${BASE}/home/followings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const text = await page.locator("body").innerText();
    const raw = await rawStored(page);
    check("C. an intentionally empty list STAYS empty", leaked(text).length === 0, leaked(text).join(", "));
    check("C. storage still holds []", raw === "[]", String(raw));
    check("C. real empty state is shown", text.includes(EMPTY_FOLLOW_TEXT));
    // View-all is the second surface the seed reached.
    await page.goto(`${BASE}/home/followings/view-all`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const vtext = await page.locator("body").innerText();
    check("C. view-all shows no fabricated brands", leaked(vtext).length === 0, leaked(vtext).join(", "));
    check("C. view-all shows its real empty state", vtext.includes(EMPTY_FOLLOW_TEXT));
    await page.screenshot({ path: "screenshots/following-view-all-empty.png", fullPage: true });
    await ctx.close();
  }

  // ── D + E. Signed in ───────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext();
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [AUTH_KEY, JSON.stringify(auth.session)]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`D/E: ${e}`));

    // D. Following is DB-backed and carries no fakes.
    await page.goto(`${BASE}/home/followings/view-all`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const dtext = await page.locator("body").innerText();
    check("D. signed in: no fabricated brands", leaked(dtext).length === 0, leaked(dtext).join(", "));
    const shown = dtext.match(/Following\s+(\d+)/)?.[1];
    check("D. followed count matches the follows table", shown !== undefined && Number(shown) === dbFollows,
      `page "${shown}" vs DB ${dbFollows}`);

    // E. Quote chat. The page opens on the RFQ list; the quote cards (and their
    // Chat buttons) only render after an RFQ is opened.
    await page.goto(`${BASE}/requirement/my-quotes`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    const rfqCard = page.locator('button:has-text("Active"), button:has-text("Closed")').first();
    if (await rfqCard.count() > 0) {
      await rfqCard.click();
      await page.waitForTimeout(2500);
    }
    const chatBtn = page.getByRole("button", { name: /^Chat$/ }).first();
    if (await chatBtn.count() === 0) {
      check("E. a quote with a Chat button is reachable", false, "no Chat button on /requirement/my-quotes");
      await page.screenshot({ path: "screenshots/quote-chat-no-button.png", fullPage: true });
    } else {
      await chatBtn.click();
      await page.waitForTimeout(3000);
      const modal = await page.locator("body").innerText();
      const scripted = SCRIPTED.filter((s) => modal.includes(s));
      check("E. no scripted conversation", scripted.length === 0, scripted.join(" | "));

      // Nothing can be sent on a locked thread — the DB refuses the insert with
      // 42501 — so the send/round-trip assertions are skipped rather than
      // reported as failures.
      const { data: convRows } = await db.from("conversations").select("id, status");
      if ((convRows ?? []).some((c) => c.status === "under_review")) {
        check("E. locked thread shows the under-review notice, not a composer",
          modal.includes("under review"));
        console.log("SKIP  E. send → close → reopen — thread is under_review; an admin must resume it first");
        await page.screenshot({ path: "screenshots/quote-chat-under-review.png" });
        await ctx.close();
        throw new Error("__SKIP_SEND__");
      }

      // DIGIT-FREE unique token, deliberately. The first run of this script used
      // a Date.now() timestamp; the 13-digit number matched chat moderation's
      // phone-number flag pattern, which locked the demo buyer's thread to
      // `under_review` and needed an admin to undo. Letters only.
      const token = Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
      sentBody = `MP nine round trip check ${token}`;
      const box = page.locator('textarea[placeholder="Type your message..."]');
      await box.fill(sentBody);
      await page.getByRole("button", { name: /Send Message/ }).click();
      await page.waitForTimeout(3500);
      check("E. the sent message appears in the thread", (await page.locator("body").innerText()).includes(sentBody));

      // Close, then reopen — the round trip that the old modal failed.
      await page.getByRole("button", { name: /^Cancel$/ }).click();
      await page.waitForTimeout(1200);
      const closed = await page.locator("body").innerText();
      check("E. the modal actually closed", !closed.includes(sentBody));
      await page.getByRole("button", { name: /^Chat$/ }).first().click();
      await page.waitForTimeout(3500);
      check("E. the message survives close → reopen", (await page.locator("body").innerText()).includes(sentBody));
      await page.screenshot({ path: "screenshots/quote-chat-real-thread.png" });
    }
    await ctx.close();
  }

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}

// ── Confirm persistence in the DB, then clean the test message up ────────────
if (sentBody) {
  const { data: rows } = await db.from("messages").select("id, body, sender_id").eq("body", sentBody);
  check("E. the message really is a row in `messages`", (rows ?? []).length === 1, `${(rows ?? []).length} row(s)`);
  if ((rows ?? []).length) {
    await db.from("messages").delete().eq("id", rows[0].id);
    const { data: after } = await db.from("messages").select("id").eq("body", sentBody);
    check("E. test message cleaned up", (after ?? []).length === 0,
      (after ?? []).length ? "still present — RLS may forbid delete; remove by hand" : "");
  }
}
await db.auth.signOut();

console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
