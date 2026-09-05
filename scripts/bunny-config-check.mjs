/**
 * Is Bunny Stream actually wired up on this project?
 *
 * Phase 8's brief says to confirm BUNNY_API_KEY and BUNNY_LIBRARY_ID exist
 * before starting, via `supabase secrets list`. That needs a management access
 * token, which this environment does not have (and which is not in either
 * repo's .env by design). This script answers the same question from the other
 * end, without one: it signs in as a real vendor and calls
 * `bunny-upload-url` with `{"probe":true}`, which returns the configuration
 * verdict WITHOUT creating a Bunny video object.
 *
 * That last part is the whole reason the probe flag exists. The only other way
 * to find out is to run a real upload, and a real upload leaves a stray empty
 * video in the library every single time anyone checks.
 *
 * IT NEVER PRINTS A SECRET. The function returns secret NAMES when they are
 * absent and the (public) CDN hostname when they are present. The API key never
 * leaves the edge runtime.
 *
 * Run: node scripts/bunny-config-check.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

// The same demo vendor the other scripts in this folder use. It must be a
// vendor (vendor_profiles row) AND active, because the probe deliberately sits
// behind the function's full authorization gate rather than merely behind
// authentication.
const VENDOR = { email: "demo-vendor@cosora.dev", password: "cosora123" };

const db = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await db.auth.signInWithPassword(VENDOR);
if (authErr) {
  console.error(`login failed for ${VENDOR.email}: ${authErr.message}`);
  process.exit(1);
}

const { data, error } = await db.functions.invoke("bunny-upload-url", { body: { probe: true } });

let verdict;
let detail = "";
if (error) {
  // A non-2xx surfaces as FunctionsHttpError whose message is only "non-2xx
  // status"; dig out the function's own words.
  detail = error.message;
  const ctx = error.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json();
      detail = [body.detail, body.error].filter(Boolean).join(" — ") || detail;
    } catch {
      /* keep the original message */
    }
  }
  verdict = "*** ERROR ***";
} else if (data?.error === "not_configured") {
  verdict = "*** NOT CONFIGURED ***";
  detail = String(data.detail || "");
} else if (data?.error) {
  verdict = "*** ERROR ***";
  detail = String(data.detail || data.error);
} else if (data?.configured) {
  verdict = "CONFIGURED";
  detail = `cdnHostname=${data.cdnHostname}`;
} else {
  verdict = "*** UNEXPECTED ***";
  detail = JSON.stringify(data).slice(0, 200);
}

console.table([{ check: "bunny-upload-url probe", verdict, detail }]);

await db.auth.signOut();

if (verdict !== "CONFIGURED") {
  console.log(
    "\nBunny is not usable yet. createProductVideo() will keep taking the Supabase\n" +
      "Storage path (provider='supabase'), which is safe but means the migration has\n" +
      "not actually happened. Set the missing secret(s) with:\n" +
      "  npx supabase secrets set --project-ref vxdhhgdfubqedfpwfyrb \"NAME=value\"\n",
  );
  process.exit(1);
}

console.log(
  "\nPASS — all three secrets are present and the function authorized a real vendor.\n" +
    "Still unverified by this check: whether MP4 Fallback is enabled in the Bunny\n" +
    "library's Encoding tab. That setting is NOT retroactive, and without it every\n" +
    "play_720p.mp4 URL this function hands out will 404 forever. Confirm it in the\n" +
    "dashboard before the first real upload.\n",
);
