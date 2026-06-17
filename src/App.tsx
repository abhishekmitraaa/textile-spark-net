import { Toaster } from "@/components/ui/toaster";
import BusinessProfileScorePage from "./pages/BusinessProfileScorePage";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserRoleProvider } from "./contexts/UserRoleContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Index from "./pages/Index";
import SellerHome from "./pages/SellerHome";
import Products from "./pages/Products";
import BrowseProducts from "./pages/BrowseProducts";
import ProductDetail from "./pages/ProductDetail";
import ForYou from "./pages/ForYou";
import Upload from "./pages/Upload";
import Leads from "./pages/Leads";
import Advertisements from "./pages/Advertisements";
import Subscription from "./pages/Subscription";
import Quotes from "./pages/Quotes";
import Profile from "./pages/Profile";
import MyStore from "./pages/MyStore";
import BusinessProfile from "./pages/BusinessProfile";
import BusinessProfileEmployees from "./pages/BusinessProfileEmployees";
import Chat from "./pages/Chat";
import PostRequirement from "./pages/PostRequirement";
import RecentlyViewed from "./pages/RecentlyViewed";
import ServiceVendors from "./pages/ServiceVendors";
import Freelancers from "./pages/Freelancers";
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
import AdvertisementSlideshow from "./pages/AdvertisementSlideshow";
import UploadCatalogue from "./pages/UploadCatalogue";
import UploadVideo from "./pages/UploadVideo";

const queryClient = new QueryClient();

type BuyerShellRoute = {
  path: string;
  title: string;
  description: string;
  relatedHref?: string;
  relatedLabel?: string;
};

const buyerShellRoutes: BuyerShellRoute[] = [
  {
    path: "/home/trends",
    title: "Trends",
    description: "Trending styles and categories landing page for the buyer home flow.",
    relatedHref: "/home/new-arrivals",
    relatedLabel: "Open New Arrivals",
  },
  {
    path: "/home/sale",
    title: "Sale",
    description: "Discounted products feed for sale-priced inventory.",
    relatedHref: "/home/new-arrivals",
    relatedLabel: "Open New Arrivals",
  },
  {
    path: "/home/followings",
    title: "Followings",
    description: "Feed for products and updates from brands the buyer follows.",
    relatedHref: "/home/new-arrivals",
    relatedLabel: "Open New Arrivals",
  },
  {
    path: "/home/followings/view-all",
    title: "View All Followings",
    description: "Full list of brands the buyer follows.",
    relatedHref: "/home/followings",
    relatedLabel: "Open Followings",
  },
  {
    path: "/home/for-you/onboarding",
    title: "For You Onboarding",
    description: "First-time preference setup flow before the personalized feed.",
    relatedHref: "/home/for-you",
    relatedLabel: "Open For You",
  },
  {
    path: "/search",
    title: "Search",
    description: "Discovery entry point before typing begins, including photo search and recent keywords.",
    relatedHref: "/home/new-arrivals",
    relatedLabel: "Open New Arrivals",
  },
  {
    path: "/search/results",
    title: "Search Results",
    description: "Product and brand results view with tabs, sorting, and filters.",
    relatedHref: "/search",
    relatedLabel: "Open Search",
  },
  {
    path: "/search/filters",
    title: "Advanced Filters",
    description: "Granular product filtering page for search and listing flows.",
    relatedHref: "/search/results",
    relatedLabel: "Back to Results",
  },
  {
    path: "/product/:id/3d-configurator",
    title: "3D Configurator",
    description: "Interactive garment customization shell for buyer design previews.",
    relatedHref: "/product/1",
    relatedLabel: "Open Product Detail",
  },
  {
    path: "/vendor/:id",
    title: "Vendor Profile",
    description: "Buyer-facing vendor or manufacturer profile page.",
    relatedHref: "/home/new-arrivals",
    relatedLabel: "Open New Arrivals",
  },
  {
    path: "/vendor/:id/products",
    title: "Vendor Products",
    description: "All products from a specific vendor.",
    relatedHref: "/vendor/1",
    relatedLabel: "Open Vendor Profile",
  },
  {
    path: "/vendor/:id/reviews",
    title: "Vendor Reviews",
    description: "Reviews and ratings for a specific vendor.",
    relatedHref: "/vendor/1",
    relatedLabel: "Open Vendor Profile",
  },
  {
    path: "/services/:vendorId",
    title: "Service Vendor Profile",
    description: "Full profile page for a service vendor.",
    relatedHref: "/services",
    relatedLabel: "Open Services",
  },
  {
    path: "/services/:vendorId/portfolio",
    title: "Service Portfolio",
    description: "Portfolio tab for a service vendor profile.",
    relatedHref: "/services",
    relatedLabel: "Open Services",
  },
  {
    path: "/services/:vendorId/reviews",
    title: "Service Reviews",
    description: "Reviews tab for a service vendor profile.",
    relatedHref: "/services",
    relatedLabel: "Open Services",
  },
  {
    path: "/freelancers/:id",
    title: "Freelancer Profile",
    description: "Full profile page for an individual freelancer or expert.",
    relatedHref: "/freelancers",
    relatedLabel: "Open Freelancers",
  },
  {
    path: "/freelancers/:id/portfolio",
    title: "Freelancer Portfolio",
    description: "Portfolio tab for a freelancer profile.",
    relatedHref: "/freelancers",
    relatedLabel: "Open Freelancers",
  },
  {
    path: "/freelancers/:id/reviews",
    title: "Freelancer Reviews",
    description: "Reviews tab for a freelancer profile.",
    relatedHref: "/freelancers",
    relatedLabel: "Open Freelancers",
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
    path: "/requirement/my-quotes/:rfqId/quotes-received",
    title: "Quotes Received",
    description: "All vendor quotes received for a specific RFQ.",
    relatedHref: "/requirement/my-quotes",
    relatedLabel: "Back to My Quotes",
  },
  {
    path: "/requirement/my-quotes/:rfqId/quote-detail/:quoteId",
    title: "Quote Detail",
    description: "Detailed view for one vendor quote.",
    relatedHref: "/requirement/my-quotes",
    relatedLabel: "Back to My Quotes",
  },
  {
    path: "/requirement/my-quotes/:rfqId/compare",
    title: "Quote Comparison",
    description: "Side-by-side comparison shell for up to three quotes.",
    relatedHref: "/requirement/my-quotes",
    relatedLabel: "Back to My Quotes",
  },
  {
    path: "/saved",
    title: "Saved Products",
    description: "Wishlist collections overview page.",
    relatedHref: "/recently-viewed",
    relatedLabel: "Open Recently Viewed",
  },
  {
    path: "/saved/:collectionId",
    title: "Saved Collection",
    description: "Individual wishlist collection contents.",
    relatedHref: "/saved",
    relatedLabel: "Back to Saved Products",
  },
  {
    path: "/chats/:vendorId",
    title: "Chat Thread",
    description: "Individual message thread with a vendor.",
    relatedHref: "/chats",
    relatedLabel: "Open Messages Hub",
  },
  {
    path: "/chats/calls",
    title: "Call History",
    description: "Complete log of calls made and received through the app.",
    relatedHref: "/chats",
    relatedLabel: "Open Messages Hub",
  },
  {
    path: "/profile/edit",
    title: "Edit Profile",
    description: "Personal, business, and photo editing flow.",
    relatedHref: "/profile",
    relatedLabel: "Open Profile",
  },
  {
    path: "/profile/reviews",
    title: "My Reviews",
    description: "All reviews written by the buyer.",
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
    path: "/profile/social-links",
    title: "Social Links",
    description: "Social profile connection and management page.",
    relatedHref: "/profile",
    relatedLabel: "Open Profile",
  },
  {
    path: "/profile/notifications",
    title: "Notification Settings",
    description: "Email and push notification preferences.",
    relatedHref: "/profile",
    relatedLabel: "Open Profile",
  },
  {
    path: "/profile/regional-settings",
    title: "Regional Settings",
    description: "Currency, timezone, and language preferences.",
    relatedHref: "/profile",
    relatedLabel: "Open Profile",
  },
  {
    path: "/profile/data-export",
    title: "Data Export",
    description: "Data download and RFQ history export page.",
    relatedHref: "/profile",
    relatedLabel: "Open Profile",
  },
  {
    path: "/profile/help/chat",
    title: "Support Chat",
    description: "Live customer support chat shell.",
    relatedHref: "/profile/help",
    relatedLabel: "Open Help",
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
    <UserRoleProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/otp-verify" element={<OtpVerify />} />
            <Route path="/auth/role-selection" element={<RoleSelection />} />
            <Route path="/auth/sub-role" element={<SubRole />} />
            <Route path="/auth/account-info" element={<AccountInfo />} />
            <Route path="/auth/interest-preference" element={<InterestPreference />} />
            <Route path="/auth/terms" element={<Terms />} />
            <Route path="/auth/welcome" element={<Welcome />} />
            <Route path="/browse" element={<BrowseProducts />} />
            <Route path="/home/new-arrivals" element={<NewArrivals />} />
            <Route path="/home/for-you" element={<ForYou />} />
            <Route path="/services" element={<ServiceVendors />} />
            <Route path="/freelancers" element={<Freelancers />} />
            <Route path="/requirement/post-requirement" element={<PostRequirement />} />
            <Route path="/requirement/my-quotes" element={<Quotes />} />
            <Route path="/chats" element={<Chat />} />
            <Route path="/profile/interest-preference" element={<InterestPreference />} />
            <Route path="/profile/help" element={<Help />} />
            <Route path="/seller-home" element={<SellerHome />} />
            <Route path="/dashboard" element={<Index />} />
            <Route path="/products" element={<Products />} />
            <Route path="/browse" element={<BrowseProducts />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/for-you" element={<ForYou />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/advertisements" element={<Advertisements />} />
            <Route path="/subscription" element={<Subscription />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/my-store" element={<MyStore />} />
            <Route path="/business-profile" element={<BusinessProfile />} />
            <Route path="/business-profile/employees" element={<BusinessProfileEmployees />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/post-requirement" element={<PostRequirement />} />
            <Route path="/recently-viewed" element={<RecentlyViewed />} />
            <Route path="/service-vendors" element={<ServiceVendors />} />
            <Route path="/freelancers" element={<Freelancers />} />
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
        </BrowserRouter>
      </TooltipProvider>
    </UserRoleProvider>
  </QueryClientProvider>
);

export default App;