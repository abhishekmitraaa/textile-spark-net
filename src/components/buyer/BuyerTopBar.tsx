import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bookmark, MoreVertical, X, Globe, ChevronRight } from "lucide-react";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useSwitchRole } from "@/hooks/useSwitchRole";
import CosoraLogo from "@/components/CosoraLogo";
import { useT } from "@/lib/i18n";

function SideDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { role } = useUserRole();
  const switchRole = useSwitchRole();
  const t = useT();

  const menuItems = [
    { label: "Dashboard",         href: "/home/new-arrivals" },
    { label: "Post Requirement",  href: "/requirement/post-requirement" },
    { label: "Browse Products",   href: "/search/results" },
    { label: "Recently Viewed",   href: "/recently-viewed" },
    { label: "My Quotes",         href: "/requirement/my-quotes" },
    { label: "Chats & Calls",     href: "/chats" },
    { label: "Service Vendors",   href: "/services" },
    { label: "Freelancers",       href: "/freelancers" },
    { label: "Saved Products",    href: "/saved" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.25 }}
            className="fixed inset-y-0 left-0 z-[71] w-72 bg-white flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <CosoraLogo height={19} />
              <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            {/* Switch mode */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="flex bg-gray-100 rounded-full p-1">
                <button
                  onClick={() => { if (role !== "buyer") { onClose(); switchRole("buyer"); } }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${role === "buyer" ? "bg-white text-[#a4172c] shadow-sm" : "text-gray-500"}`}
                >
                  {t("Buyer")}
                </button>
                <button
                  onClick={() => { onClose(); switchRole("seller"); }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${role === "seller" ? "bg-white text-[#256fef] shadow-sm" : "text-gray-500"}`}
                >
                  {t("Seller")}
                </button>
              </div>
            </div>

            {/* Menu items */}
            <div className="flex-1 overflow-y-auto py-2">
              {menuItems.map(item => (
                <button
                  key={item.label}
                  onClick={() => { onClose(); navigate(item.href); }}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="text-sm text-gray-800">{t(item.label)}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              ))}
            </div>

            {/* Currency */}
            <div className="px-5 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1.5">{t("Default Currency")}</p>
              <select className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none">
                <option>₹ INR</option>
                <option>$ USD</option>
                <option>€ EUR</option>
                <option>£ GBP</option>
              </select>
            </div>

            {/* Support */}
            <div className="px-5 py-3 border-t border-gray-100">
              <button onClick={() => { onClose(); navigate("/profile"); }} className="text-sm text-gray-700 block py-1.5">{t("My Profile")}</button>
              <button onClick={() => { onClose(); navigate("/profile/help"); }} className="text-sm text-gray-700 block py-1.5">{t("Help & Support")}</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default function BuyerTopBar() {
  const navigate = useNavigate();
  const t = useT();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 lg:px-6">
        <div className="flex items-center gap-3 py-3 max-w-2xl lg:max-w-6xl mx-auto">
          {/* Logo */}
          <button onClick={() => navigate("/home/new-arrivals")} className="shrink-0">
            <CosoraLogo height={20} />
          </button>

          {/* Search bar — mx-auto centers it within the remaining flex space
              instead of just growing flex-1 and stopping at max-w-md, which
              left a large dead gap on the right on wide desktop viewports
              and made the whole header read as left-pinned. */}
          <button
            onClick={() => navigate("/search")}
            className="flex-1 min-w-0 flex items-center gap-2 bg-gray-100 rounded-full px-3.5 lg:px-4 py-2 lg:py-2.5 text-left max-w-md mx-auto"
          >
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-400 truncate">{t("Search for items or brands")}</span>
          </button>

          {/* Bookmark */}
          <button onClick={() => navigate("/saved")} className="p-1.5 shrink-0">
            <Bookmark className="w-5 h-5 text-gray-700" />
          </button>

          {/* 3-dot menu */}
          <button onClick={() => setDrawerOpen(true)} className="p-1.5 shrink-0">
            <MoreVertical className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </div>

      <SideDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}