import { useState } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Camera, Star, QrCode, ChevronRight, Building2, Megaphone,
  Package, HelpCircle, MessageSquare, FileText, Bell,
  Flag, Share2, LogOut, Info, Link2, Download, CheckCircle2,
  AlertTriangle, ArrowLeftRight
} from "lucide-react";

const sectionVariant = (delay: number) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay } });

const completionItems = [
  { done: true, label: "Profile Photo Added" },
  { done: true, label: "Business Name Added" },
  { done: false, label: "Add Email Address" },
  { done: false, label: "Add Website" },
  { done: false, label: "Upload Catalogue" },
  { done: false, label: "Get First Review" },
];

const categoryItems = ["Fabrics", "Knitwear", "Denim", "Trims", "Packaging", "Printing", "Embroidery", "Dyeing", "Finishing", "Export", "Wholesale", "Retail"];

const MyStore = () => {
  const [completionOpen, setCompletionOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [lang, setLang] = useState("English");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["Knitwear"]);
  const navigate = useNavigate();

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-6">
        <motion.div {...sectionVariant(0.05)}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center text-2xl font-bold text-accent select-none">KT</div>
                  <button className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-md hover:bg-accent/90 transition-colors" type="button">
                    <Camera className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-bold font-display text-foreground truncate">Kumar Textiles Pvt Ltd</p>
                  <p className="text-sm text-muted-foreground mt-0.5">+91 98765 43210</p>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-sm font-semibold">4.2</span>
                    <span className="text-muted-foreground mx-1">·</span>
                    <span className="text-sm text-muted-foreground">24 Reviews</span>
                    <span className="text-muted-foreground mx-1">·</span>
                    <span className="text-sm text-muted-foreground">1.2k Followers</span>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Profile Score</span>
                  <span className="text-sm font-bold text-accent">45%</span>
                </div>
                <Progress value={45} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1.5 hover:underline cursor-pointer underline-offset-2" onClick={() => setCompletionOpen(true)}>
                  Complete your profile to get verified and attract more buyers →
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...sectionVariant(0.1)}>
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { icon: Megaphone, label: "Advertise", href: "/advertisements", color: "text-purple-600", bg: "bg-purple-100" },
                  { icon: Building2, label: "My Profile", href: "/my-store", color: "text-blue-600", bg: "bg-blue-100" },
                  { icon: Package, label: "Products", href: "/products", color: "text-emerald-600", bg: "bg-emerald-100" },
                  { icon: HelpCircle, label: "Help", href: "/help", color: "text-indigo-600", bg: "bg-indigo-100" },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link key={item.label} to={item.href} className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-muted/50 transition-colors">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${item.bg}`}>
                        <Icon className={`h-5 w-5 ${item.color}`} />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground text-center leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...sectionVariant(0.15)}>
          <Link to="/advertisements" className="block">
            <div className="rounded-xl bg-gradient-to-r from-accent to-accent/80 p-4 flex items-center justify-between overflow-hidden relative">
              <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full border-2 border-white/10 pointer-events-none" />
              <div className="absolute right-10 bottom-0 w-14 h-14 rounded-full border border-white/10 pointer-events-none" />
              <div>
                <p className="text-sm font-semibold text-accent-foreground">Boost Your Business Visibility</p>
                <p className="text-xs text-accent-foreground/70 mt-0.5">Reach more buyers today</p>
              </div>
              <div className="bg-accent-foreground text-accent text-xs rounded-full px-3 h-7 flex items-center font-medium flex-shrink-0 ml-4 hover:bg-accent-foreground/90 transition-colors">Advertise Now</div>
            </div>
          </Link>
        </motion.div>

        <motion.div {...sectionVariant(0.2)}>
          <Card className="overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setCategoryOpen(true)}>
              <span className="text-sm font-medium text-foreground">Add New Business Category</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <Link to="/leads" className="flex justify-between items-center px-4 py-3 border-t border-border hover:bg-muted/30 transition-colors cursor-pointer">
              <span className="text-sm font-medium text-foreground">Shortlisted Leads</span>
              <div className="flex items-center gap-2">
                <Badge className="bg-accent text-accent-foreground text-[10px] h-5 px-1.5 rounded-full">8</Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link to="/quotes" className="flex justify-between items-center px-4 py-3 border-t border-border hover:bg-muted/30 transition-colors cursor-pointer">
              <span className="text-sm font-medium text-foreground">Quotation Page</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
            <Link to="/chat" className="flex justify-between items-center px-4 py-3 border-t border-border hover:bg-muted/30 transition-colors cursor-pointer">
              <span className="text-sm font-medium text-foreground">Customer Chats</span>
              <div className="flex items-center gap-2">
                <Badge className="bg-accent text-accent-foreground text-[10px] h-5 px-1.5 rounded-full">3</Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          </Card>
        </motion.div>

        <motion.div {...sectionVariant(0.25)}>
          <Card className="overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscription</span>
            </div>
            <Link to="/subscription" className="flex justify-between items-center px-4 py-3 border-t border-border hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Silver Plan</span>
                <Badge className="bg-green-500/10 text-green-600 border border-green-500/20 text-[10px] rounded-full px-2">Active</Badge>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border hover:bg-muted/30 transition-colors cursor-pointer">
              <span className="text-sm font-medium text-foreground">Payment History</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Card>
        </motion.div>

        <motion.div {...sectionVariant(0.3)}>
          <Card className="overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reviews</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold font-display text-foreground">4.2</span>
                <div>
                  <div className="flex gap-0.5">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <Star className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">24 reviews</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setQrOpen(true)}>
                <QrCode className="h-3.5 w-3.5" />
                Share QR
              </Button>
            </div>
          </Card>
        </motion.div>

        <motion.div {...sectionVariant(0.35)}>
          <Card className="overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">App Settings</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <span className="text-sm font-medium">Language</span>
              <div className="flex gap-0.5 bg-muted p-0.5 rounded-full">
                {[
                  "English",
                  "Hindi",
                ].map((item) => (
                  <button key={item} className={`text-xs px-3 py-1 rounded-full transition-all ${lang === item ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setLang(item)} type="button">
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <span className="text-sm font-medium">Lead Notification Tone</span>
              <Select defaultValue="default">
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Tone</SelectItem>
                  <SelectItem value="1">Tone 1</SelectItem>
                  <SelectItem value="2">Tone 2</SelectItem>
                  <SelectItem value="3">Tone 3</SelectItem>
                  <SelectItem value="4">Tone 4</SelectItem>
                  <SelectItem value="5">Tone 5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <div>
                <p className="text-sm font-medium">Notifications</p>
                <p className="text-xs text-muted-foreground">Get all app alerts</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">Not receiving notifications?</span>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.info("Test notification sent! 🔔")}>
                Test Now
              </Button>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <span className="text-sm font-medium">Default Currency</span>
              <Select defaultValue="inr">
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inr">INR ₹</SelectItem>
                  <SelectItem value="usd">USD $</SelectItem>
                  <SelectItem value="eur">EUR €</SelectItem>
                  <SelectItem value="gbp">GBP £</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <span className="text-sm font-medium">Timezone</span>
              <Select defaultValue="ist">
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ist">IST (India)</SelectItem>
                  <SelectItem value="est">EST</SelectItem>
                  <SelectItem value="pst">PST</SelectItem>
                  <SelectItem value="gmt">GMT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>
        </motion.div>

        <motion.div {...sectionVariant(0.4)}>
          <Card className="overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other</span>
            </div>
            {[
              { icon: Flag, label: "Report Fraud", href: "/report-fraud", color: "text-destructive" },
              { icon: MessageSquare, label: "App Feedback", href: "/app-feedback", color: "text-foreground" },
              { icon: Share2, label: "Share App", href: null, color: "text-accent" },
              { icon: FileText, label: "Privacy Policy", href: null, color: "text-foreground" },
              { icon: FileText, label: "Terms & Conditions", href: null, color: "text-foreground" },
              { icon: Info, label: "About Us", href: "/about", color: "text-foreground" },
            ].map((item) => {
              const Icon = item.icon;

              if (item.href) {
                return (
                  <Link key={item.label} to={item.href} className="flex items-center gap-3 px-4 py-3 border-t border-border hover:bg-muted/30 transition-colors cursor-pointer">
                    <Icon className={`h-4 w-4 ${item.color} flex-shrink-0`} />
                    <span className={`text-sm font-medium ${item.color}`}>{item.label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </Link>
                );
              }

              if (item.label === "Share App") {
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 px-4 py-3 border-t border-border hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={async () => {
                      try {
                        if (navigator.share) {
                          await navigator.share({ title: "Cosora", url: "https://cosora.in" });
                        } else {
                          throw new Error("Share unavailable");
                        }
                      } catch {
                        toast.success("Link copied!");
                      }
                    }}
                  >
                    <Icon className={`h-4 w-4 ${item.color} flex-shrink-0`} />
                    <span className={`text-sm font-medium ${item.color}`}>{item.label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </div>
                );
              }

              return (
                <div key={item.label} className="flex items-center gap-3 px-4 py-3 border-t border-border hover:bg-muted/30 transition-colors cursor-pointer">
                  <Icon className={`h-4 w-4 ${item.color} flex-shrink-0`} />
                  <span className={`text-sm font-medium ${item.color}`}>{item.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                </div>
              );
            })}
            <div className="flex items-center gap-3 px-4 py-3 border-t border-border hover:bg-destructive/5 transition-colors cursor-pointer" onClick={() => setLogoutOpen(true)}>
              <LogOut className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">Log Out</span>
            </div>
          </Card>
        </motion.div>

        <motion.div {...sectionVariant(0.45)}>
          <Card className="overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notifications</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <span className="text-sm font-medium">New Quote Received</span>
              <Switch defaultChecked />
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <span className="text-sm font-medium">New Messages</span>
              <Switch defaultChecked />
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <span className="text-sm font-medium">RFQ Updates</span>
              <Switch defaultChecked />
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <span className="text-sm font-medium">Newsletter & Tips</span>
              <Switch />
            </div>
            <div className="px-4 pt-3 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Push Notifications</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <span className="text-sm font-medium">Quote Notifications</span>
              <Switch defaultChecked />
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
              <span className="text-sm font-medium">Message Alerts</span>
              <Switch defaultChecked />
            </div>
            <div className="px-4 pb-4 pt-2">
              <Button className="w-full bg-accent text-accent-foreground h-11 hover:bg-accent/90 font-medium" onClick={() => toast.success("Notification settings saved!")}>
                Save Notification Settings
              </Button>
            </div>
          </Card>
        </motion.div>

        <Dialog open={completionOpen} onOpenChange={setCompletionOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Complete Your Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-0 mt-2">
              {completionItems.map((item) => (
                <div key={item.label} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                  {item.done ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  {!item.done ? <span className="text-xs text-accent font-medium cursor-pointer hover:underline">Add Now</span> : null}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={qrOpen} onOpenChange={setQrOpen}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Your Review QR Code</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-3">
              <div className="w-48 h-48 bg-muted rounded-2xl border-2 border-border flex items-center justify-center">
                <QrCode className="h-20 w-20 text-foreground" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Kumar Textiles Pvt Ltd</p>
                <p className="text-sm text-muted-foreground">Surat, Gujarat</p>
              </div>
            </div>
            <div className="grid gap-2 mt-1">
              <Button variant="outline" className="w-full h-10 gap-2" onClick={() => { navigator.clipboard.writeText(window.location.origin + "/my-store"); toast.success("Review link copied!"); }}>
                <Link2 className="h-4 w-4" />
                Copy Review Link
              </Button>
              <Button variant="outline" className="w-full h-10 gap-2" onClick={() => toast.success("QR code downloaded!")}>
                <Download className="h-4 w-4" />
                Download QR Code
              </Button>
              <Button className="w-full h-10 gap-2 bg-accent text-accent-foreground hover:bg-accent/90" onClick={async () => {
                try {
                  if (navigator.share) {
                    await navigator.share({ title: "Cosora", url: window.location.origin + "/my-store" });
                  } else {
                    throw new Error("Share unavailable");
                  }
                } catch {
                  toast.success("QR code share ready!");
                }
              }}>
                <Share2 className="h-4 w-4" />
                Share QR Code
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Log Out</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground text-center py-2">Are you sure you want to log out of your Cosora account?</p>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" className="flex-1" onClick={() => setLogoutOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setLogoutOpen(false); navigate("/"); }}>
                Log Out
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Sheet open={categoryOpen} onOpenChange={setCategoryOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh]">
            <SheetHeader>
              <SheetTitle>Add Business Category</SheetTitle>
            </SheetHeader>
            <p className="text-sm text-muted-foreground mb-4">Select all categories that apply to your business</p>
            <div className="grid grid-cols-3 gap-2">
              {categoryItems.map((cat) => (
                <button
                  key={cat}
                  className={`p-3 rounded-xl border text-xs font-medium transition-all ${selectedCategories.includes(cat) ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:border-accent/50"}`}
                  onClick={() => toggleCategory(cat)}
                  type="button"
                >
                  {cat}
                </button>
              ))}
            </div>
            <Button className="w-full mt-4 bg-accent text-accent-foreground h-11 hover:bg-accent/90" onClick={() => { toast.success("Categories updated!"); setCategoryOpen(false); }}>
              Save Categories
            </Button>
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
};

export default MyStore;