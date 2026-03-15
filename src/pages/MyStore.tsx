import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Megaphone, Building2, Package, HelpCircle, ChevronRight,
  Star, QrCode, Link as LinkIcon, Download, Share2,
  Camera, Flag, MessageSquare, FileText, Info, LogOut,
  Bell, MapPin, CreditCard,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Circle } from "lucide-react";

const fadeIn = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay, ease: "easeOut" as const },
});

const profileChecklist = [
  { label: "Add Email", done: true, href: "/my-store" },
  { label: "Add Website", done: false, href: "/my-store" },
  { label: "Add Social Links", done: false, href: "/my-store" },
  { label: "Upload Catalogue", done: false, href: "/upload" },
  { label: "Add Profile Photo", done: true, href: "/my-store" },
  { label: "Get First Review", done: false, href: "/my-store" },
];

const categories = [
  "Cotton Fabrics", "Silk Fabrics", "Polyester", "Denim", "Linen",
  "Wool", "Chiffon", "Georgette", "Velvet", "Satin",
  "Knitted Fabrics", "Embroidered", "Printed Fabrics", "Home Textiles",
];

const MyStore = () => {
  const navigate = useNavigate();
  const { setRole } = useUserRole();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedCategories, setSelectedCategories] = useState<string[]>([ "Cotton Fabrics", "Silk Fabrics"]);
  const [language, setLanguage] = useState("English");
  const [notifications, setNotifications] = useState(true);
  const [currency, setCurrency] = useState("INR");
  const [timezone, setTimezone] = useState("IST");
  const [notifTone, setNotifTone] = useState("default");

  // Email notification states
  const [emailNewQuote, setEmailNewQuote] = useState(true);
  const [emailMessages, setEmailMessages] = useState(true);
  const [emailRfq, setEmailRfq] = useState(true);
  const [emailNewsletter, setEmailNewsletter] = useState(false);
  const [pushQuote, setPushQuote] = useState(true);
  const [pushMessage, setPushMessage] = useState(true);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Cosora", text: "Check out Cosora!", url: window.location.origin });
      } catch { }
    } else {
      await navigator.clipboard.writeText(window.location.origin);
      toast({ title: "Link copied to clipboard" });
    }
  };

  const handleLogout = () => {
    setRole("buyer");
    navigate("/");
  };

  const rating = 4.2;
  const starsCount = 5;

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-24 lg:pb-8">
        {/* Profile Summary */}
        <motion.div {...fadeIn(0)} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center text-2xl font-bold text-accent">
                RK
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-accent text-accent-foreground rounded-full w-6 h-6 flex items-center justify-center"
              >
                <Camera className="w-3 h-3" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-foreground">Rajesh Textiles</h2>
              <p className="text-sm text-muted-foreground">+91 98765 43210</p>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span>4.2 ⭐</span>
                <span className="text-muted-foreground">·</span>
                <span>24 Reviews</span>
                <span className="text-muted-foreground">·</span>
                <span>1.2k Followers</span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Dialog>
              <DialogTrigger asChild>
                <div className="cursor-pointer">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-foreground">Profile Score</span>
                    <span className="text-sm font-bold text-accent">45%</span>
                  </div>
                  <Progress value={45} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Complete your profile to get verified and attract more buyers
                  </p>
                </div>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-display">Complete Your Profile</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 mt-2">
                  {profileChecklist.map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {item.done ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <Circle className="w-5 h-5 text-muted-foreground" />
                        )}
                        <span className="text-sm text-foreground">{item.label}</span>
                      </div>
                      {!item.done && (
                        <Button variant="link" size="sm" className="text-accent text-xs p-0 h-auto" onClick={() => navigate(item.href)}>
                          Add Now
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div {...fadeIn(0.05)} className="grid grid-cols-4 gap-3">
          {[
            { name: "Advertise", icon: Megaphone, color: "bg-purple-500/10 text-purple-600", href: "/advertisements" },
            { name: "My Profile", icon: Building2, color: "bg-blue-500/10 text-blue-600", href: "/my-store" },
            { name: "My Products", icon: Package, color: "bg-emerald-500/10 text-emerald-600", href: "/products" },
            { name: "Help", icon: HelpCircle, color: "bg-indigo-500/10 text-indigo-600", href: "/help" },
          ].map((action) => (
            <button
              key={action.name}
              onClick={() => navigate(action.href)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${action.color}`}>
                <action.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-foreground">{action.name}</span>
            </button>
          ))}
        </motion.div>

        {/* Advertise Banner */}
        <motion.div {...fadeIn(0.1)} className="rounded-xl bg-gradient-to-r from-accent to-accent/80 p-4 text-accent-foreground">
          <p className="font-semibold">Boost your visibility today</p>
          <p className="text-sm text-accent-foreground/80 mt-0.5">Advertise & Grow your Business</p>
          <Button
            size="sm"
            className="mt-2 bg-accent-foreground text-accent text-xs rounded-full px-3 py-1 h-auto hover:bg-accent-foreground/90"
            onClick={() => navigate("/advertisements")}
          >
            Advertise Now
          </Button>
        </motion.div>

        {/* Business Section */}
        <motion.div {...fadeIn(0.15)} className="rounded-xl border border-border bg-card">
          <div className="px-4 pt-4 pb-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Business</h3>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <button className="flex justify-between items-center w-full px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors">
                <span className="text-sm text-foreground">Add New Business Category</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle className="font-display">Select Categories</SheetTitle>
              </SheetHeader>
              <div className="flex flex-wrap gap-2 mt-4 pb-4">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      selectedCategories.includes(cat)
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-card text-foreground border-border hover:bg-muted/50"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <button onClick={() => navigate("/leads")} className="flex justify-between items-center w-full px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors">
            <span className="text-sm text-foreground">Shortlisted Leads</span>
            <div className="flex items-center gap-2">
              <Badge className="bg-accent text-accent-foreground text-xs">12</Badge>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </button>

          <button onClick={() => navigate("/quotes")} className="flex justify-between items-center w-full px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors">
            <span className="text-sm text-foreground">Quotation Page</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>

          <button onClick={() => navigate("/chat")} className="flex justify-between items-center w-full px-4 py-3 hover:bg-muted/30 transition-colors">
            <span className="text-sm text-foreground">Customer Chats</span>
            <div className="flex items-center gap-2">
              <Badge className="bg-accent text-accent-foreground text-xs">3</Badge>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </button>
        </motion.div>

        {/* Subscription Section */}
        <motion.div {...fadeIn(0.2)} className="rounded-xl border border-border bg-card">
          <button onClick={() => navigate("/subscription")} className="flex justify-between items-center w-full px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Silver Plan</span>
              <span className="bg-green-500/10 text-green-600 text-xs rounded-full px-2 py-0.5">Active</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <button className="flex justify-between items-center w-full px-4 py-3 hover:bg-muted/30 transition-colors">
            <span className="text-sm text-foreground">Payment History</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </motion.div>

        {/* Reviews Section */}
        <motion.div {...fadeIn(0.25)} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-foreground">{rating}</span>
              <div>
                <div className="flex gap-0.5">
                  {Array.from({ length: starsCount }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${i < Math.floor(rating) ? "text-accent fill-accent" : "text-muted-foreground"}`}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">24 reviews</span>
              </div>
            </div>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full gap-2">
                <QrCode className="w-4 h-4" /> Share QR Code
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Your Review QR Code</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center py-4 space-y-4">
                <div className="w-48 h-48 bg-muted rounded-xl flex items-center justify-center">
                  <QrCode className="w-16 h-16 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">Rajesh Textiles</p>
                  <p className="text-sm text-muted-foreground">Surat, Gujarat</p>
                </div>
                <div className="w-full space-y-2">
                  <Button variant="outline" className="w-full gap-2" onClick={() => { navigator.clipboard.writeText(window.location.origin + "/my-store"); toast({ title: "Link copied!" }); }}>
                    <LinkIcon className="w-4 h-4" /> Copy Link
                  </Button>
                  <Button variant="outline" className="w-full gap-2">
                    <Download className="w-4 h-4" /> Download QR
                  </Button>
                  <Button className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleShare}>
                    <Share2 className="w-4 h-4" /> Share QR Code
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>

        {/* App Settings */}
        <motion.div {...fadeIn(0.3)} className="rounded-xl border border-border bg-card">
          <div className="px-4 pt-4 pb-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">App Settings</h3>
          </div>

          {/* Language */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-border">
            <span className="text-sm text-foreground">Language</span>
            <div className="flex rounded-full border border-border overflow-hidden">
              {["English", "Hindi"].map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`text-xs px-3 py-1 transition-colors ${
                    language === lang ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Lead Notification Tone */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-border">
            <span className="text-sm text-foreground">Lead Notification Tone</span>
            <Select value={notifTone} onValueChange={setNotifTone}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Tone</SelectItem>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={`tone${n}`}>Tone {n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notifications */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-border">
            <span className="text-sm text-foreground">Notifications</span>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </div>

          {/* Test Now */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-border">
            <span className="text-xs text-muted-foreground">Not receiving notifications?</span>
            <Button variant="outline" size="sm" className="text-xs px-3 py-1 h-auto">
              Test Now
            </Button>
          </div>

          {/* Default Currency */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-border">
            <span className="text-sm text-foreground">Default Currency</span>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">INR ₹</SelectItem>
                <SelectItem value="USD">USD $</SelectItem>
                <SelectItem value="EUR">EUR €</SelectItem>
                <SelectItem value="GBP">GBP £</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Timezone */}
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-foreground">Timezone</span>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IST">IST</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="EST">EST</SelectItem>
                <SelectItem value="PST">PST</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.div>

        {/* Other Settings */}
        <motion.div {...fadeIn(0.35)} className="rounded-xl border border-border bg-card">
          <div className="px-4 pt-4 pb-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Other</h3>
          </div>

          {[
            { label: "Report Fraud", icon: Flag, className: "text-destructive", href: "/report-fraud" },
            { label: "App Feedback", icon: MessageSquare, href: "/app-feedback" },
            { label: "Share App", icon: Share2, className: "text-accent", action: handleShare },
            { label: "Privacy Policy", icon: FileText },
            { label: "Terms & Conditions", icon: FileText },
            { label: "About Us", icon: Info, href: "/about" },
          ].map((item, i, arr) => (
            <button
              key={item.label}
              onClick={() => item.action ? item.action() : item.href ? navigate(item.href) : null}
              className={`flex justify-between items-center w-full px-4 py-3 hover:bg-muted/30 transition-colors ${
                i < arr.length ? "border-b border-border" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-4 h-4 ${item.className || "text-muted-foreground"}`} />
                <span className={`text-sm ${item.className || "text-foreground"}`}>{item.label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex justify-between items-center w-full px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <LogOut className="w-4 h-4 text-destructive" />
                  <span className="text-sm text-destructive">Log Out</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
                <AlertDialogDescription>You'll need to sign in again to access your store.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Log Out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </motion.div>

        {/* Email Notifications */}
        <motion.div {...fadeIn(0.4)} className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">Email Notifications</h3>

          <div className="space-y-3">
            {[
              { label: "New Quote Received", state: emailNewQuote, setter: setEmailNewQuote },
              { label: "New Messages", state: emailMessages, setter: setEmailMessages },
              { label: "RFQ Updates", state: emailRfq, setter: setEmailRfq },
              { label: "Newsletter & Tips", state: emailNewsletter, setter: setEmailNewsletter },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-sm text-foreground">{item.label}</span>
                <Switch checked={item.state} onCheckedChange={item.setter} />
              </div>
            ))}
          </div>

          <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mt-4 mb-3">Push Notifications</h4>
          <div className="space-y-3">
            {[
              { label: "Quote Notifications", state: pushQuote, setter: setPushQuote },
              { label: "Message Alerts", state: pushMessage, setter: setPushMessage },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-sm text-foreground">{item.label}</span>
                <Switch checked={item.state} onCheckedChange={item.setter} />
              </div>
            ))}
          </div>

          <Button
            className="w-full mt-4 bg-accent text-accent-foreground h-11 hover:bg-accent/90"
            onClick={() => toast({ title: "Settings saved", description: "Your notification preferences have been updated." })}
          >
            Save Notification Settings
          </Button>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default MyStore;
