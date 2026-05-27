import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  MapPin,
  Bookmark,
  BookmarkCheck,
  EyeOff,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Phone,
  Zap,
} from "lucide-react";

interface Lead {
  id: string;
  product: string;
  quantity: number;
  buyerName: string;
  company: string;
  location: string;
  category: string;
  accountAge: string;
  calls: number;
  chats: number;
  buys: string;
  designFile?: string;
}

const mockLeads: Lead[] = [
  {
    id: "1",
    product: "Cotton Men T-shirt",
    quantity: 50,
    buyerName: "Rajesh Kumar",
    company: "StyleMart Retailers",
    location: "Mumbai, Maharashtra",
    category: "Mens Wear",
    accountAge: "2 years",
    calls: 12,
    chats: 5,
    buys: "Mens Wear",
    designFile: "cotton-men-tshirt-spec.pdf",
  },
  {
    id: "2",
    product: "Silk Sarees - Banarasi",
    quantity: 200,
    buyerName: "Priya Sharma",
    company: "Fashion Forward Exports",
    location: "Delhi, NCR",
    category: "Sarees",
    accountAge: "3 years",
    calls: 8,
    chats: 14,
    buys: "Women's Ethnic",
  },
  {
    id: "3",
    product: "Denim Jeans - Slim Fit",
    quantity: 1000,
    buyerName: "Amit Patel",
    company: "TrendyWear Wholesale",
    location: "Ahmedabad, Gujarat",
    category: "Denim",
    accountAge: "1 year",
    calls: 4,
    chats: 9,
    buys: "Denim & Casual",
  },
  {
    id: "4",
    product: "Designer Lehenga Set",
    quantity: 30,
    buyerName: "Sneha Reddy",
    company: "BoutiqueHub",
    location: "Hyderabad, Telangana",
    category: "Bridal Wear",
    accountAge: "4 years",
    calls: 20,
    chats: 18,
    buys: "Bridal & Festive",
  },
  {
    id: "5",
    product: "Polo Neck T-shirts",
    quantity: 500,
    buyerName: "Vikram Singh",
    company: "Metro Garments",
    location: "Jaipur, Rajasthan",
    category: "Mens Wear",
    accountAge: "6 months",
    calls: 2,
    chats: 1,
    buys: "Mens Casual",
  },
];

const filterChips = ["Categories ∨", "Suggested", "India", "State", "Search Location", "Bulk", "Above 10K"];
const hideReasons = [
  "I do not deal in this Category",
  "I do not deal in this Location",
  "Low order value",
  "Wrong specification",
  "Less information",
  "Just remove",
  "Others",
];

const Leads = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("relevant");
  const [activeChips, setActiveChips] = useState<string[]>(["Suggested"]);
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hideSheetOpen, setHideSheetOpen] = useState(false);
  const [hideTarget, setHideTarget] = useState<Lead | null>(null);
  const [hideReason, setHideReason] = useState("");
  const [hideOtherText, setHideOtherText] = useState("");
  const [shortlistedOpen, setShortlistedOpen] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);

  const toggleChip = (chip: string) => {
    setActiveChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  const toggleShortlist = (id: string) => {
    setShortlisted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openHideSheet = (lead: Lead) => {
    setHideTarget(lead);
    setHideReason("");
    setHideOtherText("");
    setHideSheetOpen(true);
  };

  const submitHide = () => {
    if (hideTarget) {
      setHidden((prev) => new Set(prev).add(hideTarget.id));
      setHideSheetOpen(false);
    }
  };

  const contactBuyer = (lead: Lead) => {
    navigate("/chat", {
      state: {
        leadData: {
          buyerName: lead.buyerName,
          company: lead.company,
          location: lead.location,
          product: lead.product,
          quantity: lead.quantity,
          designFile: lead.designFile,
        },
      },
    });
  };

  const visibleLeads = mockLeads.filter((l) => !hidden.has(l.id) && !shortlisted.has(l.id));
  const shortlistedLeads = mockLeads.filter((l) => shortlisted.has(l.id));
  const hiddenLeads = mockLeads.filter((l) => hidden.has(l.id));

  const tabs = [
    { id: "relevant", label: "Most Relevant" },
    { id: "recent", label: "Recent" },
    { id: "history", label: "History" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">Manage buyer inquiries and convert them to orders</p>
        </motion.div>

        {/* Priority Alert */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3"
        >
          <p className="text-sm text-destructive">
            <Zap className="mr-1 inline h-4 w-4" />
            <span className="font-medium">3 high-priority leads need attention</span> — Respond quickly to increase conversion chances
          </p>
          <Button size="sm" className="shrink-0 bg-destructive text-destructive-foreground text-xs h-7 px-3">
            <Phone className="mr-1 h-3 w-3" />
            Call Now
          </Button>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {[
            { label: "Total Leads", value: "48", chip: "+5 this week", chipColor: "bg-accent/10 text-accent" },
            { label: "Conversion Rate", value: "18%", chip: null, trend: "up" },
            { label: "Pending Response", value: "12", chip: null },
            { label: "Converted This Month", value: "7", chip: null },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="rounded-xl border border-accent/20 bg-gradient-to-br from-accent/10 to-accent/5 p-3"
            >
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xl font-bold text-foreground">{stat.value}</span>
                {stat.chip && (
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${stat.chipColor}`}>{stat.chip}</span>
                )}
                {stat.trend === "up" && <TrendingUp className="h-4 w-4 text-green-600" />}
                {stat.trend === "down" && <TrendingDown className="h-4 w-4 text-destructive" />}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Filter Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex gap-2"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                activeTab === tab.id
                  ? "border border-accent/30 bg-accent/10 text-accent font-medium"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* Filter Chips */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        >
          {filterChips.map((chip) => (
            <button
              key={chip}
              onClick={() => toggleChip(chip)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
                activeChips.includes(chip)
                  ? "border border-accent/30 bg-accent/10 text-accent"
                  : "border border-border bg-card text-muted-foreground"
              }`}
            >
              {chip}
            </button>
          ))}
        </motion.div>

        {/* Lead Cards */}
        <div className="space-y-3">
          {visibleLeads.map((lead, index) => (
            <motion.div
              key={lead.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + index * 0.05 }}
              className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-accent/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">
                    {lead.product} <span className="text-muted-foreground">|</span> Qty: {lead.quantity}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {lead.buyerName} • {lead.location}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="mr-2 text-[10px]">{lead.category}</Badge>
                    Account: {lead.accountAge} • {lead.calls} calls • {lead.chats} chats
                  </p>
                  <Badge variant="secondary" className="mt-2 text-xs">Buys: {lead.buys}</Badge>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => toggleShortlist(lead.id)}
                    className="text-muted-foreground hover:text-accent transition-colors"
                  >
                    {shortlisted.has(lead.id) ? (
                      <BookmarkCheck className="h-5 w-5 text-accent fill-accent" />
                    ) : (
                      <Bookmark className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    onClick={() => openHideSheet(lead)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <EyeOff className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <Button
                className="mt-3 w-full bg-accent text-accent-foreground"
                onClick={() => contactBuyer(lead)}
              >
                Contact Buyer Now
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Shortlisted Leads */}
        {shortlistedLeads.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Collapsible open={shortlistedOpen} onOpenChange={setShortlistedOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground">
                Shortlisted Leads ({shortlistedLeads.length})
                <ChevronDown className={`h-4 w-4 transition-transform ${shortlistedOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">
                {shortlistedLeads.map((lead) => (
                  <div key={lead.id} className="rounded-xl border border-accent/20 bg-card p-4">
                    <p className="font-medium text-foreground">{lead.product} | Qty: {lead.quantity}</p>
                    <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {lead.buyerName} • {lead.location}
                    </p>
                    <Button className="mt-3 w-full bg-accent text-accent-foreground" onClick={() => contactBuyer(lead)}>
                      Contact Buyer Now
                    </Button>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </motion.div>
        )}

        {/* Hidden Leads */}
        {hiddenLeads.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Collapsible open={hiddenOpen} onOpenChange={setHiddenOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground">
                Hidden Leads ({hiddenLeads.length})
                <ChevronDown className={`h-4 w-4 transition-transform ${hiddenOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">
                {hiddenLeads.map((lead) => (
                  <div key={lead.id} className="rounded-xl border border-border bg-card/50 p-4 opacity-60">
                    <p className="font-medium text-foreground">{lead.product} | Qty: {lead.quantity}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{lead.buyerName} • {lead.location}</p>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </motion.div>
        )}

        {/* Bottom spacing for mobile nav */}
        <div className="h-20" />
      </div>

      {/* Hide Lead Sheet */}
      <Sheet open={hideSheetOpen} onOpenChange={setHideSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Why are you hiding this lead?</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <RadioGroup value={hideReason} onValueChange={setHideReason}>
              {hideReasons.map((reason) => (
                <div key={reason} className="flex items-center space-x-3 py-1">
                  <RadioGroupItem value={reason} id={reason} />
                  <Label htmlFor={reason} className="text-sm cursor-pointer">{reason}</Label>
                </div>
              ))}
            </RadioGroup>
            {hideReason === "Others" && (
              <Input
                placeholder="Please specify..."
                value={hideOtherText}
                onChange={(e) => setHideOtherText(e.target.value)}
              />
            )}
            <Button
              className="w-full bg-accent text-accent-foreground"
              disabled={!hideReason}
              onClick={submitHide}
            >
              Submit
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
};

export default Leads;
