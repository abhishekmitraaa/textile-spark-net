import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Zap,
  FileText,
  ArrowLeft,
  Camera,
  X,
  Check,
  ChevronRight,
  Clock,
  Users,
  MessageSquare,
  Mic,
  MicOff,
  Plus,
  Image as ImageIcon,
  Video,
  FileUp,
} from "lucide-react";

// Categories with circular images
const categories = [
  { id: "shirts", name: "Shirts", image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=200" },
  { id: "tshirts", name: "T-Shirts", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200" },
  { id: "pants", name: "Pants", image: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=200" },
  { id: "dresses", name: "Dresses", image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=200" },
  { id: "suits", name: "Suits", image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=200" },
  { id: "knitwear", name: "Knitwear", image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200" },
  { id: "activewear", name: "Activewear", image: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=200" },
  { id: "jackets", name: "Jackets", image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=200" },
  { id: "lingerie", name: "Lingerie", image: "https://images.unsplash.com/photo-1617331721458-bd3bd3f9c7f8?w=200" },
  { id: "swimwear", name: "Swimwear", image: "https://images.unsplash.com/photo-1570976447640-ac859083963f?w=200" },
  { id: "ethnic", name: "Ethnic Wear", image: "https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=200" },
  { id: "fabric", name: "Raw Fabric", image: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=200" },
];

const subCategories: Record<string, string[]> = {
  shirts: ["Formal Shirts", "Casual Shirts", "Oxford Shirts", "Linen Shirts", "Denim Shirts"],
  tshirts: ["Round Neck", "V-Neck", "Polo", "Henley", "Oversized"],
  pants: ["Chinos", "Trousers", "Jeans", "Joggers", "Cargo"],
  dresses: ["Maxi Dress", "Mini Dress", "Cocktail Dress", "Evening Gown", "Sundress"],
  suits: ["Two-Piece", "Three-Piece", "Blazer Only", "Vest Only"],
  knitwear: ["Sweaters", "Cardigans", "Pullovers", "Hoodies"],
  activewear: ["Leggings", "Sports Bra", "Track Pants", "Gym Shorts"],
  jackets: ["Bomber", "Leather", "Denim", "Puffer", "Blazer"],
  lingerie: ["Bras", "Panties", "Sleepwear", "Loungewear"],
  swimwear: ["Bikini", "One-Piece", "Swim Shorts", "Cover-ups"],
  ethnic: ["Kurta", "Saree", "Lehenga", "Sherwani"],
  fabric: ["Cotton", "Silk", "Linen", "Denim", "Polyester", "Blend"],
};

// Mock quote requests data
const myQuoteRequests = [
  { id: 1, title: "Cotton T-Shirts - Round Neck", status: "active", quotes: 5, date: "2 days ago" },
  { id: 2, title: "Denim Jeans - Slim Fit", status: "pending", quotes: 0, date: "5 days ago" },
  { id: 3, title: "Formal Shirts - White", status: "completed", quotes: 8, date: "1 week ago" },
];

type ViewState = "main" | "quickRfq" | "selectCategory" | "requirementForm" | "success";
type QuoteTab = "all" | "active" | "pending" | "completed";

const PostRequirement = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [viewState, setViewState] = useState<ViewState>("main");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeQuoteTab, setActiveQuoteTab] = useState<QuoteTab>("all");
  const [isRecording, setIsRecording] = useState(false);
  
  // Quick RFQ State
  const [quickImage, setQuickImage] = useState<File | null>(null);
  const [quickQuantity, setQuickQuantity] = useState("");
  const [quickDescription, setQuickDescription] = useState("");
  
  // Create Requirement State
  const [formData, setFormData] = useState({
    subCategory: "",
    quantity: "",
    priceMin: "",
    priceMax: "",
    description: "",
    files: [] as File[],
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (viewState === "quickRfq") {
        setQuickImage(newFiles[0]);
      } else {
        setFormData(prev => ({
          ...prev,
          files: [...prev.files, ...newFiles].slice(0, 5)
        }));
      }
    }
  };

  const removeFile = (index: number) => {
    setFormData(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index)
    }));
  };

  const toggleVoiceRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      toast.success("Voice recording stopped");
    } else {
      setIsRecording(true);
      toast.info("Voice recording started... Speak now");
      setTimeout(() => {
        if (viewState === "quickRfq") {
          setQuickDescription(prev => prev + " Looking for premium quality fabric with good finishing.");
        } else {
          setFormData(prev => ({
            ...prev,
            description: prev.description + " Looking for premium quality fabric with good finishing."
          }));
        }
        setIsRecording(false);
        toast.success("Voice converted to text");
      }, 3000);
    }
  };

  const handleQuickSubmit = () => {
    if (!quickImage || !quickQuantity) {
      toast.error("Please add an image and quantity");
      return;
    }
    toast.success("Quick RFQ submitted!");
    setViewState("success");
  };

  const handleFullSubmit = () => {
    if (!selectedCategory || !formData.quantity) {
      toast.error("Please select a category and enter quantity");
      return;
    }
    toast.success("Requirement submitted successfully!");
    setViewState("success");
  };

  const handleCategorySelect = (catId: string) => {
    setSelectedCategory(catId);
    setViewState("requirementForm");
  };

  const resetForm = () => {
    setSelectedCategory(null);
    setQuickImage(null);
    setQuickQuantity("");
    setQuickDescription("");
    setFormData({
      subCategory: "",
      quantity: "",
      priceMin: "",
      priceMax: "",
      description: "",
      files: [],
    });
    setViewState("main");
  };

  const filteredQuotes = myQuoteRequests.filter(q => 
    activeQuoteTab === "all" ? true : q.status === activeQuoteTab
  );

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <AnimatePresence mode="wait">
          {/* Main View */}
          {viewState === "main" && (
            <motion.div
              key="main"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-4 lg:p-6 space-y-6"
            >
              {/* Header */}
              <div className="text-center space-y-2">
                <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground">
                  Post Your Requirement
                </h1>
                <p className="text-muted-foreground text-sm">
                  Get quotes from verified vendors
                </p>
              </div>

              {/* Stats Row */}
              <div className="flex items-center justify-center gap-8 py-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-primary font-bold text-xl">
                    <Users size={18} />
                    12k+
                  </div>
                  <p className="text-xs text-muted-foreground">Active Buyers</p>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-primary font-bold text-xl">
                    <MessageSquare size={18} />
                    50+
                  </div>
                  <p className="text-xs text-muted-foreground">Daily Requests</p>
                </div>
              </div>

              {/* Quick RFQ Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card 
                  className="border border-primary/20 bg-primary/5 cursor-pointer group hover:border-primary/40 transition-all overflow-hidden"
                  onClick={() => setViewState("quickRfq")}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-primary text-primary-foreground shrink-0">
                        <Zap size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">Quick RFQ</h3>
                          <Badge className="bg-primary text-primary-foreground text-[10px] px-2">
                            Fast
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Just upload an image + quantity
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Clock size={12} />
                          <span>Takes 30 seconds</span>
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Create New Requirement Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card 
                  className="border border-border cursor-pointer group hover:border-primary/30 transition-all"
                  onClick={() => setViewState("selectCategory")}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-muted text-foreground shrink-0">
                        <FileText size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">Create New Requirement</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Detailed specifications for precise quotes
                        </p>
                      </div>
                      <ChevronRight size={20} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* My Quote Requests Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="pt-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-foreground">My Quote Requests</h2>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-primary text-xs"
                    onClick={() => navigate("/quotes")}
                  >
                    View All
                  </Button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                  {[
                    { id: "all" as QuoteTab, label: "All" },
                    { id: "active" as QuoteTab, label: "Active" },
                    { id: "pending" as QuoteTab, label: "Pending" },
                    { id: "completed" as QuoteTab, label: "Completed" },
                  ].map((tab) => (
                    <Button
                      key={tab.id}
                      variant={activeQuoteTab === tab.id ? "default" : "outline"}
                      size="sm"
                      className={`text-xs shrink-0 ${
                        activeQuoteTab === tab.id 
                          ? "bg-primary text-primary-foreground" 
                          : "text-muted-foreground"
                      }`}
                      onClick={() => setActiveQuoteTab(tab.id)}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>

                {/* Quote Cards */}
                <div className="space-y-3">
                  {filteredQuotes.length > 0 ? (
                    filteredQuotes.map((quote) => (
                      <Card key={quote.id} className="border border-border">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-foreground text-sm">{quote.title}</h4>
                              <div className="flex items-center gap-3 mt-2">
                                <Badge 
                                  variant={quote.status === "active" ? "default" : "secondary"}
                                  className={`text-[10px] ${
                                    quote.status === "active" 
                                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-200" 
                                      : quote.status === "pending"
                                      ? "bg-amber-500/10 text-amber-600 border-amber-200"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {quote.quotes} quotes
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {quote.date}
                                </span>
                              </div>
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No quote requests found</p>
                    </div>
                  )}
                </div>

                {/* Previous Quotes Button */}
                <Button 
                  variant="outline" 
                  className="w-full mt-4 text-muted-foreground border-border"
                  onClick={() => navigate("/quotes")}
                >
                  <FileText size={16} className="mr-2" />
                  My Previous Quotes
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* Quick RFQ View */}
          {viewState === "quickRfq" && (
            <motion.div
              key="quickRfq"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-4 lg:p-6 space-y-6 pb-32"
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="shrink-0"
                  onClick={() => setViewState("main")}
                >
                  <ArrowLeft size={20} />
                </Button>
                <div>
                  <h1 className="font-semibold text-lg text-foreground flex items-center gap-2">
                    <Zap size={18} className="text-primary" />
                    Quick RFQ
                  </h1>
                  <p className="text-sm text-muted-foreground">Upload image & quantity</p>
                </div>
              </div>

              {/* Image Upload */}
              <Card className="border-2 border-dashed border-border hover:border-primary/40 transition-colors">
                <CardContent className="p-4">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  {quickImage ? (
                    <div className="relative">
                      <img
                        src={URL.createObjectURL(quickImage)}
                        alt="Uploaded"
                        className="w-full h-48 object-cover rounded-xl"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={() => setQuickImage(null)}
                      >
                        <X size={16} />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center py-12 cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Camera size={28} className="text-muted-foreground" />
                      </div>
                      <p className="font-medium text-foreground">Upload Product Image</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Click or drag and drop
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quantity */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Quantity Required *</Label>
                <Input
                  placeholder="e.g., 1000 pieces"
                  value={quickQuantity}
                  onChange={(e) => setQuickQuantity(e.target.value)}
                  className="h-12 bg-background border-border"
                />
              </div>

              {/* Description with Voice */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Additional Notes (Optional)</Label>
                <div className="relative">
                  <Textarea
                    placeholder="Any specific requirements..."
                    value={quickDescription}
                    onChange={(e) => setQuickDescription(e.target.value)}
                    className="min-h-[100px] pr-12 bg-background border-border"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`absolute bottom-2 right-2 ${isRecording ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
                    onClick={toggleVoiceRecording}
                  >
                    {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                  </Button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent lg:static lg:bg-transparent lg:p-0">
                <Button 
                  size="lg" 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={handleQuickSubmit}
                >
                  <Zap size={18} className="mr-2" />
                  Submit Quick RFQ
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  Your request will be sent to verified manufacturers
                </p>
              </div>
            </motion.div>
          )}

          {/* Select Category View */}
          {viewState === "selectCategory" && (
            <motion.div
              key="selectCategory"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-4 lg:p-6 space-y-6"
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="shrink-0"
                  onClick={() => setViewState("main")}
                >
                  <ArrowLeft size={20} />
                </Button>
                <div>
                  <h1 className="font-semibold text-lg text-foreground">Post Your Requirement</h1>
                  <p className="text-sm text-muted-foreground">Only one category can be selected</p>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <p className="font-medium text-foreground">Request Quote from Vendors</p>
                <p className="text-sm text-muted-foreground">
                  Based on your requirement, interested sellers will reach out to you.
                </p>
              </div>

              {/* Category Grid - Circular Icons */}
              <div className="grid grid-cols-4 gap-4">
                {categories.map((cat) => (
                  <motion.div
                    key={cat.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="cursor-pointer flex flex-col items-center gap-2"
                    onClick={() => handleCategorySelect(cat.id)}
                  >
                    <div className={`w-16 h-16 rounded-full overflow-hidden border-2 transition-all ${
                      selectedCategory === cat.id 
                        ? 'border-primary shadow-lg ring-2 ring-primary/20' 
                        : 'border-border hover:border-primary/40'
                    }`}>
                      <img
                        src={cat.image}
                        alt={cat.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-xs text-center text-foreground font-medium leading-tight">
                      {cat.name}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Requirement Form View */}
          {viewState === "requirementForm" && selectedCategory && (
            <motion.div
              key="requirementForm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-4 lg:p-6 space-y-5 pb-32"
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="shrink-0"
                  onClick={() => setViewState("selectCategory")}
                >
                  <ArrowLeft size={20} />
                </Button>
                <div>
                  <h1 className="font-semibold text-lg text-foreground">Post Your Requirement</h1>
                  <p className="text-sm text-muted-foreground">Fill in the details below</p>
                </div>
              </div>

              {/* Selected Category */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary">
                  <img
                    src={categories.find(c => c.id === selectedCategory)?.image}
                    alt={categories.find(c => c.id === selectedCategory)?.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium text-foreground">
                    {categories.find(c => c.id === selectedCategory)?.name}
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="ml-auto text-primary text-xs"
                  onClick={() => setViewState("selectCategory")}
                >
                  Change
                </Button>
              </div>

              {/* Sub Category */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Sub Category</Label>
                <Select 
                  value={formData.subCategory} 
                  onValueChange={(val) => setFormData(prev => ({ ...prev, subCategory: val }))}
                >
                  <SelectTrigger className="h-12 bg-background border-border">
                    <SelectValue placeholder="Select sub category" />
                  </SelectTrigger>
                  <SelectContent>
                    {subCategories[selectedCategory]?.map((sub) => (
                      <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Quantity *</Label>
                <Input
                  placeholder="e.g., 1000 pieces"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                  className="h-12 bg-background border-border"
                />
              </div>

              {/* Price Range */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Price Range (Optional)</Label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                    <Input
                      placeholder="Min"
                      value={formData.priceMin}
                      onChange={(e) => setFormData(prev => ({ ...prev, priceMin: e.target.value }))}
                      className="h-12 pl-7 bg-background border-border"
                    />
                  </div>
                  <span className="text-muted-foreground">to</span>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                    <Input
                      placeholder="Max"
                      value={formData.priceMax}
                      onChange={(e) => setFormData(prev => ({ ...prev, priceMax: e.target.value }))}
                      className="h-12 pl-7 bg-background border-border"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Requirements */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Additional Requirements</Label>
                <div className="relative">
                  <Textarea
                    placeholder="Enter any specific requirements, fabric preferences, colors, sizes..."
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="min-h-[120px] pr-12 bg-background border-border"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`absolute bottom-2 right-2 ${isRecording ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
                    onClick={toggleVoiceRecording}
                  >
                    {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mic size={12} />
                  Add voice to speech option
                </p>
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Upload Files (Optional)</Label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*,video/*,.pdf"
                  multiple
                  className="hidden"
                />
                <div 
                  className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex justify-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <ImageIcon size={18} className="text-muted-foreground" />
                    </div>
                    <div className="p-2 rounded-lg bg-muted">
                      <Video size={18} className="text-muted-foreground" />
                    </div>
                    <div className="p-2 rounded-lg bg-muted">
                      <FileUp size={18} className="text-muted-foreground" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Add photos, videos or PDF
                  </p>
                </div>

                {/* Uploaded Files */}
                {formData.files.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {formData.files.map((file, index) => (
                      <div 
                        key={index} 
                        className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2"
                      >
                        <FileUp size={14} />
                        <span className="text-sm truncate max-w-[100px]">{file.name}</span>
                        <X 
                          size={14} 
                          className="cursor-pointer text-muted-foreground hover:text-primary" 
                          onClick={() => removeFile(index)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent lg:static lg:bg-transparent lg:p-0 lg:pt-4">
                <Button 
                  size="lg" 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={handleFullSubmit}
                >
                  Submit Quote Request
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  Every quote will have an expiration deadline of 7 days once the quote is received.
                </p>
              </div>
            </motion.div>
          )}

          {/* Success View */}
          {viewState === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center min-h-[80vh] p-6 bg-primary"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="w-24 h-24 rounded-full bg-background flex items-center justify-center mb-8"
              >
                <Check size={48} className="text-primary" />
              </motion.div>

              {/* COSORA Logo/Text */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="font-display text-4xl font-bold text-primary-foreground mb-4"
              >
                COSORA
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-primary-foreground/80 text-center max-w-xs"
              >
                Your Requirement has been submitted successfully.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex flex-col gap-3 mt-10 w-full max-w-xs"
              >
                <Button 
                  size="lg"
                  className="bg-background text-primary hover:bg-background/90"
                  onClick={() => navigate("/quotes")}
                >
                  <FileText size={18} className="mr-2" />
                  Go to Previous Quotes
                </Button>
                <Button 
                  variant="ghost"
                  size="lg"
                  className="text-primary-foreground hover:bg-primary-foreground/10"
                  onClick={resetForm}
                >
                  <Plus size={18} className="mr-2" />
                  Create New Requirement
                </Button>
              </motion.div>

              {/* Note */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-xs text-primary-foreground/60 text-center mt-8 max-w-xs"
              >
                This will redirect to my previous quote.
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
};

export default PostRequirement;
