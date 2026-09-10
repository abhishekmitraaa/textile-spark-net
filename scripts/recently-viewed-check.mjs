/**
 * Recently Viewed — no fabricated history, no dead routes. Real app, real DB,
 * real login.
 *
 * Until 2026-09-10 the store returned six hardcoded products (rv1..rv6) whenever
 * localStorage was empty, and a signed-out buyer's first real view persisted all
 * six into storage. Every one linked to /product/rv1../product/rv6, which do not
 * exist. This checks each way a buyer can reach the page:
 *
 *   A. First-time visitor, empty storage   → the real empty state, zero cards.
 *   B. A browser that already has the old   → the fake rows are dropped on load
 *      seed rows persisted                     and storage is rewritten without
 *                                              them; the real row survives.
 *   C. Signed-out buyer views a real product → exactly that product, by UUID.
 *   D. Signed-in buyer                        → DB-backed history, and the empty
 *                                              state is NEVER shown while it loads.
 *
 * Deliberately does not match on product NAMES: at least one seed name
 * ("Premium Cotton Polo T-Shirt") is also a real listing's name, so a name check
 * would fail on real data. It judges on hrefs and stored ids instead — a fake
 * row is one whose id is not a UUID.
 *
 * D only reads. It never opens a product page while signed in, so it does not
 * write to the demo buyer's recently_viewed history.
 *
 * Run: node scripts/recently-viewed-check.mjs [baseUrl]   (default :8090)
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:8090";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
// supabase-js v2 default storage key; src/lib/supabase.ts sets no custom one.
const AUTH_KEY = `sb-${new URL(URL_).hostname.split(".")[0]}-auth-token`;
const STORE_KEY = "cosora.recentlyViewed.v1";

// The demo buyer. Same account the app's own dev switcher uses.
const EMAIL = "demo-buyer@cosora.dev";
const PASSWORD = "cosora123";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_TEXT = "No recently viewed products";

let pass = 0;
let total = 0;
const check = (name, ok, detail = "") => {
  total++;
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// One real live product, read as anon exactly as the catalogue is.
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: live, error: liveErr } = await anon
  .from("products").select("id, name").eq("status", "live").order("created_at").limit(1);
if (liveErr || !live?.length) throw new Error(`no live product to test with: ${liveErr?.message ?? "empty"}`);
const REAL = live[0];

// Shape of a legacy persisted row, matching what the removed seed() produced.
const row = (id, name, vendorId) => ({
  id, name, manufacturer: "x", vendorId, location: "x", price: "₹1", priceValue: 1,
  moq: "MOQ: 1", rating: 4.5, reviews: 1, verified: false, gender: "men",
  image: "", secondaryImage: "", soldCount: "0", enquiries: "0", viewedAt: Date.now(),
});

async function cardHrefs(page) {
  return page.$$eval('a[href^="/product/"]', (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
}
async function storedIds(page) {
  return page.evaluate((k) => {
    try { return (JSON.parse(localStorage.getItem(k) || "[]") || []).map((r) => r.id); }
    catch { return ["<unparseable>"]; }
  }, STORE_KEY);
}
const isRv = (h) => /\/product\/rv\d/.test(h);

const browser = await chromium.launch();
const errors = [];
try {
  // ── A. First-time visitor ─────────────────────────────────────────────────
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`A: ${e}`));
    await page.goto(`${BASE}/recently-viewed`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const text = await page.locator("body").innerText();
    const hrefs = await cardHrefs(page);
    check("A. fresh browser shows the real empty state", text.includes(EMPTY_TEXT));
    check("A. fresh browser shows zero product cards", hrefs.length === 0, `${hrefs.length} card link(s)`);
    check("A. header count reads 0", /\b0 products\b/.test(text));
    await page.screenshot({ path: "screenshots/recently-viewed-empty.png", fullPage: true });
    await ctx.close();
  }

  // ── B. Browser that already persisted the old seed ────────────────────────
  {
    const ctx = await browser.newContext();
    const legacy = [
      row("rv1", "Premium Cotton Polo T-Shirt", "v-rv1"),
      row("rv2", "Women's Casual Kurta Set", "v-rv2"),
      row("rv6", "Sports Track Pants", "v-rv6"),
      row(REAL.id, REAL.name, "00000000-0000-0000-0000-000000000000"),
    ];
    // addInitScript runs on EVERY navigation; seed storage once only.
    await ctx.addInitScript(([k, v]) => {
      if (!sessionStorage.getItem("__rv_seeded")) {
        localStorage.setItem(k, v);
        sessionStorage.setItem("__rv_seeded", "1");
      }
    }, [STORE_KEY, JSON.stringify(legacy)]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`B: ${e}`));
    await page.goto(`${BASE}/recently-viewed`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const hrefs = await cardHrefs(page);
    const ids = await storedIds(page);
    check("B. legacy rv rows are not rendered", !hrefs.some(isRv), hrefs.filter(isRv).join(", "));
    check("B. the real row survives", hrefs.includes(`/product/${REAL.id}`), hrefs.join(", ") || "no cards");
    check("B. storage rewritten without the rv rows", ids.length === 1 && ids[0] === REAL.id, JSON.stringify(ids));
    await ctx.close();
  }

  // ── C. Signed-out buyer views a real product ──────────────────────────────
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`C: ${e}`));
    await page.goto(`${BASE}/product/${REAL.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/recently-viewed`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const hrefs = await cardHrefs(page);
    const ids = await storedIds(page);
    const text = await page.locator("body").innerText();
    check("C. the viewed product is listed", hrefs.includes(`/product/${REAL.id}`), hrefs.join(", ") || "no cards");
    check("C. nothing else is listed", hrefs.length === 1, `${hrefs.length} card link(s)`);
    check("C. every stored id is a real UUID", ids.length > 0 && ids.every((i) => UUID_RE.test(i)), JSON.stringify(ids));
    check("C. header count reads 1", /\b1 product\b/.test(text));
    await page.screenshot({ path: "screenshots/recently-viewed-anon.png", fullPage: true });
    await ctx.close();
  }

  // ── D. Signed-in buyer: DB-backed, and never a false empty state ──────────
  {
    const db = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data: auth, error: authErr } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (authErr) throw new Error(`demo buyer sign-in failed: ${authErr.message}`);
    const uid = auth.user.id;
    const { data: dbRows, error: rvErr } = await db
      .from("recently_viewed").select("product_id").eq("buyer_id", uid);
    if (rvErr) throw new Error(`recently_viewed read failed: ${rvErr.message}`);
    const dbIds = new Set((dbRows ?? []).map((r) => r.product_id));

    const ctx = await browser.newContext();
    await ctx.addInitScript(([k, v]) => {
      localStorage.setItem(k, v);
      // Sample the page every 10 ms from the very first paint, so a one-frame
      // flash of the empty state is caught, not just the settled result.
      window.__sawEmpty = false;
      window.__sawLoading = false;
      const t = setInterval(() => {
        const txt = document.body?.innerText ?? "";
        if (txt.includes("No recently viewed products")) window.__sawEmpty = true;
        if (txt.includes("Loading…")) window.__sawLoading = true;
      }, 10);
      setTimeout(() => clearInterval(t), 15000);
    }, [AUTH_KEY, JSON.stringify(auth.session)]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`D: ${e}`));
    await page.goto(`${BASE}/recently-viewed`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    const hrefs = await cardHrefs(page);
    const sawEmpty = await page.evaluate(() => window.__sawEmpty);
    const sawLoading = await page.evaluate(() => window.__sawLoading);
    console.log(`   demo buyer has ${dbIds.size} recently_viewed row(s) in the DB; page rendered ${hrefs.length}`);
    check("D. signed-in history renders from the DB", dbIds.size === 0 ? hrefs.length === 0 : hrefs.length > 0,
      `${hrefs.length} of ${dbIds.size}`);
    check("D. every rendered card is one of this buyer's DB rows",
      hrefs.every((h) => dbIds.has(h.replace("/product/", ""))), hrefs.filter((h) => !dbIds.has(h.replace("/product/", ""))).join(", "));
    if (dbIds.size > 0) {
      check("D. empty state never shown while loading", !sawEmpty, sawEmpty ? "flashed 'No recently viewed products'" : "");
      check("D. a loading state was shown instead", sawLoading);
    }
    check("D. no rv links", !hrefs.some(isRv));
    await page.screenshot({ path: "screenshots/recently-viewed-signed-in.png", fullPage: true });
    await ctx.close();
    await db.auth.signOut();
  }

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}

console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
