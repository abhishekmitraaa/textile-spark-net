import { useState } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Filter,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  Clock,
  User,
  Package,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MoreVertical,
  PhoneCall,
  PhoneOutgoing,
  Eye,
  Star,
  StarOff,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";
type LeadType = "call" | "inquiry" | "quote";

interface Lead {
  id: string;
  buyerName: string;
  companyName: string;
  email: string;
  phone: string;
  type: LeadType;
  status: LeadStatus;
  productInterest: string;
  quantity: string;
  message: string;
  createdAt: string;
  lastContact?: string;
  starred: boolean;
  notes?: string;
}

const mockLeads: Lead[] = [
  {
    id: "1",
    buyerName: "Rajesh Kumar",
    companyName: "StyleMart Retailers",
    email: "rajesh@stylemart.com",
    phone: "+91 98765 43210",
    type: "call",
    status: "new",
    productInterest: "Premium Cotton Kurtas",
    quantity: "500 pieces",
    message: "Looking for bulk order of cotton kurtas for summer collection",
    createdAt: "2024-01-15T10:30:00",
    starred: true,
  },
  {
    id: "2",
    buyerName: "Priya Sharma",
    companyName: "Fashion Forward Exports",
    email: "priya@ffexports.com",
    phone: "+91 87654 32109",
    type: "inquiry",
    status: "contacted",
    productInterest: "Silk Sarees Collection",
    quantity: "200 pieces",
    message: "Interested in your silk saree collection for export to UAE",
    createdAt: "2024-01-14T15:45:00",
    lastContact: "2024-01-15T09:00:00",
    starred: false,
    notes: "Follow up scheduled for next week",
  },
  {
    id: "3",
    buyerName: "Amit Patel",
    companyName: "TrendyWear Wholesale",
    email: "amit@trendywear.in",
    phone: "+91 76543 21098",
    type: "quote",
    status: "qualified",
    productInterest: "Denim Collection",
    quantity: "1000 pieces",
    message: "Need quote for denim jeans and jackets, multiple sizes",
    createdAt: "2024-01-13T11:20:00",
    lastContact: "2024-01-14T14:30:00",
    starred: true,
    notes: "High value lead - ready to place order",
  },
  {
    id: "4",
    buyerName: "Sneha Reddy",
    companyName: "BoutiqueHub",
    email: "sneha@boutiquehub.com",
    phone: "+91 65432 10987",
    type: "call",
    status: "converted",
    productInterest: "Designer Lehengas",
    quantity: "50 pieces",
    message: "Looking for exclusive designer lehengas for wedding season",
    createdAt: "2024-01-10T09:15:00",
    lastContact: "2024-01-12T16:00:00",
    starred: false,
    notes: "Order placed - ₹2.5L value",
  },
  {
    id: "5",
    buyerName: "Vikram Singh",
    companyName: "Metro Garments",
    email: "vikram@metrogarments.com",
    phone: "+91 54321 09876",
    type: "inquiry",
    status: "lost",
    productInterest: "Casual Shirts",
    quantity: "300 pieces",
    message: "Bulk inquiry for casual shirts",
    createdAt: "2024-01-08T14:00:00",
    lastContact: "2024-01-11T10:00:00",
    starred: false,
    notes: "Went with competitor - price sensitive",
  },
];

const statusConfig: Record<LeadStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  new: { label: "New", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: AlertCircle },
  contacted: { label: "Contacted", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  qualified: { label: "Qualified", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: Star },
  converted: { label: "Converted", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle2 },
  lost: { label: "Lost", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle },
};

const typeConfig: Record<LeadType, { label: string; icon: typeof Phone }> = {
  call: { label: "Call Request", icon: PhoneCall },
  inquiry: { label: "Product Inquiry", icon: MessageSquare },
  quote: { label: "Quote Request", icon: Package },
};

const Leads = () => {
  const [leads, setLeads] = useState<Lead[]>(mockLeads);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [followUpNote, setFollowUpNote] = useState("");

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.buyerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.productInterest.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    const matchesType = typeFilter === "all" || lead.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const toggleStar = (id: string) => {
    setLeads(leads.map((lead) =>
      lead.id === id ? { ...lead, starred: !lead.starred } : lead
    ));
  };

  const updateStatus = (id: string, newStatus: LeadStatus) => {
    setLeads(leads.map((lead) =>
      lead.id === id ? { ...lead, status: newStatus, lastContact: new Date().toISOString() } : lead
    ));
  };

  const addNote = (id: string, note: string) => {
    setLeads(leads.map((lead) =>
      lead.id === id ? { ...lead, notes: note, lastContact: new Date().toISOString() } : lead
    ));
    setFollowUpNote("");
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return "Yesterday";
    return `${diffInDays} days ago`;
  };

  const stats = {
    total: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    qualified: leads.filter((l) => l.status === "qualified").length,
    converted: leads.filter((l) => l.status === "converted").length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 lg:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground lg:text-2xl">
              Lead Management
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track and follow up on buyer inquiries
            </p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {[
            { label: "Total Leads", value: stats.total, color: "text-foreground" },
            { label: "New Leads", value: stats.new, color: "text-blue-600" },
            { label: "Qualified", value: stats.qualified, color: "text-purple-600" },
            { label: "Converted", value: stats.converted, color: "text-green-600" },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-border bg-card p-3 lg:p-4"
            >
              <p className="text-xs text-muted-foreground lg:text-sm">{stat.label}</p>
              <p className={`mt-1 text-xl font-semibold lg:text-2xl ${stat.color}`}>
                {stat.value}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, company, or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 sm:w-36">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-32 sm:w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="call">Call Requests</SelectItem>
                <SelectItem value="inquiry">Inquiries</SelectItem>
                <SelectItem value="quote">Quote Requests</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Leads List */}
        <div className="space-y-3">
          {filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground/40" />
              <h3 className="mt-4 font-medium text-foreground">No leads found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Try adjusting your filters or search query
              </p>
            </div>
          ) : (
            filteredLeads.map((lead, index) => {
              const StatusIcon = statusConfig[lead.status].icon;
              const TypeIcon = typeConfig[lead.type].icon;

              return (
                <motion.div
                  key={lead.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-accent/50 hover:shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    {/* Lead Info */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleStar(lead.id)}
                            className="text-muted-foreground transition-colors hover:text-accent"
                          >
                            {lead.starred ? (
                              <Star className="h-5 w-5 fill-accent text-accent" />
                            ) : (
                              <StarOff className="h-5 w-5" />
                            )}
                          </button>
                          <div>
                            <h3 className="font-medium text-foreground">{lead.buyerName}</h3>
                            <p className="text-sm text-muted-foreground">{lead.companyName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`${statusConfig[lead.status].color} hidden sm:flex`}
                          >
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {statusConfig[lead.status].label}
                          </Badge>
                          <Badge variant="secondary" className="hidden sm:flex">
                            <TypeIcon className="mr-1 h-3 w-3" />
                            {typeConfig[lead.type].label}
                          </Badge>
                        </div>
                      </div>

                      {/* Mobile badges */}
                      <div className="flex flex-wrap gap-2 sm:hidden">
                        <Badge
                          variant="outline"
                          className={statusConfig[lead.status].color}
                        >
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusConfig[lead.status].label}
                        </Badge>
                        <Badge variant="secondary">
                          <TypeIcon className="mr-1 h-3 w-3" />
                          {typeConfig[lead.type].label}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Package className="h-4 w-4" />
                          {lead.productInterest}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          Qty: {lead.quantity}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {getTimeAgo(lead.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground line-clamp-2">
                        "{lead.message}"
                      </p>

                      {lead.notes && (
                        <div className="rounded-lg bg-muted/50 p-2 text-sm">
                          <span className="font-medium text-foreground">Note: </span>
                          <span className="text-muted-foreground">{lead.notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => window.open(`tel:${lead.phone}`)}
                        >
                          <Phone className="mr-1 h-3 w-3" />
                          <span className="hidden sm:inline">Call</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => window.open(`mailto:${lead.email}`)}
                        >
                          <Mail className="mr-1 h-3 w-3" />
                          <span className="hidden sm:inline">Email</span>
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="default"
                              className="h-8"
                              onClick={() => setSelectedLead(lead)}
                            >
                              <Eye className="mr-1 h-3 w-3" />
                              <span className="hidden sm:inline">View</span>
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Lead Details</DialogTitle>
                              <DialogDescription>
                                View and manage this lead
                              </DialogDescription>
                            </DialogHeader>
                            {selectedLead && (
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-foreground">
                                      {selectedLead.buyerName}
                                    </h3>
                                    <Badge
                                      variant="outline"
                                      className={statusConfig[selectedLead.status].color}
                                    >
                                      {statusConfig[selectedLead.status].label}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedLead.companyName}
                                  </p>
                                </div>

                                <div className="grid gap-3 text-sm">
                                  <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    <span>{selectedLead.phone}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                    <span>{selectedLead.email}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                    <span>
                                      {selectedLead.productInterest} ({selectedLead.quantity})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <span>Received: {formatDate(selectedLead.createdAt)}</span>
                                  </div>
                                  {selectedLead.lastContact && (
                                    <div className="flex items-center gap-2">
                                      <PhoneOutgoing className="h-4 w-4 text-muted-foreground" />
                                      <span>
                                        Last Contact: {formatDate(selectedLead.lastContact)}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="rounded-lg bg-muted/50 p-3">
                                  <p className="text-sm font-medium text-foreground">Message:</p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {selectedLead.message}
                                  </p>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-foreground">
                                    Update Status:
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {(Object.keys(statusConfig) as LeadStatus[]).map((status) => (
                                      <Button
                                        key={status}
                                        size="sm"
                                        variant={selectedLead.status === status ? "default" : "outline"}
                                        onClick={() => {
                                          updateStatus(selectedLead.id, status);
                                          setSelectedLead({ ...selectedLead, status });
                                        }}
                                      >
                                        {statusConfig[status].label}
                                      </Button>
                                    ))}
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-foreground">
                                    Add Follow-up Note:
                                  </p>
                                  <Textarea
                                    placeholder="Enter notes about this lead..."
                                    value={followUpNote}
                                    onChange={(e) => setFollowUpNote(e.target.value)}
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      addNote(selectedLead.id, followUpNote);
                                      setSelectedLead({ ...selectedLead, notes: followUpNote });
                                    }}
                                    disabled={!followUpNote.trim()}
                                  >
                                    Save Note
                                  </Button>
                                </div>

                                <div className="flex gap-2 pt-2">
                                  <Button
                                    className="flex-1"
                                    onClick={() => window.open(`tel:${selectedLead.phone}`)}
                                  >
                                    <Phone className="mr-2 h-4 w-4" />
                                    Call Now
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => window.open(`mailto:${selectedLead.email}`)}
                                  >
                                    <Mail className="mr-2 h-4 w-4" />
                                    Send Email
                                  </Button>
                                </div>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => updateStatus(lead.id, "contacted")}>
                            <Clock className="mr-2 h-4 w-4" />
                            Mark as Contacted
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(lead.id, "qualified")}>
                            <Star className="mr-2 h-4 w-4" />
                            Mark as Qualified
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(lead.id, "converted")}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Mark as Converted
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => updateStatus(lead.id, "lost")}
                            className="text-destructive"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Mark as Lost
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Leads;
