/**
 * Proves the Bunny spec's slow-encode path: "the encode outlasts the timeout, and
 * afterAll still deletes the video" (ToDo, 2026-09-11; written 2026-10-13).
 *
 * tests/video-closeups-bunny.spec.ts inserts its product_videos row BEFORE waiting for
 * Bunny to encode, so that a transcode which outlasts the wait can still be cleaned up
 * through the row. That fix had never run: every encode since finished in time, and a
 * slow encode can't be ordered up.
 *
 * It doesn't need to be. The path through the spec is "the deadline passes while the asset
 * exists at Bunny", and a deadline of 1 ms passes at once. So this script runs the REAL
 * spec (test T8.2, which is the first to call arrangeBunnyRow) with
 * BUNNY_ENCODE_TIMEOUT_MS=1: the clip is really uploaded, the row is really inserted, the
 * wait really times out, and the spec's own afterAll really has to remove both. Nothing
 * here is a copy of that cleanup.
 *
 * THE ORACLE IS BUNNY'S API (bunny-reconcile), as in bunny-e2e-check.mjs: the library is
 * listed before and after, and a video that exists afterwards and didn't before is an
 * orphan. The CDN can't answer this (it says 403 for present and absent alike).
 *
 * SAFETY:
 *   - it stops BEFORE uploading anything unless bunny-reconcile answers, because the same
 *     key deletes: with no working key the run could only create an orphan;
 *   - the spec keeps its row when the provider delete fails, so a failed cleanup leaves
 *     something findable; this script then prints the guid and the row id.
 * It writes to production (one under_review row of the demo vendor, removed again) and
 * uploads one ~4 MB clip to the paid Bunny library, like the spec it runs.
 *
 * Run: node scripts/bunny-slow-encode-check.mjs        (needs .env; no dev server)
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { demoAccount } from "./lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const results = [];
let failures = 0;
const rec = (step, verdict, detail = "") => {
  results.push({ step, verdict, detail: String(detail).slice(0, 96) });
  if (verdict.startsWith("***")) failures++;
};
const finish = () => {
  console.table(results);
  console.log(failures === 0
    ? "\nPASS: the encode timed out with the asset at Bunny, and the spec's cleanup removed the asset and the row."
    : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
{
  const { error } = await admin.auth.signInWithPassword(demoAccount("admin"));
  if (error) { console.error(`admin login failed: ${error.message}`); process.exit(1); }
}
const vendor = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
{
  const { error } = await vendor.auth.signInWithPassword(demoAccount("vendor"));
  if (error) { console.error(`vendor login failed: ${error.message}`); process.exit(1); }
}

/** The Bunny library as its API reports it, or the reason it couldn't be read. */
async function library() {
  const { data, error } = await admin.functions.invoke("bunny-reconcile", { body: {} });
  if (error) {
    // supabase-js hides a non-2xx body behind a generic message; the body says whether it
    // was Bunny that refused (bunny_list_failed, with Bunny's own status) or this project.
    const body = await error.context?.text?.().catch(() => "");
    return { problem: body ? `${error.context.status} ${body}` : error.message };
  }
  if (data?.error) return { problem: data.detail || data.error };
  return { guids: new Set((data.library ?? []).map((v) => v.guid)), entries: data.library ?? [] };
}
const testRows = async () => {
  const { data, error } = await vendor.from("product_videos").select("id, bunny_video_id, brand_line, status").like("brand_line", "zz-bunny-uitest-%");
  if (error) throw new Error(`product_videos: ${error.message}`);
  return data ?? [];
};

// ── 0. The oracle, and the key that deletes, must work before anything is uploaded ──
const before = await library();
if (before.problem) {
  rec("0. bunny-reconcile reads the library", "*** BLOCKED ***", before.problem);
  console.table(results);
  console.log("\nNothing was uploaded. bunny-reconcile and bunny-delete-video use the same Bunny API key: until it works, " +
    "this run could only leave an orphan. Fix BUNNY_API_KEY (ToDo: \"Fix the Bunny Stream API key\") and run again.");
  process.exit(2);
}
rec("0. bunny-reconcile reads the library", "PASS", `${before.guids.size} video(s) before`);
const rowsBefore = await testRows();
rec("0b. no test row left by an earlier run", rowsBefore.length === 0 ? "PASS" : "*** FAIL ***",
  rowsBefore.length === 0 ? "" : rowsBefore.map((r) => `${r.id} → ${r.bunny_video_id}`).join("; "));
if (rowsBefore.length) finish();

// ── 1. Run the real spec with a deadline that has already passed ──
const run = spawnSync("npx", ["playwright", "test", "tests/video-closeups-bunny.spec.ts", "-g", "T8.2", "--reporter=line"], {
  env: { ...process.env, BUNNY_ENCODE_TIMEOUT_MS: "1" },
  encoding: "utf8",
  shell: true,
  timeout: 10 * 60_000,
});
const out = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
const timedOut = /did not finish encoding ([0-9a-f-]{36}) within/i.exec(out);
rec("1. the spec's encode wait timed out", timedOut ? "PASS" : "*** FAIL ***",
  timedOut ? `guid=${timedOut[1]}` : (out.match(/Error: .*/)?.[0] ?? `exit ${run.status}; no timeout message`));
rec("1b. so T8.2 failed, as a slow encode makes it", run.status !== 0 ? "PASS" : "*** FAIL ***", `playwright exit ${run.status}`);
const cleanupComplaint = /cleanup: bunny-delete-video failed[^\n]*/.exec(out);
rec("1c. afterAll's provider delete reported no failure", cleanupComplaint ? "*** FAIL ***" : "PASS", cleanupComplaint?.[0] ?? "");

// ── 2. Bunny's own API: the asset the run made is gone ──
let after = await library();
for (let i = 0; i < 5 && !after.problem && timedOut && after.guids.has(timedOut[1]); i++) {
  await new Promise((r) => setTimeout(r, 4000));
  after = await library();
}
if (after.problem) {
  rec("2. the library after the run", "*** FAIL ***", after.problem);
} else {
  const orphans = [...after.guids].filter((g) => !before.guids.has(g));
  if (timedOut) {
    rec("2. the uploaded asset is gone from Bunny", after.guids.has(timedOut[1]) ? "*** FAIL ***" : "PASS",
      after.guids.has(timedOut[1]) ? `still listed: ${timedOut[1]}` : "not in the library");
  }
  rec("2b. the run left no new video at Bunny", orphans.length === 0 ? "PASS" : "*** FAIL ***",
    orphans.length === 0 ? `${after.guids.size} video(s) after` : `orphan(s): ${orphans.join(", ")}`);
}

// ── 3. And no row ──
const rowsAfter = await testRows();
rec("3. the spec's row is gone", rowsAfter.length === 0 ? "PASS" : "*** FAIL ***",
  rowsAfter.length === 0 ? "" : rowsAfter.map((r) => `${r.id} → ${r.bunny_video_id}`).join("; "));

finish();
