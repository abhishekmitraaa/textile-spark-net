import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, Star, Globe, Share2, Package, Tag, Image, FileText, Building2, Users, Send, Calendar, ClipboardList } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

const score = 20;

const scoreItems = [
  { label: "Check your contact details", tag: "Missing", href: "/my-store", Icon: ClipboardList },
  { label: "Add about us", tag: "Missing", href: "/my-store", Icon: Building2 },
  { label: "Complete product details", tag: "Missing", href: "/upload", Icon: Package },
  { label: "Add category", tag: "Missing", href: "/my-store", Icon: Tag },
  { label: "Business Picture add 5 hd Photos", tag: "Trending", href: "/my-store", Icon: Image },
  { label: "Add Upto 10 Products with Price & Image", tag: "Trending", href: "/upload", Icon: FileText },
  { label: "Add Email Address", tag: null, href: "/my-store", Icon: Mail },
  { label: "Get up to 20 Reviews", tag: "Pending", href: "/reviews", Icon: Star },
  { label: "Add Social Media Channels", tag: null, href: "/add-social-links", Icon: Share2 },
  { label: "Add Business Website", tag: null, href: "/my-store", Icon: Globe },
  { label: "Send upto 2 quotations", tag: "Trending", href: "/quotes", Icon: Send },
  { label: "Add Year of Establishment", tag: null, href: "/my-store", Icon: Calendar },
];

const BusinessProfileScorePage = () => {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto space-y-4 pb-8">

        {/* Header */}
        <div className="flex items-center gap-3 py-1">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-base font-semibold font-display text-foreground">
            Business Profile Score
          </h1>
        </div>

        {/* Score bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-red-500">Poor</span>
            <span className="text-sm font-bold text-foreground">{score}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-red-500"
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 0.8, delay: 0.1 }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Complete the options below to increase your profile score and reach out to more customers.
          </p>
        </div>

        {/* 2-column grid */}
        <div className="grid grid-cols-2 gap-3">
          {scoreItems.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 + i * 0.03 }}
            >
              <Link to={item.href}>
                <div className="relative rounded-2xl p-4 flex flex-col items-center justify-center gap-3 bg-muted/60 hover:bg-muted transition-colors min-h-[110px] text-center">
                  {/* Badge */}
                  {item.tag && (
                    <span
                      className={`absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        item.tag === "Missing"
                          ? "bg-red-500 text-white"
                          : item.tag === "Pending"
                          ? "bg-foreground text-background"
                          : "bg-foreground text-background"
                      }`}
                    >
                      {item.tag}
                    </span>
                  )}

                  {/* Icon */}
                  <item.Icon className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />

                  {/* Label */}
                  <p className="text-xs font-medium text-foreground leading-snug">
                    {item.label}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}

          {/* Add Number of Employees — full width */}
          <motion.div
            className="col-span-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Link to="/my-store">
              <div className="relative rounded-2xl p-4 flex flex-col items-center justify-center gap-3 bg-muted/60 hover:bg-muted transition-colors min-h-[110px] text-center">
                <Users className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-xs font-medium text-foreground">Add Number of Employees</p>
              </div>
            </Link>
          </motion.div>
        </div>

      </div>
    </DashboardLayout>
  );
};

export default BusinessProfileScorePage;