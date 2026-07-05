import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { resolveCategoryId, useProductForEdit, updateProduct } from "@/lib/queries/products";
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
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};
const listContainer = {
  show: { transition: { staggerChildren: 0.055 } },
};
const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};
import { Upload as UploadIcon, X, Image, Check, ArrowLeft, ArrowRight, ChevronLeft, ChevronDown, Video, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CategorySelector } from "@/components/upload/CategorySelector";
import { SubCategorySelector } from "@/components/upload/SubCategorySelector";
import { DynamicFormFields } from "@/components/upload/DynamicFormFields";
import { getCategoryById, getFieldsForCategory, getOptionalCategoryFields } from "@/data/sellerCategories";
import { Progress } from "@/components/ui/progress";

type Step = "category" | "subcategory" | "details" | "images" | "pricing";

const ALL_STEPS: { id: Step; label: string }[] = [
  { id: "category", label: "Category" },
  { id: "subcategory", label: "Sub-category" },
  { id: "details", label: "Details" },
  { id: "images", label: "Images" },
  { id: "pricing", label: "Pricing" },
];

const Upload = () => {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("id");
  const isEdit = Boolean(editId);
  const { data: editing } = useProductForEdit(editId ?? undefined);
  // In edit mode the category/sub-category steps are skipped (the taxonomy
  // isn't reverse-mappable); the vendor edits details/images/pricing directly.
  const steps = isEdit ? ALL_STEPS.filter((s) => s.id !== "category" && s.id !== "subcategory") : ALL_STEPS;
  const [submitting, setSubmitting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // Real File objects for the picked images (parallel to `images` previews),
  // uploaded to Storage on submit.
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [currentStep, setCurrentStep] = useState<Step>(isEdit ? "details" : "category");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [selectedSubType, setSelectedSubType] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [videoFiles, setVideoFiles] = useState<string[]>([]);
  const [pdfFiles, setPdfFiles] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string | string[]>>({});
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [status, setStatus] = useState("draft");

  // Prefill the form from the loaded product when editing.
  useEffect(() => {
    if (!editing) return;
    setProductName(editing.name);
    setProductDescription(editing.description ?? "");
    setPrice(editing.price_value != null ? String(editing.price_value) : "");
    setImages(editing.images);
    setStatus(editing.status === "draft" ? "draft" : "pending");
    setFormValues((prev) => ({
      ...prev,
      fabric: editing.fabric ?? "",
      gsm: editing.gsm ?? "",
      fit: editing.fit_type ?? "",
      gender: editing.gender ?? "",
    }));
  }, [editing]);

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

  // Add real image Files (from drop or the file picker), capped at 6, keeping a
  // preview URL and the File itself in lockstep.
  const addImageFiles = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    setImages((prev) => [...prev, ...imgs.map((f) => URL.createObjectURL(f))].slice(0, 6));
    setImageFiles((prev) => [...prev, ...imgs].slice(0, 6));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addImageFiles(Array.from(e.dataTransfer.files));
  };

  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addImageFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMediaPick = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    current: string[],
    max: number,
  ) => {
    const files = Array.from(e.target.files || []);
    const fileNames = files.slice(0, max - current.length).map((file) => file.name);
    if (fileNames.length > 0) {
      setter((prev) => [...prev, ...fileNames].slice(0, max));
    }
    e.target.value = "";
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

  // Upload the picked image Files to the product-images bucket under the
  // vendor's own folder (<uid>/<productId>/…) and return their public URLs.
  const uploadImages = async (productId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user!.id}/${productId}/${i}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
      if (error) throw error;
      urls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
    }
    return urls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Only product listings are persisted in this phase; services/freelancers
    // keep the prior confirmation until their tables exist.
    if (category?.type !== "product") {
      toast.success(`${category?.type === "service" ? "Service" : "Profile"} submitted!`, {
        description: `Your ${category?.name || "listing"} is now pending review.`,
      });
      return;
    }
    if (!user) {
      toast.error("Sign in as a vendor to publish", { description: "Use the dev switcher (bottom-left) to sign in as Demo Vendor." });
      return;
    }

    setSubmitting(true);
    try {
      // Respect the 24–48h moderation rule: a submitted listing is
      // 'under_review' (buyers can't see it yet); an explicit draft stays hidden.
      const nextStatus = status === "draft" ? "draft" : "under_review";
      const fabric = (formValues["fabric"] as string) || null;
      const gsm = (formValues["gsm"] as string) || null;
      const fitType = (formValues["fit"] as string) || (formValues["fit_type"] as string) || null;
      const gender = (formValues["gender"] as string) || null;

      if (isEdit && editId) {
        // Edit: update the row + append any newly-picked images (existing ones stay).
        await updateProduct(editId, {
          name: productName,
          description: productDescription || null,
          price_value: price ? Number(price) : null,
          moq: (formValues["moq"] as string) || undefined,
          fabric, gsm, fit_type: fitType, gender,
          status: nextStatus,
        });
        if (imageFiles.length > 0) {
          const { count } = await supabase
            .from("product_images")
            .select("*", { count: "exact", head: true })
            .eq("product_id", editId);
          const start = count ?? 0;
          const urls = await uploadImages(editId);
          const { error: imgErr } = await supabase
            .from("product_images")
            .insert(urls.map((url, i) => ({ product_id: editId, url, position: start + i })));
          if (imgErr) throw imgErr;
        }
        queryClient.invalidateQueries({ queryKey: ["products"] });
        toast.success("Product updated", {
          description: nextStatus === "under_review" ? "Resubmitted for review (24–48h)." : "Saved as draft.",
        });
        navigate("/products");
        return;
      }

      // Map the granular upload taxonomy to a buyer-facing DB category.
      const subName = selectedSubCategory
        ? category?.subCategories.find((s) => s.id === selectedSubCategory)?.name
        : undefined;
      const category_id = await resolveCategoryId(subName, category?.name, productName);

      const { data: inserted, error } = await supabase
        .from("products")
        .insert({
          vendor_id: user.id,
          name: productName,
          description: productDescription || null,
          price_value: price ? Number(price) : null,
          currency: "₹",
          category_id,
          moq: (formValues["moq"] as string) || "2",
          fabric,
          gsm,
          fit_type: fitType,
          gender,
          status: nextStatus,
        })
        .select("id")
        .single();
      if (error) throw error;

      const urls = await uploadImages(inserted.id);
      if (urls.length > 0) {
        const { error: imgErr } = await supabase
          .from("product_images")
          .insert(urls.map((url, position) => ({ product_id: inserted.id, url, position })));
        if (imgErr) throw imgErr;
      }

      // Refresh any cached product lists so the vendor's Products page and the
      // buyer feed reflect the new row immediately.
      queryClient.invalidateQueries({ queryKey: ["products"] });

      toast.success("Product submitted for review", {
        description: "It becomes visible to buyers once approved (24–48h).",
      });
      navigate("/products");
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
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
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show">
      {/* Page header */}
      <motion.div
        variants={section}
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
          {isEdit ? "Edit Product" : category?.type === "service" ? "Add Service" : category?.type === "freelancer" ? "Add Profile" : "Upload Product"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEdit ? "Update your listing details, images, and pricing" : category ? `Adding to: ${category.name}` : "Select a category to get started"}
        </p>
      </motion.div>

      {/* Progress bar */}
      <motion.div variants={section} className="mb-6">
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
            <motion.button
              key={step.id}
              type="button"
              whileTap={TAP}
              transition={TAP_T}
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
            </motion.button>
          ))}
        </div>
      </motion.div>

      <motion.form variants={section} onSubmit={handleSubmit}>
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
                      maxLength={1000}
                      placeholder={
                        category?.type === "service"
                          ? "Describe your service, capabilities, and what sets you apart..."
                          : "Describe your product, specifications, and unique features..."
                      }
                      className="min-h-[100px]"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Use buyer-friendly language and highlight differentiators.</span>
                      <span>{productDescription.length}/1000</span>
                    </div>
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
                  PNG, JPG, MP4, PDF up to 10MB (max 6 images, 3 videos, 3 PDFs)
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={onPickImages}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <Image className="mr-2 h-4 w-4" />
                    Browse Images
                  </Button>
                  <label className="inline-flex cursor-pointer items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/5">
                    <input
                      type="file"
                      accept="video/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handleMediaPick(e, setVideoFiles, videoFiles, 3)}
                    />
                    <Video className="mr-2 h-4 w-4" />
                    Add Video
                  </label>
                  <label className="inline-flex cursor-pointer items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/5">
                    <input
                      type="file"
                      accept="application/pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => handleMediaPick(e, setPdfFiles, pdfFiles, 3)}
                    />
                    <FileText className="mr-2 h-4 w-4" />
                    Add PDF
                  </label>
                </div>
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

              {(videoFiles.length > 0 || pdfFiles.length > 0) && (
                <div className="mt-4 space-y-3">
                  {videoFiles.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Videos</p>
                      <div className="flex flex-wrap gap-2">
                        {videoFiles.map((fileName, index) => (
                          <span key={`${fileName}-${index}`} className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs text-foreground">
                            <Video className="mr-1 h-3 w-3 text-accent" />
                            {fileName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {pdfFiles.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">PDFs</p>
                      <div className="flex flex-wrap gap-2">
                        {pdfFiles.map((fileName, index) => (
                          <span key={`${fileName}-${index}`} className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs text-foreground">
                            <FileText className="mr-1 h-3 w-3 text-accent" />
                            {fileName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
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
        <motion.div variants={section} className="mt-6 flex items-center justify-between gap-4">
          <motion.button
            type="button"
            whileTap={TAP}
            transition={TAP_T}
            onClick={goToPreviousStep}
            disabled={currentStepIndex === 0}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/5 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </motion.button>

          <div className="flex gap-2">
            {currentStep === "pricing" ? (
              <>
                <motion.button type="button" whileTap={TAP} transition={TAP_T} className="inline-flex items-center justify-center rounded-md border border-border bg-background px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/5">
                  Save as Draft
                </motion.button>
                <motion.button type="submit" whileTap={TAP} transition={TAP_T} disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-md bg-yellow-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-yellow-600 disabled:opacity-60">
                  <Check className="h-4 w-4" />
                  {isEdit ? (submitting ? "Saving…" : "Save Changes") : submitting ? "Publishing…" : "Publish"}
                </motion.button>
              </>
            ) : (
              <motion.button
                type="button"
                whileTap={TAP}
                transition={TAP_T}
                onClick={goToNextStep}
                disabled={!canProceed()}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-yellow-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-yellow-600 disabled:opacity-50"
              >
                Continue
                <motion.span whileHover={{ x: 3 }} transition={{ ease: E, duration: 0.2 }}>
                  <ArrowRight className="h-4 w-4" />
                </motion.span>
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.form>
      </motion.div>
    </DashboardLayout>
  );
};

export default Upload;
