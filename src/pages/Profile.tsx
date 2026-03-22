import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SellerQuickActionsGrid } from "@/components/dashboard/SellerQuickActionsGrid";
import { toast } from "sonner";
import {
  Camera, Star, ChevronRight, QrCode, Link2, Download, Share2,
  Globe, Bell, LogOut, Flag, MessageSquare, Shield, FileText,
  CreditCard, Sparkles, Smartphone
} from "lucide-react";

const Profile = () => {
  const navigate = useNavigate();
  const [language, setLanguage] = useState("english");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [currency, setCurrency] = useState("INR");
  const [timezone, setTimezone] = useState("IST");
  const [leadTone, setLeadTone] = useState("default");
  const [qrOpen, setQrOpen] = useState(false);

  const [emailNotifs, setEmailNotifs] = useState({
    newQuote: true, newMessages: true, rfqUpdates: true, newsletter: false,
    pushQuote: true, pushMessages: true,
  });

  const profileCompletion = 62;
  const rating = 4.2;
  const reviewCount = 24;
  const followers = 156;

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: "Cosora", text: "Check out Cosora!", url: window.location.origin });
    } else {
      navigator.clipboard.writeText(window.location.origin);
      toast.success("Link copied!");
    }
  };

  const settingsRows = [
    { label: "Report Fraud", icon: Flag, href: "/report-fraud", destructive: false },
    { label: "App Feedback", icon: MessageSquare, href: "/app-feedback", destructive: false },
    { label: "Share App", icon: Share2, action: handleShare, destructive: false },
    { label: "Privacy Policy", icon: Shield, href: "#", destructive: false },
    { label: "Terms & Conditions", icon: FileText, href: "#", destructive: false },
    { label: "About Us", icon: Sparkles, href: "/about", destructive: false },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-24">
        {/* Profile Summary */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-xl">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center text-2xl font-bold text-accent">
                    RS
                  </div>
                  <button className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-foreground">Rajan Silk House</h2>
                  <p className="text-muted-foreground text-sm">+91 98765 43210</p>
                  <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground flex-wrap">
                    <Star className="w-3.5 h-3.5 text-accent fill-accent" />
                    <span className="font-medium text-foreground">{rating}</span>
                    <span>•</span>
                    <span>{reviewCount} Reviews</span>
                    <span>•</span>
                    <span>{followers} Followers</span>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-muted-foreground">Profile Completion</span>
                  <span className="text-sm font-semibold text-accent">{profileCompletion}%</span>
                </div>
                <Progress value={profileCompletion} className="h-2 [&>div]:bg-accent" />
                <p className="text-sm text-muted-foreground mt-2">
                  Complete your profile to get verified and attract more buyers
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <SellerQuickActionsGrid />
        </motion.div>

        {/* Business Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="rounded-xl">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-base">Business</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {[
                { label: "Add New Business Category", href: "#" },
                { label: "Shortlisted Leads", href: "/leads", badge: "5" },
                { label: "Quotation Page", href: "/quotes" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.href)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{item.label}</span>
                    {item.badge && (
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">{item.badge}</Badge>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Subscription */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="rounded-xl">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-base">Subscription</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <button onClick={() => navigate("/subscription")} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Free Plan</span>
                  <Badge className="bg-green-500/10 text-green-600 text-xs border-green-500/20">Active</Badge>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50">
                <span className="text-sm">Payment History</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Reviews */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="rounded-xl">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-base">Reviews</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4].map((i) => (
                      <Star key={i} className="w-4 h-4 text-accent fill-accent" />
                    ))}
                    <Star className="w-4 h-4 text-accent" />
                  </div>
                  <span className="text-sm text-muted-foreground">{reviewCount} reviews</span>
                </div>
                <Dialog open={qrOpen} onOpenChange={setQrOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs gap-1">
                      <QrCode className="w-3.5 h-3.5" /> Share QR Code
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="text-center">Rate My Business</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center py-4">
                      <div className="w-48 h-48 bg-white rounded-xl border flex items-center justify-center">
                        <QrCode className="w-24 h-24 text-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-3 text-center">
                        Scan to leave a review for Rajan Silk House
                      </p>
                      <div className="grid grid-cols-3 gap-2 mt-4 w-full">
                        <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied!"); }}>
                          <Link2 className="w-3 h-3" /> Copy Link
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs gap-1">
                          <Download className="w-3 h-3" /> Download
                        </Button>
                        <Button size="sm" className="text-xs gap-1 bg-accent text-accent-foreground">
                          <Share2 className="w-3 h-3" /> Share
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* App Settings */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="rounded-xl">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-base">App Settings</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3 space-y-4">
              {/* Language */}
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Language</label>
                <div className="flex gap-2">
                  {["english", "hindi"].map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`rounded-full px-4 py-1.5 text-sm capitalize transition-colors ${
                        language === lang
                          ? "bg-accent/10 text-accent border border-accent/30"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lead Tone */}
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Lead Notification Tone</label>
                <Select value={leadTone} onValueChange={setLeadTone}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["default", "chime", "bell", "ping", "alert", "silent"].map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notifications Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm">Notifications</span>
                <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
              </div>

              {/* Test Now */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Are you not receiving notifications?</span>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => toast.info("Test notification sent!")}>
                  <Smartphone className="w-3 h-3 mr-1" /> Test Now
                </Button>
              </div>

              {/* Currency */}
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Default Currency</label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["INR", "USD", "EUR", "GBP"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Timezone */}
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Timezone</label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IST">IST (India Standard Time)</SelectItem>
                    <SelectItem value="EST">EST (Eastern Standard)</SelectItem>
                    <SelectItem value="PST">PST (Pacific Standard)</SelectItem>
                    <SelectItem value="GMT">GMT (Greenwich Mean)</SelectItem>
                    <SelectItem value="CET">CET (Central European)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Other Settings */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="rounded-xl">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-base">Other Settings</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {settingsRows.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => item.action ? item.action() : navigate(item.href!)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{item.label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                );
              })}
              <button
                onClick={() => { toast.success("Logged out"); navigate("/"); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-destructive/5 transition-colors"
              >
                <LogOut className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive font-medium">Log Out</span>
              </button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Email Notifications */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="rounded-xl">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-base">Email Notifications</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3 space-y-3">
              {[
                { key: "newQuote" as const, label: "New Quote Received" },
                { key: "newMessages" as const, label: "New Messages" },
                { key: "rfqUpdates" as const, label: "RFQ Updates" },
                { key: "newsletter" as const, label: "Newsletter & Tips" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <span className="text-sm">{item.label}</span>
                  <Switch
                    checked={emailNotifs[item.key]}
                    onCheckedChange={(v) => setEmailNotifs({ ...emailNotifs, [item.key]: v })}
                  />
                </div>
              ))}
              <div className="h-px bg-border my-2" />
              <p className="text-xs text-muted-foreground font-medium">Push Notifications</p>
              {[
                { key: "pushQuote" as const, label: "Quote Notifications" },
                { key: "pushMessages" as const, label: "Message Alerts" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <span className="text-sm">{item.label}</span>
                  <Switch
                    checked={emailNotifs[item.key]}
                    onCheckedChange={(v) => setEmailNotifs({ ...emailNotifs, [item.key]: v })}
                  />
                </div>
              ))}
              <Button
                className="w-full bg-accent text-accent-foreground mt-2"
                onClick={() => toast.success("Notification settings saved!")}
              >
                Save Notification Settings
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
