import { Toaster } from "@/components/ui/toaster";
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
import MyStore from "./pages/MyStore";
import Reviews from "./pages/Reviews";
import CompetitorAds from "./pages/CompetitorAds";
import ReportFraud from "./pages/ReportFraud";
import AppFeedback from "./pages/AppFeedback";
import About from "./pages/About";

const queryClient = new QueryClient();

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
            <Route path="/auth/otp-verify" element={<OtpVerify />} />
            <Route path="/browse" element={<BrowseProducts />} />
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
            <Route path="/my-store" element={<Profile />} />
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
            <Route path="/auth/role-selection" element={<RoleSelection />} />
            <Route path="/auth/sub-role" element={<SubRole />} />
            <Route path="/auth/account-info" element={<AccountInfo />} />
            <Route path="/auth/interest-preference" element={<InterestPreference />} />
            <Route path="/auth/terms" element={<Terms />} />
            <Route path="/auth/welcome" element={<Welcome />} />
            <Route path="/seller" element={<VendorLanding />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/my-store" element={<MyStore />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/competitor-ads" element={<CompetitorAds />} />
            <Route path="/report-fraud" element={<ReportFraud />} />
            <Route path="/app-feedback" element={<AppFeedback />} />
            <Route path="/about" element={<About />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </UserRoleProvider>
  </QueryClientProvider>
);

export default App;
