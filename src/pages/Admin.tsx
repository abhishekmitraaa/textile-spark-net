 import { useState } from "react";
 import { DashboardLayout } from "@/components/layout/DashboardLayout";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Badge } from "@/components/ui/badge";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from "@/components/ui/table";
 import {
   Users,
   Package,
   Store,
   Briefcase,
   MessageSquare,
   TrendingUp,
   Search,
   MoreHorizontal,
   CheckCircle,
   XCircle,
   Eye,
   Trash2,
   Edit,
   Ban,
   Shield,
   DollarSign,
   FileText,
   AlertTriangle,
 } from "lucide-react";
 import { motion } from "framer-motion";
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from "@/components/ui/dropdown-menu";
 import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
 } from "@/components/ui/alert-dialog";
 import { toast } from "sonner";
 
 // Mock data for admin dashboard
 const platformStats = [
   { title: "Total Users", value: "12,847", change: "+324 this week", icon: Users },
   { title: "Total Products", value: "45,892", change: "+1,234 this month", icon: Package },
   { title: "Active Vendors", value: "2,156", change: "+89 this week", icon: Store },
   { title: "Revenue (MTD)", value: "₹24.5L", change: "+18% vs last month", icon: DollarSign },
 ];
 
 const mockUsers = [
   { id: "1", name: "Rajesh Kumar", email: "rajesh@textiles.com", role: "Vendor", status: "active", joined: "2024-01-15", products: 45 },
   { id: "2", name: "Priya Sharma", email: "priya@fashionhouse.in", role: "Buyer", status: "active", joined: "2024-02-20", orders: 23 },
   { id: "3", name: "Amit Patel", email: "amit@silkworld.com", role: "Vendor", status: "suspended", joined: "2023-11-10", products: 12 },
   { id: "4", name: "Sneha Reddy", email: "sneha@linenco.in", role: "Buyer", status: "active", joined: "2024-03-05", orders: 8 },
   { id: "5", name: "Vikram Singh", email: "vikram@woolmart.com", role: "Vendor", status: "pending", joined: "2024-03-18", products: 0 },
 ];
 
 const mockProducts = [
   { id: "1", name: "Premium Cotton Fabric", vendor: "Rajesh Textiles", category: "Cotton", status: "approved", price: "₹450/m", views: 2345 },
   { id: "2", name: "Mulberry Silk Roll", vendor: "Silk World", category: "Silk", status: "pending", price: "₹1,200/m", views: 567 },
   { id: "3", name: "Organic Linen", vendor: "Linen Co.", category: "Linen", status: "approved", price: "₹650/m", views: 1890 },
   { id: "4", name: "Designer Wool Blend", vendor: "Wool Mart", category: "Wool", status: "rejected", price: "₹890/m", views: 234 },
   { id: "5", name: "Recycled Polyester", vendor: "Eco Fabrics", category: "Synthetic", status: "pending", price: "₹320/m", views: 456 },
 ];
 
 const mockVendors = [
   { id: "1", name: "Premium Textile Mills", owner: "Rajesh Kumar", products: 45, rating: 4.8, status: "verified", revenue: "₹12.5L" },
   { id: "2", name: "Silk Weavers Co.", owner: "Arjun Mehta", products: 32, rating: 4.9, status: "verified", revenue: "₹8.2L" },
   { id: "3", name: "Linen House", owner: "Priya Nair", products: 28, rating: 4.7, status: "pending", revenue: "₹5.6L" },
   { id: "4", name: "Eco Fabrics Inc", owner: "Vikram Singh", products: 15, rating: 4.2, status: "unverified", revenue: "₹2.1L" },
 ];
 
 const mockFreelancers = [
   { id: "1", name: "Ananya Desai", expertise: "Pattern Making", rate: "₹1,500/hr", projects: 45, rating: 4.9, status: "verified" },
   { id: "2", name: "Karan Malhotra", expertise: "CLO 3D Design", rate: "₹2,000/hr", projects: 32, rating: 4.8, status: "verified" },
   { id: "3", name: "Meera Iyer", expertise: "Tech Packs", rate: "₹1,200/hr", projects: 28, rating: 4.6, status: "pending" },
   { id: "4", name: "Rohan Joshi", expertise: "Sourcing", rate: "₹800/hr", projects: 15, rating: 4.4, status: "unverified" },
 ];
 
 const mockRFQs = [
   { id: "1", buyer: "Fashion Brand X", product: "Organic Cotton 500m", status: "open", quotes: 8, deadline: "2024-03-25" },
   { id: "2", buyer: "Luxury Apparel Co.", product: "Mulberry Silk 200m", status: "closed", quotes: 12, deadline: "2024-03-20" },
   { id: "3", buyer: "Style House", product: "Linen Blend 1000m", status: "open", quotes: 5, deadline: "2024-03-30" },
 ];
 
 const mockReports = [
   { id: "1", type: "Spam", reportedBy: "User123", target: "Product #456", status: "pending", date: "2024-03-18" },
   { id: "2", type: "Fraud", reportedBy: "Vendor789", target: "User #234", status: "investigating", date: "2024-03-17" },
   { id: "3", type: "Quality Issue", reportedBy: "Buyer456", target: "Vendor #789", status: "resolved", date: "2024-03-15" },
 ];
 
 const Admin = () => {
   const [searchQuery, setSearchQuery] = useState("");
   const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; type: string; id: string }>({
     open: false,
     type: "",
     id: "",
   });
 
   const handleAction = (action: string, type: string, id: string) => {
     if (action === "delete") {
       setDeleteDialog({ open: true, type, id });
     } else {
       toast.success(`${action} action performed on ${type} #${id}`);
     }
   };
 
   const confirmDelete = () => {
     toast.success(`${deleteDialog.type} #${deleteDialog.id} has been deleted`);
     setDeleteDialog({ open: false, type: "", id: "" });
   };
 
   const getStatusBadge = (status: string) => {
     const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
       active: { variant: "default", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
       approved: { variant: "default", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
       verified: { variant: "default", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
       pending: { variant: "outline", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
       suspended: { variant: "destructive", className: "bg-red-500/10 text-red-600 border-red-500/20" },
       rejected: { variant: "destructive", className: "bg-red-500/10 text-red-600 border-red-500/20" },
       unverified: { variant: "secondary", className: "bg-muted text-muted-foreground" },
       open: { variant: "default", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
       closed: { variant: "secondary", className: "bg-muted text-muted-foreground" },
       investigating: { variant: "outline", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
       resolved: { variant: "default", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
     };
     const config = variants[status] || { variant: "secondary" as const, className: "" };
     return (
       <Badge variant="outline" className={config.className}>
         {status.charAt(0).toUpperCase() + status.slice(1)}
       </Badge>
     );
   };
 
   return (
     <DashboardLayout>
       <motion.div
         initial={{ opacity: 0, y: -10 }}
         animate={{ opacity: 1, y: 0 }}
         className="mb-6 lg:mb-8"
       >
         <div className="flex items-center gap-3 mb-2">
           <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
             <Shield className="h-5 w-5 text-primary" />
           </div>
           <div>
             <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
               Admin Dashboard
             </h1>
             <p className="text-sm text-muted-foreground">
               Complete platform control and management
             </p>
           </div>
         </div>
       </motion.div>
 
       {/* Platform Stats */}
       <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:mb-8 lg:grid-cols-4 lg:gap-6">
         {platformStats.map((stat, index) => (
           <motion.div
             key={stat.title}
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: index * 0.1 }}
           >
             <Card className="border-border/50">
               <CardContent className="p-4">
                 <div className="flex items-center gap-3">
                   <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                     <stat.icon className="h-5 w-5 text-primary" />
                   </div>
                   <div>
                     <p className="text-xs text-muted-foreground">{stat.title}</p>
                     <p className="text-xl font-bold text-foreground">{stat.value}</p>
                     <p className="text-xs text-emerald-600">{stat.change}</p>
                   </div>
                 </div>
               </CardContent>
             </Card>
           </motion.div>
         ))}
       </div>
 
       {/* Search Bar */}
       <div className="mb-6 relative">
         <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
         <Input
           type="search"
           placeholder="Search users, products, vendors..."
           value={searchQuery}
           onChange={(e) => setSearchQuery(e.target.value)}
           className="pl-10 max-w-md"
         />
       </div>
 
       {/* Tabs for different sections */}
       <Tabs defaultValue="users" className="space-y-6">
         <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 h-auto gap-1 bg-muted/50 p-1">
           <TabsTrigger value="users" className="gap-2 text-xs sm:text-sm">
             <Users className="h-4 w-4" />
             <span className="hidden sm:inline">Users</span>
           </TabsTrigger>
           <TabsTrigger value="products" className="gap-2 text-xs sm:text-sm">
             <Package className="h-4 w-4" />
             <span className="hidden sm:inline">Products</span>
           </TabsTrigger>
           <TabsTrigger value="vendors" className="gap-2 text-xs sm:text-sm">
             <Store className="h-4 w-4" />
             <span className="hidden sm:inline">Vendors</span>
           </TabsTrigger>
           <TabsTrigger value="freelancers" className="gap-2 text-xs sm:text-sm">
             <Briefcase className="h-4 w-4" />
             <span className="hidden sm:inline">Freelancers</span>
           </TabsTrigger>
           <TabsTrigger value="rfqs" className="gap-2 text-xs sm:text-sm">
             <FileText className="h-4 w-4" />
             <span className="hidden sm:inline">RFQs</span>
           </TabsTrigger>
           <TabsTrigger value="reports" className="gap-2 text-xs sm:text-sm">
             <AlertTriangle className="h-4 w-4" />
             <span className="hidden sm:inline">Reports</span>
           </TabsTrigger>
         </TabsList>
 
         {/* Users Tab */}
         <TabsContent value="users">
           <Card>
             <CardHeader className="flex flex-row items-center justify-between">
               <CardTitle className="text-lg">All Users</CardTitle>
               <Badge variant="secondary">{mockUsers.length} users</Badge>
             </CardHeader>
             <CardContent>
               <div className="overflow-x-auto">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Name</TableHead>
                       <TableHead>Email</TableHead>
                       <TableHead>Role</TableHead>
                       <TableHead>Status</TableHead>
                       <TableHead>Joined</TableHead>
                       <TableHead className="text-right">Actions</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {mockUsers.map((user) => (
                       <TableRow key={user.id}>
                         <TableCell className="font-medium">{user.name}</TableCell>
                         <TableCell className="text-muted-foreground">{user.email}</TableCell>
                         <TableCell>
                           <Badge variant="outline">{user.role}</Badge>
                         </TableCell>
                         <TableCell>{getStatusBadge(user.status)}</TableCell>
                         <TableCell className="text-muted-foreground">{user.joined}</TableCell>
                         <TableCell className="text-right">
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon">
                                 <MoreHorizontal className="h-4 w-4" />
                               </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               <DropdownMenuItem onClick={() => handleAction("view", "user", user.id)}>
                                 <Eye className="mr-2 h-4 w-4" /> View Details
                               </DropdownMenuItem>
                               <DropdownMenuItem onClick={() => handleAction("edit", "user", user.id)}>
                                 <Edit className="mr-2 h-4 w-4" /> Edit
                               </DropdownMenuItem>
                               {user.status === "active" ? (
                                 <DropdownMenuItem onClick={() => handleAction("suspend", "user", user.id)}>
                                   <Ban className="mr-2 h-4 w-4" /> Suspend
                                 </DropdownMenuItem>
                               ) : (
                                 <DropdownMenuItem onClick={() => handleAction("activate", "user", user.id)}>
                                   <CheckCircle className="mr-2 h-4 w-4" /> Activate
                                 </DropdownMenuItem>
                               )}
                               <DropdownMenuItem
                                 className="text-red-600"
                                 onClick={() => handleAction("delete", "user", user.id)}
                               >
                                 <Trash2 className="mr-2 h-4 w-4" /> Delete
                               </DropdownMenuItem>
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </div>
             </CardContent>
           </Card>
         </TabsContent>
 
         {/* Products Tab */}
         <TabsContent value="products">
           <Card>
             <CardHeader className="flex flex-row items-center justify-between">
               <CardTitle className="text-lg">All Products</CardTitle>
               <Badge variant="secondary">{mockProducts.length} products</Badge>
             </CardHeader>
             <CardContent>
               <div className="overflow-x-auto">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Product Name</TableHead>
                       <TableHead>Vendor</TableHead>
                       <TableHead>Category</TableHead>
                       <TableHead>Price</TableHead>
                       <TableHead>Status</TableHead>
                       <TableHead className="text-right">Actions</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {mockProducts.map((product) => (
                       <TableRow key={product.id}>
                         <TableCell className="font-medium">{product.name}</TableCell>
                         <TableCell className="text-muted-foreground">{product.vendor}</TableCell>
                         <TableCell>
                           <Badge variant="secondary">{product.category}</Badge>
                         </TableCell>
                         <TableCell>{product.price}</TableCell>
                         <TableCell>{getStatusBadge(product.status)}</TableCell>
                         <TableCell className="text-right">
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon">
                                 <MoreHorizontal className="h-4 w-4" />
                               </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               <DropdownMenuItem onClick={() => handleAction("view", "product", product.id)}>
                                 <Eye className="mr-2 h-4 w-4" /> View
                               </DropdownMenuItem>
                               {product.status === "pending" && (
                                 <>
                                   <DropdownMenuItem onClick={() => handleAction("approve", "product", product.id)}>
                                     <CheckCircle className="mr-2 h-4 w-4" /> Approve
                                   </DropdownMenuItem>
                                   <DropdownMenuItem onClick={() => handleAction("reject", "product", product.id)}>
                                     <XCircle className="mr-2 h-4 w-4" /> Reject
                                   </DropdownMenuItem>
                                 </>
                               )}
                               <DropdownMenuItem
                                 className="text-red-600"
                                 onClick={() => handleAction("delete", "product", product.id)}
                               >
                                 <Trash2 className="mr-2 h-4 w-4" /> Delete
                               </DropdownMenuItem>
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </div>
             </CardContent>
           </Card>
         </TabsContent>
 
         {/* Vendors Tab */}
         <TabsContent value="vendors">
           <Card>
             <CardHeader className="flex flex-row items-center justify-between">
               <CardTitle className="text-lg">All Vendors</CardTitle>
               <Badge variant="secondary">{mockVendors.length} vendors</Badge>
             </CardHeader>
             <CardContent>
               <div className="overflow-x-auto">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Business Name</TableHead>
                       <TableHead>Owner</TableHead>
                       <TableHead>Products</TableHead>
                       <TableHead>Rating</TableHead>
                       <TableHead>Revenue</TableHead>
                       <TableHead>Status</TableHead>
                       <TableHead className="text-right">Actions</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {mockVendors.map((vendor) => (
                       <TableRow key={vendor.id}>
                         <TableCell className="font-medium">{vendor.name}</TableCell>
                         <TableCell className="text-muted-foreground">{vendor.owner}</TableCell>
                         <TableCell>{vendor.products}</TableCell>
                         <TableCell>⭐ {vendor.rating}</TableCell>
                         <TableCell>{vendor.revenue}</TableCell>
                         <TableCell>{getStatusBadge(vendor.status)}</TableCell>
                         <TableCell className="text-right">
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon">
                                 <MoreHorizontal className="h-4 w-4" />
                               </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               <DropdownMenuItem onClick={() => handleAction("view", "vendor", vendor.id)}>
                                 <Eye className="mr-2 h-4 w-4" /> View Details
                               </DropdownMenuItem>
                               {vendor.status !== "verified" && (
                                 <DropdownMenuItem onClick={() => handleAction("verify", "vendor", vendor.id)}>
                                   <CheckCircle className="mr-2 h-4 w-4" /> Verify
                                 </DropdownMenuItem>
                               )}
                               <DropdownMenuItem onClick={() => handleAction("suspend", "vendor", vendor.id)}>
                                 <Ban className="mr-2 h-4 w-4" /> Suspend
                               </DropdownMenuItem>
                               <DropdownMenuItem
                                 className="text-red-600"
                                 onClick={() => handleAction("delete", "vendor", vendor.id)}
                               >
                                 <Trash2 className="mr-2 h-4 w-4" /> Delete
                               </DropdownMenuItem>
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </div>
             </CardContent>
           </Card>
         </TabsContent>
 
         {/* Freelancers Tab */}
         <TabsContent value="freelancers">
           <Card>
             <CardHeader className="flex flex-row items-center justify-between">
               <CardTitle className="text-lg">All Freelancers</CardTitle>
               <Badge variant="secondary">{mockFreelancers.length} freelancers</Badge>
             </CardHeader>
             <CardContent>
               <div className="overflow-x-auto">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Name</TableHead>
                       <TableHead>Expertise</TableHead>
                       <TableHead>Rate</TableHead>
                       <TableHead>Projects</TableHead>
                       <TableHead>Rating</TableHead>
                       <TableHead>Status</TableHead>
                       <TableHead className="text-right">Actions</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {mockFreelancers.map((freelancer) => (
                       <TableRow key={freelancer.id}>
                         <TableCell className="font-medium">{freelancer.name}</TableCell>
                         <TableCell>
                           <Badge variant="secondary">{freelancer.expertise}</Badge>
                         </TableCell>
                         <TableCell>{freelancer.rate}</TableCell>
                         <TableCell>{freelancer.projects}</TableCell>
                         <TableCell>⭐ {freelancer.rating}</TableCell>
                         <TableCell>{getStatusBadge(freelancer.status)}</TableCell>
                         <TableCell className="text-right">
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon">
                                 <MoreHorizontal className="h-4 w-4" />
                               </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               <DropdownMenuItem onClick={() => handleAction("view", "freelancer", freelancer.id)}>
                                 <Eye className="mr-2 h-4 w-4" /> View Profile
                               </DropdownMenuItem>
                               {freelancer.status !== "verified" && (
                                 <DropdownMenuItem onClick={() => handleAction("verify", "freelancer", freelancer.id)}>
                                   <CheckCircle className="mr-2 h-4 w-4" /> Verify
                                 </DropdownMenuItem>
                               )}
                               <DropdownMenuItem onClick={() => handleAction("suspend", "freelancer", freelancer.id)}>
                                 <Ban className="mr-2 h-4 w-4" /> Suspend
                               </DropdownMenuItem>
                               <DropdownMenuItem
                                 className="text-red-600"
                                 onClick={() => handleAction("delete", "freelancer", freelancer.id)}
                               >
                                 <Trash2 className="mr-2 h-4 w-4" /> Delete
                               </DropdownMenuItem>
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </div>
             </CardContent>
           </Card>
         </TabsContent>
 
         {/* RFQs Tab */}
         <TabsContent value="rfqs">
           <Card>
             <CardHeader className="flex flex-row items-center justify-between">
               <CardTitle className="text-lg">All RFQs</CardTitle>
               <Badge variant="secondary">{mockRFQs.length} RFQs</Badge>
             </CardHeader>
             <CardContent>
               <div className="overflow-x-auto">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Buyer</TableHead>
                       <TableHead>Product Request</TableHead>
                       <TableHead>Status</TableHead>
                       <TableHead>Quotes</TableHead>
                       <TableHead>Deadline</TableHead>
                       <TableHead className="text-right">Actions</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {mockRFQs.map((rfq) => (
                       <TableRow key={rfq.id}>
                         <TableCell className="font-medium">{rfq.buyer}</TableCell>
                         <TableCell className="text-muted-foreground">{rfq.product}</TableCell>
                         <TableCell>{getStatusBadge(rfq.status)}</TableCell>
                         <TableCell>{rfq.quotes} quotes</TableCell>
                         <TableCell>{rfq.deadline}</TableCell>
                         <TableCell className="text-right">
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon">
                                 <MoreHorizontal className="h-4 w-4" />
                               </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               <DropdownMenuItem onClick={() => handleAction("view", "RFQ", rfq.id)}>
                                 <Eye className="mr-2 h-4 w-4" /> View Details
                               </DropdownMenuItem>
                               <DropdownMenuItem onClick={() => handleAction("close", "RFQ", rfq.id)}>
                                 <XCircle className="mr-2 h-4 w-4" /> Close RFQ
                               </DropdownMenuItem>
                               <DropdownMenuItem
                                 className="text-red-600"
                                 onClick={() => handleAction("delete", "RFQ", rfq.id)}
                               >
                                 <Trash2 className="mr-2 h-4 w-4" /> Delete
                               </DropdownMenuItem>
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </div>
             </CardContent>
           </Card>
         </TabsContent>
 
         {/* Reports Tab */}
         <TabsContent value="reports">
           <Card>
             <CardHeader className="flex flex-row items-center justify-between">
               <CardTitle className="text-lg">Reports & Issues</CardTitle>
               <Badge variant="secondary">{mockReports.length} reports</Badge>
             </CardHeader>
             <CardContent>
               <div className="overflow-x-auto">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Type</TableHead>
                       <TableHead>Reported By</TableHead>
                       <TableHead>Target</TableHead>
                       <TableHead>Status</TableHead>
                       <TableHead>Date</TableHead>
                       <TableHead className="text-right">Actions</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {mockReports.map((report) => (
                       <TableRow key={report.id}>
                         <TableCell>
                           <Badge variant={report.type === "Fraud" ? "destructive" : "outline"}>
                             {report.type}
                           </Badge>
                         </TableCell>
                         <TableCell className="text-muted-foreground">{report.reportedBy}</TableCell>
                         <TableCell className="font-medium">{report.target}</TableCell>
                         <TableCell>{getStatusBadge(report.status)}</TableCell>
                         <TableCell>{report.date}</TableCell>
                         <TableCell className="text-right">
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon">
                                 <MoreHorizontal className="h-4 w-4" />
                               </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               <DropdownMenuItem onClick={() => handleAction("investigate", "report", report.id)}>
                                 <Eye className="mr-2 h-4 w-4" /> Investigate
                               </DropdownMenuItem>
                               <DropdownMenuItem onClick={() => handleAction("resolve", "report", report.id)}>
                                 <CheckCircle className="mr-2 h-4 w-4" /> Mark Resolved
                               </DropdownMenuItem>
                               <DropdownMenuItem onClick={() => handleAction("dismiss", "report", report.id)}>
                                 <XCircle className="mr-2 h-4 w-4" /> Dismiss
                               </DropdownMenuItem>
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </div>
             </CardContent>
           </Card>
         </TabsContent>
       </Tabs>
 
       {/* Delete Confirmation Dialog */}
       <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Are you sure?</AlertDialogTitle>
             <AlertDialogDescription>
               This will permanently delete this {deleteDialog.type}. This action cannot be undone.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
               Delete
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
     </DashboardLayout>
   );
 };
 
 export default Admin;