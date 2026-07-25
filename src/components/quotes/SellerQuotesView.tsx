import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useVendorQuoteSummary, vendorQuoteSummaryFixture } from "@/hooks/useVendorData";
import {
  Search,
  Filter,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  FileText,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Package,
  Truck,
  ArrowUpDown,
  MessageCircle,
  Phone,
  Mail,
  Star,
  Inbox,
  TrendingUp,
  Reply,
  BarChart3,
} from "lucide-react";

// Mock data for seller's sent quotes
const sellerSentQuotes = [
  {
    id: "SQ001",
    buyerName: "Urban Threads Fashion",
    buyerLogo: "UT",
    buyerLocation: "New York, USA",
    buyerRating: 4.6,
    rfqId: "RFQ-2024-0112",
    productName: "Organic Cotton Poplin - 60s Count",
    quantity: "5000 meters",
    quotedPrice: "$2.50/meter",
    totalValue: "$12,500",
    leadTime: "15-20 days",
    status: "negotiating",
    sentDate: "2024-01-12",
    expiryDate: "2024-01-27",
    competingQuotes: 3,
    lowestCompetingPrice: "$2.25/meter",
    buyerResponsePreview: "Buyer viewed the quote and asked for a sharper price on bulk volume.",
    specifications: {
      material: "100% Organic Cotton",
      weight: "120 GSM",
      width: "58 inches",
      finish: "Pre-washed",
    },
  },
  {
    id: "SQ002",
    buyerName: "Luxe Atelier",
    buyerLogo: "LA",
    buyerLocation: "Paris, France",
    buyerRating: 4.9,
    rfqId: "RFQ-2024-0098",
    productName: "Mulberry Silk Charmeuse - Grade A",
    quantity: "2000 meters",
    quotedPrice: "$8.00/meter",
    totalValue: "$16,000",
    leadTime: "25-30 days",
    status: "accepted",
    sentDate: "2024-01-08",
    expiryDate: "2024-01-23",
    competingQuotes: 2,
    lowestCompetingPrice: "$7.95/meter",
    buyerResponsePreview: "Accepted after internal review and stakeholder sign-off.",
    specifications: {
      material: "100% Mulberry Silk",
      weight: "90 GSM",
      width: "45 inches",
      finish: "Sand-washed",
    },
  },
  {
    id: "SQ003",
    buyerName: "Denim Republic",
    buyerLogo: "DR",
    buyerLocation: "Los Angeles, USA",
    buyerRating: 4.3,
    rfqId: "RFQ-2024-0134",
    productName: "Selvedge Denim - 14oz",
    quantity: "8000 meters",
    quotedPrice: "$4.20/meter",
    totalValue: "$33,600",
    leadTime: "20-25 days",
    status: "rejected",
    sentDate: "2024-01-05",
    expiryDate: "2024-01-20",
    competingQuotes: 4,
    lowestCompetingPrice: "$3.90/meter",
    buyerResponsePreview: "Buyer selected a lower-cost supplier for the same spec.",
    rejectionReason: "Price was slightly above the buyer's target range.",
    specifications: {
      material: "100% Cotton",
      weight: "475 GSM",
      width: "32 inches",
      finish: "Raw / Unwashed",
    },
  },
  {
    id: "SQ004",
    buyerName: "EcoWear Brand",
    buyerLogo: "EW",
    buyerLocation: "London, UK",
    buyerRating: 4.7,
    rfqId: "RFQ-2024-0150",
    productName: "Hemp-Cotton Blend Jersey",
    quantity: "3000 meters",
    quotedPrice: "$3.80/meter",
    totalValue: "$11,400",
    leadTime: "18-22 days",
    status: "pending",
    sentDate: "2024-01-14",
    expiryDate: "2024-01-29",
    competingQuotes: 1,
    lowestCompetingPrice: "$5.40/meter",
    buyerResponsePreview: "Awaiting response from buyer procurement team.",
    specifications: {
      material: "55% Hemp, 45% Cotton",
      weight: "180 GSM",
      width: "60 inches",
      finish: "Enzyme-washed",
    },
  },
  {
    id: "SQ005",
    buyerName: "Silk Road Couture",
    buyerLogo: "SR",
    buyerLocation: "Dubai, UAE",
    buyerRating: 4.8,
    rfqId: "RFQ-2024-0167",
    productName: "Viscose Crepe - Printed",
    quantity: "4000 meters",
    quotedPrice: "$3.00/meter",
    totalValue: "$12,000",
    leadTime: "12-15 days",
    status: "expired",
    sentDate: "2023-12-20",
    expiryDate: "2024-01-05",
    competingQuotes: 5,
    lowestCompetingPrice: "$3.60/meter",
    buyerResponsePreview: "Quote expired before the buyer completed shortlist review.",
    specifications: {
      material: "100% Viscose",
      weight: "130 GSM",
      width: "54 inches",
      finish: "Digital Print",
    },
  },
];

// Mock data for incoming RFQs the seller can respond to
const incomingRFQs = [
  {
    id: "RFQ-2024-0180",
    buyerName: "Nordic Style Co.",
    buyerLocation: "Stockholm, Sweden",
    productName: "Organic Linen Fabric",
    quantity: "6000 meters",
    targetPrice: "$4.00-5.00/meter",
    deadline: "2024-01-30",
    postedDate: "2024-01-15",
    requirements: "GOTS certified, natural dye, 200 GSM minimum",
    status: "new",
  },
  {
    id: "RFQ-2024-0175",
    buyerName: "Coastal Wear Ltd",
    buyerLocation: "Sydney, Australia",
    productName: "Recycled Polyester Knit",
    quantity: "10000 meters",
    targetPrice: "$2.00-3.00/meter",
    deadline: "2024-02-05",
    postedDate: "2024-01-13",
    requirements: "GRS certified, moisture-wicking, 150 GSM",
    status: "new",
  },
  {
    id: "RFQ-2024-0160",
    buyerName: "Heritage Textiles",
    buyerLocation: "Milan, Italy",
    productName: "Jacquard Woven Fabric",
    quantity: "1500 meters",
    targetPrice: "$10.00-15.00/meter",
    deadline: "2024-01-25",
    postedDate: "2024-01-10",
    requirements: "Custom pattern, silk-cotton blend, minimum 200 GSM",
    status: "viewed",
  },
];

const statusConfig = {
  pending: { label: "Awaiting Response", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  negotiating: { label: "Negotiating", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: MessageCircle },
  accepted: { label: "Accepted", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
  rejected: { label: "Declined", color: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
  expired: { label: "Expired", color: "bg-muted text-muted-foreground border-muted", icon: AlertCircle },
};

const SellerQuotesView = () => {
  const [activeTab, setActiveTab] = useState("sent");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedQuote, setSelectedQuote] = useState<typeof sellerSentQuotes[0] | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isRespondOpen, setIsRespondOpen] = useState(false);
  const [selectedRFQ, setSelectedRFQ] = useState<typeof incomingRFQs[0] | null>(null);
  const { data: quoteSummary } = useVendorQuoteSummary();

  // Respond to RFQ form state
  const [responsePrice, setResponsePrice] = useState("");
  const [responseLeadTime, setResponseLeadTime] = useState("");
  const [responseNotes, setResponseNotes] = useState("");

  const filteredQuotes = sellerSentQuotes.filter((quote) => {
    const matchesSearch =
      quote.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.buyerName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || quote.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    ...(quoteSummary ?? vendorQuoteSummaryFixture),
  };

  const handleRespondToRFQ = () => {
    toast.success("Quotation sent to buyer successfully!");
    setIsRespondOpen(false);
    setResponsePrice("");
    setResponseLeadTime("");
    setResponseNotes("");
  };

  const handleQuoteStatusAction = (quote: typeof sellerSentQuotes[0]) => {
    if (quote.status === "accepted") {
      toast.success(`Viewing order details for ${quote.buyerName}`);
      return;
    }

    if (quote.status === "rejected") {
      toast.info(`Drafting a revised quote for ${quote.buyerName}`);
      return;
    }

    if (quote.status === "expired") {
      toast.info(`Republishing ${quote.productName} with a refreshed quote`);
      return;
    }

    toast.success(`Sending follow-up to ${quote.buyerName}`);
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground lg:text-3xl">
            My Quotations
          </h1>
          <p className="text-sm text-muted-foreground">
            Track sent quotations and respond to buyer requests
          </p>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3"
      >
        {[
          { label: "Total Sent", value: stats.totalSent, icon: Send, color: "text-accent" },
          { label: "In Negotiation", value: stats.negotiating, icon: MessageCircle, color: "text-blue-500" },
          { label: "Awaiting Response", value: stats.pending, icon: Clock, color: "text-amber-500" },
          { label: "Accepted", value: stats.accepted, icon: CheckCircle2, color: "text-emerald-500" },
          { label: "Acceptance Rate", value: stats.acceptanceRate, icon: TrendingUp, color: "text-primary" },
          { label: "Avg Response Time", value: stats.avgResponseTime, icon: BarChart3, color: "text-accent" },
          { label: "Total Value", value: stats.totalValue, icon: TrendingUp, color: "text-primary" },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/50 bg-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-muted-foreground truncate">{stat.label}</p>
                  <p className="mt-0.5 text-xl sm:text-2xl font-bold text-foreground">{stat.value}</p>
                </div>
                <div className={`shrink-0 rounded-lg bg-muted p-1.5 sm:p-2 ${stat.color}`}>
                  <stat.icon size={16} className="sm:w-5 sm:h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 lg:space-y-4">
        <TabsList className="bg-muted/50 p-1 w-full grid grid-cols-3">
          <TabsTrigger value="sent" className="gap-1.5 text-xs sm:text-sm">
            <Send size={14} />
            <span className="hidden sm:inline">Sent</span> Quotes
          </TabsTrigger>
          <TabsTrigger value="rfqs" className="gap-1.5 text-xs sm:text-sm">
            <Inbox size={14} />
            RFQs ({incomingRFQs.length})
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5 text-xs sm:text-sm">
            <BarChart3 size={14} />
            <span className="hidden sm:inline">Performance</span><span className="sm:hidden">Stats</span>
          </TabsTrigger>
        </TabsList>

        {/* Sent Quotes Tab */}
        <TabsContent value="sent" className="space-y-3">
          {/* Filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input
                placeholder="Search by product or buyer..."
                className="pl-9 h-9 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-9 text-sm">
                  <Filter size={14} className="mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Awaiting Response</SelectItem>
                  <SelectItem value="negotiating">Negotiating</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="rejected">Declined</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <ArrowUpDown size={16} />
              </Button>
            </div>
          </div>

          {/* Sent Quote Cards */}
          <div className="grid gap-3">
            <AnimatePresence>
              {filteredQuotes.map((quote, index) => {
                const status = statusConfig[quote.status as keyof typeof statusConfig];
                const StatusIcon = status.icon;

                return (
                  <motion.div
                    key={quote.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="group overflow-hidden border-border/50 bg-card transition-all hover:border-accent/30 hover:shadow-md">
                      <CardContent className="p-3 sm:p-4 lg:p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
                          {/* Left Section */}
                          <div className="flex-1 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                                    {quote.rfqId}
                                  </Badge>
                                  <Badge className={`${status.color} border gap-1`}>
                                    <StatusIcon size={12} />
                                    {status.label}
                                  </Badge>
                                </div>
                                <h3 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
                                  {quote.productName}
                                </h3>
                              </div>
                            </div>

                            {/* Buyer Info */}
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                                {quote.buyerLogo}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">
                                    {quote.buyerName}
                                  </span>
                                  <div className="flex items-center gap-1 text-amber-500">
                                    <Star size={12} fill="currentColor" />
                                    <span className="text-xs">{quote.buyerRating}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin size={10} />
                                  {quote.buyerLocation}
                                </div>
                              </div>
                            </div>

                            {/* Meta Info */}
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs sm:text-sm">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Calendar size={12} />
                                <span>Sent: {quote.sentDate}</span>
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Clock size={12} />
                                <span>Expires: {quote.expiryDate}</span>
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Truck size={12} />
                                <span>Lead: {quote.leadTime}</span>
                              </div>
                            </div>

                            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Buyer response</span>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {quote.competingQuotes} competing quotes
                                </Badge>
                              </div>
                              <p className="text-sm text-foreground leading-relaxed">{quote.buyerResponsePreview}</p>
                              <p className="text-xs text-muted-foreground">
                                Lowest competing price: {quote.lowestCompetingPrice}
                              </p>
                            </div>

                            {/* Specs */}
                            <div className="hidden sm:flex flex-wrap gap-1.5">
                              {Object.entries(quote.specifications).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-[10px]">
                                  {key}: {value}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          {/* Right Section - Pricing */}
                          <div className="flex items-center gap-4 sm:flex-col sm:gap-3 lg:items-end lg:text-right lg:min-w-[200px]">
                            <div>
                              <p className="text-[10px] sm:text-xs text-muted-foreground">Quoted Price</p>
                              <p className="text-lg sm:text-xl font-bold text-accent">{quote.quotedPrice}</p>
                            </div>
                            <div className="flex gap-4 sm:flex-col sm:gap-1">
                              <div>
                                <p className="text-[10px] sm:text-xs text-muted-foreground">Qty</p>
                                <p className="text-xs sm:text-sm font-medium">{quote.quantity}</p>
                              </div>
                              <div>
                                <p className="text-[10px] sm:text-xs text-muted-foreground">Total</p>
                                <p className="text-xs sm:text-sm font-bold text-foreground">{quote.totalValue}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                          <Button
                            variant="gold"
                            size="sm"
                            className="gap-1.5 h-8 text-xs"
                            onClick={() => {
                              setSelectedQuote(quote);
                              setIsDetailOpen(true);
                            }}
                          >
                            <Eye size={12} />
                            Details
                          </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 h-8 text-xs"
                                onClick={() => handleQuoteStatusAction(quote)}
                              >
                                <Reply size={12} />
                                {quote.status === "accepted"
                                  ? "View Order"
                                  : quote.status === "rejected"
                                  ? "Revise Quote"
                                  : quote.status === "expired"
                                  ? "Republish"
                                  : "Follow Up"}
                              </Button>
                          <div className="flex-1" />
                          <div className="hidden sm:flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Phone size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MessageCircle size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Mail size={14} />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </TabsContent>

        {/* Incoming RFQs Tab */}
        <TabsContent value="rfqs" className="space-y-4">
          <div className="grid gap-4">
            {incomingRFQs.map((rfq, index) => (
              <motion.div
                key={rfq.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="border-border/50 bg-card transition-all hover:border-accent/30 hover:shadow-md">
                  <CardContent className="p-4 lg:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                            {rfq.id}
                          </Badge>
                          {rfq.status === "new" && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 border">New</Badge>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">
                          {rfq.productName}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building2 size={14} />
                          <span className="font-medium text-foreground">{rfq.buyerName}</span>
                          <span>•</span>
                          <MapPin size={14} />
                          <span>{rfq.buyerLocation}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Requirements:</span> {rfq.requirements}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Package size={14} />
                            <span>{rfq.quantity}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <DollarSign size={14} />
                            <span>Target: {rfq.targetPrice}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar size={14} />
                            <span>Deadline: {rfq.deadline}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 lg:flex-col">
                        <Button
                          variant="gold"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            setSelectedRFQ(rfq);
                            setIsRespondOpen(true);
                          }}
                        >
                          <Reply size={14} />
                          Send Quotation
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Eye size={14} />
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Quote Acceptance Rate", value: "40%", desc: "2 of 5 quotes accepted", color: "text-emerald-500" },
              { label: "Avg. Response Time", value: "2.3 days", desc: "From RFQ to quotation sent", color: "text-accent" },
              { label: "Total Revenue (Accepted)", value: "$16,000", desc: "From accepted quotations", color: "text-primary" },
              { label: "Pending Value", value: "$23,900", desc: "Quotes awaiting response", color: "text-amber-500" },
              { label: "Quotes This Month", value: "5", desc: "Sent in January 2024", color: "text-accent" },
              { label: "Repeat Buyers", value: "1", desc: "Buyers who accepted before", color: "text-emerald-500" },
            ].map((metric) => (
              <Card key={metric.label} className="border-border/50 bg-card">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${metric.color}`}>{metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Quote Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Quote Details</DialogTitle>
          </DialogHeader>
          {selectedQuote && (
            <div className="space-y-4 pt-2">
              <div>
                <h4 className="font-semibold text-foreground">{selectedQuote.productName}</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  RFQ: {selectedQuote.rfqId} • Sent to {selectedQuote.buyerName}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Quoted Price</p>
                  <p className="text-lg font-bold text-accent">{selectedQuote.quotedPrice}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Total Value</p>
                  <p className="text-lg font-bold text-foreground">{selectedQuote.totalValue}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="font-medium">{selectedQuote.quantity}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Lead Time</p>
                  <p className="font-medium">{selectedQuote.leadTime}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Competition</p>
                  <p className="font-medium">{selectedQuote.competingQuotes} quotes</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Lowest Competing</p>
                  <p className="font-medium">{selectedQuote.lowestCompetingPrice}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Specifications</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(selectedQuote.specifications).map(([key, value]) => (
                    <Badge key={key} variant="secondary" className="text-xs capitalize">
                      {key}: {value}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">Buyer response</p>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                    {selectedQuote.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedQuote.buyerResponsePreview}</p>
                {selectedQuote.rejectionReason ? (
                  <p className="text-xs text-destructive">Reason: {selectedQuote.rejectionReason}</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Sent Date</p>
                  <p className="font-medium">{selectedQuote.sentDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Expiry Date</p>
                  <p className="font-medium">{selectedQuote.expiryDate}</p>
                </div>
              </div>
              <div
                className={`rounded-lg border p-3 text-sm ${
                  selectedQuote.status === "accepted"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                    : selectedQuote.status === "negotiating"
                    ? "border-blue-500/20 bg-blue-500/10 text-blue-700"
                    : selectedQuote.status === "rejected"
                    ? "border-destructive/20 bg-destructive/10 text-destructive"
                    : "border-border bg-muted/20 text-muted-foreground"
                }`}
              >
                {selectedQuote.status === "accepted" && "Buyer accepted the quote. Move to order handoff and fulfillment."}
                {selectedQuote.status === "negotiating" && "Buyer is comparing options. Follow up fast to protect the deal."}
                {selectedQuote.status === "rejected" && "This quote lost on price or fit. A revised quote can be sent from this view."}
                {selectedQuote.status === "pending" && "Waiting for buyer response. Use the follow-up CTA to stay top of mind."}
                {selectedQuote.status === "expired" && "Quote expired. Duplicate it if you want to resend a refreshed offer."}
              </div>
              <DialogFooter className="gap-2 sm:gap-3">
                <Button variant="outline" onClick={() => handleChat(selectedQuote)}>
                  <MessageCircle size={14} className="mr-1.5" />
                  Message Buyer
                </Button>
                <Button variant="outline" onClick={() => handleCall(selectedQuote)}>
                  <Phone size={14} className="mr-1.5" />
                  Call Buyer
                </Button>
                <Button variant="gold" className="gap-2" onClick={() => handleQuoteStatusAction(selectedQuote)}>
                  <Reply size={14} />
                  {selectedQuote.status === "accepted"
                    ? "View Order"
                    : selectedQuote.status === "rejected"
                    ? "Revise Quote"
                    : selectedQuote.status === "expired"
                    ? "Republish"
                    : "Follow Up"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Respond to RFQ Dialog */}
      <Dialog open={isRespondOpen} onOpenChange={setIsRespondOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Send Quotation</DialogTitle>
          </DialogHeader>
          {selectedRFQ && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium text-foreground">{selectedRFQ.productName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedRFQ.buyerName} • {selectedRFQ.quantity} • Target: {selectedRFQ.targetPrice}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Your Price (per unit)</label>
                  <Input
                    placeholder="e.g., $4.50/meter"
                    value={responsePrice}
                    onChange={(e) => setResponsePrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Lead Time</label>
                  <Input
                    placeholder="e.g., 15-20 days"
                    value={responseLeadTime}
                    onChange={(e) => setResponseLeadTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Additional Notes</label>
                <Textarea
                  placeholder="Add details about MOQ, payment terms, certifications, etc."
                  rows={4}
                  value={responseNotes}
                  onChange={(e) => setResponseNotes(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsRespondOpen(false)}>
                  Cancel
                </Button>
                <Button variant="gold" className="gap-2" onClick={handleRespondToRFQ}>
                  <Send size={16} />
                  Send Quotation
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SellerQuotesView;
