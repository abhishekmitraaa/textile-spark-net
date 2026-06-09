# Cosora — Product Context

## What Is Cosora?

Cosora is a B2B sourcing marketplace for India's fashion and textile industry. It connects three parties: **manufacturers/suppliers** (Vendors), **brands/retailers/designers** (Buyers), and **Cosora's own operations team** (Admin). Think of it as the infrastructure layer between a fabric mill in Surat and a fashion brand in Delhi — a place where sourcing deals get initiated, negotiated, and tracked.

The platform runs as a single unified web app where the same user can toggle between the Vendor and Buyer experience depending on their role.

---

## The Three Sides

### Vendor Side
For manufacturers, mills, fabric suppliers, service providers (printers, logistics companies), and freelancers (pattern makers, CLO 3D designers, etc.). Vendors list products, receive buyer inquiries (leads), run ads, manage quotes, and track their business analytics. The vendor side is blue (`#256fef`) as its primary color.

### Buyer Side
For fashion brands, wholesalers, retailers, sourcing managers, and buying houses. Buyers discover products, post sourcing requirements (called RFQs), receive quotes from multiple vendors, compare them, and negotiate via chat. The buyer side is Cosora red (`#EF4D62`) as its primary color.

### Admin Panel
Cosora's internal team uses this to verify vendors, moderate product listings, handle fraud reports, manage blog content, and oversee the platform. Not yet designed.

---

## Core Mechanics

### How Vendors Operate
A vendor registers, completes a multi-step onboarding (business details, documents, products, contract), then lands on a dashboard. From there they:
- List products and services (with specs like fabric type, GSM, MOQ, certifications)
- Receive leads when buyers show interest in their products
- Run paid ad campaigns to increase visibility
- Track quotes they've sent to buyers
- Monitor competitor activity

Vendor accounts have subscription tiers (Basic, Silver, Gold) that determine how many leads they get, how many products they can list, and where their ads appear geographically.

### How Buyers Operate
A buyer registers, selects their sourcing interests, and lands on a discovery feed. From there they:
- Browse products across categories (apparel, fabrics, accessories, services, freelancers)
- Post sourcing requirements — either a quick RFQ (image + quantity, takes 30 seconds) or a detailed requirement form with full specs
- Receive multiple quotes from vendors in response
- Compare quotes side by side and accept/reject/negotiate
- Save products to wishlist collections and track vendors they follow

### How They Connect
Communication happens through an in-app chat system. When a buyer contacts a vendor, the chat opens with the lead context pre-loaded (product, quantity, requirements). Calls are initiated via native phone dialer. Cosora monitors all platform messages — this disclosure is legally required and must always be visible.

---

## Key Domain Terms

| Term | Meaning |
|---|---|
| **RFQ** | Request for Quotation — a buyer's sourcing requirement post |
| **Quick RFQ** | Simplified RFQ: just an image + quantity, designed to take under 30 seconds |
| **Lead** | A buyer inquiry that arrives in a vendor's dashboard |
| **MOQ** | Minimum Order Quantity |
| **GSM** | Fabric weight measurement (grams per square metre) |
| **TradeSEAL** | Cosora's paid vendor verification badge — purchased via the ad system |
| **Pan India** | Nationwide ad targeting across all of India |
| **UPI AutoPay** | Subscription payment method via India's UPI system |
| **Profile Score** | A completeness percentage shown to vendors — higher score = better visibility |

---

## Authentication

Login is OTP-only (phone number + one-time password). No passwords. Google OAuth is a secondary option. A user who registered as a vendor first is taken to the vendor dashboard after login; a buyer-first user goes to the buyer homepage. Switching from vendor to buyer is a direct toggle. Switching from buyer to vendor requires completing full vendor onboarding first.

---

## What Makes Cosora Distinct

A few things worth understanding because they shape design and data decisions:

**The Freelancers category** — Cosora lists individual fashion professionals (pattern makers, CLO 3D artists, trend researchers) alongside manufacturers. No other Indian B2B fashion marketplace does this. It positions Cosora as a complete production ecosystem, not just a supplier directory.

**Competitor intelligence loop** — Vendors can see what competitors in their category and city are advertising, and at what budget. This is a deliberate retention and upsell mechanic.

**Total Order Value** — The My Quotes section shows vendors a cumulative figure of all orders they've won through Cosora (e.g., ₹24.5 Lakhs). This is the platform's strongest retention metric — vendors won't leave once they can see their business growing here.

**Future financing product** — The data Cosora collects (order volume, capacity, reliability, pricing, transaction history) is the foundation for a working capital lending product planned for the future. The database schema must be designed to support this from day one, even though the product doesn't exist yet.

**Audio-first for Indian SMEs** — Many Indian manufacturers are more comfortable speaking than typing. Audio messages in chat and voice-to-text in the RFQ form are not nice-to-haves; they're critical for the actual user base.

---

## Current Build Status

- **Frontend stack:** React 18 + TypeScript, Vite, React Router DOM v6, Tailwind CSS v3, Shadcn UI, Framer Motion
- **Active repo:** `abhishekmitraaa/textile-spark-net` (Vite/TSX)
- **Source reference:** `cosorawork/client-cosora-vendor-frontend` (Next.js/JSX — being ported from)
- **UI design tool:** Canva
- **Backend:** Not started
- **Admin side:** No UI exists yet. Not designed, not built. Out of scope for now.

### Where we are right now
Cosora is a 3-sided platform — Vendor, Buyer, and Admin — but only two sides have UI: Vendor and Buyer. The Admin side has no designs and no code; it doesn't exist yet.

The current focus is **reviewing and correcting the Vendor and Buyer UIs** — fixing issues, porting components from the Next.js source repo into the Vite/TSX target repo, and resolving a catalogued list of problems (pricing contradictions, broken logic, placeholder content from other platforms, legal gaps, etc.). This is a correction and porting process, not a greenfield build.

Vendor side is being addressed first. Buyer side is next. Admin side comes after both are stable.

---

## Brand Colors

| Usage | Hex |
|---|---|
| Vendor primary CTA, links, blue states | `#256fef` |
| Buyer primary CTA, alerts, Switch to Buyer banner | `#EF4D62` |
| Success, verified, accepted states | `#14ae5c` |
| Borders, inactive, placeholder | `#d0d4dc` |
| Body text, headings | `#363636` |

---

## Things That Must Always Be True

- The chat monitoring disclosure ("We'll be monitoring the messages") is **legally required** — never remove it
- Default currency for Indian users is **INR**, default timezone is **IST**
- All product listings go through admin moderation before going live (24–48 hours)
- The Switch to Buyer/Seller toggle appears **only** on the Vendor Dashboard Home and Buyer Homepage — nowhere else
- Image imports must use ES module syntax (`import x from "@/assets/..."`) — not file path strings
- Every page wraps in `DashboardLayout`