# Help & Support P5: the new Help content, for review

Written 2026-10-01 for Andy (content owner) and Mitra. Everything here is seeded by
`supabase/migrations/20261001130000_faqs_seller_help_and_translations.sql`, which is rehearsed but
**not applied** yet. Once it's applied, every row can be edited in Cosora-Admin → FAQs with no deploy.

Each English answer was checked against the code and the live database on 2026-10-01. The Hindi
and Gujarati were written alongside. Like the app's other translations, they still need a native
speaker's review (`ToDo.md`).

## 1. Seller Help (new surface `seller_help`, **active**)

Sellers see these on Help & Support instead of the buyer questions. They replace the note "The
questions on this page are written for buyers".


### KYC and verification
- **Which documents does Cosora ask for?** Your PAN is needed to register. On the KYC page (My Store → My Business → KYC) you can also add your GST certificate and, for a company, your CIN. Aadhaar isn't collected. Your documents are stored privately, and only Cosora's team can open them.
- **How long does verification take?** Our team reviews documents within 3–5 days. You get a notification when a document is verified, or rejected with the reason.
- **My document was rejected. What now?** Open the KYC page and read the reason shown under the document. Upload a corrected copy, and it goes back into review. If the reason isn't clear, contact Cosora Support from Help & Support.

### Leads and quotes
- **What counts as a lead?** A lead is a buyer's open requirement that you quote on. Each one counts once towards your plan's lead limit, however many times you revise the quote. A request a buyer sends to you directly never counts, and the limit never blocks it.
- **What happens when I reach my lead limit?** You can't quote on more open requirements until your next plan period starts, or until you upgrade. Leads shows how many you've used. You can still answer requests sent to you directly.
- **Why can't I quote on a requirement?** A quote needs a requirement that's still open to you. The buyer may have closed it, or sent it to another seller. A suspended account can't send quotes either. If none of these applies, contact Cosora Support.

### Listings and videos
- **When does my product go live?** Every new product is reviewed before buyers see it, usually within 24–48 hours. Until then it shows as under review in My Products.
- **Why did my live product disappear after I edited it?** Editing a live product sends it back for review, and buyers can't see it until it's approved again. It helps to make all your changes in one edit.
- **What videos can I upload?** MP4 videos up to 50 MB and 60 seconds. iPhone .mov files aren't accepted, so export or convert them to MP4 first. Videos are reviewed, like products, before buyers see them.
- **My product or video was rejected. What can I do?** The reason is shown on the item and in your notifications. Fix what it names and submit it again, and it goes back into review.

### Advertising
- **When does my ad campaign start?** After payment, Cosora reviews every campaign before it can show to buyers. Once approved, it starts on its start date. If we need changes, you'll see the reason on the campaign.
- **Why was my campaign paused or rejected?** Cosora pauses or rejects a campaign that breaks the ad rules, for example with a misleading claim. The reason appears on the campaign in Advertisements. Fix it and submit it again, or contact Cosora Support if the reason isn't clear.

### Plans and billing
- **Does my plan renew by itself?** No. Each month or year is a one-time payment that you make yourself. If a period ends without a new payment, your account goes back to the Free plan and its limits.
- **Where are my invoices?** My Payments lists your subscription and advertising payments, each with its invoice. Add your GSTIN on the Subscription page, and it's recorded on your invoices.

### Account and suspension
- **What happens if my account is suspended?** You stay signed in, and what's already live stays up. But you can't add products, videos, quotes, requirements, campaigns or reviews, and your campaigns stop showing to buyers. You get a notification when it happens.
- **How do I appeal a suspension?** Contact Cosora Support from Help & Support: a suspended account can still reach us. Give your store name and tell us why you think the suspension is wrong, and the team will review it.
- **Can I buy and sell from one account?** Yes. One account can buy and sell. Use the buyer and seller switch at the top of the app to change sides; your store, leads and plan stay as they are.

## 2. Buyer Help: the MPF-14 replacements (**inactive**: for your approval)

Decision D-12: the seven inaccurate answers stay live until launch, and these replace them then.
They're seeded switched off, each just after the answer it replaces. To swap one in Cosora-Admin →
FAQs → Buyer Help, deactivate the old row and reactivate the new one.

| Live today (inaccurate) | Replacement |
|---|---|
| How do I track my order status? | **How do I keep track of my requirements and quotes?** Cosora doesn't handle orders or deliveries: you agree those with the vendor directly. Your requirements and the quotes on them are in My Quotes, and your conversations with vendors are in Messages. |
| What payment methods are accepted? | **How do I pay a vendor?** You pay the vendor directly, on terms you agree with them, for example by bank transfer against their invoice. Cosora doesn't take payment for orders, and never asks you to pay a vendor through Cosora. |
| Is my payment secure? | **How do I pay a vendor safely?** Before paying, check the vendor's profile and verification badge, ask for a written quote or proforma invoice with their GSTIN, and pay the business account named on it. Be careful if you're asked to pay a personal account or to move off Cosora in a hurry. If something feels wrong, use Report fraud in Help & Support. |
| Can I get a refund if there's an issue with my order? | **What if there's a problem with my order?** Orders are between you and the vendor, so start by raising it with them in Messages. Cosora can't refund an order it didn't take payment for. If the vendor stops responding, or you think it's fraud, report it from Help & Support and our team will review it. |
| How do I update my business profile? | **How do I update my profile?** Open Profile. Edit Profile changes your photo and personal details, and Business Details holds your business name, address, GSTIN and PAN. |
| Can I have multiple team members on one account? | **Can I have multiple team members on one account?** Not at the moment. Each account belongs to one person and signs in with one mobile number. |
| How do I change my notification settings? | **How do I change my notification settings?** Profile → Notifications saves your preferences. Today Cosora shows updates in the app only, under the bell. It doesn't send email, SMS or push messages yet. |

## 3. Quick Guides

| Guide | Audience | State | Why |
|---|---|---|---|
| How to Complete Verification (`/help/guides/complete-verification`) | vendor | active | True today: KYC upload and review exist. |
| Request a Callback (`/help/guides/request-a-callback`) | both | inactive | Off until launch: in-app callbacks open only when rollout includes the reader. |
| Audio, PDF & Image Support (`/help/guides/audio-pdf-image-support`) | both | inactive | Off until launch: the support chat opens only when rollout includes the reader. |
| Payment & Subscription Guide (`/help/guides/payment-and-subscription`) | vendor | inactive | Off until online payment is live: plan checkout runs in demo mode while the Razorpay keys aren't set. |

### How to Complete Verification
1. Open My Store, then My Business, then KYC.
2. Upload your PAN card. Add your GST certificate, and your CIN if you're a company.
3. Check that each file is clear and readable, then submit it.
4. Our team reviews documents within 3–5 days, and you get a notification for each decision.
5. If a document is rejected, read the reason under it and upload a corrected copy. It goes back into review.

### Request a Callback
1. Open Help & Support and choose Request a callback.
2. Pick what it's about, and check the number we should call.
3. Choose a one-hour time inside support hours: Monday to Friday, 10:00–19:00 IST.
4. We call you in that hour. If we can't reach you, My requests says so, and you can book another time.
5. Need us sooner? Call +91 88155 78226 during support hours.

### Audio, PDF & Image Support
1. In a chat with Cosora Support, tap Attach to add a photo or a PDF.
2. Photos (JPG, PNG or WebP) and voice notes can be up to 5 MB each, PDFs up to 10 MB, and a message can carry up to 5 files.
3. To send a voice note, hold the microphone, speak for up to 2 minutes, and let go.
4. If your phone blocks the microphone, choose an audio file instead.
5. Only you and Cosora's team can open the files in your request.

### Payment & Subscription Guide
1. Open Subscription to compare the plans and their product and lead limits.
2. Choose monthly or yearly. A year costs ten times the monthly price.
3. GST at 18% is added at checkout. Add your GSTIN first, so it's recorded on your invoices.
4. Each period is a one-time payment. Nothing renews automatically.
5. Your invoices are in My Payments.
6. When a paid period ends, your account returns to the Free plan's limits until you pay for another.

## 4. MPF-16: what the FAQs say today (kept as they are, by Andy's decision on 2026-10-01)

Read from the live database on 2026-10-01. Each is followed by what the product does.

- **Is there any cost to register?** (Seller Registration) "NO, Basic registration is free. You only pay if you opt for: Premium listings, Pay-per-lead access, Featured vendor badges". The product: registration is the Free plan; "Basic" is a paid plan's name; pay-per-lead doesn't exist.
- **What documents are required to register?** "GST Certificate, PAN card, Business registration (or MSME/Udyam), Aadhar card, Product catalog (PDF, Excel, or images)". The product: only PAN is required; KYC takes PAN, GST and CIN; Aadhaar isn't collected.
- **I don't have a GST number. Can I still register?** "Yes, but your account will be marked as "Unverified Seller", which may affect visibility and lead access." The product: there's no such label, and nothing gates visibility or leads on it.
- **How are leads managed on Cosora?** "You'll get notified via dashboard, email, or WhatsApp when a buyer is interested." The product: leads appear on Leads; no email, WhatsApp or in-app notification is sent.
- **Can I upgrade or downgrade my plan anytime?** (Subscription) "…the difference will be prorated. Downgrades will take effect from your next billing cycle." The product: no proration; a new plan starts at once, at full price.
- **What happens when I reach my lead limit?** "You'll receive notifications as you approach your limit." The product: no notification; Leads shows the count, and quoting at the limit is refused.
- **Is there a refund policy?** "We offer a 7-day money-back guarantee for first-time subscribers." The product: the Terms say fees are non-refundable, and no refund can run (MPF-17; the manual process and the Terms wording are open).

The new Seller Help answers don't repeat these claims. Where they cover the same ground (documents,
leads), they describe what the product does.

## 5. Found while writing, not changed

- The Subscription page says "When your period nears its end you'll get a renew reminder". Nothing
  sends one.
