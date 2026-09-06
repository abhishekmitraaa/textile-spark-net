/**
 * Bunny Stream, end to end, against the REAL library — upload, encode, moderate, delete.
 *
 * The API-layer half of Phase 8's fixture test. It exercises the whole chain the
 * browser would: mint a slot through `bunny-upload-url`, TUS the bytes straight
 * to Bunny, wait for encoding, discover which renditions actually exist, insert
 * the row and confirm the moderation trigger still forces `under_review`, then
 * delete through `bunny-delete-video` and confirm the asset is really gone.
 *
 * THE ORACLE IS BUNNY'S API, NOT THE CDN — learned the hard way.
 * The first version of this script HEADed the public playback URLs. That is
 * wrong twice over on this library: the pull zone answers 403 for a file that
 * does not exist AND for one that does, so (a) it cannot say which renditions
 * were produced, and (b) the "asset is gone after delete" assertion passed for
 * the wrong reason — 403 before, 403 after. Both answers now come from
 * `bunny-reconcile`, which reads the library through the API with the key that
 * never leaves the edge runtime. The phase brief asked for exactly this: verify
 * deletion "via a follow-up list/get call against Bunny's API, not just that the
 * DB row is gone".
 *
 * The CDN is still probed, but only as a diagnostic — a 403 on a rendition the
 * API says exists means the pull zone is protected (token auth / referrer
 * rules), which is a playback blocker in its own right.
 *
 * SAFETY: everything it creates it destroys — the throwaway row is deleted in a
 * finally block and the Bunny video goes through the real delete path. It never
 * touches the one real product_videos row.
 *
 * Run: node scripts/bunny-e2e-check.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, createWriteStream, createReadStream, statSync, unlinkSync, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import * as tus from "tus-js-client";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const VENDOR = { email: "demo-vendor@cosora.dev", password: "cosora123" };
const ADMIN = { email: "demo-admin@cosora.dev", password: "cosora123" };

// The real vendor upload already in the project: 478x850, 21s, ~4 MB. Chosen
// deliberately over a synthetic clip — it is a genuine phone video from this
// platform's actual user base, and its dimensions are exactly the case that
// decides whether hardcoding `play_720p.mp4` is safe.
const SOURCE_URL =
  "https://vxdhhgdfubqedfpwfyrb.supabase.co/storage/v1/object/public/product-videos/" +
  "6f66d05d-df40-4019-ac65-4f1599579810/1785812083443-65j7ju.mp4";
// fileURLToPath, not .pathname: this repo lives under a path containing a
// space, which .pathname hands back percent-encoded and fs cannot open.
const LOCAL_PATH = fileURLToPath(new URL("../test-results/bunny-e2e-source.mp4", import.meta.url));

const ENCODE_TIMEOUT_MS = 5 * 60_000;
const POLL_MS = 10_000;

const results = [];
let failures = 0;
const rec = (step, verdict, detail = "") => {
  results.push({ step, verdict, detail: String(detail).slice(0, 78) });
  if (verdict.startsWith("***")) failures++;
};

const head = async (url, referer) => {
  try {
    return (await fetch(url, {
      method: "HEAD",
      headers: referer ? { Referer: referer, Origin: new URL(referer).origin } : {},
    })).status;
  } catch {
    return 0;
  }
};

// Bunny's documented causes of a 403 on a Stream playback URL are: token
// authentication enabled, an allowed-referrers allowlist, or "block direct URL
// file access" — and that last one rejects requests with a BLANK Referer.
// A script HEADing a URL sends no Referer; a browser playing the reel always
// does. So probing without one cannot distinguish "playback is broken" from
// "this probe looks like a hotlink", and the difference decides whether the
// migration is blocked or fine. Probe both ways.
const REFERERS = [
  ["no referer (hotlink-shaped)", undefined],
  ["dev origin", "http://localhost:8080/"],
  ["production origin", "https://textile-spark-net.vercel.app/"],
];

const db = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await db.auth.signInWithPassword(VENDOR);
if (authErr) {
  console.error(`login failed for ${VENDOR.email}: ${authErr.message}`);
  process.exit(1);
}
const vendorId = auth.user.id;

// bunny-reconcile is admin-gated (it enumerates every vendor's library), so the
// oracle needs a second session. demo-admin is super_admin.
const adminDb = createClient(URL_, ANON, { auth: { persistSession: false } });
const { error: adminErr } = await adminDb.auth.signInWithPassword(ADMIN);
if (adminErr) {
  console.error(`login failed for ${ADMIN.email}: ${adminErr.message}`);
  process.exit(1);
}

/** The Bunny library as the API reports it. Throws rather than guessing. */
async function library() {
  const { data, error } = await adminDb.functions.invoke("bunny-reconcile", { body: {} });
  if (error) throw new Error(`bunny-reconcile: ${error.message}`);
  if (data?.error) throw new Error(`bunny-reconcile: ${data.detail || data.error}`);
  return data.library ?? [];
}

let slot = null;
let rowId = null;

try {
  // ── 1. Source file ───────────────────────────────────────────────────────
  if (!existsSync(LOCAL_PATH)) {
    const resp = await fetch(SOURCE_URL);
    if (!resp.ok) throw new Error(`source fetch ${resp.status}`);
    await pipeline(Readable.fromWeb(resp.body), createWriteStream(LOCAL_PATH));
  }
  const bytes = statSync(LOCAL_PATH).size;
  rec("1. source clip (478x850, real vendor upload)", "INFO", `${(bytes / 1048576).toFixed(1)} MB`);

  // ── 2. Mint an upload slot ───────────────────────────────────────────────
  {
    // Real probed dimensions of the source clip, exactly as UploadVideo.tsx
    // sends them from probeVideoFile(). They decide which rendition the
    // function points video_url at.
    const { data, error } = await db.functions.invoke("bunny-upload-url", {
      body: { title: `e2e-check ${new Date().toISOString()}`, width: 478, height: 850 },
    });
    if (error) throw new Error(`bunny-upload-url: ${error.message}`);
    if (data?.error) throw new Error(`bunny-upload-url: ${data.detail || data.error}`);
    slot = data;
    rec("2. bunny-upload-url minted a slot", "PASS", `guid=${slot.videoId}`);
    const blob = JSON.stringify(data);
    const leaked = /accesskey/i.test(blob) || /apikey/i.test(blob);
    rec("2b. response carries no API key", leaked ? "*** FAIL ***" : "PASS",
      `keys: ${Object.keys(data).join(",")}`);
  }

  // ── 3. TUS straight to Bunny ─────────────────────────────────────────────
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(createReadStream(LOCAL_PATH), {
      endpoint: slot.endpoint,
      uploadSize: statSync(LOCAL_PATH).size,
      retryDelays: [0, 3000, 5000, 10000],
      headers: {
        AuthorizationSignature: slot.signature,
        AuthorizationExpire: String(slot.expirationTime),
        LibraryId: slot.libraryId,
        VideoId: slot.videoId,
      },
      metadata: { filetype: "video/mp4", title: "e2e-check" },
      chunkSize: 8 * 1024 * 1024,
      onError: reject,
      onSuccess: resolve,
    });
    upload.start();
  });
  rec("3. TUS upload to Bunny", "PASS", slot.endpoint);

  // ── 4. Wait for encoding, and ask Bunny WHAT it produced ─────────────────
  const deadline = Date.now() + ENCODE_TIMEOUT_MS;
  let entry = null;
  while (Date.now() < deadline) {
    entry = (await library()).find((v) => v.guid === slot.videoId) ?? null;
    if (entry && (entry.status === 3 || entry.status === 4)) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  if (!entry) throw new Error("uploaded video never appeared in the Bunny library listing");
  rec("4. encoding finished", entry.status === 3 || entry.status === 4 ? "PASS" : "*** FAIL ***",
    `status=${entry.status} progress=${entry.encodeProgress}%`);

  // The non-retroactive Encoding-tab setting, answered authoritatively.
  rec("4b. MP4 Fallback enabled on the library", entry.hasMP4Fallback ? "PASS" : "*** FAIL ***",
    entry.hasMP4Fallback ? "yes" : "OFF — enable in the Encoding tab; it is NOT retroactive");

  const avail = String(entry.availableResolutions || "").split(",").map((r) => r.trim()).filter(Boolean);
  rec("4c. renditions produced", avail.length ? "PASS" : "*** FAIL ***", avail.join(", ") || "none");

  // THE assertion this script exists for: the rendition the function CHOSE from
  // the source dimensions must be one Bunny actually built. This is what turns
  // pickRendition() from a heuristic into a tested rule — a 478x850 phone clip
  // (this platform's real content) yields 240p/360p/480p and no 720p, so a
  // hardcoded 720p would 404 here.
  const chosen = `${slot.rendition}p`;
  rec("4d. chosen rendition exists at Bunny", avail.includes(chosen) ? "PASS" : "*** FAIL ***",
    `chose ${chosen} from 478x850; Bunny built ${avail.join(",") || "none"}`);

  rec("4e. Bunny's own thumbnail filename", "INFO",
    `${entry.thumbnailFileName} (we compose thumbnail.jpg)`);

  // CDN reachability is a SEPARATE question from "the file exists", and the two
  // must be disambiguated or a 403 on a missing file gets misread as a locked
  // pull zone. So probe both: the URL we composed (which may legitimately not
  // exist) and the best rendition Bunny says it DID produce.
  const base = slot.playbackUrl.slice(0, slot.playbackUrl.lastIndexOf("/"));
  const best = ["1080p", "720p", "480p", "360p", "240p"].find((r) => avail.includes(r));

  // Probe a rendition Bunny SAYS exists, under each referer shape.
  //
  // The blank-referer case is a NEGATIVE control, not a failure: the library has
  // "block direct URL file access" turned on, so a request with no Referer is
  // SUPPOSED to be refused. Asserting 200 there would make this script
  // permanently red for correct behaviour, which is how a suite gets ignored.
  // What must hold is the pair — blocked when hotlink-shaped, served when a
  // browser origin is present.
  const codes = {};
  for (const [label, ref] of REFERERS) {
    codes[label] = best ? await head(`${base}/play_${best}.mp4`, ref) : 0;
    rec(`4f. CDN, existing ${best} — ${label}`, "INFO", `-> ${codes[label]}`);
  }
  const blankBlocked = codes["no referer (hotlink-shaped)"] !== 200;
  const browserServed =
    codes["dev origin"] === 200 && codes["production origin"] === 200;
  rec("4g. hotlink protection blocks a blank referer", blankBlocked ? "PASS" : "*** FAIL ***",
    blankBlocked ? "403 as configured" : "served without a referer — hotlink protection is OFF");
  rec("4h. real browser origins are served", browserServed ? "PASS" : "*** FAIL ***",
    browserServed
      ? "dev + production both 200 — reel playback works"
      : "403 with a browser referer — the allowlist excludes these origins, or token auth is on");

  const thumbCode = await head(slot.thumbnailUrl, "https://textile-spark-net.vercel.app/");
  rec("4i. CDN serves thumbnail.jpg (prod referer)", thumbCode === 200 ? "PASS" : "*** FAIL ***", `-> ${thumbCode}`);

  const hlsCode = await head(`${base}/playlist.m3u8`, "https://textile-spark-net.vercel.app/");
  rec("4j. HLS manifest also served (the deferred option)", "INFO", `-> ${hlsCode}`);

  // ── 5. Insert the row; the trigger must still force under_review ─────────
  {
    const { data, error } = await db
      .from("product_videos")
      .insert({
        vendor_id: vendorId,
        brand_line: "zz-bunny-e2e",
        category: "Buttons",
        provider: "bunny",
        bunny_video_id: slot.videoId,
        video_url: slot.playbackUrl,
        thumbnail_url: slot.thumbnailUrl,
        status: "live", // deliberately illegal — the trigger must overwrite it
      })
      .select("id, status, provider, bunny_video_id")
      .single();
    if (error) throw new Error(`insert: ${error.message}`);
    rowId = data.id;
    rec("5. moderation trigger still forces under_review",
      data.status === "under_review" ? "PASS" : "*** FAIL ***",
      `asked for live, got ${data.status}`);
    rec("5b. provider + guid persisted",
      data.provider === "bunny" && data.bunny_video_id === slot.videoId ? "PASS" : "*** FAIL ***",
      `${data.provider} / ${data.bunny_video_id}`);
  }

  // ── 6. Delete at Bunny through the real path ─────────────────────────────
  {
    const { data, error } = await db.functions.invoke("bunny-delete-video", { body: { rowId } });
    if (error) throw new Error(`bunny-delete-video: ${error.message}`);
    if (data?.error) throw new Error(`bunny-delete-video: ${data.detail || data.error}`);
    rec("6. bunny-delete-video reported success", data.deleted ? "PASS" : "*** FAIL ***", JSON.stringify(data));
  }

  // The row being gone is NOT the assertion — the asset being gone is, and the
  // CDN cannot testify to that here (403 either way). Ask the API.
  {
    let stillThere = true;
    for (let i = 0; i < 5 && stillThere; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      stillThere = (await library()).some((v) => v.guid === slot.videoId);
    }
    rec("6b. asset gone from the Bunny library (API)", stillThere ? "*** FAIL ***" : "PASS",
      stillThere ? `guid ${slot.videoId} still listed` : "guid no longer in library listing");
  }
} catch (e) {
  rec("FATAL", "*** FAIL ***", e.message);
} finally {
  if (rowId) {
    const { error } = await db.from("product_videos").delete().eq("id", rowId);
    rec("7. throwaway row removed", error ? "*** FAIL ***" : "PASS", error?.message ?? rowId);
  }
  if (existsSync(LOCAL_PATH)) unlinkSync(LOCAL_PATH);
  await db.auth.signOut();
  await adminDb.auth.signOut();
}

console.table(results);
console.log(failures === 0 ? "\nPASS — the whole Bunny chain works end to end." : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
