#!/usr/bin/env node
// ─────────────────────────────────────────────────
// "GST is computed once, and exactly as the subscription flow always did."
//
// supabase/functions/_shared/gst.ts replaced three copies of
//   const GST_RATE = 0.18; const gst = Math.round(base * GST_RATE);
// in subscription-create-order, -verify-payment and -webhook (Phase 20 of the My
// Profile brief, 2026-09-24, MPF-11 part B). This asserts:
//   1. gstOn() gives the old formula's answer for every live plan price (read
//      from subscription_plans, public), both cycles, and a sweep of amounts,
//      including the x.5 rounding edges;
//   2. total = base + gst, and the paise amount create-order sends is total × 100;
//   3. none of the three functions keeps its own copy: each imports gstOn, or
//      subscriptionAmounts() from _shared/discounts.ts, which imports gstOn
//      (admin completion Phase 10, 2026-09-29), and none defines GST_RATE;
//   4. with no discount, subscriptionAmounts() charges exactly what gstOn() did,
//      and with one, GST is on the discounted price.
// Nothing buyer-facing calls gstOn() yet: buyers pay Cosora nothing today.
//
//   node scripts/gst-check.mjs
// ─────────────────────────────────────────────────

import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(path.join(tmpdir(), "cosora-gst-"));
const outfile = path.join(dir, "gst.mjs");
await build({ entryPoints: ["supabase/functions/_shared/gst.ts"], outfile, format: "esm", platform: "node", bundle: false, logLevel: "silent" });
const { gstOn, GST_RATE } = await import(pathToFileURL(outfile).href);

let failures = 0;
const rows = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  rows.push({ check: name, verdict: ok ? "PASS" : "*** FAIL ***", detail });
};
const old = (base) => Math.round(base * 0.18); // the three removed copies, verbatim

// 1. Live plan prices.
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/subscription_plans?select=id,monthly_price,yearly_price`, {
  headers: { apikey: env.VITE_SUPABASE_ANON_KEY },
});
const plans = res.ok ? await res.json() : [];
check("subscription_plans readable", plans.length > 0, `${plans.length} plans`);
check("the rate is 18%", GST_RATE === 0.18, `GST_RATE=${GST_RATE}`);
const planDetail = [];
for (const p of plans) {
  for (const cycle of ["monthly_price", "yearly_price"]) {
    const base = Number(p[cycle]);
    const r = gstOn(base);
    planDetail.push(`${p.id} ${cycle.split("_")[0]} ₹${base} → gst ₹${r.gst}, total ₹${r.total}`);
    check(`${p.id} ${cycle}: same GST as before`, r.gst === old(base), `₹${base}: new ${r.gst} vs old ${old(base)}`);
    check(`${p.id} ${cycle}: total = base + gst, paise = total × 100`,
      r.total === base + r.gst && r.total * 100 === (base + old(base)) * 100, `total ₹${r.total}`);
  }
}

// 2. A sweep: every whole rupee to ₹1,00,000, and the half-rupee edges.
let sweepBad = 0;
for (let base = 0; base <= 100000; base++) if (gstOn(base).gst !== old(base)) sweepBad++;
check("₹0 – ₹1,00,000: same GST as before", sweepBad === 0, `${sweepBad} differences`);
const edges = [25, 75, 125, 175, 225]; // base × 0.18 = x.5 (4.5, 13.5, 22.5, …)
check("x.5 rounds as before (Math.round, half up)", edges.every((b) => gstOn(b).gst === old(b)),
  edges.map((b) => `₹${b}→${gstOn(b).gst}`).join(" "));
check("a different rate can be passed", gstOn(1000, 0.05).gst === 50, `₹1000 @5% → ${gstOn(1000, 0.05).gst}`);

// 3. No function keeps its own copy. Since Phase 10 they reach gstOn() through
//    subscriptionAmounts(), which takes the discount off first.
const discountsSrc = readFileSync("supabase/functions/_shared/discounts.ts", "utf8");
check("_shared/discounts.ts imports gstOn from gst.ts", discountsSrc.includes('import { gstOn } from "./gst.ts";'));
check("_shared/discounts.ts has no inline GST_RATE or formula", !/GST_RATE|\* 0\.18/.test(discountsSrc));
for (const f of ["subscription-create-order", "subscription-verify-payment", "subscription-webhook"]) {
  const src = readFileSync(`supabase/functions/${f}/index.ts`, "utf8");
  const viaShared = src.includes('import { gstOn } from "../_shared/gst.ts";')
    || /import \{[^}]*\bsubscriptionAmounts\b[^}]*\} from "\.\.\/_shared\/discounts\.ts";/.test(src);
  check(`${f} gets GST from _shared/gst.ts`, viaShared);
  check(`${f} has no inline GST_RATE or formula`, !/GST_RATE|base \* 0\.18/.test(src));
}

// 4. The discounted path: nothing changes without a code, and GST follows the discount.
const discountsOut = path.join(dir, "discounts.mjs");
await build({ entryPoints: ["supabase/functions/_shared/discounts.ts"], outfile: discountsOut, format: "esm", platform: "node", bundle: true, logLevel: "silent" });
const { subscriptionAmounts } = await import(pathToFileURL(discountsOut).href);
let noCodeBad = 0;
for (let list = 1; list <= 100000; list += 7) {
  const m = subscriptionAmounts(list, 0);
  if (m.gst !== old(list) || m.paise !== (list + old(list)) * 100) noCodeBad++;
}
check("no code: the same charge as before", noCodeBad === 0, `${noCodeBad} differences`);
const gold = subscriptionAmounts(2299, 575);
check("25% off Gold monthly: GST on ₹1,724", gold.base === 1724 && gold.gst === 310 && gold.total === 2034 && gold.paise === 203400,
  `base ₹${gold.base}, gst ₹${gold.gst}, total ₹${gold.total}`);
// 5. The browser's copy (src/lib/gst.ts), which the plan checkout shows before a
//    vendor pays, gives the charged answer for every whole rupee.
const clientOut = path.join(dir, "client-gst.mjs");
await build({ entryPoints: ["src/lib/gst.ts"], outfile: clientOut, format: "esm", platform: "node", bundle: false, logLevel: "silent" });
const client = await import(pathToFileURL(clientOut).href);
let mirrorBad = 0;
for (let base = 0; base <= 100000; base++) {
  const a = client.gstOn(base), b = gstOn(base);
  if (a.gst !== b.gst || a.total !== b.total) mirrorBad++;
}
check("shown GST (src/lib/gst.ts) === charged GST, ₹0 – ₹1,00,000", mirrorBad === 0 && client.GST_RATE === GST_RATE,
  `${mirrorBad} differences`);

const full = subscriptionAmounts(699, 699);
check("100% off: ₹0, no GST", full.total === 0 && full.gst === 0 && full.paise === 0, `total ₹${full.total}`);
const over = subscriptionAmounts(699, 5000);
check("a discount never exceeds the price", over.discount === 699 && over.total === 0, `discount ₹${over.discount}`);

console.table(rows);
console.log(planDetail.join("\n"));
console.log(failures === 0 ? "\nGST CONSISTENT — one formula, same results as the three copies it replaced" : `\n${failures} CHECK(S) FAILED`);
rmSync(dir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
