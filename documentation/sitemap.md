# Sitemap

All routes/pages/sub-pages, grouped by side. Updated automatically whenever routes change.

Last updated: 2026-09-05 — 97 routes.

**Source of truth:** every route is declared in `src/App.tsx`. Routes marked **(shell)** come
from the `buyerShellRoutes` array at the top of that file and render inside
`BuyerRouteShell`. Everything else is a direct `<Route>` with its own page component.

---

## Buyer Side

Buyer pages render inside `BuyerShell` (BuyerTopBar + content + `MobileBottomNav` + ToTop) —
**not** the vendor `DashboardLayout`.

### Discovery feed
| Route | Component | Notes |
|---|---|---|
| `/browse` | `Navigate` | Redirect into the feed |
| `/home/new-arrivals` | `NewArrivals` | Buyer home; carries the role toggle |
| `/home/for-you` | `ForYou` | Personalised feed |
| `/home/for-you/onboarding` **(shell)** | — | First-time preference setup before the feed |
| `/home/trends` | `Trends` | |
| `/home/sale` **(shell)** | — | Discounted / sale-priced inventory |
| `/home/followings` | `Following` | Followed brands |
| `/home/followings/view-all` | `FollowingViewAll` | |
| `/for-you` | `ForYou` | Legacy alias of `/home/for-you` |
| `/video-closeups` | `VideoCloseUpsPage` | Product video reel. Never called "Reels" |
| `/categories` | `Categories` | |
| `/recently-viewed` | `RecentlyViewed` | |

### Search
| Route | Component |
|---|---|
| `/search` | `Search` |
| `/search/results` | `SearchResults` |

### Products & vendors
| Route | Component | Notes |
|---|---|---|
| `/product/:id` | `ProductDetail` | |
| `/vendor/:id` | `VendorProfile` | Contact details are gated |
| `/services` | `ServiceVendors` | Printers, logistics, other service providers |
| `/service-vendors` | `ServiceVendors` | Alias of `/services` |
| `/services/:vendorId` | `ServiceVendorProfile` | Seed data, no `profiles` row |
| `/freelancers` | `Freelancers` | Pattern makers, CLO 3D artists, trend researchers |
| `/freelancers/:id` | `FreelancerProfile` | Seed data, no `profiles` row |
| `/cosora-studio` | `CosoraStudio` | Photographers. **Listed in both buyer and seller nav**; styled vendor-blue |
| `/cosora-studio/:id` | `PhotographerProfile` | |

### Requirements (RFQ) & quotes
| Route | Component | Notes |
|---|---|---|
| `/requirement` **(shell)** | — | Hub: Quick RFQ, detailed RFQ, My Quotes |
| `/requirement/quick-rfq` **(shell)** | — | Image + quantity, <30 seconds |
| `/requirement/post-requirement` | `PostRequirement` | Category select → schema-driven form |
| `/requirement/post-requirement/form` **(shell)** | — | Structured form step |
| `/requirement/post-requirement/success` **(shell)** | — | Coral success screen |
| `/requirement/my-quotes` | `MyQuotes` | Also the target of "Track Orders" |
| `/post-requirement` | `PostRequirement` | Legacy alias |

### Saved
| Route | Component |
|---|---|
| `/saved` | `SavedCollections` |
| `/saved/:collectionId` | `SavedCollectionDetail` |

### Messaging
| Route | Component |
|---|---|
| `/chats` | `Chat` |
| `/chats/:vendorId` | `ChatThread` |

### Buyer profile
| Route | Component | Notes |
|---|---|---|
| `/profile` | `Profile` | Buyer sidebar "Settings" also points here — **known bug**, buyer has no dedicated Settings page |
| `/profile/edit` **(shell)** | — | Personal, business, photo |
| `/profile/business-details` **(shell)** | — | |
| `/profile/interest-preference` | `InterestPreference` | |
| `/profile/reviews` | `MyReviews` | Fans out across `reviews`, `product_reviews`, `service_reviews` |
| `/profile/notifications` | `ProfileNotifications` | |
| `/profile/social-links` | `ProfileSocialLinks` | |
| `/profile/regional-settings` | `ProfileAccountPrefs` | |
| `/profile/data-export` | `ProfileAccountPrefs` | |
| `/profile/terms` | `TermsConditions` | |
| `/profile/help` | `Help` | |
| `/profile/help/chat` | `SupportChat` | |

### Content
| Route | Component |
|---|---|
| `/blogs` **(shell)** | — |
| `/blogs/:blogId` **(shell)** | — |

---

## Vendor Side

Vendor pages wrap in `DashboardLayout` (256 px sidebar + `lg:p-6`).

### Dashboard & catalogue
| Route | Component | Notes |
|---|---|---|
| `/seller-home` | `SellerHome` | Vendor home; carries the role toggle |
| `/dashboard` | `Index` | |
| `/products` | `Products` | |
| `/upload` | `Upload` | |
| `/upload-catalogue` | `UploadCatalogue` | |
| `/upload-video` | `UploadVideo` | TUS resumable, 50 MB / 60 s cap |

### Demand
| Route | Component | Notes |
|---|---|---|
| `/leads` | `Leads` | Buyer inquiries |
| `/quotes` | `Quotes` | Quote requests; shows Total Order Value |
| `/chat` | `Chat` | Vendor messages |

### Advertising & monetisation
| Route | Component | Notes |
|---|---|---|
| `/advertisements` | `Advertisements` | Uses `min-[1400px]:` / `min-[1700px]:` variants, not `xl:`/`2xl:` |
| `/old-advertisements` | `OldAdvertisements` | |
| `/advertisement-slideshow` | `AdvertisementSlideshow` | |
| `/competitor-ads` | `CompetitorAds` | Competitor intelligence loop |
| `/subscription` | `Subscription` | Basic / Silver / Gold |
| `/subscription/invoice/:id` | `InvoiceDetail` | |

### Store & business profile
| Route | Component |
|---|---|
| `/my-store` | `MyStore` |
| `/my-store/business` | `MyBusiness` |
| `/my-store/business/tools` | `BusinessTools` |
| `/business-profile` | `BusinessProfile` |
| `/business-profile/employees` | `BusinessProfileEmployees` |
| `/business-profile-score` | `BusinessProfileScorePage` |
| `/add-social-links` | `AddSocialLinks` |

### Insight & reputation
| Route | Component |
|---|---|
| `/analytics` | `Analytics` |
| `/reviews` | `Reviews` |

### Vendor acquisition & onboarding
| Route | Component | Notes |
|---|---|---|
| `/seller` | `VendorLanding` | Vendor marketing landing |
| `/register` | `Register` | |
| `/onboarding` | `Onboarding` | Business details, documents, products, contract |

### Vendor settings & content
| Route | Component | Notes |
|---|---|---|
| `/settings` | `VendorSettings` | Business, Notifications, Language, Security, Help & Legal |
| `/seller/blogs` | `VendorBlogs` | |
| `/seller/blogs/:blogId` | `VendorBlogArticle` | |

---

## Admin Side

**No admin routes exist in this repo.** The admin panel is built in a **separate repo,
`Cosora-Admin`**, running against the same Supabase project. This repo contributes the
server-side surface the panel drives — `approve_vendor_content`,
`approve_vendor_content_bulk`, `reject_vendor_content`, `set_account_status`,
`submit_report` — while `resolve_conversation_review` and `regex_probe` are owned by
Cosora-Admin's own migrations.

Its routes are listed in `Cosora-Admin/README.md`, not here. The one worth knowing from
this side: **`/videos`** is the Video Closeups moderation queue (added 2026-09-05). It is
what moves a `product_videos` row from `under_review` to `live`, and therefore the only
reason anything ever appears in this repo's `/video-closeups` buyer feed.

---

## Shared / Cross-role

### Entry & auth
| Route | Component |
|---|---|
| `/` | `Landing` |
| `/login` | `Login` |
| `/auth/login` | `Login` |
| `/auth/otp-verify` | `OtpVerify` |
| `/auth/callback` | `AuthCallback` |
| `/auth/role-selection` | `RoleSelection` |
| `/auth/sub-role` | `SubRole` |
| `/auth/account-info` | `AccountInfo` |
| `/auth/interest-preference` | `InterestPreference` |
| `/auth/terms` | `Terms` |
| `/auth/welcome` | `Welcome` |

### Support, legal & misc
| Route | Component | Notes |
|---|---|---|
| `/notifications` | `Notifications` | Backed by the `notifications` table; 4 moderation kinds are real, the rest are dev-only samples |
| `/help` | `Help` | Both sidebars' "Help & Support" |
| `/terms` | `TermsConditions` | |
| `/about` | `About` | |
| `/report-fraud` | `ReportFraud` | |
| `/app-feedback` | `AppFeedback` | |
| `*` | `NotFound` | Fallback |

---

## Routes that do NOT exist (asked for often)

- **`/orders`** — there is no orders route. "Track Orders" → `/requirement/my-quotes`;
  "View Order Details" → `/chat`.
- **A buyer Settings page** — buyer sidebar "Settings" points at `/profile`.
