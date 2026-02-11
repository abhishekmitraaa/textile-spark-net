import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { Upload as UploadIcon, X, Image, Check, ArrowLeft, ArrowRight, ChevronLeft, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CategorySelector } from "@/components/upload/CategorySelector";
import { SubCategorySelector } from "@/components/upload/SubCategorySelector";
import { DynamicFormFields } from "@/components/upload/DynamicFormFields";
import { getCategoryById, getFieldsForCategory, getOptionalCategoryFields } from "@/data/sellerCategories";
import { Progress } from "@/components/ui/progress";

type Step = "category" | "subcategory" | "details" | "images" | "pricing";

const steps: { id: Step; label: string }[] = [
  { id: "category", label: "Category" },
  { id: "subcategory", label: "Sub-category" },
  { id: "details", label: "Details" },
  { id: "images", label: "Images" },
  { id: "pricing", label: "Pricing" },
];

const Upload = () => {
  const [currentStep, setCurrentStep] = useState<Step>("category");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [selectedSubType, setSelectedSubType] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string | string[]>>({});
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [status, setStatus] = useState("draft");

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const category = selectedCategory ? getCategoryById(selectedCategory) : null;
  const dynamicFields = selectedCategory ? getFieldsForCategory(selectedCategory, selectedSubCategory || undefined) : [];
  const optionalFields = selectedCategory ? getOptionalCategoryFields(selectedCategory) : [];
  const [showOptionalSpecs, setShowOptionalSpecs] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const newImages = Array.from(e.dataTransfer.files).map(
        () => `https://images.unsplash.com/photo-${Math.random().toString(36).slice(2)}?w=400&h=400&fit=crop`
      );
      setImages((prev) => [...prev, ...newImages].slice(0, 6));
    }
  };

  const addPlaceholderImage = () => {
    const placeholders = [
      "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop",
    ];
    if (images.length < 6) {
      setImages((prev) => [...prev, placeholders[prev.length % placeholders.length]]);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFieldChange = (fieldId: string, value: string | string[]) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case "category":
        return !!selectedCategory;
      case "subcategory":
        return !!selectedSubCategory;
      case "details":
        return !!productName;
      case "images":
        return true;
      case "pricing":
        return !!price;
      default:
        return false;
    }
  };

  const goToNextStep = () => {
    const idx = steps.findIndex((s) => s.id === currentStep);
    if (idx < steps.length - 1) {
      setCurrentStep(steps[idx + 1].id);
    }
  };

  const goToPreviousStep = () => {
    const idx = steps.findIndex((s) => s.id === currentStep);
    if (idx > 0) {
      setCurrentStep(steps[idx - 1].id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const categoryName = category?.name || "Unknown";
    toast.success(`${category?.type === "service" ? "Service" : "Product"} uploaded successfully!`, {
      description: `Your ${categoryName} listing is now pending review.`,
    });
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setSelectedSubCategory(null);
    setSelectedSubType(null);
    setFormValues({});
  };

  const handleSubCategorySelect = (subCategoryId: string) => {
    setSelectedSubCategory(subCategoryId);
    setSelectedSubType(null);
  };

  return (
    <DashboardLayout>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 lg:mb-6"
      >
        <Link
          to="/products"
          className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground lg:mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Products
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {category?.type === "service" ? "Add Service" : category?.type === "freelancer" ? "Add Profile" : "Upload Product"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {category ? `Adding to: ${category.name}` : "Select a category to get started"}
        </p>
      </motion.div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Step {currentStepIndex + 1} of {steps.length}
          </span>
          <span className="text-xs font-medium text-accent">
            {steps[currentStepIndex].label}
          </span>
        </div>
        <Progress value={progress} className="h-2" />
        <div className="mt-2 hidden justify-between sm:flex">
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => {
                if (index <= currentStepIndex || (index === currentStepIndex + 1 && canProceed())) {
                  setCurrentStep(step.id);
                }
              }}
              className={cn(
                "text-xs transition-colors",
                index <= currentStepIndex
                  ? "font-medium text-accent"
                  : "text-muted-foreground"
              )}
            >
              {step.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <AnimatePresence mode="wait">
          {/* Step 1: Category Selection */}
          {currentStep === "category" && (
            <motion.div
              key="category"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="rounded-xl border border-border bg-card p-4 lg:p-6"
            >
              <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                What are you listing?
              </h2>
              <CategorySelector
                selectedCategory={selectedCategory}
                onSelectCategory={handleCategorySelect}
              />
            </motion.div>
          )}

          {/* Step 2: Sub-category Selection */}
          {currentStep === "subcategory" && selectedCategory && (
            <motion.div
              key="subcategory"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="rounded-xl border border-border bg-card p-4 lg:p-6"
            >
              <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                Select Sub-category
              </h2>
              <SubCategorySelector
                categoryId={selectedCategory}
                selectedSubCategory={selectedSubCategory}
                onSelectSubCategory={handleSubCategorySelect}
                selectedSubType={selectedSubType}
                onSelectSubType={setSelectedSubType}
              />
            </motion.div>
          )}

          {/* Step 3: Product/Service Details */}
          {currentStep === "details" && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 lg:space-y-6"
            >
              {/* Basic info */}
              <div className="rounded-xl border border-border bg-card p-4 lg:p-6">
                <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                  Basic Information
                </h2>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      {category?.type === "service" ? "Service Name" : category?.type === "freelancer" ? "Profile Title" : "Product Name"}
                      <span className="ml-1 text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder={
                        category?.type === "service"
                          ? "e.g., Premium Screen Printing Services"
                          : category?.type === "freelancer"
                          ? "e.g., Senior Fashion Designer"
                          : "e.g., Premium Cotton Blend Fabric"
                      }
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Input value={category?.name || ""} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sku">SKU / Reference ID</Label>
                      <Input
                        id="sku"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        placeholder="e.g., FCT-001"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder={
                        category?.type === "service"
                          ? "Describe your service, capabilities, and what sets you apart..."
                          : "Describe your product, specifications, and unique features..."
                      }
                      className="min-h-[100px]"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic category-specific fields */}
              {dynamicFields.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4 lg:p-6">
                  <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                    {category?.type === "service" ? "Service Details" : category?.type === "freelancer" ? "Profile Details" : "Specifications"}
                  </h2>
                  <DynamicFormFields
                    fields={dynamicFields}
                    values={formValues}
                    onChange={handleFieldChange}
                  />
                </div>
              )}

              {/* Optional category-level specifications */}
              {optionalFields.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4 lg:p-6">
                  <button
                    type="button"
                    onClick={() => setShowOptionalSpecs(!showOptionalSpecs)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div>
                      <h2 className="font-display text-lg font-semibold text-card-foreground">
                        Optional
                      </h2>
                      <p className="text-xs text-muted-foreground">Additional specifications</p>
                    </div>
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform",
                      showOptionalSpecs && "rotate-180"
                    )}>
                      <ChevronDown className="h-4 w-4" />
                    </div>
                  </button>
                  <AnimatePresence>
                    {showOptionalSpecs && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-4">
                          <DynamicFormFields
                            fields={optionalFields}
                            values={formValues}
                            onChange={handleFieldChange}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {/* Step 4: Images */}
          {currentStep === "images" && (
            <motion.div
              key="images"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="rounded-xl border border-border bg-card p-4 lg:p-6"
            >
              <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                {category?.type === "service" ? "Portfolio Images" : category?.type === "freelancer" ? "Profile & Work Samples" : "Product Images"}
              </h2>
              <div
                className={cn(
                  "relative rounded-lg border-2 border-dashed p-6 text-center transition-all lg:p-8",
                  dragActive
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/50"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-secondary lg:mb-4 lg:h-12 lg:w-12">
                  <UploadIcon className="h-5 w-5 text-muted-foreground lg:h-6 lg:w-6" />
                </div>
                <p className="mb-1 text-sm font-medium text-foreground lg:mb-2">
                  Drag and drop images here
                </p>
                <p className="mb-3 text-xs text-muted-foreground lg:mb-4">
                  PNG, JPG up to 10MB (max 6)
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPlaceholderImage}
                >
                  <Image className="mr-2 h-4 w-4" />
                  Browse
                </Button>
              </div>

              {images.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:gap-4">
                  {images.map((src, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-border"
                    >
                      <img
                        src={src}
                        alt={`Image ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                      {index === 0 && (
                        <span className="absolute bottom-1 left-1 rounded bg-accent px-1 py-0.5 text-[8px] font-medium text-accent-foreground lg:px-1.5 lg:text-[10px]">
                          Main
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Step 5: Pricing */}
          {currentStep === "pricing" && (
            <motion.div
              key="pricing"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid gap-4 lg:grid-cols-2 lg:gap-6"
            >
              <div className="rounded-xl border border-border bg-card p-4 lg:p-6">
                <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                  Pricing
                </h2>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">
                      {category?.type === "service" ? "Starting Price" : "Price per Unit"}
                      <span className="ml-1 text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        ₹
                      </span>
                      <Input
                        id="price"
                        type="number"
                        className="pl-7"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Select value={unit} onValueChange={setUnit}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {category?.type === "product" ? (
                          <>
                            <SelectItem value="yard">Per Yard</SelectItem>
                            <SelectItem value="meter">Per Meter</SelectItem>
                            <SelectItem value="kg">Per Kilogram</SelectItem>
                            <SelectItem value="piece">Per Piece</SelectItem>
                            <SelectItem value="dozen">Per Dozen</SelectItem>
                            <SelectItem value="set">Per Set</SelectItem>
                          </>
                        ) : category?.type === "service" ? (
                          <>
                            <SelectItem value="project">Per Project</SelectItem>
                            <SelectItem value="hour">Per Hour</SelectItem>
                            <SelectItem value="day">Per Day</SelectItem>
                            <SelectItem value="month">Per Month</SelectItem>
                            <SelectItem value="piece">Per Piece</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="hour">Per Hour</SelectItem>
                            <SelectItem value="day">Per Day</SelectItem>
                            <SelectItem value="project">Per Project</SelectItem>
                            <SelectItem value="month">Per Month</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-4 lg:space-y-6">
                <div className="rounded-xl border border-border bg-card p-4 lg:p-6">
                  <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                    Status
                  </h2>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="pending">Submit for Review</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Drafts won't be visible until approved.
                  </p>
                </div>

                {/* Summary */}
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 lg:p-6">
                  <h3 className="mb-3 font-display text-sm font-semibold text-foreground">
                    Listing Summary
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Category</span>
                      <span className="font-medium text-foreground">{category?.name}</span>
                    </div>
                    {selectedSubCategory && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sub-category</span>
                        <span className="font-medium text-foreground">
                          {category?.subCategories.find((s) => s.id === selectedSubCategory)?.name}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name</span>
                      <span className="max-w-[150px] truncate font-medium text-foreground">
                        {productName || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Images</span>
                      <span className="font-medium text-foreground">{images.length}/6</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation buttons */}
        <div className="mt-6 flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={goToPreviousStep}
            disabled={currentStepIndex === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="flex gap-2">
            {currentStep === "pricing" ? (
              <>
                <Button type="button" variant="outline" size="lg">
                  Save as Draft
                </Button>
                <Button type="submit" variant="gold" size="lg" className="gap-2">
                  <Check className="h-4 w-4" />
                  Publish
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="gold"
                onClick={goToNextStep}
                disabled={!canProceed()}
                className="gap-2"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
};

export default Upload;
