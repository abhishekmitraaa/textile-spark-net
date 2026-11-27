import { Suspense } from "react";
import { LazyMotion } from "framer-motion";
import { lazyPage, scheduleWarmPages } from "./lib/lazyPage";
import { prefetchRouteData } from "./lib/routeData";
const BusinessProfileScorePage = lazyPage(() => import("./pages/BusinessProfileScorePage"));
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { UserRoleProvider } from "./contexts/UserRoleContext";
import { AuthProvider } from "./contexts/AuthContext";
import { RealtimeHubProvider } from "./lib/realtimeHub";
import { DisplayCurrencyProvider } from "./contexts/DisplayCurrencyContext";
import DevAccountSwitcher from "./components/dev/DevAccountSwitcher";
import ClarityMask from "./components/analytics/ClarityMask";
import SiteThemeApplier from "./components/SiteThemeApplier";
import StoreSync from "./components/StoreSync";
import { BuyerFrame } from "./components/buyer/BuyerShell";
import { ScrollToTopOnNavigate } from "./components/ScrollToTopOnNavigate";
import { ReturnToTracker } from "./components/ReturnToTracker";
import { RouteErrorBoundary } from "./components/AppErrorBoundary";
import AuthCallback from "./pages/AuthCallback";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import RoleHomeRedirect from "./components/RoleHomeRedirect";
const SellerHome = lazyPage(() => import("./pages/SellerHome"), { warm: "seller" });
const Products = lazyPage(() => import("./pages/Products"), { warm: "seller" });
const ProductDetail = lazyPage(() => import("./pages/ProductDetail"), { warm: "buyer" });
const ForYou = lazyPage(() => import("./pages/ForYou"));
const Upload = lazyPage(() => import("./pages/Upload"));
const Leads = lazyPage(() => import("./pages/Leads"), { warm: "seller" });
const LeadAlerts = lazyPage(() => import("./pages/LeadAlerts"));
const OverseasLeads = lazyPage(() => import("./pages/OverseasLeads"));
const Crm = lazyPage(() => import("./pages/Crm"));
const CrmFollowUps = lazyPage(() => import("./pages/CrmFollowUps"));
const CrmAnalytics = lazyPage(() => import("./pages/CrmAnalytics"));
const AccountManager = lazyPage(() => import("./pages/AccountManager"));
const Visibility = lazyPage(() => import("./pages/Visibility"));
import { TierGate } from "./components/TierGate";
const Advertisements = lazyPage(() => import("./pages/Advertisements"));
const Subscription = lazyPage(() => import("./pages/Subscription"));
const InvoiceDetail = lazyPage(() => import("./pages/InvoiceDetail"));
const MyPayments = lazyPage(() => import("./pages/MyPayments"));
const AdReceiptDetail = lazyPage(() => import("./pages/AdReceiptDetail"));
const Quotes = lazyPage(() => import("./pages/Quotes"));
const Profile = lazyPage(() => import("./pages/Profile"));
const MyStore = lazyPage(() => import("./pages/MyStore"));
const BusinessProfile = lazyPage(() => import("./pages/BusinessProfile"));
const Chat = lazyPage(() => import("./pages/Chat"));
const ChatThread = lazyPage(() => import("./pages/ChatThread"));
const Categories = lazyPage(() => import("./pages/Categories"));
const MyReviews = lazyPage(() => import("./pages/MyReviews"));
const PostRequirement = lazyPage(() => import("./pages/PostRequirement"));
const MyQuotes = lazyPage(() => import("./pages/MyQuotes"));
const Sale = lazyPage(() => import("./pages/Sale"));
const SearchResults = lazyPage(() => import("./pages/SearchResults"), { warm: "buyer" });
const VendorProfile = lazyPage(() => import("./pages/VendorProfile"), { warm: "buyer" });
const RecentlyViewed = lazyPage(() => import("./pages/RecentlyViewed"));
const ServiceVendors = lazyPage(() => import("./pages/ServiceVendors"));
const ServiceVendorProfile = lazyPage(() => import("./pages/ServiceVendorProfile"));
const Freelancers = lazyPage(() => import("./pages/Freelancers"));
const FreelancerProfile = lazyPage(() => import("./pages/FreelancerProfile"));
const Analytics = lazyPage(() => import("./pages/Analytics"));
const Help = lazyPage(() => import("./pages/Help"));
const CosoraStudio = lazyPage(() => import("./pages/CosoraStudio"));
import NotFound from "./pages/NotFound";
import Register from "./pages/Register";
import OtpVerify from "./pages/OtpVerify";
const RoleSelection = lazyPage(() => import("./pages/RoleSelection"));
const SubRole = lazyPage(() => import("./pages/SubRole"));
const AccountInfo = lazyPage(() => import("./pages/AccountInfo"));
const InterestPreference = lazyPage(() => import("./pages/InterestPreference"));
const Terms = lazyPage(() => import("./pages/Terms"));
const Welcome = lazyPage(() => import("./pages/Welcome"));
const VendorLanding = lazyPage(() => import("./pages/VendorLanding"));
const Onboarding = lazyPage(() => import("./pages/Onboarding"));
import SignupStep from "./components/auth/SignupStep";
import RegisteredVendorGate from "./components/auth/RegisteredVendorGate";
import NewArrivals from "./pages/NewArrivals";
// Lazily loaded. These two are the video routes, and neither is on the path a
// buyer lands on — but their dependencies (the reel viewer, the upload page's
// probe/preview machinery) were being shipped inside the single main chunk that
// every visitor downloads before anything renders. Route-level splitting only:
// vite.config.ts:15 records that a manualChunks pass caused runtime problems.
const VideoCloseUpsPage = lazyPage(() => import("./pages/VideoCloseUpsPage"));
const Trends = lazyPage(() => import("./pages/Trends"));
const Following = lazyPage(() => import("./pages/Following"));
const FollowingViewAll = lazyPage(() => import("./pages/FollowingViewAll"));
const ProfileNotifications = lazyPage(() => import("./pages/ProfileNotifications"));
const ProfileSocialLinks = lazyPage(() => import("./pages/ProfileSocialLinks"));
const ProfileAccountPrefs = lazyPage(() => import("./pages/ProfileAccountPrefs"));
const ProfileEdit = lazyPage(() => import("./pages/ProfileEdit"));
const ProfileBusinessDetails = lazyPage(() => import("./pages/ProfileBusinessDetails"));
const BuyerSettings = lazyPage(() => import("./pages/Settings"));
const TermsConditions = lazyPage(() => import("./pages/TermsConditions"));
const PrivacyPolicy = lazyPage(() => import("./pages/PrivacyPolicy"));
const Careers = lazyPage(() => import("./pages/Careers"));
// Help & Support P6c (D-15): hidden until the Grievance Officer is named (src/lib/grievance.ts).
const Grievance = lazyPage(() => import("./pages/Grievance"));
// Company disclosure (Mitra, 2026-11-24): who runs Cosora, and its refund rules.
const Contact = lazyPage(() => import("./pages/Contact"));
const RefundPolicy = lazyPage(() => import("./pages/RefundPolicy"));
const SavedCollections = lazyPage(() => import("./pages/SavedCollections"));
const SavedCollectionDetail = lazyPage(() => import("./pages/SavedCollectionDetail"));
const Search = lazyPage(() => import("./pages/Search"));
const AddSocialLinks = lazyPage(() => import("./pages/AddSocialLinks"));


const Reviews = lazyPage(() => import("./pages/Reviews"));
const CompetitorAds = lazyPage(() => import("./pages/CompetitorAds"));
const MyBusiness = lazyPage(() => import("./pages/MyBusiness"));
const BusinessTools = lazyPage(() => import("./pages/BusinessTools"));
const Kyc = lazyPage(() => import("./pages/Kyc"));
const OldAdvertisements = lazyPage(() => import("./pages/OldAdvertisements"));
const ReportFraud = lazyPage(() => import("./pages/ReportFraud"));
// Help & Support (plan P3): the requester's screens.
const SupportChatStart = lazyPage(() => import("./pages/SupportChatStart"));
const SupportThread = lazyPage(() => import("./pages/SupportThread"));
const MyRequests = lazyPage(() => import("./pages/MyRequests"));
const SupportCallback = lazyPage(() => import("./pages/SupportCallback"));
const AppFeedback = lazyPage(() => import("./pages/AppFeedback"));
const HelpGuide = lazyPage(() => import("./pages/HelpGuide"));
const VendorBlogs = lazyPage(() => import("./pages/VendorBlogs"));
const VendorBlogArticle = lazyPage(() => import("./pages/VendorBlogArticle"));
const GoPostRfq = lazyPage(() => import("./pages/GoPostRfq"));
import { SaveToFolderModal, CallNumberModal } from "./components/buyer/LazyModals";
import { PendingEnquiry } from "./hooks/usePendingEnquiry";
import AutoTranslate from "./components/i18n/AutoTranslate";
import LanguageSync from "./components/i18n/LanguageSync";
const AdvertisementSlideshow = lazyPage(() => import("./pages/AdvertisementSlideshow"));
const UploadCatalogue = lazyPage(() => import("./pages/UploadCatalogue"));
const UploadVideo = lazyPage(() => import("./pages/UploadVideo"));
const Notifications = lazyPage(() => import("./pages/Notifications"));
const VendorSettings = lazyPage(() => import("./pages/VendorSettings"));

// A bare `new QueryClient()` uses staleTime: 0, which means EVERY query in the
// app was considered stale the instant it resolved: navigating back to a page
// refetched it, and so did alt-tabbing away and back. For a catalogue app whose
// content changes on a 24-48h moderation cycle that is a lot of egress and a lot
// of loading spinners for data we already had.
//
// A minute of freshness is well inside how fast anything here actually changes.
// Queries that need something different set it themselves (see useVideoCloseUps
// at 5 min, useMyVideos at 30s, and the subscription queries).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
prefetchRouteData(queryClient, window.location.pathname, window.location.search);

// The pages people open next are fetched in the background after the first one (review M-34).
scheduleWarmPages();

/** An old address that now lives elsewhere, query and hash kept (review L-101; vercel.json redirects a direct load). */
function AliasRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

// framer-motion's engine loads after the first script (speed plan 3.3): the request starts now, while the app renders.
// A failed load is a replaced deploy's file, which main.tsx's vite:preloadError handler reloads once.
const motionFeatures = import("./lib/motionFeatures").then((mod) => mod.default);
const loadMotionFeatures = () => motionFeatures;

const App = () => (
  <LazyMotion features={loadMotionFeatures}>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <UserRoleProvider>
    <DisplayCurrencyProvider>
      <>
        <Sonner />
        <RealtimeHubProvider>
        <BrowserRouter>
          <AutoTranslate />
          <LanguageSync />
          {/* The site theme saved in Cosora-Admin (admin completion Phase 9). */}
          <SiteThemeApplier />
          {/* Covers the lazily-loaded routes below. Deliberately a blank div
              rather than a spinner: these chunks are small and load in a frame
              or two on any reasonable connection, and a flashed spinner reads
              worse than nothing. */}
          {/* A page that throws shows a message instead of a white screen; the next route starts clean. */}
          <RouteErrorBoundary>
          <Suspense fallback={<div className="min-h-screen bg-white" />}>
          <Routes>
            {/* <ClarityMask> hides a page from Microsoft Clarity's recordings (lib/analytics/clarity.ts):
                sign-in, chats, onboarding, KYC, profile, requirements, quotes, leads and billing. */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<ClarityMask><Login /></ClarityMask>} />
            <Route path="/auth/login" element={<ClarityMask><Login /></ClarityMask>} />
            <Route path="/auth/otp-verify" element={<ClarityMask><OtpVerify /></ClarityMask>} />
            {/* Masked from Clarity like the other sign-in pages (review L-71). The page itself is unchanged. */}
            <Route path="/auth/callback" element={<ClarityMask><AuthCallback /></ClarityMask>} />
            <Route path="/auth/role-selection" element={<RegisteredVendorGate><SignupStep><RoleSelection /></SignupStep></RegisteredVendorGate>} />
            <Route path="/auth/sub-role" element={<SignupStep><SubRole /></SignupStep>} />
            <Route path="/auth/account-info" element={<SignupStep><ClarityMask><AccountInfo /></ClarityMask></SignupStep>} />
            <Route path="/auth/interest-preference" element={<SignupStep><InterestPreference /></SignupStep>} />
            <Route path="/auth/terms" element={<SignupStep><Terms /></SignupStep>} />
            <Route path="/auth/welcome" element={<Welcome />} />
            {/* /browse retired — the old page served hardcoded fake products.
                Kept as a redirect so external/bookmarked links land on the real
                live-data search feed. Internal entry points now link there directly. */}
            <Route path="/browse" element={<Navigate to="/search" replace />} />
            <Route path="/home/new-arrivals" element={<NewArrivals />} />
            <Route path="/home/trends" element={<BuyerFrame><Trends /></BuyerFrame>} />
            <Route path="/home/sale" element={<Sale />} />
            <Route path="/home/followings" element={<Following />} />
            <Route path="/home/followings/view-all" element={<BuyerFrame><FollowingViewAll /></BuyerFrame>} />
            <Route path="/video-closeups" element={<BuyerFrame><VideoCloseUpsPage /></BuyerFrame>} />
            <Route path="/search" element={<BuyerFrame><Search /></BuyerFrame>} />
            <Route path="/search/results" element={<BuyerFrame><SearchResults /></BuyerFrame>} />
            <Route path="/home/for-you" element={<ForYou />} />
            <Route path="/services" element={<ServiceVendors />} />
            <Route path="/services/:vendorId" element={<BuyerFrame><ServiceVendorProfile /></BuyerFrame>} />
            <Route path="/freelancers" element={<Freelancers />} />
            <Route path="/freelancers/:id" element={<BuyerFrame><FreelancerProfile /></BuyerFrame>} />
            <Route path="/requirement/post-requirement" element={<ClarityMask><PostRequirement /></ClarityMask>} />
            <Route path="/requirement/my-quotes" element={<ClarityMask><MyQuotes /></ClarityMask>} />
            <Route path="/vendor/:id" element={<BuyerFrame><VendorProfile /></BuyerFrame>} />
            <Route path="/chats" element={<BuyerFrame><ClarityMask><Chat /></ClarityMask></BuyerFrame>} />
            <Route path="/chats/:vendorId" element={<BuyerFrame><ClarityMask><ChatThread /></ClarityMask></BuyerFrame>} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/profile/interest-preference" element={<BuyerFrame><InterestPreference /></BuyerFrame>} />
            <Route path="/profile/reviews" element={<BuyerFrame><MyReviews /></BuyerFrame>} />
            <Route path="/profile/help" element={<ClarityMask><Help /></ClarityMask>} />
            {/* The canned "support chat" is gone (Help & Support P1); the real one is /help/chat (P3). */}
            <Route path="/profile/help/chat" element={<Navigate to="/help" replace />} />
            <Route path="/seller-home" element={<SellerHome />} />
            <Route path="/dashboard" element={<RoleHomeRedirect />} />
            <Route path="/products" element={<Products />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            {/* Aliases go to the page's one address (review L-101); vercel.json redirects a direct load. */}
            <Route path="/for-you" element={<AliasRedirect to="/home/for-you" />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/leads" element={<ClarityMask><Leads /></ClarityMask>} />
            {/* Belongs to a plan (subscriptions P6): shown only when lead alerts are this vendor's. */}
            <Route path="/lead-alerts" element={<ClarityMask><TierGate feature="lead_alerts"><LeadAlerts /></TierGate></ClarityMask>} />
            <Route path="/overseas-leads" element={<ClarityMask><TierGate feature="overseas_leads"><OverseasLeads /></TierGate></ClarityMask>} />
            <Route path="/crm" element={<ClarityMask><TierGate feature="crm_pipeline"><Crm /></TierGate></ClarityMask>} />
            <Route path="/crm/follow-ups" element={<ClarityMask><TierGate feature="crm_pipeline"><CrmFollowUps /></TierGate></ClarityMask>} />
            <Route path="/crm/analytics" element={<ClarityMask><TierGate feature="crm_analytics"><CrmAnalytics /></TierGate></ClarityMask>} />
            <Route path="/account-manager" element={<ClarityMask><TierGate feature="am_page"><AccountManager /></TierGate></ClarityMask>} />
            <Route path="/visibility" element={<ClarityMask><TierGate feature="visibility_page"><Visibility /></TierGate></ClarityMask>} />
            {/* The CSV import is off (Mitra, 2026-10-22): an old link lands on Products. */}
            <Route path="/catalogue/bulk-import" element={<Navigate to="/products" replace />} />
            <Route path="/notifications" element={<ClarityMask><Notifications /></ClarityMask>} />
            <Route path="/advertisements" element={<Advertisements />} />
            <Route path="/settings" element={<ClarityMask><VendorSettings /></ClarityMask>} />
            <Route path="/terms" element={<TermsConditions />} />
            <Route path="/grievance" element={<Grievance />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/subscription" element={<ClarityMask><Subscription /></ClarityMask>} />
            <Route path="/subscription/invoice/:id" element={<ClarityMask><InvoiceDetail /></ClarityMask>} />
            {/* Vendor billing: every payment, its bill, and certificate tracking. */}
            <Route path="/my-payments" element={<ClarityMask><MyPayments /></ClarityMask>} />
            <Route path="/my-payments/receipt/:orderId" element={<ClarityMask><AdReceiptDetail /></ClarityMask>} />
            <Route path="/quotes" element={<ClarityMask><Quotes /></ClarityMask>} />
            <Route path="/profile" element={<ClarityMask><Profile /></ClarityMask>} />
            {/* Replaced the Edit Profile modal (2026-09-23): real, refresh-safe routes. */}
            <Route path="/profile/edit" element={<BuyerFrame><ClarityMask><ProfileEdit /></ClarityMask></BuyerFrame>} />
            <Route path="/profile/business-details" element={<BuyerFrame><ClarityMask><ProfileBusinessDetails /></ClarityMask></BuyerFrame>} />
            {/* Buyer account & security settings (2026-09-23). /settings is the vendor's. */}
            <Route path="/profile/settings" element={<ClarityMask><BuyerSettings /></ClarityMask>} />
            <Route path="/profile/notifications" element={<BuyerFrame><ProfileNotifications /></BuyerFrame>} />
            <Route path="/profile/social-links" element={<BuyerFrame><ClarityMask><ProfileSocialLinks /></ClarityMask></BuyerFrame>} />
            <Route path="/profile/regional-settings" element={<BuyerFrame><ClarityMask><ProfileAccountPrefs /></ClarityMask></BuyerFrame>} />
            <Route path="/profile/data-export" element={<BuyerFrame><ClarityMask><ProfileAccountPrefs /></ClarityMask></BuyerFrame>} />
            <Route path="/profile/terms" element={<TermsConditions />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            {/* Behind the careers_page switch; off, it is the 404 page (review L-68). */}
            <Route path="/careers" element={<Careers />} />
            <Route path="/saved" element={<SavedCollections />} />
            <Route path="/saved/:collectionId" element={<SavedCollectionDetail />} />
            <Route path="/my-store" element={<MyStore />} />
            <Route path="/business-profile" element={<ClarityMask><BusinessProfile /></ClarityMask>} />
            <Route path="/chat" element={<BuyerFrame><ClarityMask><Chat /></ClarityMask></BuyerFrame>} />
            <Route path="/post-requirement" element={<ClarityMask><PostRequirement /></ClarityMask>} />
            <Route path="/recently-viewed" element={<RecentlyViewed />} />
            <Route path="/service-vendors" element={<AliasRedirect to="/services" />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/help" element={<ClarityMask><Help /></ClarityMask>} />
            <Route path="/help/chat" element={<ClarityMask><SupportChatStart /></ClarityMask>} />
            <Route path="/help/requests" element={<ClarityMask><MyRequests /></ClarityMask>} />
            <Route path="/help/requests/:ticketNo" element={<ClarityMask><SupportThread /></ClarityMask>} />
            <Route path="/help/callback" element={<ClarityMask><SupportCallback /></ClarityMask>} />
            <Route path="/help/guides/:slug" element={<HelpGuide />} />
            <Route path="/feedback" element={<ClarityMask><AppFeedback /></ClarityMask>} />
            <Route path="/cosora-studio" element={<CosoraStudio />} />
            {/* The invented studios behind these links are gone (2026-11-05). */}
            <Route path="/cosora-studio/:id" element={<Navigate to="/cosora-studio" replace />} />
            <Route path="/register" element={<ClarityMask><Register /></ClarityMask>} />
            <Route path="/seller" element={<VendorLanding />} />
            <Route path="/onboarding" element={<RegisteredVendorGate showPending><ClarityMask><Onboarding /></ClarityMask></RegisteredVendorGate>} />
            
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/competitor-ads" element={<CompetitorAds />} />
            <Route path="/my-store/business" element={<ClarityMask><MyBusiness /></ClarityMask>} />
            <Route path="/my-store/business/tools" element={<BusinessTools />} />
            <Route path="/kyc" element={<ClarityMask><Kyc /></ClarityMask>} />
            <Route path="/old-advertisements" element={<OldAdvertisements />} />
            <Route path="/report-fraud" element={<ClarityMask><ReportFraud /></ClarityMask>} />
            {/* Entry point for Post RFQ links arriving from the proxied blog at /blogs. */}
            <Route path="/go/post-rfq" element={<GoPostRfq />} />
            <Route path="/seller/blogs" element={<VendorBlogs />} />
            <Route path="/seller/blogs/:blogId" element={<VendorBlogArticle />} />
            {/* For You's first run is part of /home/for-you itself; this address showed a developer scaffold card. */}
            <Route path="/home/for-you/onboarding" element={<Navigate to="/home/for-you" replace />} />
            {/* These four were BuyerRouteShell developer scaffolds ("Route scaffold · Phase 1"), live and reachable by address
                (2026-11-18 review, H-02). The real pages are Post Requirement (its category step, form and success screen,
                and the Quick Quote sheet) and My Quotes. */}
            <Route path="/requirement" element={<Navigate to="/requirement/post-requirement" replace />} />
            <Route path="/requirement/quick-rfq" element={<Navigate to="/requirement/post-requirement" replace />} />
            <Route path="/requirement/post-requirement/form" element={<Navigate to="/requirement/post-requirement" replace />} />
            <Route path="/requirement/post-requirement/success" element={<Navigate to="/requirement/my-quotes" replace />} />
            <Route path="/add-social-links" element={<AddSocialLinks />} />
            <Route path="/advertisement-slideshow" element={<AdvertisementSlideshow />} />
            <Route path="/upload-catalogue" element={<UploadCatalogue />} />
            <Route path="/upload-video" element={<UploadVideo />} />
            <Route path="/business-profile-score" element={<BusinessProfileScorePage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </RouteErrorBoundary>
          {/* Global wishlist modal: available from every page's product cards */}
          <SaveToFolderModal />
          {/* Desktop "call this number" dialog (mobile opens the dialer directly) */}
          <CallNumberModal />
          <PendingEnquiry />
          {/* Syncs Saved + Recently-Viewed stores with the DB on auth changes */}
          <StoreSync />
          {/* A new page opens at its top; Back keeps the browser's restore (review M-02) */}
          <ScrollToTopOnNavigate />
          {/* Back to the page after sign-in (review M-59) */}
          <ReturnToTracker />
          {/* Dev-only: sign in as a seeded buyer/vendor/admin (no-op in prod) */}
          <DevAccountSwitcher />
        </BrowserRouter>
        </RealtimeHubProvider>
      </>
    </DisplayCurrencyProvider>
    </UserRoleProvider>
    </AuthProvider>
  </QueryClientProvider>
  </LazyMotion>
);

export default App;