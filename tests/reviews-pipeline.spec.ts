import { test, expect, type Browser, type BrowserContext, type Session } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The review pipeline, end to end, through the real UI (2026-09-29).
 *
 *   buyer writes a store review (/vendor/:id) and a product review (/product/:id)
 *   → both show on the buyer's /profile/reviews, under the right filter
 *   → the vendor sees both on /reviews (Store / Product tabs) and replies to each
 *   → the buyer sees both replies on /profile/reviews
 *   → the buyer deletes both from /profile/reviews, and the vendor's page empties.
 * Plus the database rules behind it (migration 20260928190320):
 *   - a seller can't review their own store or product, and the UI hides the CTA;
 *   - a buyer can't write a "seller reply" onto their own review.
 *
 * ACCOUNTS: demo-admin reviews (it has no reviews of its own, so every row this
 * spec touches is one it created; afterEach deletes them, which also runs after
 * a timeout). demo-vendor replies. demo-buyer is not used: it already reviewed
 * demo-vendor's store and three of its products, and those rows are real data.
 *
 * Opening product and vendor pages signed in writes production analytics
 * (views, engagement events, ad impressions, recently_viewed), so every context
 * answers those requests itself. Requires `npm run dev` on :8080.
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
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const REVIEWER = "demo-admin@cosora.dev";
const VENDOR = "demo-vendor@cosora.dev";

const TRACKING = /\/rest\/v1\/rpc\/(log_engagement_event|ad_impression|ad_click|increment_product_view|increment_video_view|increment_product_enquiry)(\?|$)/;
const RECENTLY_VIEWED = /\/rest\/v1\/recently_viewed(\?|$)/;

test.skip(
  !hasCredentials("DEMO_ADMIN_PASSWORD", "DEMO_VENDOR_PASSWORD"),
  "set DEMO_ADMIN_PASSWORD and DEMO_VENDOR_PASSWORD in .env (see .env.example)",
);

async function signIn(email: string) {
  const db: SupabaseClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: demoPasswordFor(email) });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, uid: data.user.id, session: data.session };
}

async function contextFor(browser: Browser, session: Session): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(session)] as const);
  await ctx.route(TRACKING, (route) => route.fulfill({ status: 204 }));
  await ctx.route(RECENTLY_VIEWED, (route) =>
    route.request().method() === "GET" ? route.continue() : route.fulfill({ status: 201, body: "[]" }),
  );
  return ctx;
}

// Everything the reviewer wrote about demo-vendor, removed as the reviewer.
let cleanup: (() => Promise<void>) | null = null;
test.afterEach(async () => {
  const run = cleanup;
  cleanup = null;
  if (run) await run();
});

test("a buyer's store and product reviews reach the vendor, the replies reach the buyer", async ({ browser }) => {
  test.setTimeout(180_000);
  const reviewer = await signIn(REVIEWER);
  const vendor = await signIn(VENDOR);

  const { data: products, error: pErr } = await reviewer.db
    .from("products").select("id, name").eq("vendor_id", vendor.uid).eq("status", "live").order("created_at").limit(1);
  if (pErr) throw pErr;
  expect(products?.length, "demo-vendor needs a live product").toBe(1);
  const product = products![0] as { id: string; name: string };

  const mine = async () => {
    const [{ data: s }, { data: p }] = await Promise.all([
      reviewer.db.from("reviews").select("id, reply_body").eq("buyer_id", reviewer.uid).eq("vendor_id", vendor.uid),
      reviewer.db.from("product_reviews").select("id, reply_body").eq("buyer_id", reviewer.uid).eq("product_id", product.id),
    ]);
    return { store: s ?? [], product: p ?? [] };
  };
  const before = await mine();
  expect(before.store.length + before.product.length, "the reviewer must start with no reviews of demo-vendor").toBe(0);
  cleanup = async () => {
    await reviewer.db.from("reviews").delete().eq("buyer_id", reviewer.uid).eq("vendor_id", vendor.uid);
    await reviewer.db.from("product_reviews").delete().eq("buyer_id", reviewer.uid).eq("product_id", product.id);
  };

  const stamp = Date.now().toString(36);
  const storeText = `Store review ${stamp}: quick replies, good fabric.`;
  const productText = `Product review ${stamp}: stitching is neat.`;
  const storeReply = `Store reply ${stamp}: thank you!`;
  const productReply = `Product reply ${stamp}: glad it fits well.`;

  // ── 1. The buyer writes both reviews through the real modal ──
  const buyerCtx = await contextFor(browser, reviewer.session);
  const buyer = await buyerCtx.newPage();
  // The product page keeps its reviews behind a Details / Reviews switch.
  const openProductReviewsTab = () => buyer.getByRole("button", { name: "reviews", exact: true }).click();

  await buyer.goto(`/vendor/${vendor.uid}`, { waitUntil: "networkidle" });
  await buyer.getByRole("button", { name: "Write a Review" }).first().click();
  await buyer.getByRole("button", { name: "4 stars" }).click();
  await buyer.getByPlaceholder("Share details about product quality, communication, delivery…").fill(storeText);
  await buyer.getByRole("button", { name: "Submit Review" }).click();
  await expect(buyer.getByText("Thanks! Your review has been submitted")).toBeVisible();

  await buyer.goto(`/product/${product.id}`, { waitUntil: "networkidle" });
  await openProductReviewsTab();
  await buyer.getByRole("button", { name: "Write a Review" }).first().click();
  await buyer.getByRole("button", { name: "5 stars" }).click();
  await buyer.getByPlaceholder("Share your experience with this product…").fill(productText);
  await buyer.getByRole("button", { name: "Submit Review" }).click();
  await expect(buyer.getByText("Thanks! Your review has been submitted")).toBeVisible();

  const written = await mine();
  expect(written.store.length, "store review row").toBe(1);
  expect(written.product.length, "product review row").toBe(1);

  // ── 2. Both are on the buyer's My Reviews, under the right filter ──
  await buyer.goto("/profile/reviews", { waitUntil: "networkidle" });
  await expect(buyer.getByText(storeText)).toBeVisible();
  await expect(buyer.getByText(productText)).toBeVisible();
  await buyer.getByRole("button", { name: /^Vendors/ }).click();
  await expect(buyer.getByText(storeText)).toBeVisible();
  await expect(buyer.getByText(productText)).toHaveCount(0);
  await buyer.getByRole("button", { name: /^Products/ }).click();
  await expect(buyer.getByText(productText)).toBeVisible();
  await expect(buyer.getByText(storeText)).toHaveCount(0);

  // ── 3. The buyer can't forge a seller reply on their own review ──
  await reviewer.db.from("reviews").update({ reply_body: "forged" }).eq("id", written.store[0].id);
  await reviewer.db.from("product_reviews").update({ reply_body: "forged" }).eq("id", written.product[0].id);
  const afterForge = await mine();
  expect(afterForge.store[0].reply_body, "forged store reply").toBeNull();
  expect(afterForge.product[0].reply_body, "forged product reply").toBeNull();

  // ── 4. The vendor sees both on /reviews and replies to each ──
  const vendorCtx = await contextFor(browser, vendor.session);
  const seller = await vendorCtx.newPage();
  await seller.goto("/reviews", { waitUntil: "networkidle" });

  const storeCard = seller.locator("div.rounded-xl, div.rounded-lg").filter({ hasText: storeText }).last();
  await expect(storeCard).toBeVisible();
  await storeCard.getByRole("button", { name: "Reply" }).click();
  await storeCard.getByPlaceholder("Write a professional reply to this review...").fill(storeReply);
  await storeCard.getByRole("button", { name: "Post Reply" }).click();
  await expect(storeCard.getByText(storeReply)).toBeVisible();

  await seller.getByRole("tab", { name: /Product reviews/ }).click();
  const productCard = seller.locator("div.rounded-xl, div.rounded-lg").filter({ hasText: productText }).last();
  await expect(productCard).toBeVisible();
  await expect(productCard.getByText(product.name)).toBeVisible();
  await productCard.getByRole("button", { name: "Reply" }).click();
  await productCard.getByPlaceholder("Write a professional reply to this review...").fill(productReply);
  await productCard.getByRole("button", { name: "Post Reply" }).click();
  await expect(productCard.getByText(productReply)).toBeVisible();

  // ── 5. The buyer sees both replies on My Reviews and on the product page ──
  await buyer.goto("/profile/reviews", { waitUntil: "networkidle" });
  await expect(buyer.getByText(storeReply)).toBeVisible();
  await expect(buyer.getByText(productReply)).toBeVisible();
  await expect(buyer.getByText("Reply from the seller")).toHaveCount(2);
  await buyer.goto(`/product/${product.id}`, { waitUntil: "networkidle" });
  await openProductReviewsTab();
  await expect(buyer.getByText(productReply)).toBeVisible();

  // ── 6. The seller can't review their own store or product ──
  await seller.goto(`/vendor/${vendor.uid}`, { waitUntil: "networkidle" });
  // Wait until the vendor row and its reviews have loaded (the average is no
  // longer "–"), or a count of 0 below could pass on a page that hasn't rendered.
  const reviewsSection = seller.locator("section").filter({ has: seller.getByRole("heading", { name: "Reviews and Ratings" }) });
  await expect(reviewsSection.locator("span.text-4xl")).not.toHaveText("–");
  await expect(reviewsSection.getByRole("button", { name: /Write a Review|Edit your Review/ })).toHaveCount(0);
  const selfStore = await vendor.db.from("reviews").insert({ vendor_id: vendor.uid, buyer_id: vendor.uid, rating: 5, reviewer_name: "self" });
  expect(selfStore.error?.code, "self store review").toBe("42501");
  const selfProduct = await vendor.db.from("product_reviews").insert({ product_id: product.id, buyer_id: vendor.uid, rating: 5, reviewer_name: "self" });
  expect(selfProduct.error?.code, "self product review").toBe("42501");
  expect(selfProduct.error?.message).toBe("You can't review your own business");

  // ── 7. The buyer deletes both from My Reviews; the vendor's page empties of them ──
  await buyer.goto("/profile/reviews", { waitUntil: "networkidle" });
  for (const text of [storeText, productText]) {
    const card = buyer.locator("div.rounded-2xl").filter({ hasText: text });
    await card.getByRole("button", { name: "Options" }).click();
    await card.getByRole("button", { name: "Delete" }).click();
    await expect(buyer.getByText("Review deleted").first()).toBeVisible();
    await expect(buyer.getByText(text)).toHaveCount(0);
  }
  const gone = await mine();
  expect(gone.store.length + gone.product.length, "rows deleted").toBe(0);

  await seller.goto("/reviews", { waitUntil: "networkidle" });
  await expect(seller.getByText(storeText)).toHaveCount(0);
  await seller.getByRole("tab", { name: /Product reviews/ }).click();
  await expect(seller.getByText(productText)).toHaveCount(0);

  await buyerCtx.close();
  await vendorCtx.close();
});
