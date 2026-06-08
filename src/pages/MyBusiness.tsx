import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChevronLeft, ChevronRight, Megaphone, Users, User, ClipboardList, Wrench, CreditCard, Info, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";

const menuItems = [
  { icon: Megaphone,     title: "Advertise",        subtitle: "Boost visibility with targeted ads",        route: "/advertisements",       badge: null,             iconBg: "bg-blue-50",   iconColor: "text-blue-600"   },
  { icon: Users,         title: "Leads",             subtitle: null,                                        route: "/leads",                 badge: null,             iconBg: "bg-green-50",  iconColor: "text-green-600"  },
  { icon: User,          title: "Business Profile",  subtitle: "Complete your profile to attract buyers",   route: "/business-profile",     badge: "Info Missing",   iconBg: "bg-purple-50", iconColor: "text-purple-600" },
  { icon: ClipboardList, title: "Catalogue",         subtitle: "Upload your product catalogue",             route: "/products",             badge: "Missing",        iconBg: "bg-indigo-50", iconColor: "text-indigo-600" },
  { icon: Wrench,        title: "Business Tools",    subtitle: "Reviews, offers, and QR tools",            route: "/my-store/business/tools", badge: "18 Pending",   iconBg: "bg-yellow-50", iconColor: "text-yellow-600" },
  { icon: CreditCard,    title: "KYC & Payments",    subtitle: "Verify your business and manage billing",  route: "/subscription",         badge: "Missing",        iconBg: "bg-pink-50",   iconColor: "text-pink-600"   },
  { icon: Info,          title: "Additional Info",   subtitle: "Add extra details to your listing",        route: "/business-profile",     badge: null,             iconBg: "bg-teal-50",   iconColor: "text-teal-600"   },
  { icon: Headphones,    title: "Support",            subtitle: "Get help from the Cosora team",           route: "/help",                 badge: null,             iconBg: "bg-cyan-50",   iconColor: "text-cyan-600"   },
];

const badgeStyle = (text: string) =>
  text === "Missing" || text === "Info Missing" ? "text-orange-600 bg-orange-50" : "text-red-600 bg-red-50";

const MyBusiness = () => {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-none">My Business</h1>
            <p className="text-xs text-gray-400 mt-0.5">Manage your business operations</p>
          </div>
        </div>

        {/* Mobile list */}
        <div className="lg:hidden bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {menuItems.map((item, i) => (
            <button key={i} onClick={() => navigate(item.route)}
              className="w-full flex items-center justify-between px-4 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors text-left">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", item.iconBg)}>
                  <item.icon className={cn("w-5 h-5", item.iconColor)} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                    {item.badge && (
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", badgeStyle(item.badge))}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.subtitle}</p>}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
            </button>
          ))}
        </div>

        {/* Desktop grid */}
        <div className="hidden lg:grid grid-cols-2 gap-4">
          {menuItems.map((item, i) => (
            <button key={i} onClick={() => navigate(item.route)}
              className="group bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex items-start gap-4">
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform", item.iconBg)}>
                  <item.icon className={cn("w-6 h-6", item.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold text-gray-900">{item.title}</span>
                    {item.badge && (
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", badgeStyle(item.badge))}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.subtitle && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.subtitle}</p>}
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-400 group-hover:text-gray-600 mt-2 transition-colors">
                    <span>Manage</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MyBusiness;