import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import BusinessProfileScorePage from "./pages/BusinessProfileScorePage";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { UserRoleProvider } from "./contexts/UserRoleContext";
import { AuthProvider } from "./contexts/AuthContext";
import DevAccountSwitcher from "./components/dev/DevAccountSwitcher";
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
import Advertisements from "./pages/Advertisements";
import Subscription from "./pages/Subscription";
import InvoiceDetail from "./pages/InvoiceDetail";
import Quotes from "./pages/Quotes";
import Profile from "./pages/Profile";
import MyStore from "./pages/MyStore";
import BusinessProfile from "./pages/BusinessProfile";
import BusinessProfileEmployees from "./pages/BusinessProfileEmployees";
import Chat from "./pages/Chat";
import ChatThread from "./pages/ChatThread";
import Categories from "./pages/Categories";
import MyReviews from "./pages/MyReviews";
import SupportChat from "./pages/SupportChat";
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
import TermsConditions from "./pages/TermsConditions";
import SavedCollections from "./pages/SavedCollections";
import SavedCollectionDetail from "./pages/SavedCollectionDetail";
import Search from "./pages/Search";
import AddSocialLinks from "./pages/AddSocialLinks";


import Reviews from "./pages/Reviews";
import CompetitorAds from "./pages/CompetitorAds";
import MyBusiness from "./pages/MyBusiness";
import BusinessTools from "./pages/BusinessTools";
import OldAdvertisements from "./pages/OldAdvertisements";
import ReportFraud from "./pages/ReportFraud";
import AppFeedback from "./pages/AppFeedback";
import About from "./pages/About";
import VendorBlogs from "./pages/VendorBlogs";
import VendorBlogArticle from "./pages/VendorBlogArticle";
import BuyerRouteShell from "./components/buyer/BuyerRouteShell";
import SaveToFolderModal from "./components/buyer/SaveToFolderModal";
import CallNumberModal from "./components/buyer/CallNumberModal";
import AutoTranslate from "./components/i18n/AutoTranslate";
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
  {
    path: "/blogs",
    title: "Blogs",
    description: "Buyer-facing articles, industry insights, and updates.",
    relatedHref: "/about",
    relatedLabel: "Open About",
  },
  {
    path: "/blogs/:blogId",
    title: "Blog Article",
    description: "Individual blog post reading experience.",
    relatedHref: "/blogs",
    relatedLabel: "Back to Blogs",
  },
];

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <UserRoleProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AutoTranslate />
          {/* Covers the lazily-loaded routes below. Deliberately a blank div
              rather than a spinner: these chunks are small and load in a frame
              or two on any reasonable connection, and a flashed spinner reads
              worse than nothing. */}
          <Suspense fallback={<div className="min-h-screen bg-white" />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/otp-verify" element={<OtpVerify />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/role-selection" element={<RoleSelection />} />
            <Route path="/auth/sub-role" element={<SubRole />} />
            <Route path="/auth/account-info" element={<AccountInfo />} />
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
            <Route path="/requirement/post-requirement" element={<PostRequirement />} />
            <Route path="/requirement/my-quotes" element={<MyQuotes />} />
            <Route path="/vendor/:id" element={<VendorProfile />} />
            <Route path="/chats" element={<Chat />} />
            <Route path="/chats/:vendorId" element={<ChatThread />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/profile/interest-preference" element={<InterestPreference />} />
            <Route path="/profile/reviews" element={<MyReviews />} />
            <Route path="/profile/help" element={<Help />} />
            <Route path="/profile/help/chat" element={<SupportChat />} />
            <Route path="/seller-home" element={<SellerHome />} />
            <Route path="/dashboard" element={<Index />} />
            <Route path="/products" element={<Products />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/for-you" element={<ForYou />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/advertisements" element={<Advertisements />} />
            <Route path="/settings" element={<VendorSettings />} />
            <Route path="/terms" element={<TermsConditions />} />
            <Route path="/subscription" element={<Subscription />} />
            <Route path="/subscription/invoice/:id" element={<InvoiceDetail />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/notifications" element={<ProfileNotifications />} />
            <Route path="/profile/social-links" element={<ProfileSocialLinks />} />
            <Route path="/profile/regional-settings" element={<ProfileAccountPrefs />} />
            <Route path="/profile/data-export" element={<ProfileAccountPrefs />} />
            <Route path="/profile/terms" element={<TermsConditions />} />
            <Route path="/saved" element={<SavedCollections />} />
            <Route path="/saved/:collectionId" element={<SavedCollectionDetail />} />
            <Route path="/my-store" element={<MyStore />} />
            <Route path="/business-profile" element={<BusinessProfile />} />
            <Route path="/business-profile/employees" element={<BusinessProfileEmployees />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/post-requirement" element={<PostRequirement />} />
            <Route path="/recently-viewed" element={<RecentlyViewed />} />
            <Route path="/service-vendors" element={<ServiceVendors />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/help" element={<Help />} />
            <Route path="/cosora-studio" element={<CosoraStudio />} />
            <Route path="/cosora-studio/:id" element={<PhotographerProfile />} />
            <Route path="/register" element={<Register />} />
            <Route path="/seller" element={<VendorLanding />} />
            <Route path="/onboarding" element={<Onboarding />} />
            
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/competitor-ads" element={<CompetitorAds />} />
            <Route path="/my-store/business" element={<MyBusiness />} />
            <Route path="/my-store/business/tools" element={<BusinessTools />} />
            <Route path="/old-advertisements" element={<OldAdvertisements />} />
            <Route path="/report-fraud" element={<ReportFraud />} />
            <Route path="/app-feedback" element={<AppFeedback />} />
            <Route path="/about" element={<About />} />
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
    </UserRoleProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;