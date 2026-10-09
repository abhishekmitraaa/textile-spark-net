// Local stack: copy the edge functions the local specs call into the local project folder,
// where `supabase start` serves them (verify_jwt stays on, the default). Run again after
// changing a function. Cosora-Admin's functions come from the sibling checkout.
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(process.env.LOCAL_STACK_DIR ?? ".claude/tmp/localstack", "supabase/functions");
const ADMIN_REPO = resolve(process.env.ADMIN_REPO ?? "../../cosora-admin");
mkdirSync(DIR, { recursive: true });
const buyer = ["_shared", "faqs-snapshot", "site-config-snapshot", "support-receipt", "support-sweep", "support-attachment-verify",
  // Plans and checkout (no Razorpay keys locally, so checkouts take the demo path).
  "subscription-create-order", "subscription-verify-payment", "subscription-webhook", "discount-quote",
  // Invoices as PDFs and the payment reconciler (subscriptions P1).
  "invoice-render", "billing-reconcile",
  // The notification outbox's sender (subscriptions P2).
  "notification-dispatch",
  // Autopay (subscriptions P3).
  "subscription-autopay",
  // Paid ad orders, for the reach rule (subscriptions P5).
  "razorpay-create-order", "razorpay-verify-payment", "razorpay-webhook"];
const admin = ["admin-staff", "admin-refund-payment"];
for (const f of buyer) cpSync(resolve("supabase/functions", f), resolve(DIR, f), { recursive: true, force: true });
for (const f of admin) cpSync(resolve(ADMIN_REPO, "supabase/functions", f), resolve(DIR, f), { recursive: true, force: true });
console.log(`copied ${[...buyer, ...admin].join(", ")} -> ${DIR}`);
