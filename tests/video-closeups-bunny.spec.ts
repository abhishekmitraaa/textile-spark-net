import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Video Closeups on Bunny Stream — BROWSER layer.
 *
 * The companion to `scripts/bunny-e2e-check.mjs`, which covers the same
 * migration at the API layer. Neither is sufficient alone, and the split is not
 * arbitrary — it follows the boundary chat-pipeline.spec.ts already draws
 * against Cosora-Admin/scripts/chat-pipeline-matrix.mjs, for the same reason:
 * the failure this pass exists to catch is a correct database under a UI that
 * has not caught up.
 *
 * The API script proves Bunny accepts the upload, encodes it, picks a rendition
 * that exists, refuses to let the moderation trigger be bypassed, and really
 * deletes the asset. None of that answers the only question a buyer has, which
 * is whether the reel PLAYS. That question cannot be asked from Node at all —
 * see "WHY A BROWSER IS REQUIRED" below.
 *
 * WHY A BROWSER IS REQUIRED, NOT MERELY NICER
 * The Bunny library has "block direct URL file access" enabled, which refuses
 * any request carrying a blank `Referer`. A Node `fetch` sends none, so from a
 * script every playback URL returns 403 whether the file exists or not — which
 * is exactly how an earlier session mistook working hotlink protection for a
 * dead pull zone and reported the whole migration blocked. A real browser
 * loading a real <video> sends a real Referer. So the browser is not a
 * convenience here; it is the only instrument that can distinguish "protected"
 * from "broken", and T3/T5 below are that measurement.
 *
 * ACCOUNTS: demo-vendor / demo-admin / demo-buyer, not the chatfx-* fixtures.
 * chat-pipeline.spec.ts's "FIXTURES ONLY, never demo-*" rule is scoped to chat
 * and states its own reason: `messages` has no DELETE policy for any role, so
 * every message a test sends is permanent. That reason does not transfer here.
 * `product_videos` has pvideos_delete, this spec's afterAll removes both the row
 * and the asset at Bunny, and scripts/bunny-e2e-check.mjs already round-trips
 * insert -> delete against these same accounts cleanly. Requiring the chat
 * fixtures would have made this spec depend on re-seeding known-password logins
 * into a live database for no benefit it can name.
 *
 * WHAT THIS SPEC WRITES, AND FOR HOW LONG
 * One throwaway product_videos row owned by demo-vendor, captioned so it is
 * obvious in any list it reaches, plus one Bunny video. T4 approves that row,
 * so for the ~30s between T4 and afterAll it is genuinely live in the buyer
 * feed — that is the point of T5, and it is the only way to test the published
 * path without mocking the thing under test. afterAll runs even when a test
 * fails. The one real vendor row (`Yoyoyo`, provider='supabase') is never
 * touched: this spec only ever addresses rows by the id it created.
 *
 * PREREQUISITES — both dev servers, started by hand (playwright.config.ts
 * deliberately has no `webServer`; see its header):
 *     textile-spark-net:  npm run dev     (localhost:8080)
 *     Cosora-Admin:       npm run dev     (localhost:5174)
 */

// This repo is ESM ("type": "module"), so __dirname does not exist.
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
/** supabase-js v2 default. Both apps leave it at the default, and both point at
 *  the same project — so one injected value signs a context into either app. */
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const ADMIN_APP_URL = process.env.ADMIN_APP_URL ?? "http://localhost:5174";

const LOGIN = {
  vendor: "demo-vendor@cosora.dev",
  admin: "demo-admin@cosora.dev",
  buyer: "demo-buyer@cosora.dev",
};
const PASSWORD_DEMO = "cosora123";

/**
 * The real vendor upload already in this project: 478x850, 21s, ~4 MB — a
 * genuine portrait phone clip from the actual user base, not a synthetic
 * fixture. Its dimensions are load-bearing twice over: they are what proves
 * pickRendition() has to derive the rendition (this source yields 240p/360p/480p
 * and NO 720p), and they are the shape the whole 9:16 viewer is built for.
 */
const SOURCE_URL =
  "https://vxdhhgdfubqedfpwfyrb.supabase.co/storage/v1/object/public/product-videos/" +
  "6f66d05d-df40-4019-ac65-4f1599579810/1785812083443-65j7ju.mp4";

// Playwright wipes test-results/ at the start of a run, before hooks execute,
// so writing fixtures here is safe and self-cleaning between runs.
const FIXTURES = path.join(REPO_ROOT, "test-results", "bunny-fixtures");
const MP4_PATH = path.join(FIXTURES, "real-source.mp4");
/** A QuickTime-branded copy of the above, named .mp4 — see makeQuickTimeCopy. */
const FAKE_MP4_PATH = path.join(FIXTURES, "iphone-clip.mp4");

const CAPTION = `zz-bunny-uitest-${Date.now().toString(36)}`;
const ENCODE_TIMEOUT_MS = 6 * 60_000;
const POLL_MS = 10_000;

/** Anything that would mean bytes left the browser. T1 asserts none of it fired. */
const UPLOAD_ATTEMPT = /video\.bunnycdn\.com|\/storage\/v1\/upload\/resumable|\/functions\/v1\/bunny-upload-url/;

function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
}

async function apiSignIn(email: string, password = PASSWORD_DEMO) {
  const db = anonClient();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, session: data.session, id: data.user!.id };
}

/**
 * Boot a context already signed in as `email`.
 *
 * Sessions are minted through supabase-js in Node and injected into
 * localStorage before the app boots, rather than driven through a login form —
 * the same convention chat-pipeline.spec.ts established, for the same reason:
 * the form is not what these tests are about, and OTP is the real production
 * path anyway.
 */
async function contextAs(browser: Browser, email: string): Promise<{ ctx: BrowserContext; db: SupabaseClient; id: string }> {
  const { session, id, db } = await apiSignIn(email);
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [STORAGE_KEY, JSON.stringify(session)] as const,
  );
  return { ctx, db, id };
}

/**
 * Turn the real MP4 into a file whose container signature says QuickTime.
 *
 * ISO base media layout: [4-byte box size]['f','t','y','p'][4-byte major brand].
 * A QuickTime .mov carries the major brand `qt  `; an MP4 carries isom/mp42/etc.
 * Rewriting only those 4 bytes leaves every other byte of a real video intact
 * and produces exactly what sniffVideoContainer inspects.
 *
 * WHAT THIS DOES AND DOES NOT PROVE. It proves the client gate discriminates on
 * the real container signature rather than on the filename — the realistic
 * failure mode, a phone's .mov renamed to .mp4. It is NOT a claim about HEVC,
 * about whether a full QuickTime atom tree would also be caught, or about what
 * Bunny would do with such a file; the last of those is out of scope by
 * instruction, since a transcoder would likely normalise it and silently
 * reverse the documented "iPhone .mov not accepted" business rule.
 *
 * (ffmpeg would give a byte-for-byte real .mov via `-c copy -f mov`, but it is
 * not on PATH here, and adding a binary dependency to run one assertion buys
 * nothing the sniff can actually see: it reads 12 bytes and stops.)
 */
function makeQuickTimeCopy(fromPath: string, toPath: string) {
  const buf = readFileSync(fromPath);
  const magic = buf.subarray(4, 8).toString("ascii");
  if (magic !== "ftyp") {
    throw new Error(`source is not ISO base media (bytes 4-8 = ${JSON.stringify(magic)}); fixture cannot be derived`);
  }
  buf.write("qt  ", 8, 4, "ascii");
  writeFileSync(toPath, buf);
  return buf;
}

// ── Shared state, arranged once in beforeAll ───────────────────────────────
let vendor: { db: SupabaseClient; id: string };
let adminDb: SupabaseClient;
let slot: {
  videoId: string;
  libraryId: string;
  expirationTime: number;
  signature: string;
  endpoint: string;
  rendition: number;
  playbackUrl: string;
  thumbnailUrl: string;
};
let rowId: string | null = null;

/** The Bunny library as its own API reports it — the only honest oracle. */
async function bunnyLibrary(): Promise<{ guid: string; status: number; availableResolutions: string | null }[]> {
  const { data, error } = await adminDb.functions.invoke("bunny-reconcile", { body: {} });
  if (error) throw new Error(`bunny-reconcile: ${error.message}`);
  if (data?.error) throw new Error(`bunny-reconcile: ${data.detail || data.error}`);
  return data.library ?? [];
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Downloading ~4 MB and waiting on a real transcode is the bulk of this.
  test.setTimeout(ENCODE_TIMEOUT_MS + 120_000);

  mkdirSync(FIXTURES, { recursive: true });

  const v = await apiSignIn(LOGIN.vendor);
  vendor = { db: v.db, id: v.id };
  // bunny-reconcile is admin-gated (it enumerates every vendor's library).
  adminDb = (await apiSignIn(LOGIN.admin)).db;

  // ── Fixtures ────────────────────────────────────────────────────────────
  if (!existsSync(MP4_PATH)) {
    const resp = await fetch(SOURCE_URL);
    if (!resp.ok) throw new Error(`source fetch ${resp.status}`);
    await pipeline(Readable.fromWeb(resp.body as never), createWriteStream(MP4_PATH));
  }
  makeQuickTimeCopy(MP4_PATH, FAKE_MP4_PATH);

  // ── A real Bunny-backed row to drive the UI against ─────────────────────
  // Arranged through the API rather than by driving the upload form, so that a
  // Bunny outage or a slow transcode fails in a hook with a clear message
  // instead of failing an assertion about the UI. The form's own gate is what
  // T1/T1b test; this is the published-content path.
  {
    const { data, error } = await vendor.db.functions.invoke("bunny-upload-url", {
      // The real probed dimensions of the source clip, exactly as
      // UploadVideo.tsx sends them from probeVideoFile().
      body: { title: CAPTION, width: 478, height: 850 },
    });
    if (error) throw new Error(`bunny-upload-url: ${error.message}`);
    if (data?.error) throw new Error(`bunny-upload-url: ${data.detail || data.error}`);
    slot = data;
  }

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(createReadStream(MP4_PATH), {
      endpoint: slot.endpoint,
      uploadSize: statSync(MP4_PATH).size,
      retryDelays: [0, 3000, 5000, 10000],
      headers: {
        AuthorizationSignature: slot.signature,
        AuthorizationExpire: String(slot.expirationTime),
        LibraryId: slot.libraryId,
        VideoId: slot.videoId,
      },
      metadata: { filetype: "video/mp4", title: CAPTION },
      chunkSize: 8 * 1024 * 1024,
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });

  // 3 = Finished, 4 = Resolution finished. Anything else and the renditions the
  // UI is about to be asked to play do not exist yet.
  const deadline = Date.now() + ENCODE_TIMEOUT_MS;
  let entry: { status: number; availableResolutions: string | null } | undefined;
  while (Date.now() < deadline) {
    entry = (await bunnyLibrary()).find((x) => x.guid === slot.videoId);
    if (entry && (entry.status === 3 || entry.status === 4)) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  if (!entry || (entry.status !== 3 && entry.status !== 4)) {
    throw new Error(`Bunny never finished encoding ${slot.videoId} (status=${entry?.status ?? "absent"})`);
  }

  const { data: row, error: insErr } = await vendor.db
    .from("product_videos")
    .insert({
      vendor_id: vendor.id,
      brand_line: CAPTION,
      category: "Buttons",
      provider: "bunny",
      bunny_video_id: slot.videoId,
      video_url: slot.playbackUrl,
      thumbnail_url: slot.thumbnailUrl,
      duration_seconds: 21,
      video_width: 478,
      video_height: 850,
    })
    .select("id, status")
    .single();
  if (insErr) throw new Error(`insert: ${insErr.message}`);
  rowId = row.id;
  // Not the assertion — the arrangement. The trigger forcing under_review is
  // asserted properly (against an insert that explicitly asks for 'live') in
  // scripts/bunny-e2e-check.mjs step 5. Here it is a precondition: T2 is about
  // the queue rendering, and it needs the row to be IN the queue.
  if (row.status !== "under_review") {
    throw new Error(`expected a fresh row to be under_review, got ${row.status}`);
  }
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  if (rowId) {
    // Provider first, then the row — the same order deleteProductVideo() uses,
    // and for the same reason: the row is the only record of where the media
    // lives, so dropping it first strands a paid asset nothing can find again.
    const { error } = await vendor.db.functions.invoke("bunny-delete-video", { body: { rowId } });
    if (error) console.error(`cleanup: bunny-delete-video failed — ${error.message}`);
    await vendor.db.from("product_videos").delete().eq("id", rowId);
  }
  await vendor?.db.auth.signOut();
  await adminDb?.auth.signOut();
});

// ───────────────────────────────────────────────────────────────────────────
// T1/T1b — the client-side container gate, in a real browser
// ───────────────────────────────────────────────────────────────────────────

/** Open the vendor upload form and start recording anything upload-shaped. */
async function uploadPageWithSpy(ctx: BrowserContext): Promise<{ page: Page; attempts: string[] }> {
  const page = await ctx.newPage();
  const attempts: string[] = [];
  page.on("request", (r) => {
    if (UPLOAD_ATTEMPT.test(r.url())) attempts.push(`${r.method()} ${r.url()}`);
  });
  await page.goto("/upload-video", { waitUntil: "domcontentloaded" });
  await expect(page.locator('input[type="file"][accept*="video"]')).toBeAttached();
  return { page, attempts };
}

test("T8.1 a QuickTime file renamed .mp4 is rejected client-side, before any upload attempt", async ({ browser }) => {
  const { ctx } = await contextAs(browser, LOGIN.vendor);
  const { page, attempts } = await uploadPageWithSpy(ctx);

  await page.locator('input[type="file"][accept*="video"]').setInputFiles({
    name: "iphone-clip.mp4",
    // The declared type a renamed .mov really carries: the browser derives
    // file.type from the extension, so it claims video/mp4 and sails past the
    // MIME allowlist. Setting it explicitly is what makes this the renamed-file
    // case rather than a file the first check would have caught anyway.
    mimeType: "video/mp4",
    buffer: readFileSync(FAKE_MP4_PATH),
  });

  await expect(page.getByText("This is a QuickTime (.mov) file renamed to .mp4")).toBeVisible();
  await expect(page.getByText(/Re-export it as an MP4/i)).toBeVisible();

  // The file must not have been accepted into the form either — a visible
  // error over a staged file would still let the vendor press Publish.
  await expect(page.locator("video")).toHaveCount(0);

  // The actual claim in the brief: rejected BEFORE any upload attempt. A toast
  // proves the message; only this proves no bytes and no slot request left.
  expect(attempts, `expected no upload traffic, saw:\n${attempts.join("\n")}`).toHaveLength(0);

  await ctx.close();
});

test("T8.1b positive control: the same file with its real MP4 brand is accepted", async ({ browser }) => {
  // Without this, T8.1 passes just as well against a gate that rejects
  // everything — which is the failure mode that makes a suite worthless.
  const { ctx } = await contextAs(browser, LOGIN.vendor);
  const { page } = await uploadPageWithSpy(ctx);

  await page.locator('input[type="file"][accept*="video"]').setInputFiles({
    name: "real-clip.mp4",
    mimeType: "video/mp4",
    buffer: readFileSync(MP4_PATH),
  });

  // Accepted == staged for preview. Nothing is uploaded until Publish.
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.getByText(/renamed to \.mp4|isn't really an MP4/i)).toHaveCount(0);

  await ctx.close();
});

// ───────────────────────────────────────────────────────────────────────────
// T2–T4 — Cosora-Admin's moderation queue, against a provider='bunny' row
// ───────────────────────────────────────────────────────────────────────────

test("T8.2 the bunny row reaches Cosora-Admin's queue, gated exactly as before", async ({ browser }) => {
  const { ctx } = await contextAs(browser, LOGIN.admin);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_APP_URL}/videos`, { waitUntil: "domcontentloaded" });

  // The queue tab is the default; the row must be in it, not merely in the DB.
  await expect(page.getByRole("heading", { name: "Video Closeups" })).toBeVisible();
  const card = page.locator("h3", { hasText: CAPTION });
  await expect(card).toBeVisible({ timeout: 20_000 });

  // Provider is invisible to moderation by design — this row must look and
  // behave like any other. The dimensions come from the columns the vendor
  // upload path fills in, and are what tell a moderator it is a portrait clip.
  await expect(page.getByText("478×850")).toBeVisible();
  // exact: see T8.4 — "Approve" is a substring of the bulk button's label.
  await expect(page.getByRole("button", { name: "Approve", exact: true }).first()).toBeEnabled();

  await ctx.close();
});

test("T8.3 the moderator's player actually plays the Bunny MP4", async ({ browser }) => {
  // THE assertion the API script structurally cannot make. From Node every one
  // of these URLs is a 403 (blank Referer -> hotlink protection). A browser
  // sends a Referer, so a successful decode here is the direct measurement that
  // retracts the "pull zone 403s everything" finding.
  const { ctx } = await contextAs(browser, LOGIN.admin);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_APP_URL}/videos`, { waitUntil: "domcontentloaded" });

  await expect(page.locator("h3", { hasText: CAPTION })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: `Play "${CAPTION}"` }).click();

  const player = page.locator(`video[src="${slot.playbackUrl}"]`);
  await expect(player).toBeVisible();

  // readyState >= 2 (HAVE_CURRENT_DATA) means a frame was actually decoded —
  // not merely that the element mounted with a src. A 403 or a 404 leaves it
  // at 0 forever, which is exactly the state a blank black rectangle has.
  await expect
    .poll(() => player.evaluate((el: HTMLVideoElement) => el.readyState), {
      timeout: 30_000,
      message: `Bunny MP4 never decoded a frame: ${slot.playbackUrl}`,
    })
    .toBeGreaterThanOrEqual(2);

  // A decoded frame with real pixel dimensions rules out an audio-only or
  // metadata-only decode satisfying the check above.
  expect(
    await player.evaluate((el: HTMLVideoElement) => el.videoWidth),
    "decoded frame should have a real width",
  ).toBeGreaterThan(0);

  // The "probably still encoding" Note must NOT be showing — its presence would
  // mean onError fired, which is the incident that Note exists to explain.
  await expect(page.getByText(/This file did not load/i)).toHaveCount(0);

  await ctx.close();
});

test("T8.4 approving through the admin UI publishes it", async ({ browser }) => {
  const { ctx } = await contextAs(browser, LOGIN.admin);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_APP_URL}/videos`, { waitUntil: "domcontentloaded" });

  const heading = page.locator("h3", { hasText: CAPTION });
  await expect(heading).toBeVisible({ timeout: 20_000 });

  // Scope the click to THIS row's card — the innermost element holding both
  // this caption and an Approve button. Without the scope, `.first()` on a
  // page-wide Approve locator approves whatever row the queue happens to sort
  // first, which on a shared database is somebody else's video.
  //
  // `exact` is not cosmetic. A substring match on "Approve" also matches
  // "Approve all for vendor…", which is approve_vendor_content_bulk — it
  // approves that vendor's pending PRODUCTS and CATALOGUES as well as their
  // videos. Strict mode caught the ambiguity here; an auto-first-match API
  // would have silently clicked one or the other.
  const card = page
    .locator("div")
    .filter({ has: page.locator("h3", { hasText: CAPTION }) })
    .filter({ has: page.getByRole("button", { name: "Approve", exact: true }) })
    .last();
  await card.getByRole("button", { name: "Approve", exact: true }).click();

  // Leaving the under_review tab is the UI's report. The DB is the truth — and
  // the two disagreeing is exactly what this layer exists to catch, so assert
  // both rather than trusting either.
  await expect(heading).toHaveCount(0, { timeout: 20_000 });

  const { data } = await adminDb
    .from("product_videos")
    .select("status, provider, bunny_video_id")
    .eq("id", rowId!)
    .single();
  expect(data?.status, "the database must agree the row is live").toBe("live");
  expect(data?.provider).toBe("bunny");
  expect(data?.bunny_video_id).toBe(slot.videoId);

  await ctx.close();
});

// ───────────────────────────────────────────────────────────────────────────
// T5 — the buyer feed, which is the whole point of the migration
// ───────────────────────────────────────────────────────────────────────────

test("T8.5 the approved bunny video renders and plays in the buyer reel", async ({ browser }) => {
  const { ctx } = await contextAs(browser, LOGIN.buyer);
  const page = await ctx.newPage();
  await page.goto("/video-closeups", { waitUntil: "domcontentloaded" });

  // VideoCloseUpsPage opens the viewer on mount and falls back to dev-only
  // sample clips ONLY when the live list is empty — so a passing assertion here
  // cannot be satisfied by the samples: it names this row's Bunny URL.
  const player = page.locator(`video[src="${slot.playbackUrl}"]`);
  await expect(player).toBeAttached({ timeout: 30_000 });

  await expect
    .poll(() => player.evaluate((el: HTMLVideoElement) => el.readyState), {
      timeout: 30_000,
      message: `buyer feed never decoded a frame from ${slot.playbackUrl}`,
    })
    .toBeGreaterThanOrEqual(2);

  // The stored URL is the MP4 rendition the edge function derived from the
  // source dimensions, not a hardcoded 720p — a 478x850 source has no 720p
  // rendition, so this URL 404ing is precisely the regression to catch.
  expect(slot.playbackUrl).toContain(`play_${slot.rendition}p.mp4`);
  expect(slot.rendition, "a 478x850 source must not be served a 720p URL").toBeLessThan(720);

  await ctx.close();
});
