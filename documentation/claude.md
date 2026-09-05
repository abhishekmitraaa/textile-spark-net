# Cosora — Project Memory (read this first, every session)

Last updated: 2026-09-05

## What Cosora Is

Cosora is a **three-sided B2B sourcing marketplace for India's fashion and textile
industry**, connecting **Buyers** (brands, retailers, designers, wholesalers, sourcing
managers and buying houses), **Vendors** (manufacturers, mills, fabric suppliers, service
providers such as printers and logistics firms, and freelancers like pattern makers and
CLO 3D artists), and an **Admin** layer (Cosora's own ops team). It replaces a fragmented
offline sourcing process — WhatsApp threads, brokers, trade fairs and personal contacts —
with a single trust-and-discovery platform where deals are initiated, negotiated and
tracked: vendors list products and run ads, buyers post RFQs and receive comparable quotes
from multiple suppliers, and admin verifies, moderates and monetises the whole thing. Think
of it as the infrastructure layer between a fabric mill in Surat and a fashion brand in
Delhi. It runs as one unified web app in which the same person can toggle between the
Vendor and Buyer experience.

## Business Rules — Predefined

Rules decided before or outside of Claude Code sessions.

### Legal & compliance
- **Chat monitoring disclosure** — "We'll be monitoring the messages" (or similar) is
  **legally required** in all chat flows. Never remove or hide it.
- **Product moderation** — all product listings go through admin moderation before going
  live (24–48 hours).

### Locale
- **Currency & timezone** — default to **INR** and **IST** for all Indian users.

### Product / UX rules
- **Role toggle placement** — the "Switch to Buyer/Seller" toggle appears **only** on the
  Vendor Dashboard Home and the Buyer Homepage. Nowhere else.
- **Authentication is OTP-only** — phone number + one-time password, no passwords. Google
  OAuth is a secondary option. A vendor-first user lands on the vendor dashboard after
  login; a buyer-first user lands on the buyer homepage. Vendor → Buyer is a direct toggle;
  **Buyer → Vendor requires completing full vendor onboarding first.**
- **"Video Closeups", never "Reels"** — product videos in the buyer feed are called Video
  Closeups. Deliberate brand/product naming decision.
- **Audio-first matters** — many Indian manufacturers are more comfortable speaking than
  typing. Audio messages in chat and voice-to-text in the RFQ form are critical for the
  real user base, not nice-to-haves.
- **Subscription tiers (Basic / Silver / Gold)** determine vendor lead volume, product
  listing caps, and geographic ad reach.

### Brand colours
| Usage | Hex |
|---|---|
| Vendor primary CTA, links, blue states | `#256fef` |
| Buyer primary CTA, alerts, Switch-to-Buyer banner | `#EF4D62` |
| Success, verified, accepted states | `#14ae5c` |
| Borders, inactive, placeholder | `#d0d4dc` |
| Body text, headings | `#363636` |

### Engineering conventions treated as product rules
- **Image imports must use ES module syntax** — `import img from "@/assets/image.png"`,
  never a file-path string.
- **Layout wrappers are role-specific** — every **vendor** page wraps in `DashboardLayout`;
  every **buyer** page uses `BuyerShell`. Putting `DashboardLayout` on a buyer route
  double-stacks the top bar.

## Business Rules — Discovered/Decided During Development

Rules that emerged while building. Append here the moment one is settled — never leave one
undocumented. Deep technical rationale for each lives in
`documentation/technicalimplementation.md`.

- **The admin side exists and is built — in a separate repo.** `Cosora-Admin` runs against
  the same Supabase project and owns some of this project's migrations. Older notes
  claiming "admin is not designed or built" are stale.
- **Vendors must never be able to publish straight to the buyer feed.** Products *and*
  videos default to `under_review`; the transition to `live` is enforced by a BEFORE
  trigger, not by client convention and not by RLS alone.
- **Moderation must be reviewable.** A hard blocklist stop leaves no trail, so
  `keyword_blocklist` is deliberately **empty** and stays that way until a human names a
  term; pattern flags keep the message and lock the thread instead, so support can read it.
- **Moderation notices never identify the reporter, the matched pattern, the verdict or the
  reason.** A report notice is deliberately identical to a pattern-triggered lock — in a
  two-person thread, saying "a report happened" names the reporter by elimination.
- **A lock must be unlockable.** Locked conversations can be resumed only via the
  `resolve_conversation_review` RPC; a verdict defaults to leaving the thread locked and the
  reviewer opts in to reopening.
- **Suspension blocks content *creation*, not existing content.** A suspended account cannot
  create RFQs, quotes, products, videos, ads or reviews — but live content stays up, a
  running ad campaign keeps serving, and an in-progress session is not ended. A suspended
  vendor can still delete their own videos.
- **Suspension is account-level, not vendor-level** — the same human toggles between buyer
  and vendor, so a vendor-table flag could not stop them messaging as a buyer.
- **Media is rationed by the Supabase Free plan.** 5 GB/month egress is shared org-wide
  across database, auth and storage; exceeding it 402s the whole app. Video uploads are
  capped at 50 MB / 60 s, review photos at 4 photos / 2 MB.
- **iPhone `.mov` is deliberately not accepted** (HEVC plays on Safari, fails on
  Chrome/Android, and there is no transcoding step).
- **No mock data in production.** Dev-only helpers return `[]` in a production build; an
  empty catalogue is meant to render empty. Do not seed demo rows to "fix" an empty state.
- **A review's subject id must be the resolved entity id, never the route param** — buyer
  side vendor links carry slugs. And where no real row exists, the Write-a-Review CTA is
  hidden rather than shown and left to fail.
- **Signed-out / loading / error / empty must stay four distinct states** on any surface
  that reads from Supabase. Collapsing them is how a broken page passes for an empty one.
- **Vendor contact details are gated by the same rule as calling** — one resolution, many
  consumers, and a skeleton (never real rows) while the gate resolves. **Known open
  decision:** `vendor_profiles` is world-readable including `phone`, so the gate is a UI
  rule only. Closing it is a marketplace-discovery decision, not a bug fix.
- **There is no `/orders` route.** "Track Orders" maps to `/requirement/my-quotes`; "View
  Order Details" maps to `/chat`.
- **Payment amounts are computed server-side, never accepted from the client**, and the
  Razorpay account is in **live mode** — checkouts move real money. Refunds are manual.
- **Total Order Value is the retention metric.** The cumulative figure of orders won through
  Cosora is the single strongest reason a vendor stays.
- **The schema must stay compatible with a future working-capital lending product.** Order
  volume, capacity, reliability, pricing and transaction history are being collected with
  that in mind even though the product does not exist yet.
- **Known papercut, deliberately unfixed:** `UserRoleContext` initialises to `"buyer"` and
  never seeds from `profile.active_role`, so signing in as a vendor still starts in buyer
  mode until the sidebar SWITCH MODE toggle is used.

## Domain Terms

| Term | Meaning |
|---|---|
| **RFQ** | Request for Quotation — a buyer's sourcing requirement post |
| **Quick RFQ** | Simplified RFQ (image + quantity), designed for <30 seconds |
| **Lead** | A buyer inquiry arriving in the vendor dashboard |
| **MOQ** | Minimum Order Quantity |
| **GSM** | Fabric weight (grams per square metre) |
| **TradeSEAL** | Cosora's paid vendor verification badge, purchased via the ad system |
| **Pan India** | Nationwide ad targeting across all of India |
| **UPI AutoPay** | Subscription payment method via India's UPI system |
| **Profile Score** | Vendor's profile completeness % — higher = better visibility |
| **Total Order Value** | Cumulative orders won through Cosora — strongest vendor retention metric |
| **Video Closeup** | A product video in the buyer feed. Never called a "Reel" |

## Architecture Snapshot

- **Repo**: `textile-spark-net` (`github.com/abhishekmitraaa/textile-spark-net`), built with
  Lovable.dev, ported from the Next.js source `cosorawork/client-cosora-vendor-frontend`.
- **Stack**: Vite + React 18 + TypeScript + shadcn-ui + Tailwind + React Router v6 +
  React Query + Framer Motion, on **Supabase** (Postgres/Auth/Storage/Edge Functions/
  Realtime), with **Razorpay** payments, deployed to **Vercel**.
- **Key folders**: `src/pages/` (route components), `src/components/` (`buyer/`,
  `dashboard/`, `layout/`, `ui/`, feature folders), `src/contexts/`, `src/hooks/`,
  `src/lib/` (`queries/` for Supabase access, `*Store.ts` for
  `useSyncExternalStore`-backed client state), `src/data/`, `supabase/migrations/`,
  `supabase/functions/`, `tests/` (Playwright), `scripts/` (verification scripts).
- **Routing**: every route is declared in `src/App.tsx`; `buyerShellRoutes` at the top of
  that file defines the buyer pages that use the `BuyerRouteShell` wrapper.
- **Dev server**: `localhost:8080` (non-standard). Path alias `@/*` → `src/*`.
- **Admin panel**: separate repo `Cosora-Admin`, same Supabase project.

Depth — schema, invariants, integrations, tech debt — lives in
`documentation/technicalimplementation.md`. Keep this snapshot current, not exhaustive.

## Pointers

- Full dated history: `documentation/changelog.md`
- Test data & results: `documentation/test.md`
- Technical depth: `documentation/technicalimplementation.md`
- Routes/pages: `documentation/sitemap.md`
- Buyer/Vendor/Admin feature detail: `documentation/sides.md`
- Razorpay runbook: `supabase/RAZORPAY.md`

## Documentation Protocol — follow every session, unprompted

1. At the start of a session, read ONLY this file for baseline context. Do not read the
   other `documentation/*.md` files unless the task at hand needs them.
2. The moment you decide, confirm, or discover a business rule or platform-level fact,
   add it to the sections above immediately — do not wait to be asked.
3. Before ending ANY turn in which you changed code, a decision, or a business rule —
   with no exceptions and without being asked:
     a. Append a dated entry to `documentation/changelog.md` (what changed, why, files touched).
     b. Update this file if the change affects business rules, architecture, or
        platform-level facts.
4. Whenever you write or run a test, update `documentation/test.md` with the test data
   used, what was checked, and the result.
5. Whenever you touch implementation details (schema, APIs, libraries, patterns,
   infra choices), update `documentation/technicalimplementation.md`.
6. Whenever a route/page/sub-page is added, renamed, or removed, update
   `documentation/sitemap.md`.
7. Whenever buyer-side, vendor-side, or admin-side features or flows change, update
   the matching section of `documentation/sides.md`.
8. Treat updating these files as PART OF finishing a task, not a separate step you
   might skip. A task is not done until its docs reflect it.

### How the automation actually works (`.claude/settings.json`)

- **`PreCompact` hook (agent)** — the only thing that *writes* these docs. It runs a
  review-and-update agent **before every compaction**, automatic or manual `/compact`.
  Tied to the compaction boundary, **not** literally "after each chat".
- **`UserPromptSubmit` hook (command)** — read-only; injects `documentation/claude.md`
  into context on every prompt (baseline only, per step 1 above — the 348 KB changelog is
  deliberately NOT injected). Never writes. It runs `powershell -NoProfile`, **not** `pwsh`:
  PowerShell 7 is not installed on this machine, so the pre-existing `pwsh` invocation was
  failing silently and no context was ever injected. It also needs `-Encoding UTF8` on
  `Get-Content`, or PS 5.1 reads the file as ANSI and mangles every em dash.
- **`Stop` hook (command)** — posts a reminder only; it does not update anything.
- `.github/copilot-instructions.md` is prose for GitHub Copilot; Claude Code does **not**
  execute it. Do not treat it as the hook source.

**What this means for you (the assistant):** the `PreCompact` agent is a safety net, not a
guarantee. A short session that never compacts won't trigger it, and agent hooks can fail to
fire. So the protocol above is yours to execute — do not assume a hook already did it.
