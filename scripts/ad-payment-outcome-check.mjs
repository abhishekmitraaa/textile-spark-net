#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// What the Advertise page tells a seller after an ad checkout, checked without a browser
// (Seller Home audit SH-090; final review 2026-11-16).
//
// The rule it protects: the page never says "You were not charged" once Razorpay's checkout
// has handed back a payment, and never says ads are waiting for review when it doesn't know
// that. A real checkout can't be driven in a test, so the decision lives in the import-free
// src/lib/adPaymentOutcome.ts and is exercised here (the pattern of ad-destination-check.mjs).
//
//   node scripts/ad-payment-outcome-check.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(path.join(tmpdir(), "cosora-adpay-"));
const outfile = path.join(dir, "adPaymentOutcome.mjs");
await build({ entryPoints: ["src/lib/adPaymentOutcome.ts"], outfile, format: "esm", platform: "node", bundle: false, logLevel: "silent" });
const { paidAdOutcome, freeAdOutcome } = await import(pathToFileURL(outfile).href);

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${ok ? "" : `\n          ${detail}`}`);
}
const text = (o) => `${o.title} | ${o.description}`;
const PAY = "pay_TEST123";

// ── After Razorpay took a payment ──
let o = paidAdOutcome({ ok: true, count: 2 }, PAY, 2);
check("published: says the ads are waiting for review, with the number sent",
  o.kind === "success" && o.title === "Payment received. Your ads are waiting for Cosora's review"
  && o.description === "2 campaigns sent for review. Your days start when Cosora approves them.", text(o));

o = paidAdOutcome({ ok: true, count: 1 }, PAY, 3);
check("one campaign reads as one", o.description.startsWith("1 campaign sent for review."), text(o));

// The webhook got there first: this call published nothing itself and doesn't know what the webhook did
// (it may have sent the order to refund review), so it claims neither a number nor a review.
o = paidAdOutcome({ ok: true, count: 0, already: true }, PAY, 2);
check("already handled: never '0 campaign', never 'waiting for review'",
  o.kind === "success" && o.title === "Payment received" && !/\b0 campaign/.test(text(o)) && !/waiting for/.test(text(o))
  && o.description.includes(PAY), text(o));

o = paidAdOutcome({ ok: false, retry: true }, PAY, 2);
check("could not be set up yet: payment received, contact support with the payment ID",
  o.kind === "error" && o.title === "Payment received, but your ads are not set up yet" && o.description.includes(PAY), text(o));

o = paidAdOutcome({ ok: false, blocked: true, refundFlagged: true }, PAY, 2);
check("the plan can't run them: refund review",
  o.kind === "error" && o.title === "Payment received, but your plan cannot run these ads"
  && o.description === "The order has been sent for a refund review.", text(o));

o = paidAdOutcome({ ok: false, blocked: true, refundFlagged: true, reason: "refused" }, PAY, 2);
check("refused for another reason: doesn't blame the plan",
  o.kind === "error" && o.title === "Payment received, but these ads could not be set up"
  && o.description === "The order has been sent for a refund review.", text(o));

// A signature that doesn't verify still came from a completed checkout (the handler only runs after payment), and
// can mean the server's key doesn't match the checkout's. Money may have moved.
for (const answer of [{ ok: false, error: "bad_signature" }, { ok: false, error: "no_response" }, { ok: false }]) {
  o = paidAdOutcome(answer, PAY, 2);
  check(`unconfirmed (${answer.error ?? "no reason"}): never "You were not charged"`,
    o.kind === "error" && o.title === "We couldn't confirm your payment" && o.description.includes(PAY)
    && !/not charged|Nothing was charged/i.test(text(o)), text(o));
}

// ── A code took the order to ₹0: nothing was paid ──
o = freeAdOutcome({ ok: true, count: 2 }, 2);
check("free order published", o.kind === "success" && o.title === "Your ads are submitted!" && o.description === "2 campaigns sent for review.", text(o));
o = freeAdOutcome({ ok: true, count: 0, already: true }, 3);
check("free order already handled: no '0 campaign'", o.kind === "success" && !/\b0 campaign/.test(text(o)), text(o));
o = freeAdOutcome({ ok: false, blocked: true }, 2);
check("free order the plan can't run", o.kind === "error" && o.title === "Your plan cannot run these ads" && /Nothing was charged/.test(o.description), text(o));
o = freeAdOutcome({ ok: false, retry: true }, 2);
check("free order failed", o.kind === "error" && o.title === "Couldn't publish your ads" && o.description === "Nothing was charged. Please try again.", text(o));

rmSync(dir, { recursive: true, force: true });
if (failures) {
  console.log(`\n${failures} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("\nAD PAYMENT MESSAGES HONEST — every outcome says what happened to the money");
