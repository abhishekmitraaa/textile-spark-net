#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Every notice kind the database writes has a place to go on /notifications (Seller Home audit SH-034, 2026-11-17).
//
// A kind with no entry fell back to /notifications, the page the reader is already on. This reads every
// `notify(<recipient>, '<kind>'` in the migrations of both repos (and the two concatenated families, 'ad_' || decision,
// 'certificate_' || status, plus '<what>_approved/_rejected' for listings, videos and catalogues) and fails on a kind
// src/lib/notificationsStore.ts doesn't know.
//
//   node scripts/notification-kinds-check.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { build } from "esbuild";
import { mkdtempSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(path.join(tmpdir(), "cosora-notif-"));
const outfile = path.join(dir, "notificationsStore.mjs");
await build({ entryPoints: ["src/lib/notificationsStore.ts"], outfile, format: "esm", platform: "node", bundle: false, logLevel: "silent",
  define: { "import.meta.env.DEV": "false" } });
const { notificationKindMeta, toVendorNotification } = await import(pathToFileURL(outfile).href);

const dirs = ["supabase/migrations", "../../cosora-admin/supabase/migrations", "../../../../cosora-admin/supabase/migrations"]
  .filter((d) => existsSync(d));
const kinds = new Set();
for (const d of dirs) {
  for (const f of readdirSync(d)) {
    if (!f.endsWith(".sql")) continue;
    const text = readFileSync(path.join(d, f), "utf8");
    for (const m of text.matchAll(/notify\(\s*[^,()]+(?:\([^)]*\))?\s*,\s*'([a-z_]+)'/g)) kinds.add(m[1]);
  }
}
// Built by concatenation in content_decision_notice (v_kind || '_approved' / '_rejected').
for (const what of ["product", "video", "catalogue"]) for (const d of ["approved", "rejected"]) kinds.add(`${what}_${d}`);
// The two prefix families.
for (const k of ["ad_approved", "ad_rejected", "ad_paused", "ad_resumed", "ad_suspended", "ad_changes_requested", "certificate_delivered"]) kinds.add(k);

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${ok ? "" : `\n          ${detail}`}`);
};

check("found the kinds the migrations write", kinds.size >= 30, `only ${kinds.size}`);
for (const kind of [...kinds].sort()) {
  const meta = notificationKindMeta(kind);
  const n = toVendorNotification({ id: "x", kind, title: "t", body: null, conversation_id: null, read: false, created_at: new Date().toISOString() });
  check(`${kind} has an entry`, meta.known, "add it to KIND_META in src/lib/notificationsStore.ts");
  check(`${kind} never sends the reader to /notifications`, n.href !== "/notifications", `href ${n.href}`);
  if (n.href) check(`${kind} has an action label`, Boolean(n.actionLabel), "empty actionLabel with a destination");
}
// Chat notices without a kind entry still open the chat hub.
check("an unknown kind with a conversation opens /chat",
  toVendorNotification({ id: "x", kind: "something_new", title: "t", body: null, conversation_id: "c", read: false, created_at: "2026-11-17T00:00:00Z" }).href === "/chat");
check("an unknown kind without one has no action",
  toVendorNotification({ id: "x", kind: "something_new", title: "t", body: null, conversation_id: null, read: false, created_at: "2026-11-17T00:00:00Z" }).href === null);

console.log(failures ? `\n${failures} failure(s)` : "\nall notice kinds have a destination");
process.exit(failures ? 1 : 0);
