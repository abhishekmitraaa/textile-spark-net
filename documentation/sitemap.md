# Sitemap

Every route in `src/App.tsx`, grouped by the side `routeSide()` (`src/lib/sellerRoutes.ts`) gives its address.
Regenerated from the route table: keep it so when a route is added or removed (review L-102, 2026-11-20).

Last updated: 2026-11-20 — 112 routes (the 404 catch-all `*` not counted).

- **Seller** pages render in `DashboardLayout` (the seller frame, whatever the account's side).
- **Buyer** pages render in `BuyerShell`, or `BuyerFrame` around a page with its own frame (the sign-up gate and the
  buyer side either way).
- **Shared** pages keep the side the person came from (Help, chats, notifications, the legal pages, careers).
- A component of `→ /path` is a redirect. *Wrapped in* names `ClarityMask` (masked from Clarity), `BuyerFrame`,
  `SignupStep` (a buyer sign-up step), `RegisteredVendorGate`, `TierGate` (a plan feature).

## Seller side (33)

| Route | Component | Wrapped in | Notes |
|---|---|---|---|
| `/account-manager` | `AccountManager` | ClarityMask, TierGate | Who looks after the seller: messages, a call back, VIP picks and reviews (Silver and above) |
| `/add-social-links` | `AddSocialLinks` |  |  |
| `/advertisements` | `Advertisements` |  | Uses `min-[1400px]:` / `min-[1700px]:` variants, not `xl:`/`2xl:` |
| `/analytics` | `Analytics` |  |  |
| `/business-profile` | `BusinessProfile` | ClarityMask |  |
| `/business-profile-score` | `BusinessProfileScorePage` |  |  |
| `/competitor-ads` | `CompetitorAds` |  | Competitor intelligence loop |
| `/crm` | `Crm` | ClarityMask, TierGate | The CRM: leads by stage, board or list (Silver and above) |
| `/crm/analytics` | `CrmAnalytics` | ClarityMask, TierGate | Funnel, win rate, follow-ups kept (Gold and VIP) |
| `/crm/follow-ups` | `CrmFollowUps` | ClarityMask, TierGate | Follow-ups overdue, today and coming up (Silver and above) |
| `/kyc` | `Kyc` | ClarityMask |  |
| `/lead-alerts` | `LeadAlerts` | ClarityMask, TierGate | How the seller is told about matching requirements (paid plans) |
| `/leads` | `Leads` | ClarityMask | Buyer inquiries |
| `/my-payments` | `MyPayments` | ClarityMask |  |
| `/my-payments/receipt/:orderId` | `AdReceiptDetail` | ClarityMask |  |
| `/my-store` | `MyStore` |  |  |
| `/my-store/business` | `MyBusiness` | ClarityMask |  |
| `/my-store/business/tools` | `BusinessTools` |  |  |
| `/old-advertisements` | `OldAdvertisements` |  |   |
| `/overseas-leads` | `OverseasLeads` | ClarityMask, TierGate | Requirements from buyers outside India (Gold and VIP; VIP first) |
| `/products` | `Products` |  |   |
| `/quotes` | `Quotes` | ClarityMask | Quote requests; shows Total Order Value |
| `/reviews` | `Reviews` |  |  |
| `/seller-home` | `SellerHome` |  | Vendor home; carries the role toggle |
| `/seller/blogs` | `VendorBlogs` |  |   |
| `/seller/blogs/:blogId` | `VendorBlogArticle` |  |   |
| `/settings` | `VendorSettings` | ClarityMask | Business, Notifications, Language, Security, Help & Legal |
| `/subscription` | `Subscription` | ClarityMask | Basic / Silver / Gold. The FAQ is `public.faqs` (`subscription`) via `<FaqSection>`, ending in "Contact us" → `mailto:hello@cosora.in?subject=Subscription%20question` (2026-09-25; it opened `/help` from 2026-09-23) |
| `/subscription/invoice/:id` | `InvoiceDetail` | ClarityMask |   |
| `/upload` | `Upload` |  |   |
| `/upload-catalogue` | `UploadCatalogue` |  |   |
| `/upload-video` | `UploadVideo` |  | TUS resumable, 50 MB / 60 s cap |
| `/visibility` | `Visibility` | ClarityMask, TierGate | Where the plan places the seller's products, and views in Featured places and the Spotlight (Basic and above) |

## Shared (18)

| Route | Component | Wrapped in | Notes |
|---|---|---|---|
| `/careers` | `Careers` |  |  |
| `/chat` | `Chat` | BuyerFrame, ClarityMask | Vendor messages |
| `/chats` | `Chat` | BuyerFrame, ClarityMask |  |
| `/chats/:vendorId` | `ChatThread` | BuyerFrame, ClarityMask |  |
| `/cosora-studio` | `CosoraStudio` |  | Photographers. **Listed in both buyer and seller nav**; styled vendor-blue |
| `/cosora-studio/:id` | → `/cosora-studio` |  |   |
| `/feedback` | `AppFeedback` | ClarityMask | A bug or an idea; My Store's "App Feedback" |
| `/grievance` | `Grievance` |  | **Hidden** (P6c, D-15): the not-found page until the Grievance Officer is named in `src/lib/grievance.ts`. Not linked, not in the sitemap |
| `/help` | `Help` | ClarityMask | Both sidebars' "Help & Support". The same page as `/profile/help`. Seller frame and `seller_help` FAQs for sellers (P5), `buyer_help` for buyers, each in the reader's language when stored. Shows chat and callback only when rollout includes the person (P3) |
| `/help/callback` | `SupportCallback` | ClarityMask | Book a one-hour slot in support hours |
| `/help/chat` | `SupportChatStart` | ClarityMask | Start a chat or continue an open one. `?category=&entity_type=&entity_id=` from links (`supportChatHref`) |
| `/help/guides/:slug` | `HelpGuide` |  | A Quick Guide; public |
| `/help/requests` | `MyRequests` | ClarityMask | Every request, newest activity first |
| `/help/requests/:ticketNo` | `SupportThread` | ClarityMask | One request's conversation with Cosora Support, live; files and voice notes |
| `/notifications` | `Notifications` | ClarityMask | Backed by the `notifications` table; 4 moderation kinds are real, the rest are dev-only samples |
| `/privacy` | `PrivacyPolicy` |  |  |
| `/report-fraud` | `ReportFraud` | ClarityMask | Fills an email to Cosora (P1, 2026-10-01). Seller frame for sellers, the back header for everyone else, signed out included. P3 makes it a stored report |
| `/terms` | `TermsConditions` |  |   |

## Buyer side and public pages (61)

| Route | Component | Wrapped in | Notes |
|---|---|---|---|
| `/` | `Landing` |  |  |
| `/advertisement-slideshow` | `AdvertisementSlideshow` |  |   |
| `/auth/account-info` | `AccountInfo` | SignupStep, ClarityMask |  |
| `/auth/callback` | `AuthCallback` | ClarityMask |  |
| `/auth/interest-preference` | `InterestPreference` | SignupStep |  |
| `/auth/login` | `Login` | ClarityMask |  |
| `/auth/otp-verify` | `OtpVerify` | ClarityMask |  |
| `/auth/role-selection` | `RoleSelection` | RegisteredVendorGate, SignupStep |  |
| `/auth/sub-role` | `SubRole` | SignupStep |  |
| `/auth/terms` | `Terms` | SignupStep |  |
| `/auth/welcome` | `Welcome` |  |  |
| `/browse` | → `/search` |  | Redirect into the feed |
| `/catalogue/bulk-import` | → `/products` |  | Add up to 500 products from a spreadsheet (CSV), with a template, a preview and Recent imports (Silver and above) |
| `/categories` | `Categories` |  |   |
| `/dashboard` | `RoleHomeRedirect` |  |   |
| `/for-you` | → `/home/for-you` |  | Old address, redirected (vercel.json too) |
| `/freelancers` | `Freelancers` |  | Pattern makers, CLO 3D artists, trend researchers. **Sample profiles** (2026-11-18) |
| `/freelancers/:id` | `FreelancerProfile` | BuyerFrame | Sample profile from app data, no `profiles` row |
| `/go/post-rfq` | `GoPostRfq` |  |  |
| `/home/followings` | `Following` |  | Followed brands |
| `/home/followings/view-all` | `FollowingViewAll` | BuyerFrame |   |
| `/home/for-you` | `ForYou` |  | Personalised feed |
| `/home/for-you/onboarding` | → `/home/for-you` |  | Redirect: For You's first run is part of the feed (the scaffold card is gone, 2026-11-14) |
| `/home/new-arrivals` | `NewArrivals` |  | Buyer home; carries the role toggle |
| `/home/sale` | `Sale` |  | Discounted / sale-priced inventory |
| `/home/trends` | `Trends` | BuyerFrame |   |
| `/login` | `Login` | ClarityMask |  |
| `/onboarding` | `Onboarding` | RegisteredVendorGate, ClarityMask | Business details, documents, products, contract |
| `/post-requirement` | `PostRequirement` | ClarityMask | Same form as `/requirement/post-requirement`; closed to crawlers (robots.txt) |
| `/product/:id` | `ProductDetail` |  |   |
| `/profile` | `Profile` | ClarityMask |   |
| `/profile/business-details` | `ProfileBusinessDetails` | BuyerFrame, ClarityMask | Business name/type/website/industry, address with a country list (subscriptions P7), GSTIN, PAN (was the modal's Business tab) |
| `/profile/data-export` | `ProfileAccountPrefs` | BuyerFrame, ClarityMask |   |
| `/profile/edit` | `ProfileEdit` | BuyerFrame, ClarityMask | Photo + personal details (was the Edit Profile modal's Photo/Personal tabs; the modal is gone). `?focus=city` focuses City — the `/profile` "Add city" nudge links there |
| `/profile/help` | `Help` | ClarityMask | FAQ rows come from `public.faqs` (`buyer_help`), edited in Cosora-Admin `/faqs` with no deploy (2026-09-23). Also the Delete my account entry |
| `/profile/help/chat` | → `/help` |  | Redirects to `/help` since Help & Support P1 (2026-10-01); the canned chat it showed is gone |
| `/profile/interest-preference` | `InterestPreference` | BuyerFrame |   |
| `/profile/notifications` | `ProfileNotifications` | BuyerFrame |   |
| `/profile/regional-settings` | `ProfileAccountPrefs` | BuyerFrame, ClarityMask |   |
| `/profile/reviews` | `MyReviews` | BuyerFrame | Fans out across `reviews`, `product_reviews`, `service_reviews` |
| `/profile/settings` | `BuyerSettings` | ClarityMask | Buyer account & security (2026-09-23): sign-in number, account email, Log Out, download data, delete account, help & legal. The buyer sidebar's "Settings" and `/profile` → "Account & Security" link here. (`/settings` is the vendor's page.) |
| `/profile/social-links` | `ProfileSocialLinks` | BuyerFrame, ClarityMask |   |
| `/profile/terms` | `TermsConditions` |  |   |
| `/recently-viewed` | `RecentlyViewed` |  |   |
| `/register` | `Register` | ClarityMask |   |
| `/requirement` | → `/requirement/post-requirement` |  | → `/requirement/post-requirement` (2026-11-18: it showed a developer scaffold card) |
| `/requirement/my-quotes` | `MyQuotes` | ClarityMask | Also the target of "Track Orders" |
| `/requirement/post-requirement` | `PostRequirement` | ClarityMask | Category select → schema-driven form → success, all inside the page; asks for sign-in before the form |
| `/requirement/post-requirement/form` | → `/requirement/post-requirement` |  | → `/requirement/post-requirement` |
| `/requirement/post-requirement/success` | → `/requirement/my-quotes` |  | → `/requirement/my-quotes` |
| `/requirement/quick-rfq` | → `/requirement/post-requirement` |  | → `/requirement/post-requirement` (Quick Quote is a sheet there) |
| `/saved` | `SavedCollections` |  |  |
| `/saved/:collectionId` | `SavedCollectionDetail` |  |  |
| `/search` | `Search` | BuyerFrame |  |
| `/search/results` | `SearchResults` | BuyerFrame |  |
| `/seller` | `VendorLanding` |  | Vendor marketing landing. Its FAQ block is `public.faqs` (`seller_registration`), Andy's 10 questions, edited in Cosora-Admin `/faqs` (2026-09-23) |
| `/service-vendors` | → `/services` |  | Old address, redirected (vercel.json too) |
| `/services` | `ServiceVendors` |  | Printers, logistics, other service providers. **Sample profiles** (2026-11-18): no contact, ratings or reviews |
| `/services/:vendorId` | `ServiceVendorProfile` | BuyerFrame | Sample profile from app data, no `profiles` row |
| `/vendor/:id` | `VendorProfile` | BuyerFrame | Contact details are gated |
| `/video-closeups` | `VideoCloseUpsPage` | BuyerFrame | Product video reel. Never called "Reels" |
