# Security Flags & Gaps

Log of every security flag, vulnerability, gap, or risk discovered anywhere in this
codebase — infra, dependencies, auth, data handling, or business logic. Maintained
automatically the moment something is found, during any session or while working any
prompt, without being asked.

IMPORTANT: never paste actual secret values, API keys, tokens, passwords, or working
exploit payloads into this file. Describe the finding, its location, and its risk —
not the sensitive value itself. This file may end up in version control history.

## Open Flags (unresolved, needs attention)
| Date found | Title | Severity | Location | Status |
|---|---|---|---|---|
| 2026-09-11 | Public vendor profile fills a vendor's empty identity and contact fields with invented values (GSTIN, PAN, owner, phone, email, address) | Medium | `src/pages/VendorProfile.tsx` (`detailRows`, `contactRows`, `contactAddress`, `aboutText`, `bannerSrc`) | Open — logged only, on Mitra's decision (Master Prompt 8) |
| 2026-09-11 | Product-level `rating_avg` / `reviews_count` / `sold_count` are vendor-writable and have no real source | Low | `products` (`products_update` admits `vendor_id = auth.uid()`; no guard on these columns) | Open — cards keep showing them on Mitra's decision; guard them when they are computed from something real |
| 2026-09-11 | embed-query's per-IP key parses `x-forwarded-for` identically but was never probed | Low | `supabase/functions/embed-query/index.ts` (`.split(",")[0]`) | Open — confirm next time that file is touched |

## Fixed / Closed Flags
| Date found | Title | Severity | Location | Status |
|---|---|---|---|---|
| 2026-09-11 | A vendor could set its own review count and star rating | Medium | `vendor_profiles` (`vprofiles_update` + `enforce_vendor_profile_admin_fields()`) | Fixed 2026-09-11 (Master Prompt 8, Phase 2) — signed-in writes to both columns refused; `sync_vendor_rating()` is the only writer |
| 2026-09-11 | Super-admin demo credential shipped in the production JS bundle and committed to a public repo | Critical | `src/contexts/AuthContext.tsx` (`DEMO_ACCOUNTS`); 16 other tracked files in `scripts/` and `tests/`; more in Cosora-Admin | Fixed 2026-09-11 (Master Prompt 8, Phase 1) — rotated, sessions revoked, old password refused; literal out of every build; all test credentials read from env |
| 2026-09-11 | Unverified claim that image-search's per-IP key cannot be spoofed via `x-forwarded-for` | Low | `supabase/functions/image-search/index.ts` | Closed 2026-09-11 — tested on this deployment; no bypass; comment made precise, parsing unchanged |
| 2026-09-10 | image-search has no rate limit | Medium | `supabase/functions/image-search/index.ts` | Fixed 2026-09-10 |
| 2026-09-10 | No rejection path for non-product images | Low | `supabase/functions/image-search/index.ts`, `src/pages/Search.tsx` | Fixed 2026-09-10 |

The two 2026-09-10 flags were logged and closed in the same edit: they were found and reported (not fixed)
at the end of the previous session on 2026-09-10, deliberately left out of that session's scope, and fixed
in the next one.

## Log

### 2026-09-11 — Super-admin demo credential shipped in the production bundle — Severity: Critical
- What was found: `DEMO_ACCOUNTS` in `src/contexts/AuthContext.tsx` is a module-level export
  holding the email and the shared demo password for `demo-buyer`, `demo-vendor` and
  **`demo-admin@cosora.dev`, which is a `super_admin`** on the live project. `DevAccountSwitcher`
  correctly renders nothing in production (`if (!import.meta.env.DEV) return null`), but the
  constant it reads is not dev-gated, so the literal ships in the bundle whether or not the
  button renders.
- Where: `src/contexts/AuthContext.tsx` (the constant). The same password is also hardcoded in
  16 other tracked files under `scripts/` and `tests/` (`git grep` on HEAD, 2026-09-11). The
  repository `abhishekmitraaa/textile-spark-net` is public. The password has been in the
  repository since 2026-07-05 (`2ac5be8`).
- How it was discovered: Master Prompt 7 (buyer-trust thread), Phase 5 — the Bunny spec signs
  in as demo-admin. Confirmed in a local production build (`dist/assets/index-*.js`) AND on the
  live deployment: the bundle served by `textile-spark-net.vercel.app` on 2026-09-11
  (`/assets/index-DGTU6TCp.js`) contains the admin email and password as a string literal.
- Risk / impact: anyone who opens devtools on the production site, or reads the public repo,
  can sign in to Cosora-Admin as a super_admin — suspend accounts, approve or reject KYC and
  content, open every vendor's KYC scans through signed URLs (`business_docs_owner_select`
  admits `is_admin()`), and read admin-only tables. Removing the literal from the bundle does
  NOT undo the exposure: it is in public git history and in every bundle already deployed.
- Fix applied (2026-09-11, Master Prompt 8, Phase 1), in the order recommended above:
  1. **Rotation, first, before any code.** A new random password per account was generated
     and bcrypt-hashed locally; only the hash was sent to the database
     (`auth.users.encrypted_password`), so no new value appears in any tool log or file but
     the gitignored `.env`. In the same transaction every `auth.sessions` row was deleted and
     every `auth.refresh_tokens` row revoked, because a password change alone does not end a
     session an attacker may already hold (demo-admin had 1 live session and 1 unrevoked
     refresh token at the time). Accounts: demo-admin, and — on Mitra's decision —
     demo-buyer and demo-vendor. Also rotated, because their passwords were in the same
     public repo: `zz-mp4-vendor`, `zz-mp5-link` and the three `zz-test-vendor-*` accounts.
     Verified with a password grant against `/auth/v1/token`: each old password now returns
     HTTP 400 `invalid_credentials`; each new one returns 200.
  2. **demo-admin keeps `super_admin`** — Mitra's decision, asked rather than assumed. Its
     password is now a secret held only in `.env`.
  3. **No build can contain a demo password.** `vite.config.ts` defines `__DEMO_PASSWORDS__`
     from `.env` only when `command === "serve"`; every build, including `build:dev`, gets
     `null`, and `DEMO_ACCOUNTS` is `null` without it. Verified: after `npm run build`, no
     file in `dist/` contains the old password, any new one, or even the demo-admin email.
  4. **Every test credential comes from the environment.** `scripts/lib/test-credentials.mjs`
     in both repos (process env first, then `.env`); names in `.env.example`; CI maps them
     from repository secrets. Scripts call `credential()`, which throws with the variable's
     name; specs use `optionalCredential()` plus `test.skip`, the pattern
     `mp7-admin-vendor-panels.spec.ts` introduced. Beyond the 17 files counted above, the
     sweep found the throwaway-vendor password in 7 more textile-spark-net files (one of them
     a tracked handoff file under `screenshots/`, written by `vendor-signup.spec.ts`, which
     no longer writes it), and the rlstest/chatfx fixture password in 13 Cosora-Admin files,
     including the two seed scripts that create admin logins. The seeds now read
     `current_setting('cosora.fixture_password')` and abort if it is unset. No fixture
     account exists today, so nothing needed rotating there. Verified: `git grep -lF` for
     each of the three old values returns 0 files in both repositories.
- Still true, and not fixable: the old passwords remain in public git history and in
  previously deployed bundles. Rotation is what makes them worthless. CI secrets must be
  created in GitHub by a human; until they are, the specs that need them skip.
- Status: Fixed 2026-09-11
- Related changelog entries: 2026-09-11 (Master Prompt 7, buyer-trust thread · security finding);
  2026-09-11 (Master Prompt 8 · Phase 1)

### 2026-09-11 — A vendor could set its own review count and star rating — Severity: Medium
- What was found: `vendor_profiles.reviews_count` and `rating_avg` are what buyers see as a
  supplier's reputation (vendor page, New Arrivals tiles, RFQ vendor cards). `vprofiles_update`
  admits `id = auth.uid()`, and `enforce_vendor_profile_admin_fields()` guarded only
  `is_verified`, so a vendor could write both numbers directly.
- Where: `vendor_profiles` RLS + `enforce_vendor_profile_admin_fields()`.
- How it was discovered: Master Prompt 8, Phase 2, while making the vendor aggregates truthful.
  Proven, not inferred: signed in as demo-vendor through the anon key, an update setting its
  own `reviews_count` 5 → 10004 and `rating_avg` → 5 was ACCEPTED; reverted immediately.
- Risk / impact: any vendor could claim thousands of reviews and a 5.0 rating.
- Fix applied: migration `20260911120000_vendor_review_aggregates_truthful.sql`. The trigger
  forces both to 0 on a signed-in INSERT and raises `42501` on a signed-in UPDATE that changes
  either. `sync_vendor_rating()` is SECURITY DEFINER, so it runs as the owner and stays the
  only writer. Verified after applying: the vendor's self-write → `REFUSED 42501`; a
  super_admin's write → `REFUSED 42501`; an ordinary vendor profile update → ok; a buyer
  editing their own review still moves the aggregate (4.4 → 3.8 → 4.4 on revert).
- Status: Fixed 2026-09-11
- Related changelog entry: 2026-09-11 (Master Prompt 8 · Phase 2)

### 2026-09-11 — Product-level counters are vendor-writable and have no real source — Severity: Low
- What was found: `products.rating_avg`, `reviews_count` and `sold_count` have no writer and
  no source (`reviews` has no `product_id`; there is no orders table), and `products_update`
  admits `vendor_id = auth.uid()` with no guard on these columns.
- Where: `products` RLS; read by `src/lib/queries/products.ts` for listing cards.
- How it was discovered: Master Prompt 8, Phase 2, next to the vendor-level fix above.
- Risk / impact: the cards already show seeded values (Mitra chose to keep them for now),
  and a vendor could also raise its own. Guarding them before they are computed from
  something real would only freeze the seed values.
- Fix applied: none — deliberately, on Mitra's decision about the cards.
- Status: Open
- Related changelog entry: 2026-09-11 (Master Prompt 8 · Phase 2)

### 2026-09-11 — Public vendor profile invents a vendor's missing identity and contact details — Severity: Medium
- What was found: on `/vendor/:id`, every empty field on a REAL vendor falls back to a
  hardcoded demo value. The fallbacks cover the Company MD / owner name, phone, email,
  website and a Gwalior street address in the contact card, plus a GSTIN and PAN in "Detailed
  information", an About paragraph and a stock banner. A buyer can call a phone number, or
  trust a GSTIN, that belongs to no one on the platform.
- Where: `src/pages/VendorProfile.tsx` — `detailRows`, `detailRowsResolved`, `contactRows`,
  `contactAddress`, `aboutText`, `websiteValue`, `bannerSrc`.
- How it was discovered: Master Prompt 8, Phase 2, while removing the same page's invented
  rating fallback.
- Risk / impact: misattributed contact details and fabricated tax identifiers on a real
  business's public page.
- Fix applied: none — Mitra chose to log it for a later round. The fix is to render "Not
  provided" or omit the row, as `/product/:id` already does.
- Status: Open
- Related changelog entry: 2026-09-11 (Master Prompt 8 · Phase 2)

### YYYY-MM-DD — <short title> — Severity: Critical / High / Medium / Low
- What was found:
- Where (file / module / endpoint / dependency):
- How it was discovered:
- Risk / impact if left unaddressed:
- Fix applied (or recommended fix, if not yet fixed):
- Status: Open / Fixed / Accepted risk / Monitoring
- Related changelog entry: (link the dated entry in documentation/changelog.md, if any)

### 2026-09-11 — Unverified claim that image-search's per-IP key cannot be spoofed via x-forwarded-for — Severity: Low
- What was found: The 2026-09-10 session reported that on this project "the client IP can't be faked"
  via `x-forwarded-for`. That rested on ONE observation: a forged value `zz-xffprobe-…` was counted under
  the real address. The value was not a valid IP, so a gateway that simply discarded malformed entries
  would have produced the same result. Community reports on Supabase disagree. One describes a forged
  value arriving with the real IP appended AFTER it (forged value at position 0); another describes the
  header being overwritten. `image-search` keys its per-IP bucket on position 0 (`.split(",")[0]`).
  If a forged prefix could survive there, anyone could mint a fresh per-IP bucket on every request.
  The global and per-user buckets would still hold.
- Where (file / module / endpoint / dependency): `supabase/functions/image-search/index.ts`, the
  `const ip = …split(",")[0]` line before the `image_search_rate_check` call.
- How it was discovered: Raised as an open question in the brief for the 2026-09-11 session, and
  settled empirically on this deployment instead of from either report.
  - **Method:** a temporary build (v6) echoed its IP-related headers in response to a one-off nonce,
    returning before the limiter and before any OpenAI call. v7 removed it.
  - **Ground truth:** the client's real public IPv4 was confirmed by three independent outside services.
  - **Cases,** 3 requests each plus a curl repeat of (c): (a) no forged header; (b) a forged single
    IPv4; (c) a forged `a, b` pair; (d) a forged non-IP token; (e) a forged IPv6 address; (f) a forged
    `X-Real-IP` only.
  - **Observed, in all 19 requests:** the header that reached the function was exactly
    `<real>,<real>, <upstream proxy>`.
    - No forged value appeared in any position.
    - `X-Real-IP` was stripped entirely.
    - `cf-connecting-ip` carried the real address.
    - The trailing proxy address varied per request (`13.248.105.16`–`.46`).
- Risk / impact if left unaddressed: As tested, none. There is no bypass on this deployment. The real
  risk was the reverse. The textbook hardening ("use the last `x-forwarded-for` entry") would have keyed
  every caller on a shared, rotating proxy address. That would have throttled unrelated buyers together
  and made the per-IP budget meaningless.
- Fix applied: No code change to the parsing; `.split(",")[0]` is correct here. The comment next to it
  now records exactly what was tested and observed, replacing the generic "spoofable/not spoofable"
  wording, and warns against switching to the last entry. Deployed as v7. The probe branch is confirmed
  gone: the nonce now receives `400 no_image`. `claude.md` and `technicalimplementation.md` record the
  same finding with its limits: one date, one IPv4 client, observed platform behaviour, not a Supabase
  guarantee.
- Status: Fixed (question closed; re-open if the platform's proxy chain changes).
- Related changelog entry: `documentation/changelog.md`, 2026-09-11, "x-forwarded-for settled
  empirically on this deployment".

### 2026-09-11 — embed-query's per-IP key parses x-forwarded-for identically but was never probed — Severity: Low
- What was found: `supabase/functions/embed-query/index.ts` derives its per-IP rate-limit key with the
  same `(req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()` that image-search uses, and
  passes it to `embed_query_rate_check`. The 2026-09-11 probe was run against `image-search` only.
- Where (file / module / endpoint / dependency): `supabase/functions/embed-query/index.ts` (the `ip`
  line before the `embed_query_rate_check` RPC).
- How it was discovered: Reading embed-query while settling the same question for image-search on
  2026-09-11. Not edited: embed-query was explicitly out of scope for that session.
- Risk / impact if left unaddressed: Probably none. Both functions sit behind the same Supabase edge,
  and the probe showed that edge rebuilding the header before function code runs, so embed-query very
  likely receives the same `<real>,<real>, <proxy>` shape. But it was not observed for embed-query
  itself. If a forged prefix could ever reach it, only embed-query's per-IP bucket would be bypassable.
  Its global 10,000/hour bucket still bounds spend, at ~$0.00002 per call.
- Fix applied (or recommended fix, if not yet fixed): Recommended, not applied. The next time
  `embed-query/index.ts` is touched, run the same probe against it: a temporary nonce-gated echo of
  `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip`, cases (a)–(f) as in the entry above, then
  remove it. Keep `.split(",")[0]` if the result matches, and add the same precise comment. Do NOT
  switch to the last entry: on this deployment that is a rotating proxy address.
- Status: Open
- Related changelog entry: `documentation/changelog.md`, 2026-09-11, "x-forwarded-for settled
  empirically on this deployment".

### 2026-09-10 — image-search has no rate limit — Severity: Medium
- What was found: The `image-search` edge function made one billable OpenAI vision call (`gpt-4o-mini`)
  per request with no limit of any kind: no per-IP, per-user or global ceiling. Its only gate is
  `verify_jwt`, and the anon key that satisfies it ships in the client bundle, so in practice anyone
  could call it. Before 2026-09-10 the exposure was theoretical, because `OPENAI_API_KEY` was unset and
  every call returned `not_configured`. It became live the moment the key was added.
- Where (file / module / endpoint / dependency): `supabase/functions/image-search/index.ts`
  (`POST /functions/v1/image-search`).
- How it was discovered: Reported at the end of the previous 2026-09-10 session, which verified photo
  search end to end with the real key and, as out of scope, noted it as "callable by any holder of the
  public anon key … with no rate limit". It was left unfixed there on purpose. This session confirmed
  it against the deployed v4 source (no limiter call anywhere) before fixing it.
- Risk / impact if left unaddressed: Unbounded spend. A scripted loop could run up OpenAI charges at
  the rate the function can serve, limited only by OpenAI account limits. Every such call also ran a
  real catalogue search.
- Fix applied: New `public.image_search_rate_check()` (migration
  `20260910190000_image_search_rate_limit.sql`), a structural copy of the proven
  `embed_query_rate_check`. It uses a fixed-window UPSERT in the existing `embed_query_rate_limit`
  table under new `img:`-prefixed keys, so embed-query's keys and rows are untouched. There are three
  budgets, checked in order:
  - `img:global`: 300 per hour. This bounds total spend.
  - `img:ip:<addr>`: 10 per 10 minutes.
  - `img:user:<jwt sub>`: 10 per 10 minutes. This is the one bucket a caller cannot spoof.
  The function is SECURITY DEFINER, with EXECUTE revoked from `public, anon, authenticated` (both
  grants; verified with `has_function_privilege`) and granted to `service_role` only. `image-search` v5
  calls it on EVERY request that would reach OpenAI (there is no cache to exempt) and returns
  `{ error: "rate_limited" }` at 200. It fails OPEN if the RPC itself errors, so a limiter outage cannot
  take photo search down. `Search.tsx` shows a dedicated "Too many photo searches" toast for it.
  Verified live: the per-IP limit tripped on exactly the predicted call. The budgets were exercised in
  a self-rolling-back `DO` block at the database layer, and again through the real function and a real
  browser. `get_advisors(security)` showed no new findings.
- Residual risk (accepted, same trade-off as embed-query): the global bucket is shared, so one abuser
  burning 300 calls in an hour disables photo search for everyone until the window rolls. The
  alternative is an unbounded bill. Also observed: this project's gateway sets `x-forwarded-for` itself
  (a client-supplied value was ignored, measured 2026-09-10), so the per-IP bucket is harder to evade
  than the code comment assumes.
- Status: Fixed
- Related changelog entry: `documentation/changelog.md`, 2026-09-10, "Photo search now refuses
  non-product images and is rate limited".

### 2026-09-10 — No rejection path for non-product images — Severity: Low
- What was found: The vision prompt asked for a product query UNCONDITIONALLY, and nothing in the
  function could return "this is not a product photo". Any image produced a plausible garment
  description. A flat blue rectangle came back as "men blue denim jacket" and ran a real search.
  Separately, `Search.tsx` had one catch-all error branch, so every failure (including any future
  error code) showed "Couldn't recognise that image", which blames the photo.
- Where (file / module / endpoint / dependency): `supabase/functions/image-search/index.ts` (the
  prompt and the raw-string response parsing); `src/pages/Search.tsx` (`handleImageFile`).
- How it was discovered: Observed in the previous 2026-09-10 session's real-browser compression
  check. A generated transparent PNG was answered with a fabricated denim jacket, and it was reported
  there as out of scope. Re-confirmed this session from the deployed v4 source: there was no
  classification gate.
- Risk / impact if left unaddressed: An integrity problem rather than an exploitable hole. The
  platform silently presented fabricated matches as results for an irrelevant photo, which conflicts
  with the project rule "no fabricated data on the search surfaces". It also spent a vision call AND a
  catalogue search on input that should have been refused.
- Fix applied: The vision request now uses OpenAI Structured Outputs:
  `response_format` `json_schema` named `image_search_result`, `strict: true`, with required
  `is_apparel_or_textile: boolean` and `query: string | null`. The prompt tells the model to describe
  the item only when the photo clearly shows an apparel, fabric, trim, accessory or other
  textile/fashion product, and otherwise to return false/null ("do not guess"). A false verdict, a null
  query or a safety refusal returns `{ error: "no_match" }`. Unparseable output returns
  `bad_model_output`. `Search.tsx` now has an explicit branch per code, and anything unrecognised gets
  the generic "Image search unavailable" copy, never the recognition copy. Verified live:
  - the real garment fixture still returns a real query;
  - a generated solid-colour square returns `no_match`, and the browser shows "Couldn't recognise that
    image" without running a search;
  - an unknown code (mocked, since the live function cannot be made to produce one) shows the generic
    copy.
- Status: Fixed
- Related changelog entry: `documentation/changelog.md`, 2026-09-10, "Photo search now refuses
  non-product images and is rate limited".
