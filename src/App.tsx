import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserRoleProvider } from "./contexts/UserRoleContext";
import Index from "./pages/Index";
import Products from "./pages/Products";
import Upload from "./pages/Upload";
import Leads from "./pages/Leads";
import Advertisements from "./pages/Advertisements";
import Subscription from "./pages/Subscription";
import Quotes from "./pages/Quotes";
import Profile from "./pages/Profile";
import Chat from "./pages/Chat";
import PostRequirement from "./pages/PostRequirement";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserRoleProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/products" element={<Products />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/advertisements" element={<Advertisements />} />
            <Route path="/subscription" element={<Subscription />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/post-requirement" element={<PostRequirement />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </UserRoleProvider>
  </QueryClientProvider>
);

export default App;
