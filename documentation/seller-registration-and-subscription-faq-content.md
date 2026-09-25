# Seller Registration & Subscription FAQ: source content

Andy supplied this content on 2026-09-23, and Mitra relayed it. This file keeps the source
text as supplied and records what was published from it.

The published FAQs live in `public.faqs` and are edited in Cosora-Admin `/faqs`. **The app
doesn't read this file**, so change a live answer in the admin, not here.

## What was published (2026-09-23)

Loaded through the `admin_faq_*` RPCs as demo-admin (super_admin), the same path the admin
page uses. No migration was involved.

- **Seller Registration:** all 10 questions, verbatim, on the vendor landing page `/seller`
  (Mitra's choice of placement). They replace that page's 4 hardcoded questions.
- **Subscription:** Andy's 5 questions, verbatim, first on `/subscription`.
  - **"Lowest billing plan?"** was unfinished ("Yes! for ______"). I wrote its answer in
    Andy's tone from the live `subscription_plans` rows, as Mitra asked. **It hardcodes
    prices and limits:** Basic ₹699/month or ₹6,990/year, with 10 listings and 150 leads a
    month; Free, with 2 listings and 10 leads. Update it in the admin if plan prices change.
  - **Superseded rows:** two of his questions replace older rows on the same topic:
    - "Can I upgrade or downgrade my plan anytime?";
    - "What happens when I reach my lead limit?", replacing "…lead or product limit?".

    The old rows are **deactivated, not deleted**, so their text stays one click away in the
    admin.
  - **Kept:** three older, accurate rows that Andy's list doesn't cover stay live after his
    (autopay, payment methods and GST).
- **"Contact us?"** isn't a question. It's the Subscription FAQ's button. It opened the Help
  page (`/help`), as Andy asked, from 2026-09-23. **Since 2026-09-25 (Phase 24, Mitra's
  choice) it writes to hello@cosora.in** instead, because `/help` is the buyer page and its
  chat is canned (MPF-15).
- **Seeded by migration since 2026-09-25:** `20260925075432_faqs_seed_seller_registration_and_subscription.sql` reproduces these rows,
  as they are live, on a fresh database. "Lowest billing plan?" keeps its 2026-09-23 answer.
- **Formatting only:** the Markdown bold markers were dropped, `-` bullets are shown as `•`
  on their own lines, and "3 - 5 days" was typeset as "3–5 days". The wording is unchanged.
- **Decisions (Mitra, 2026-09-23):**
  - **Verbatim:** publish Andy's answers as written, even where they promise something the
    product doesn't do. Each mismatch is logged as MPF-16 in `myprofileflags.md`.
  - **Refund answer:** publish it as written, despite the Terms page (MPF-17).
  - **Verification time:** use 3–5 days everywhere, so `Kyc.tsx` and `Onboarding.tsx` now say
    "3–5 days" too.
- **Addressed from the open items below:**
  - placement, answered;
  - the "Lowest billing plan?" answer, written;
  - the cross-check, done: its results are MPF-16 and MPF-17, published by decision rather
    than corrected.

---

## Source content, as supplied

Headings are demoted one level so they sit under this file's title. Nothing else is changed.

## Seller Registration & Subscription Page FAQ — Content Drop (not yet wired anywhere)

**Status:** raw content only, supplied by Andy 2026-09-23. Not yet placed into any page — this is **not** the buyer `/profile/help` FAQ (that page's FAQ content is a separate, buyer-RFQ-flavored set and is explicitly out of scope for the current My Profile build pass). This content reads as vendor-side (Seller Registration) and Subscription-page FAQ, most likely destined for the vendor onboarding/registration flow and the vendor `Subscription` page — confirm exact placement with Andy before wiring.

---

### Seller Registration FAQs – Cosora

**1. What is Cosora?**
Cosora is a B2B platform where manufacturers of textiles, garments, and accessories can connect directly with fashion brands, wholesalers, and retailers to generate quality leads and grow their business.

**2. Who can register as a seller on Cosora?**
Manufacturers, wholesalers, exporters, or distributors of:
- Fabrics & textiles
- Ready-made garments
- Fashion accessories (labels, tags, trims, etc.)
- Anyone related to Fashion industry

**3. Is there any cost to register?**
NO, Basic registration is **free**. You only pay if you opt for:
- **Premium listings**
- **Pay-per-lead access**
- **Featured vendor badges**

**4. What documents are required to register?**
- GST Certificate
- PAN card
- Business registration (or MSME/Udyam)
- Aadhar card
- Product catalog (PDF, Excel, or images)

**5. I don't have a GST number. Can I still register?**
Yes, but your account will be marked as **"Unverified Seller"**, which may affect visibility and lead access. We recommend registering your business officially.

**6. How do buyers contact me?**
Buyers can **call or chat** with you directly through the platform once your product listings are approved.

**7. How are leads managed on Cosora?**
You'll get notified via dashboard, email, or WhatsApp when a buyer is interested. In future, you can also choose **pay-per-lead plans** to access high-intent buyers.

**8. How long does it take to get verified?**
Verification usually takes **3 - 5 days**, depending on the documents submitted.

**9. Do I need to ship products through Cosora?**
Not right now. Cosora helps you connect with buyers. You can handle payments and shipping directly until we integrate logistics support.

**10. Can I edit my listings after uploading?**
Yes. You can log in to your dashboard to update prices, product details, or contact information anytime.

---

### Subscription Page FAQ

**Can I upgrade or downgrade my plan anytime?**
Yes, you can upgrade your plan at any time and the difference will be prorated. Downgrades will take effect from your next billing cycle.

**Is there a refund policy?**
We offer a 7-day money-back guarantee for first-time subscribers. If you're not satisfied, contact us for a full refund.

**What happens when I reach my lead limit?**
You'll receive notifications as you approach your limit. You can always upgrade your plan to get more leads or wait for the next billing cycle.

**Do you offer discounts for annual billing?**
Yes! You save up to 17% when you choose annual billing. That's effectively 2 months free!

**Lowest billing plan?**
Yes! for ______ *(unfinished — Andy needs to fill in the actual lowest-plan answer before this ships)*

**Contact us?**
**ADD A BUTTON WHICH TAKES THEM TO THE HELP PAGE**

---

#### Open items before this is buildable
- Confirm placement: vendor Seller Registration flow page + vendor Subscription page (not buyer `/profile/help`).
- "Lowest billing plan?" answer is unfinished in the source content — needs a real answer before it ships.
- Cross-check the "3-5 days" verification SLA and the free/premium/pay-per-lead claims against what `Subscription`/`VendorKycPanel` actually implement today before publishing, so the FAQ doesn't promise something the live product doesn't do (same honesty bar the rest of this project holds itself to).
