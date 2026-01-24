import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Image as ImageIcon,
  Video,
  FileUp,
  Mic,
  MicOff,
  Camera,
  X,
  Plus,
  Check,
  ChevronRight,
  Sparkles,
  Clock,
  CheckCircle2,
  Upload,
} from "lucide-react";

// Categories with icons
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

const fabricTypes = ["Cotton", "Silk", "Linen", "Denim", "Polyester", "Rayon", "Wool", "Blend", "Organic Cotton", "Tencel"];
const colorOptions = ["White", "Black", "Navy", "Red", "Blue", "Green", "Beige", "Gray", "Pink", "Yellow", "Purple", "Orange", "Brown", "Multicolor"];
const sizeOptions = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size", "Custom"];
const printingOptions = ["Screen Printing", "Sublimation", "DTG (Direct to Garment)", "Embroidery", "Heat Transfer", "None"];

type ViewState = "main" | "quickRfq" | "createRequirement" | "success";

const PostRequirement = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [viewState, setViewState] = useState<ViewState>("main");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  // Quick RFQ State
  const [quickImage, setQuickImage] = useState<File | null>(null);
  const [quickQuantity, setQuickQuantity] = useState("");
  const [quickDescription, setQuickDescription] = useState("");
  
  // Create Requirement State
  const [formData, setFormData] = useState({
    subCategory: "",
    fabric: "",
    colors: [] as string[],
    sizes: [] as string[],
    gsm: "",
    quantity: "",
    printing: [] as string[],
    description: "",
    priceMin: "",
    priceMax: "",
    files: [] as File[],
  });

  const handleColorToggle = (color: string) => {
    setFormData(prev => ({
      ...prev,
      colors: prev.colors.includes(color)
        ? prev.colors.filter(c => c !== color)
        : [...prev.colors, color]
    }));
  };

  const handleSizeToggle = (size: string) => {
    setFormData(prev => ({
      ...prev,
      sizes: prev.sizes.includes(size)
        ? prev.sizes.filter(s => s !== size)
        : [...prev.sizes, size]
    }));
  };

  const handlePrintingToggle = (printing: string) => {
    setFormData(prev => ({
      ...prev,
      printing: prev.printing.includes(printing)
        ? prev.printing.filter(p => p !== printing)
        : [...prev.printing, printing]
    }));
  };

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
      // Simulate voice to text after 3 seconds
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

  const resetForm = () => {
    setSelectedCategory(null);
    setQuickImage(null);
    setQuickQuantity("");
    setQuickDescription("");
    setFormData({
      subCategory: "",
      fabric: "",
      colors: [],
      sizes: [],
      gsm: "",
      quantity: "",
      printing: [],
      description: "",
      priceMin: "",
      priceMax: "",
      files: [],
    });
    setViewState("main");
  };

  // Check if category requires GSM field (clothing related)
  const needsGSM = selectedCategory && !["fabric"].includes(selectedCategory);

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
        <AnimatePresence mode="wait">
          {/* Main View - Choose Option */}
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
                <p className="text-muted-foreground">
                  Get quotes from verified manufacturers
                </p>
              </div>

              {/* Quick RFQ Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card 
                  className="border-2 border-accent/30 bg-gradient-to-br from-accent/5 to-accent/10 cursor-pointer group hover:border-accent/50 transition-all"
                  onClick={() => setViewState("quickRfq")}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-2xl bg-accent/20 text-accent group-hover:scale-110 transition-transform">
                        <Zap size={28} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-lg font-semibold text-foreground">Quick RFQ</h3>
                          <Badge className="bg-accent text-accent-foreground text-[10px]">
                            <Sparkles size={10} className="mr-1" />
                            Fast
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Just upload an image + quantity. Get quotes in minutes!
                        </p>
                        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                          <Clock size={12} />
                          <span>Takes 30 seconds</span>
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-muted-foreground group-hover:text-accent transition-colors" />
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
                  className="border-border/50 cursor-pointer group hover:border-primary/30 transition-all"
                  onClick={() => setViewState("createRequirement")}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-2xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                        <FileText size={28} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-display text-lg font-semibold text-foreground">Create New Requirement</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Detailed specifications for precise quotes
                        </p>
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-emerald-500" />
                            Category, Fabric, Colors
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-emerald-500" />
                            GSM, Size, Quantity
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* My Previous Quotes Button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Button 
                  variant="outline" 
                  className="w-full gap-2"
                  onClick={() => navigate("/quotes")}
                >
                  <FileText size={18} />
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
                <Button variant="ghost" size="icon" onClick={() => setViewState("main")}>
                  <ArrowLeft size={20} />
                </Button>
                <div>
                  <h1 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                    <Zap size={20} className="text-accent" />
                    Quick RFQ
                  </h1>
                  <p className="text-sm text-muted-foreground">Upload image & quantity</p>
                </div>
              </div>

              {/* Image Upload */}
              <Card className="border-dashed border-2 border-accent/30">
                <CardContent className="p-6">
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
                      <div className="p-4 rounded-full bg-accent/10 text-accent mb-4">
                        <Camera size={32} />
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
                <Label className="text-sm font-medium">Quantity Required *</Label>
                <Input
                  placeholder="e.g., 1000 pieces"
                  value={quickQuantity}
                  onChange={(e) => setQuickQuantity(e.target.value)}
                  className="h-12"
                />
              </div>

              {/* Description with Voice */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Additional Notes (Optional)</Label>
                <div className="relative">
                  <Textarea
                    placeholder="Any specific requirements..."
                    value={quickDescription}
                    onChange={(e) => setQuickDescription(e.target.value)}
                    className="min-h-[100px] pr-12"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`absolute bottom-2 right-2 ${isRecording ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`}
                    onClick={toggleVoiceRecording}
                  >
                    {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                  </Button>
                </div>
              </div>

              {/* Submit Button - Fixed at bottom on mobile */}
              <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent lg:static lg:bg-transparent lg:p-0">
                <Button 
                  variant="gold" 
                  size="lg" 
                  className="w-full gap-2"
                  onClick={handleQuickSubmit}
                >
                  <Zap size={18} />
                  Submit Quick RFQ
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  Your request will be sent to verified manufacturers
                </p>
              </div>
            </motion.div>
          )}

          {/* Create Requirement View */}
          {viewState === "createRequirement" && (
            <motion.div
              key="createRequirement"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-4 lg:p-6 space-y-6 pb-32"
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => {
                  if (selectedCategory) {
                    setSelectedCategory(null);
                  } else {
                    setViewState("main");
                  }
                }}>
                  <ArrowLeft size={20} />
                </Button>
                <div>
                  <h1 className="font-display text-xl font-bold text-foreground">
                    {selectedCategory ? "Post Your Requirement" : "Select Category"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {selectedCategory ? "Fill in the details below" : "Choose one category"}
                  </p>
                </div>
              </div>

              {/* Category Selection */}
              {!selectedCategory && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <p className="text-sm font-medium text-foreground">Request Quote from Vendors</p>
                  <p className="text-xs text-muted-foreground">
                    Based on your requirement, interested sellers will reach out to you.
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {categories.map((cat) => (
                      <motion.div
                        key={cat.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                          selectedCategory === cat.id 
                            ? 'border-accent shadow-lg' 
                            : 'border-transparent'
                        }`}
                        onClick={() => setSelectedCategory(cat.id)}
                      >
                        <div className="aspect-square relative">
                          <img
                            src={cat.image}
                            alt={cat.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <p className="absolute bottom-2 left-2 right-2 text-[11px] font-medium text-white text-center leading-tight">
                            {cat.name}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Requirement Form */}
              {selectedCategory && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  {/* Selected Category Badge */}
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      {categories.find(c => c.id === selectedCategory)?.name}
                      <X 
                        size={12} 
                        className="cursor-pointer" 
                        onClick={() => setSelectedCategory(null)} 
                      />
                    </Badge>
                  </div>

                  {/* Sub Category */}
                  <div className="space-y-2">
                    <Label>Sub Category</Label>
                    <Select 
                      value={formData.subCategory} 
                      onValueChange={(val) => setFormData(prev => ({ ...prev, subCategory: val }))}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select sub category" />
                      </SelectTrigger>
                      <SelectContent>
                        {subCategories[selectedCategory]?.map((sub) => (
                          <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Fabric */}
                  <div className="space-y-2">
                    <Label>Fabric</Label>
                    <Select 
                      value={formData.fabric} 
                      onValueChange={(val) => setFormData(prev => ({ ...prev, fabric: val }))}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select fabric type" />
                      </SelectTrigger>
                      <SelectContent>
                        {fabricTypes.map((fab) => (
                          <SelectItem key={fab} value={fab}>{fab}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Colors - Multiple Selection */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Colors
                      <Badge variant="outline" className="text-[10px]">Multiple</Badge>
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((color) => (
                        <Badge
                          key={color}
                          variant={formData.colors.includes(color) ? "default" : "outline"}
                          className="cursor-pointer transition-all"
                          onClick={() => handleColorToggle(color)}
                        >
                          {formData.colors.includes(color) && <Check size={12} className="mr-1" />}
                          {color}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Sizes - Multiple Selection */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Size
                      <Badge variant="outline" className="text-[10px]">Multiple</Badge>
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {sizeOptions.map((size) => (
                        <Badge
                          key={size}
                          variant={formData.sizes.includes(size) ? "default" : "outline"}
                          className="cursor-pointer transition-all"
                          onClick={() => handleSizeToggle(size)}
                        >
                          {formData.sizes.includes(size) && <Check size={12} className="mr-1" />}
                          {size}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* GSM - Only for clothing */}
                  {needsGSM && (
                    <div className="space-y-2">
                      <Label>GSM (Fabric Weight)</Label>
                      <Input
                        placeholder="e.g., 180"
                        value={formData.gsm}
                        onChange={(e) => setFormData(prev => ({ ...prev, gsm: e.target.value }))}
                        className="h-12"
                      />
                    </div>
                  )}

                  {/* Quantity */}
                  <div className="space-y-2">
                    <Label>Quantity *</Label>
                    <Input
                      placeholder="e.g., 1000 pieces"
                      value={formData.quantity}
                      onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                      className="h-12"
                    />
                  </div>

                  {/* Printing/Embellishment */}
                  <div className="space-y-2">
                    <Label>Printing / Embellishment</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {printingOptions.map((opt) => (
                        <div 
                          key={opt}
                          className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                            formData.printing.includes(opt) 
                              ? 'border-accent bg-accent/5' 
                              : 'border-border'
                          }`}
                          onClick={() => handlePrintingToggle(opt)}
                        >
                          <Checkbox 
                            checked={formData.printing.includes(opt)}
                            onCheckedChange={() => handlePrintingToggle(opt)}
                          />
                          <span className="text-sm">{opt}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Description with Voice */}
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <div className="relative">
                      <Textarea
                        placeholder="Enter product description..."
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        className="min-h-[100px] pr-12"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`absolute bottom-2 right-2 ${isRecording ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`}
                        onClick={toggleVoiceRecording}
                      >
                        {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mic size={12} />
                      Tap microphone to use voice input
                    </p>
                  </div>

                  {/* Price Range */}
                  <div className="space-y-2">
                    <Label>Price Range (Optional)</Label>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                        <Input
                          placeholder="Min"
                          value={formData.priceMin}
                          onChange={(e) => setFormData(prev => ({ ...prev, priceMin: e.target.value }))}
                          className="h-12 pl-7"
                        />
                      </div>
                      <span className="text-muted-foreground">to</span>
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                        <Input
                          placeholder="Max"
                          value={formData.priceMax}
                          onChange={(e) => setFormData(prev => ({ ...prev, priceMax: e.target.value }))}
                          className="h-12 pl-7"
                        />
                      </div>
                    </div>
                  </div>

                  {/* File Upload */}
                  <div className="space-y-2">
                    <Label>Upload Design/Inspiration File (Optional)</Label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*,video/*,.pdf"
                      multiple
                      className="hidden"
                    />
                    <div 
                      className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-accent/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="flex justify-center gap-4 mb-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <ImageIcon size={20} className="text-muted-foreground" />
                        </div>
                        <div className="p-2 rounded-lg bg-muted">
                          <Video size={20} className="text-muted-foreground" />
                        </div>
                        <div className="p-2 rounded-lg bg-muted">
                          <FileUp size={20} className="text-muted-foreground" />
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
                              className="cursor-pointer text-muted-foreground hover:text-destructive" 
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
                      variant="gold" 
                      size="lg" 
                      className="w-full gap-2"
                      onClick={handleFullSubmit}
                    >
                      <Zap size={18} />
                      Submit Quote Request
                    </Button>
                    <p className="text-xs text-center text-muted-foreground mt-2">
                      Your request will be sent to verified manufacturers matching your requirements. You'll typically receive quotes within 24-48 hours.
                    </p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Success View */}
          {viewState === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center min-h-[80vh] p-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="w-24 h-24 rounded-full bg-accent flex items-center justify-center mb-6"
              >
                <Check size={48} className="text-accent-foreground" />
              </motion.div>
              
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="font-display text-2xl font-bold text-foreground text-center"
              >
                Your Requirement has been submitted successfully!
              </motion.h2>
              
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-muted-foreground text-center mt-3 max-w-md"
              >
                Verified manufacturers will review your requirement and send you quotes within 24-48 hours.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex flex-col gap-3 mt-8 w-full max-w-xs"
              >
                <Button 
                  variant="gold" 
                  size="lg"
                  className="gap-2"
                  onClick={() => navigate("/quotes")}
                >
                  <FileText size={18} />
                  View My Quotes
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={resetForm}
                >
                  Post Another Requirement
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
};

export default PostRequirement;
