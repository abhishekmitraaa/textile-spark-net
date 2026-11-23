# Company disclosure and messaging consent — plan (2026-11-24)

Mitra's brief: show publicly that Cosora is a brand of Fearce Textiles Private Limited, and disclose how
Cosora contacts people (WhatsApp, email, one-time codes). Meta reviews the site to check that the brand
"Cosora" belongs to the company, so the company's name, address and phone must read the same on every page.

Branch `legal/company-disclosure-2026-11-24` in textile-spark-net, cosora-blogs and Cosora-Admin.

## The company facts, one copy per repo

| Fact | Value |
|---|---|
| Legal name | Fearce Textiles Private Limited |
| Brand | Cosora |
| Registered office | Innov8 Orchid Center 3rd floor, Orchid Center, Golf Course Road, SEC-53,Gurugram, HR, IND, 122022 |
| CIN | U47912HR2024PTC118434 |
| GSTIN | 06AAFCF7943P1ZZ |
| Support email | teamcosora@gmail.com |
| Phone / WhatsApp | +91 7904840367 |
| Grievance Officer | Ishani Banerjee, ishani.bnj@gmail.com, +91 8815578226 |
| Website | https://cosora.in |

- Marketplace: `src/lib/company.ts` (new). `supportContact.ts` reads its email and phone from there, so the
  Help page, the footer and the policies can't drift apart.
- Journal: `src/lib/site.ts` (`LEGAL_NAME` was "Cosora Technologies Pvt Ltd", which is wrong).
- Database: `support_settings` holds the same email and phone for the Help page once support rollout is on.

## Decisions (Mitra, 2026-11-24)

1. **Describe the messages Cosora really sends.** Cosora is a B2B marketplace and doesn't sell or ship
   goods, so there are no order confirmations or shipping updates. Service messages are sign-in codes,
   updates on requirements, quotes and leads, payment receipts and invoices for plans and ads, and
   account and security alerts.
2. **Sign-in code line:** "We'll send your one-time code by SMS or WhatsApp, and updates about your account on
   WhatsApp." The code goes by SMS today (`src/lib/auth/otp.ts`, `channel: "sms"`), and sign-in doesn't change.
3. **Email provider is Resend**, as the code uses (`_shared/resend.ts`).
4. **Sign-up opt-ins go on the step after the code**, where the account exists: the buyer's Terms step,
   and the seller's contact step in onboarding, saved when registration is submitted.

Also decided here:
- **Refund policy, no shipping policy.** `/refund-policy` states the rules the code already applies
  (the 7-day money-back guarantee on a first plan payment, plan changes, ad refunds through Cosora-Admin), and
  says Cosora ships nothing: goods move between buyer and seller (Terms clause 2).
- **Footer placement.** The full footer goes on the public pages people and reviewers read: the buyer and seller
  landing pages, Contact, Privacy, Terms, Refund, Grievance and Help, plus every Journal page.
  Signed-in work screens such as chats and upload keep their bottom menu only.
- **About is the Journal's /blogs/about** (`/about` already redirects there, vercel.json).
- **Marketing consent is its own record**, apart from `contact_consent`, which records consent to service
  messages (lead alerts) on WhatsApp and SMS. A yes to one is never read as a yes to the other.
- **The grievance page is published** (`src/lib/grievance.ts` named it as waiting for an officer). It
  acknowledges within 48 hours and resolves "within the timelines required by law" (Mitra's wording).

## Database: migration `20261124100000_company_disclosure_marketing_consent.sql`

- `public.marketing_consent` (profile, channel `whatsapp` | `email`, opted_in, address, source, wording,
  changed_at). This is the current answer per person and channel, readable only by its owner. No row means no.
- `admin.marketing_consent_log`, append-only: every opt-in and opt-out, with the address it applied to,
  where it was given (`signup`, `checkout`, `settings`, `support`), the exact wording shown, and the time.
  This is the proof of consent.
- `public.set_marketing_consent(p_channel, p_opted_in, p_source)`: security definer and self-guarded. The
  address and the wording come from the server, never the client. Only a real change of mind is logged.
- `public.my_marketing_consent()`: the person's own two answers, for the settings switches and to hide a
  checkout box that is already ticked.
- `buyer_terms_version()` becomes `2026-11-v3`. The Terms now name the company and add a Communications
  clause. Buyers who accepted earlier versions aren't asked again: the sign-up gate only checks that a
  version was accepted.
- `support_settings`: email teamcosora@gmail.com, phone +917904840367.

Order: apply the migration, then deploy the app. Until the app is deployed, an open Terms tab sends v2 and gets
"stale_terms", and the reload message handles that.

## App changes

- `LegalFooter` (new) on the pages listed above: the copyright line, the five links, and the registered office
  and CIN in small text.
- `/contact` (new): legal name, registered office, CIN, GSTIN, support email, phone and WhatsApp, business
  hours, and the Grievance Officer with the 48-hour acknowledgement.
- `/privacy`: rewritten to Mitra's sections a–l, keeping every true statement it already made.
- `/terms`: the company named in the intro, a Communications clause, and the contact clause rewritten.
- `/refund-policy` (new).
- `/grievance`: published, linked from Help, Contact, Privacy and Terms.
- `MarketingOptIn` (new): the two unticked boxes and the Privacy Policy link. Used on the buyer Terms step,
  seller onboarding, the plan checkout and the three ad Pay buttons. At checkout a box that is already "yes"
  is hidden, and an unticked box never withdraws an earlier yes.
- Withdrawing: Profile › Notifications and seller Settings get two switches backed by `marketing_consent`.
  They replace the old "Newsletter & Tips" / "Selling tips & updates" preference, which nothing sent and
  nothing recorded as consent.
- Register (sign-up) shows the one-time code line under the phone field. Login is untouched (sign-in rule).
- The sitemap, the route lists (`sellerRoutes.ts`, Cosora-Admin's `cosoraRoutes.ts`) and `llms.txt` updated.
- Journal: `LEGAL_NAME`, the contact email, the Organization JSON-LD (legal name, address, phone), an About
  paragraph, and the footer's legal line and links.

## Placeholders left for Mitra

These show on the Privacy Policy as `[PLACEHOLDER: …]` until filled:
- How long account and payment records are kept (years, or "as tax and accounting law requires").
- How long message logs are kept (months). Today the send log is pruned 90 days after a message finishes
  (`admin.notification_outbox`), so the value should be 3 months or longer, or that job changes to match.

## Not changed (outside this brief)

- Terms clause 6 says "Cosora operates on a pay-per-lead model". Cosora sells plans and ads. The clause is
  counsel's text, so it's flagged here rather than changed.
- The seller Supplier Agreement doesn't name the company yet. It's versioned on its own and needs counsel.
- Sending marketing messages isn't built. When it is, it must read `marketing_consent`, honour WhatsApp's
  "Stop promotions" button and STOP replies (a Meta webhook), and add an unsubscribe link to marketing email.
