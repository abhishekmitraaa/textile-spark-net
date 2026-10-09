import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import BusinessProfileScorePage from "./pages/BusinessProfileScorePage";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { UserRoleProvider } from "./contexts/UserRoleContext";
import { AuthProvider } from "./contexts/AuthContext";
import { DisplayCurrencyProvider } from "./contexts/DisplayCurrencyContext";
import DevAccountSwitcher from "./components/dev/DevAccountSwitcher";
import ClarityMask from "./components/analytics/ClarityMask";
import SiteThemeApplier from "./components/SiteThemeApplier";
import StoreSync from "./components/StoreSync";
import AuthCallback from "./pages/AuthCallback";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Index from "./pages/Index";
import SellerHome from "./pages/SellerHome";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import ForYou from "./pages/ForYou";
import Upload from "./pages/Upload";
import Leads from "./pages/Leads";
import LeadAlerts from "./pages/LeadAlerts";
import OverseasLeads from "./pages/OverseasLeads";
import Crm from "./pages/Crm";
import CrmFollowUps from "./pages/CrmFollowUps";
import CrmAnalytics from "./pages/CrmAnalytics";
import AccountManager from "./pages/AccountManager";
import Visibility from "./pages/Visibility";
import BulkImport from "./pages/BulkImport";
import { TierGate } from "./components/TierGate";
import Advertisements from "./pages/Advertisements";
import Subscription from "./pages/Subscription";
import InvoiceDetail from "./pages/InvoiceDetail";
import MyPayments from "./pages/MyPayments";
import AdReceiptDetail from "./pages/AdReceiptDetail";
import Quotes from "./pages/Quotes";
import Profile from "./pages/Profile";
import MyStore from "./pages/MyStore";
import BusinessProfile from "./pages/BusinessProfile";
import Chat from "./pages/Chat";
import ChatThread from "./pages/ChatThread";
import Categories from "./pages/Categories";
import MyReviews from "./pages/MyReviews";
import PostRequirement from "./pages/PostRequirement";
import MyQuotes from "./pages/MyQuotes";
import Sale from "./pages/Sale";
import SearchResults from "./pages/SearchResults";
import VendorProfile from "./pages/VendorProfile";
import RecentlyViewed from "./pages/RecentlyViewed";
import ServiceVendors from "./pages/ServiceVendors";
import ServiceVendorProfile from "./pages/ServiceVendorProfile";
import Freelancers from "./pages/Freelancers";
import FreelancerProfile from "./pages/FreelancerProfile";
import Analytics from "./pages/Analytics";
import Help from "./pages/Help";
import CosoraStudio from "./pages/CosoraStudio";
import PhotographerProfile from "./pages/PhotographerProfile";
import NotFound from "./pages/NotFound";
import Register from "./pages/Register";
import OtpVerify from "./pages/OtpVerify";
import RoleSelection from "./pages/RoleSelection";
import SubRole from "./pages/SubRole";
import AccountInfo from "./pages/AccountInfo";
import InterestPreference from "./pages/InterestPreference";
import Terms from "./pages/Terms";
import Welcome from "./pages/Welcome";
import VendorLanding from "./pages/VendorLanding";
import Onboarding from "./pages/Onboarding";
import NewArrivals from "./pages/NewArrivals";
// Lazily loaded. These two are the video routes, and neither is on the path a
// buyer lands on — but their dependencies (the reel viewer, the upload page's
// probe/preview machinery) were being shipped inside the single main chunk that
// every visitor downloads before anything renders. Route-level splitting only:
// vite.config.ts:15 records that a manualChunks pass caused runtime problems.
const VideoCloseUpsPage = lazy(() => import("./pages/VideoCloseUpsPage"));
import Trends from "./pages/Trends";
import Following from "./pages/Following";
import FollowingViewAll from "./pages/FollowingViewAll";
import ProfileNotifications from "./pages/ProfileNotifications";
import ProfileSocialLinks from "./pages/ProfileSocialLinks";
import ProfileAccountPrefs from "./pages/ProfileAccountPrefs";
import ProfileEdit from "./pages/ProfileEdit";
import ProfileBusinessDetails from "./pages/ProfileBusinessDetails";
import BuyerSettings from "./pages/Settings";
import TermsConditions from "./pages/TermsConditions";
// Help & Support P6c (D-15): hidden until the Grievance Officer is named (src/lib/grievance.ts).
import Grievance from "./pages/Grievance";
import SavedCollections from "./pages/SavedCollections";
import SavedCollectionDetail from "./pages/SavedCollectionDetail";
import Search from "./pages/Search";
import AddSocialLinks from "./pages/AddSocialLinks";


import Reviews from "./pages/Reviews";
import CompetitorAds from "./pages/CompetitorAds";
import MyBusiness from "./pages/MyBusiness";
import BusinessTools from "./pages/BusinessTools";
import Kyc from "./pages/Kyc";
import OldAdvertisements from "./pages/OldAdvertisements";
import ReportFraud from "./pages/ReportFraud";
// Help & Support (plan P3): the requester's screens.
import SupportChatStart from "./pages/SupportChatStart";
import SupportThread from "./pages/SupportThread";
import MyRequests from "./pages/MyRequests";
import SupportCallback from "./pages/SupportCallback";
import AppFeedback from "./pages/AppFeedback";
import HelpGuide from "./pages/HelpGuide";
import VendorBlogs from "./pages/VendorBlogs";
import VendorBlogArticle from "./pages/VendorBlogArticle";
import BuyerRouteShell from "./components/buyer/BuyerRouteShell";
import GoPostRfq from "./pages/GoPostRfq";
import SaveToFolderModal from "./components/buyer/SaveToFolderModal";
import CallNumberModal from "./components/buyer/CallNumberModal";
import AutoTranslate from "./components/i18n/AutoTranslate";
import LanguageSync from "./components/i18n/LanguageSync";
import AdvertisementSlideshow from "./pages/AdvertisementSlideshow";
import UploadCatalogue from "./pages/UploadCatalogue";
const UploadVideo = lazy(() => import("./pages/UploadVideo"));
import Notifications from "./pages/Notifications";
import VendorSettings from "./pages/VendorSettings";

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

type BuyerShellRoute = {
  path: string;
  title: string;
  description: string;
  relatedHref?: string;
  relatedLabel?: string;
};

const buyerShellRoutes: BuyerShellRoute[] = [
  {
    path: "/home/sale",
    title: "Sale",
    description: "Discounted products feed for sale-priced inventory.",
    relatedHref: "/home/new-arrivals",
    relatedLabel: "Open New Arrivals",
  },
  {
    path: "/home/for-you/onboarding",
    title: "For You Onboarding",
    description: "First-time preference setup flow before the personalized feed.",
    relatedHref: "/home/for-you",
    relatedLabel: "Open For You",
  },
  {
    path: "/requirement",
    title: "Requirement Hub",
    description: "Central landing page for Quick RFQ, detailed RFQ, and My Quotes.",
    relatedHref: "/requirement/my-quotes",
    relatedLabel: "Open My Quotes",
  },
  {
    path: "/requirement/quick-rfq",
    title: "Quick RFQ",
    description: "Fast quote entry shell for uploading a product image and quantity.",
    relatedHref: "/requirement",
    relatedLabel: "Open Requirement Hub",
  },
  {
    path: "/requirement/post-requirement/form",
    title: "Detailed Requirement Form",
    description: "Full form step for structured quote requests.",
    relatedHref: "/requirement/post-requirement",
    relatedLabel: "Open Detailed RFQ",
  },
  {
    path: "/requirement/post-requirement/success",
    title: "Requirement Submitted",
    description: "Success screen shown after a detailed RFQ is submitted.",
    relatedHref: "/requirement/my-quotes",
    relatedLabel: "Open My Quotes",
  },
  {
    path: "/profile/edit",
    title: "Edit Profile",
    description: "Personal, business, and photo editing flow.",
    relatedHref: "/profile",
    relatedLabel: "Open Profile",
  },
  {
    path: "/profile/business-details",
    title: "Business Details",
    description: "Expanded business profile management page.",
    relatedHref: "/profile",
    relatedLabel: "Open Profile",
  },
];

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <UserRoleProvider>
    <DisplayCurrencyProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AutoTranslate />
          <LanguageSync />
          {/* The site theme saved in Cosora-Admin (admin completion Phase 9). */}
          <SiteThemeApplier />
          {/* Covers the lazily-loaded routes below. Deliberately a blank div
              rather than a spinner: these chunks are small and load in a frame
              or two on any reasonable connection, and a flashed spinner reads
              worse than nothing. */}
          <Suspense fallback={<div className="min-h-screen bg-white" />}>
          <Routes>
            {/* <ClarityMask> hides a page from Microsoft Clarity's recordings (lib/analytics/clarity.ts):
                sign-in, chats, onboarding, KYC, profile, requirements, quotes, leads and billing. */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<ClarityMask><Login /></ClarityMask>} />
            <Route path="/auth/login" element={<ClarityMask><Login /></ClarityMask>} />
            <Route path="/auth/otp-verify" element={<ClarityMask><OtpVerify /></ClarityMask>} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/role-selection" element={<RoleSelection />} />
            <Route path="/auth/sub-role" element={<SubRole />} />
            <Route path="/auth/account-info" element={<ClarityMask><AccountInfo /></ClarityMask>} />
            <Route path="/auth/interest-preference" element={<InterestPreference />} />
            <Route path="/auth/terms" element={<Terms />} />
            <Route path="/auth/welcome" element={<Welcome />} />
            {/* /browse retired — the old page served hardcoded fake products.
                Kept as a redirect so external/bookmarked links land on the real
                live-data search feed. Internal entry points now link there directly. */}
            <Route path="/browse" element={<Navigate to="/search" replace />} />
            <Route path="/home/new-arrivals" element={<NewArrivals />} />
            <Route path="/home/trends" element={<Trends />} />
            <Route path="/home/sale" element={<Sale />} />
            <Route path="/home/followings" element={<Following />} />
            <Route path="/home/followings/view-all" element={<FollowingViewAll />} />
            <Route path="/video-closeups" element={<VideoCloseUpsPage />} />
            <Route path="/search" element={<Search />} />
            <Route path="/search/results" element={<SearchResults />} />
            <Route path="/home/for-you" element={<ForYou />} />
            <Route path="/services" element={<ServiceVendors />} />
            <Route path="/services/:vendorId" element={<ServiceVendorProfile />} />
            <Route path="/freelancers" element={<Freelancers />} />
            <Route path="/freelancers/:id" element={<FreelancerProfile />} />
            <Route path="/requirement/post-requirement" element={<ClarityMask><PostRequirement /></ClarityMask>} />
            <Route path="/requirement/my-quotes" element={<ClarityMask><MyQuotes /></ClarityMask>} />
            <Route path="/vendor/:id" element={<VendorProfile />} />
            <Route path="/chats" element={<ClarityMask><Chat /></ClarityMask>} />
            <Route path="/chats/:vendorId" element={<ClarityMask><ChatThread /></ClarityMask>} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/profile/interest-preference" element={<InterestPreference />} />
            <Route path="/profile/reviews" element={<MyReviews />} />
            <Route path="/profile/help" element={<ClarityMask><Help /></ClarityMask>} />
            {/* The canned "support chat" is gone (Help & Support P1); the real one is /help/chat (P3). */}
            <Route path="/profile/help/chat" element={<Navigate to="/help" replace />} />
            <Route path="/seller-home" element={<SellerHome />} />
            <Route path="/dashboard" element={<Index />} />
            <Route path="/products" element={<Products />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/for-you" element={<ForYou />} />
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
            <Route path="/catalogue/bulk-import" element={<ClarityMask><TierGate feature="bulk_import"><BulkImport /></TierGate></ClarityMask>} />
            <Route path="/notifications" element={<ClarityMask><Notifications /></ClarityMask>} />
            <Route path="/advertisements" element={<Advertisements />} />
            <Route path="/settings" element={<ClarityMask><VendorSettings /></ClarityMask>} />
            <Route path="/terms" element={<TermsConditions />} />
            <Route path="/grievance" element={<Grievance />} />
            <Route path="/subscription" element={<ClarityMask><Subscription /></ClarityMask>} />
            <Route path="/subscription/invoice/:id" element={<ClarityMask><InvoiceDetail /></ClarityMask>} />
            {/* Vendor billing: every payment, its bill, and certificate tracking. */}
            <Route path="/my-payments" element={<ClarityMask><MyPayments /></ClarityMask>} />
            <Route path="/my-payments/receipt/:orderId" element={<ClarityMask><AdReceiptDetail /></ClarityMask>} />
            <Route path="/quotes" element={<ClarityMask><Quotes /></ClarityMask>} />
            <Route path="/profile" element={<ClarityMask><Profile /></ClarityMask>} />
            {/* Replaced the Edit Profile modal (2026-09-23): real, refresh-safe routes. */}
            <Route path="/profile/edit" element={<ClarityMask><ProfileEdit /></ClarityMask>} />
            <Route path="/profile/business-details" element={<ClarityMask><ProfileBusinessDetails /></ClarityMask>} />
            {/* Buyer account & security settings (2026-09-23). /settings is the vendor's. */}
            <Route path="/profile/settings" element={<ClarityMask><BuyerSettings /></ClarityMask>} />
            <Route path="/profile/notifications" element={<ProfileNotifications />} />
            <Route path="/profile/social-links" element={<ClarityMask><ProfileSocialLinks /></ClarityMask>} />
            <Route path="/profile/regional-settings" element={<ClarityMask><ProfileAccountPrefs /></ClarityMask>} />
            <Route path="/profile/data-export" element={<ClarityMask><ProfileAccountPrefs /></ClarityMask>} />
            <Route path="/profile/terms" element={<TermsConditions />} />
            <Route path="/saved" element={<SavedCollections />} />
            <Route path="/saved/:collectionId" element={<SavedCollectionDetail />} />
            <Route path="/my-store" element={<MyStore />} />
            <Route path="/business-profile" element={<ClarityMask><BusinessProfile /></ClarityMask>} />
            <Route path="/chat" element={<ClarityMask><Chat /></ClarityMask>} />
            <Route path="/post-requirement" element={<ClarityMask><PostRequirement /></ClarityMask>} />
            <Route path="/recently-viewed" element={<RecentlyViewed />} />
            <Route path="/service-vendors" element={<ServiceVendors />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/help" element={<ClarityMask><Help /></ClarityMask>} />
            <Route path="/help/chat" element={<ClarityMask><SupportChatStart /></ClarityMask>} />
            <Route path="/help/requests" element={<ClarityMask><MyRequests /></ClarityMask>} />
            <Route path="/help/requests/:ticketNo" element={<ClarityMask><SupportThread /></ClarityMask>} />
            <Route path="/help/callback" element={<ClarityMask><SupportCallback /></ClarityMask>} />
            <Route path="/help/guides/:slug" element={<HelpGuide />} />
            <Route path="/feedback" element={<ClarityMask><AppFeedback /></ClarityMask>} />
            <Route path="/cosora-studio" element={<CosoraStudio />} />
            <Route path="/cosora-studio/:id" element={<PhotographerProfile />} />
            <Route path="/register" element={<ClarityMask><Register /></ClarityMask>} />
            <Route path="/seller" element={<VendorLanding />} />
            <Route path="/onboarding" element={<ClarityMask><Onboarding /></ClarityMask>} />
            
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
            {buyerShellRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  <BuyerRouteShell
                    title={route.title}
                    description={route.description}
                    relatedHref={route.relatedHref}
                    relatedLabel={route.relatedLabel}
                  />
                }
              />
            ))}
            <Route path="/add-social-links" element={<AddSocialLinks />} />
            <Route path="/advertisement-slideshow" element={<AdvertisementSlideshow />} />
            <Route path="/upload-catalogue" element={<UploadCatalogue />} />
            <Route path="/upload-video" element={<UploadVideo />} />
            <Route path="/business-profile-score" element={<BusinessProfileScorePage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          {/* Global wishlist modal: available from every page's product cards */}
          <SaveToFolderModal />
          {/* Desktop "call this number" dialog (mobile opens the dialer directly) */}
          <CallNumberModal />
          {/* Syncs Saved + Recently-Viewed stores with the DB on auth changes */}
          <StoreSync />
          {/* Dev-only: sign in as a seeded buyer/vendor/admin (no-op in prod) */}
          <DevAccountSwitcher />
        </BrowserRouter>
      </TooltipProvider>
    </DisplayCurrencyProvider>
    </UserRoleProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;