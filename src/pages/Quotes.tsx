import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  Filter,
  Plus,
  Star,
  Phone,
  MessageCircle,
  Mail,
  FileText,
  Image as ImageIcon,
  Video,
  Download,
  Heart,
  Scale,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Eye,
  Send,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Package,
  Truck,
  Shield,
  ArrowUpDown,
  MoreHorizontal,
  Play,
  X,
} from "lucide-react";

// Mock data for quotes
const mockQuotes = [
  {
    id: "QT001",
    vendorName: "Premium Textile Mills",
    vendorLogo: "PTM",
    vendorRating: 4.8,
    vendorLocation: "Mumbai, India",
    verified: true,
    productName: "Organic Cotton Fabric - Premium Grade",
    productImage: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400",
    quantity: "5000 meters",
    pricePerUnit: "$2.50",
    totalPrice: "$12,500",
    moq: "1000 meters",
    leadTime: "15-20 days",
    status: "pending",
    receivedDate: "2024-01-10",
    expiryDate: "2024-01-25",
    shortlisted: false,
    attachments: {
      images: 5,
      videos: 2,
      pdfs: 3,
    },
    specifications: {
      material: "100% Organic Cotton",
      weight: "180 GSM",
      width: "58 inches",
      color: "Natural White",
    },
  },
  {
    id: "QT002",
    vendorName: "Silk Weavers Co.",
    vendorLogo: "SWC",
    vendorRating: 4.9,
    vendorLocation: "Bangalore, India",
    verified: true,
    productName: "Pure Silk Fabric - Mulberry Grade A",
    productImage: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400",
    quantity: "2000 meters",
    pricePerUnit: "$8.00",
    totalPrice: "$16,000",
    moq: "500 meters",
    leadTime: "25-30 days",
    status: "accepted",
    receivedDate: "2024-01-08",
    expiryDate: "2024-01-23",
    shortlisted: true,
    attachments: {
      images: 8,
      videos: 1,
      pdfs: 2,
    },
    specifications: {
      material: "100% Mulberry Silk",
      weight: "90 GSM",
      width: "45 inches",
      color: "Pearl White",
    },
  },
  {
    id: "QT003",
    vendorName: "Denim Factory Ltd",
    vendorLogo: "DFL",
    vendorRating: 4.5,
    vendorLocation: "Ahmedabad, India",
    verified: false,
    productName: "Stretch Denim - Indigo Blue",
    productImage: "https://images.unsplash.com/photo-1565084888279-aca607ecce0c?w=400",
    quantity: "10000 meters",
    pricePerUnit: "$3.20",
    totalPrice: "$32,000",
    moq: "2000 meters",
    leadTime: "20-25 days",
    status: "rejected",
    receivedDate: "2024-01-05",
    expiryDate: "2024-01-20",
    shortlisted: false,
    attachments: {
      images: 4,
      videos: 0,
      pdfs: 1,
    },
    specifications: {
      material: "98% Cotton, 2% Elastane",
      weight: "320 GSM",
      width: "60 inches",
      color: "Indigo Blue",
    },
  },
  {
    id: "QT004",
    vendorName: "Linen House",
    vendorLogo: "LH",
    vendorRating: 4.7,
    vendorLocation: "Delhi, India",
    verified: true,
    productName: "Premium Linen Fabric - Natural",
    productImage: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400",
    quantity: "3000 meters",
    pricePerUnit: "$5.50",
    totalPrice: "$16,500",
    moq: "500 meters",
    leadTime: "18-22 days",
    status: "pending",
    receivedDate: "2024-01-12",
    expiryDate: "2024-01-27",
    shortlisted: true,
    attachments: {
      images: 6,
      videos: 3,
      pdfs: 4,
    },
    specifications: {
      material: "100% European Linen",
      weight: "200 GSM",
      width: "54 inches",
      color: "Natural Beige",
    },
  },
];

const quoteRequests = [
  {
    id: "RQ001",
    productName: "Organic Cotton Fabric",
    quantity: "5000 meters",
    sentTo: 12,
    responses: 8,
    status: "active",
    createdDate: "2024-01-08",
    deadline: "2024-01-22",
  },
  {
    id: "RQ002",
    productName: "Silk Blend Fabric",
    quantity: "2000 meters",
    sentTo: 8,
    responses: 5,
    status: "active",
    createdDate: "2024-01-10",
    deadline: "2024-01-24",
  },
  {
    id: "RQ003",
    productName: "Denim Material",
    quantity: "10000 meters",
    sentTo: 15,
    responses: 15,
    status: "completed",
    createdDate: "2024-01-01",
    deadline: "2024-01-15",
  },
];

const statusConfig = {
  pending: { label: "Pending", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  accepted: { label: "Accepted", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
  expired: { label: "Expired", color: "bg-muted text-muted-foreground border-muted", icon: AlertCircle },
};

const Quotes = () => {
  const [activeTab, setActiveTab] = useState("received");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedQuotes, setSelectedQuotes] = useState<string[]>([]);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<typeof mockQuotes[0] | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [showMediaViewer, setShowMediaViewer] = useState(false);

  const filteredQuotes = mockQuotes.filter((quote) => {
    const matchesSearch = quote.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.vendorName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || quote.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleQuoteSelection = (id: string) => {
    setSelectedQuotes(prev =>
      prev.includes(id) ? prev.filter(q => q !== id) : [...prev, id]
    );
  };

  const toggleShortlist = (id: string) => {
    // In real app, this would update the database
    console.log("Toggle shortlist for:", id);
  };

  const stats = {
    totalReceived: mockQuotes.length,
    pending: mockQuotes.filter(q => q.status === "pending").length,
    accepted: mockQuotes.filter(q => q.status === "accepted").length,
    shortlisted: mockQuotes.filter(q => q.shortlisted).length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 lg:p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
              Quote Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Request, compare, and manage quotes from manufacturers
            </p>
          </div>
          <Dialog open={isNewRequestOpen} onOpenChange={setIsNewRequestOpen}>
            <DialogTrigger asChild>
              <Button variant="gold" size="lg" className="gap-2">
                <Plus size={20} />
                Request New Quote
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-xl">Request for Quote</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Product Category</label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cotton">Cotton Fabric</SelectItem>
                        <SelectItem value="silk">Silk Fabric</SelectItem>
                        <SelectItem value="denim">Denim</SelectItem>
                        <SelectItem value="linen">Linen</SelectItem>
                        <SelectItem value="synthetic">Synthetic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Product Type</label>
                    <Input placeholder="e.g., Organic Cotton Poplin" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Quantity Required</label>
                    <Input placeholder="e.g., 5000 meters" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Target Price (per unit)</label>
                    <Input placeholder="e.g., $2.50" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Delivery Location</label>
                    <Input placeholder="e.g., New York, USA" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Required By</label>
                    <Input type="date" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Specifications</label>
                  <Textarea
                    placeholder="Enter detailed specifications like GSM, width, color, finish, etc."
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Attach Reference Files</label>
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6">
                    <div className="text-center w-full">
                      <p className="text-sm text-muted-foreground">
                        Drag and drop files here or click to upload
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports: Images, PDFs, Videos (Max 10MB each)
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setIsNewRequestOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="gold" className="flex-1 gap-2">
                    <Send size={18} />
                    Send to Vendors
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        >
          {[
            { label: "Total Quotes", value: stats.totalReceived, icon: FileText, color: "text-accent" },
            { label: "Pending Review", value: stats.pending, icon: Clock, color: "text-amber-500" },
            { label: "Accepted", value: stats.accepted, icon: CheckCircle2, color: "text-emerald-500" },
            { label: "Shortlisted", value: stats.shortlisted, icon: Heart, color: "text-pink-500" },
          ].map((stat, index) => (
            <Card key={stat.label} className="border-border/50 bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{stat.value}</p>
                  </div>
                  <div className={`rounded-lg bg-muted p-2 ${stat.color}`}>
                    <stat.icon size={20} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="received" className="gap-2">
              <FileText size={16} />
              Received Quotes
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2">
              <Send size={16} />
              My Requests
            </TabsTrigger>
            <TabsTrigger value="compare" className="gap-2">
              <Scale size={16} />
              Compare ({selectedQuotes.length})
            </TabsTrigger>
            <TabsTrigger value="shortlisted" className="gap-2">
              <Heart size={16} />
              Shortlisted
            </TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input
                  placeholder="Search quotes by product or vendor..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <Filter size={16} className="mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon">
                  <ArrowUpDown size={18} />
                </Button>
              </div>
            </div>

            {/* Quote Cards */}
            <div className="grid gap-4">
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
                        <CardContent className="p-0">
                          <div className="flex flex-col lg:flex-row">
                            {/* Product Image */}
                            <div className="relative h-48 w-full lg:h-auto lg:w-56 shrink-0">
                              <img
                                src={quote.productImage}
                                alt={quote.productName}
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent lg:bg-gradient-to-r" />
                              <div className="absolute bottom-3 left-3 flex gap-2">
                                <Badge variant="secondary" className="bg-white/90 text-foreground gap-1">
                                  <ImageIcon size={12} />
                                  {quote.attachments.images}
                                </Badge>
                                {quote.attachments.videos > 0 && (
                                  <Badge variant="secondary" className="bg-white/90 text-foreground gap-1">
                                    <Video size={12} />
                                    {quote.attachments.videos}
                                  </Badge>
                                )}
                                {quote.attachments.pdfs > 0 && (
                                  <Badge variant="secondary" className="bg-white/90 text-foreground gap-1">
                                    <FileText size={12} />
                                    {quote.attachments.pdfs}
                                  </Badge>
                                )}
                              </div>
                              <Checkbox
                                checked={selectedQuotes.includes(quote.id)}
                                onCheckedChange={() => toggleQuoteSelection(quote.id)}
                                className="absolute left-3 top-3 bg-white border-white"
                              />
                            </div>

                            {/* Quote Details */}
                            <div className="flex-1 p-4 lg:p-5">
                              <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                                {/* Left Section */}
                                <div className="flex-1 space-y-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <h3 className="font-display text-lg font-semibold text-foreground">
                                        {quote.productName}
                                      </h3>
                                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                                        <div className="flex items-center gap-2">
                                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                                            {quote.vendorLogo}
                                          </div>
                                          <span className="text-sm font-medium text-foreground">
                                            {quote.vendorName}
                                          </span>
                                          {quote.verified && (
                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500 text-emerald-600">
                                              <Shield size={10} className="mr-0.5" />
                                              Verified
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1 text-amber-500">
                                          <Star size={14} fill="currentColor" />
                                          <span className="text-xs font-medium">{quote.vendorRating}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <Badge className={`${status.color} border gap-1`}>
                                      <StatusIcon size={12} />
                                      {status.label}
                                    </Badge>
                                  </div>

                                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                      <MapPin size={14} />
                                      <span>{quote.vendorLocation}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                      <Calendar size={14} />
                                      <span>Received: {quote.receivedDate}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                      <Clock size={14} />
                                      <span>Expires: {quote.expiryDate}</span>
                                    </div>
                                  </div>

                                  {/* Specifications */}
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(quote.specifications).map(([key, value]) => (
                                      <Badge key={key} variant="secondary" className="text-xs">
                                        {key}: {value}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>

                                {/* Right Section - Pricing */}
                                <div className="flex flex-col gap-3 lg:items-end lg:text-right lg:min-w-[200px]">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Unit Price</p>
                                    <p className="text-xl font-bold text-accent">{quote.pricePerUnit}</p>
                                  </div>
                                  <div className="flex gap-4 lg:flex-col lg:gap-1">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Quantity</p>
                                      <p className="text-sm font-medium">{quote.quantity}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Total</p>
                                      <p className="text-sm font-bold text-foreground">{quote.totalPrice}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Truck size={12} />
                                    <span>Lead time: {quote.leadTime}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                                <Button
                                  variant="gold"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => {
                                    setSelectedQuote(quote);
                                    setIsDetailOpen(true);
                                  }}
                                >
                                  <Eye size={14} />
                                  View Details
                                </Button>
                                <Button
                                  variant={quote.shortlisted ? "default" : "outline"}
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => toggleShortlist(quote.id)}
                                >
                                  <Heart size={14} fill={quote.shortlisted ? "currentColor" : "none"} />
                                  {quote.shortlisted ? "Shortlisted" : "Shortlist"}
                                </Button>
                                <div className="flex-1" />
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Phone size={16} />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MessageCircle size={16} />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Mail size={16} />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Download size={16} />
                                  </Button>
                                </div>
                              </div>
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

          <TabsContent value="requests" className="space-y-4">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="font-display text-lg">Active Quote Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {quoteRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-foreground">{request.productName}</h4>
                          <Badge variant={request.status === "active" ? "default" : "secondary"}>
                            {request.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {request.quantity} • Deadline: {request.deadline}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Sent to</p>
                          <p className="font-bold text-foreground">{request.sentTo}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Responses</p>
                          <p className="font-bold text-accent">{request.responses}</p>
                        </div>
                        <div className="w-24">
                          <Progress value={(request.responses / request.sentTo) * 100} className="h-2" />
                        </div>
                        <Button variant="outline" size="sm">
                          View Responses
                          <ChevronRight size={14} className="ml-1" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compare" className="space-y-4">
            {selectedQuotes.length < 2 ? (
              <Card className="border-border/50 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Scale size={48} className="text-muted-foreground/50" />
                  <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                    Compare Quotes Side by Side
                  </h3>
                  <p className="mt-2 text-center text-sm text-muted-foreground max-w-md">
                    Select at least 2 quotes from the "Received Quotes" tab to compare pricing, specifications, and vendor details.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-4 text-left text-sm font-medium text-muted-foreground">Criteria</th>
                      {selectedQuotes.map((id) => {
                        const quote = mockQuotes.find(q => q.id === id);
                        return quote ? (
                          <th key={id} className="p-4 min-w-[200px]">
                            <div className="flex flex-col items-center gap-2">
                              <img
                                src={quote.productImage}
                                alt={quote.productName}
                                className="h-20 w-20 rounded-lg object-cover"
                              />
                              <p className="font-medium text-foreground text-center text-sm">{quote.vendorName}</p>
                            </div>
                          </th>
                        ) : null;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {["Unit Price", "Total Price", "MOQ", "Lead Time", "Rating", "Verified"].map((criteria) => (
                      <tr key={criteria} className="border-b border-border">
                        <td className="p-4 text-sm font-medium text-muted-foreground">{criteria}</td>
                        {selectedQuotes.map((id) => {
                          const quote = mockQuotes.find(q => q.id === id);
                          if (!quote) return null;
                          let value: React.ReactNode;
                          switch (criteria) {
                            case "Unit Price":
                              value = <span className="font-bold text-accent">{quote.pricePerUnit}</span>;
                              break;
                            case "Total Price":
                              value = quote.totalPrice;
                              break;
                            case "MOQ":
                              value = quote.moq;
                              break;
                            case "Lead Time":
                              value = quote.leadTime;
                              break;
                            case "Rating":
                              value = (
                                <div className="flex items-center justify-center gap-1">
                                  <Star size={14} className="text-amber-500" fill="currentColor" />
                                  {quote.vendorRating}
                                </div>
                              );
                              break;
                            case "Verified":
                              value = quote.verified ? (
                                <CheckCircle2 size={18} className="text-emerald-500 mx-auto" />
                              ) : (
                                <XCircle size={18} className="text-muted-foreground mx-auto" />
                              );
                              break;
                          }
                          return (
                            <td key={id} className="p-4 text-center text-sm">
                              {value}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="shortlisted" className="space-y-4">
            <div className="grid gap-4">
              {mockQuotes.filter(q => q.shortlisted).map((quote) => {
                const status = statusConfig[quote.status as keyof typeof statusConfig];
                return (
                  <Card key={quote.id} className="border-border/50 bg-card">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={quote.productImage}
                          alt={quote.productName}
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground">{quote.productName}</h4>
                          <p className="text-sm text-muted-foreground">{quote.vendorName}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-accent">{quote.pricePerUnit}</p>
                          <p className="text-xs text-muted-foreground">{quote.quantity}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="gold" size="sm">Accept Quote</Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal size={16} />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {mockQuotes.filter(q => q.shortlisted).length === 0 && (
                <Card className="border-border/50 border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Heart size={48} className="text-muted-foreground/50" />
                    <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                      No Shortlisted Quotes
                    </h3>
                    <p className="mt-2 text-center text-sm text-muted-foreground">
                      Shortlist quotes to easily access them later for comparison and decision making.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Quote Detail Modal */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedQuote && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display text-xl flex items-center gap-2">
                    Quote Details
                    <Badge className={`${statusConfig[selectedQuote.status as keyof typeof statusConfig].color} border ml-2`}>
                      {statusConfig[selectedQuote.status as keyof typeof statusConfig].label}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6 pt-4">
                  {/* Vendor Info */}
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">
                        {selectedQuote.vendorLogo}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-foreground">{selectedQuote.vendorName}</h3>
                          {selectedQuote.verified && (
                            <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                              <Shield size={12} className="mr-1" />
                              Verified
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-sm text-muted-foreground">{selectedQuote.vendorLocation}</span>
                          <div className="flex items-center gap-1 text-amber-500">
                            <Star size={14} fill="currentColor" />
                            <span className="text-sm font-medium">{selectedQuote.vendorRating}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Phone size={14} />
                        Call
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <MessageCircle size={14} />
                        Chat
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Mail size={14} />
                        Email
                      </Button>
                    </div>
                  </div>

                  {/* Product Images */}
                  <div>
                    <h4 className="font-medium text-foreground mb-3">Product Media</h4>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="relative aspect-square rounded-lg overflow-hidden group cursor-pointer">
                        <img
                          src={selectedQuote.productImage}
                          alt="Product"
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye className="text-white" size={24} />
                        </div>
                      </div>
                      {/* More images placeholder */}
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="aspect-square rounded-lg bg-muted flex items-center justify-center">
                          <ImageIcon className="text-muted-foreground" size={24} />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-3">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Video size={14} />
                        View {selectedQuote.attachments.videos} Videos
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <FileText size={14} />
                        Download {selectedQuote.attachments.pdfs} PDFs
                      </Button>
                    </div>
                  </div>

                  {/* Pricing Details */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pricing</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm">Unit Price</span>
                          <span className="font-bold text-accent">{selectedQuote.pricePerUnit}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Quantity</span>
                          <span className="font-medium">{selectedQuote.quantity}</span>
                        </div>
                        <div className="flex justify-between border-t border-border pt-2">
                          <span className="text-sm font-medium">Total</span>
                          <span className="font-bold text-foreground">{selectedQuote.totalPrice}</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Delivery</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm">Lead Time</span>
                          <span className="font-medium">{selectedQuote.leadTime}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">MOQ</span>
                          <span className="font-medium">{selectedQuote.moq}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Valid Until</span>
                          <span className="font-medium">{selectedQuote.expiryDate}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Specifications */}
                  <div>
                    <h4 className="font-medium text-foreground mb-3">Specifications</h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {Object.entries(selectedQuote.specifications).map(([key, value]) => (
                        <div key={key} className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground capitalize">{key}</p>
                          <p className="font-medium text-foreground">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 border-t border-border pt-4">
                    <Button variant="gold" className="flex-1 gap-2">
                      <CheckCircle2 size={18} />
                      Accept Quote
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2">
                      <MessageCircle size={18} />
                      Negotiate
                    </Button>
                    <Button variant="destructive" className="gap-2">
                      <XCircle size={18} />
                      Reject
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Quotes;
