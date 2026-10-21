import { errorMessage } from "@/lib/errorMessage";
import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";
import { fileExt } from "@/lib/fileExt";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { resolveCategoryId, resolveSubcategoryId, sellerIdsForCategoryId, useProductForEdit, updateProduct } from "@/lib/queries/products";
import { useVendorPlan } from "@/lib/queries/subscriptions";
import { capReached, isUnlimited } from "@/lib/plan";
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
import { Switch } from "@/components/ui/switch";
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
import { getCategoryById, getFieldsForCategory, getOptionalCategoryFields, getSubCategoryById } from "@/data/sellerCategories";
import { productAttributes } from "@/lib/formAttributes";
import { createProductVideo, validateVideoFile, type VideoProbe } from "@/lib/queries/videos";
import { checkPdf, fileSizeLabel, uploadProductDocuments, MAX_PDFS } from "@/lib/queries/productDocuments";
import { Progress } from "@/components/ui/progress";

// Shown on the Pricing step only for a garment whose Details fields have no size field of their own. Since
// 2026-10-17 every garment sub-category has its own set (data/sizeCharts.ts), so this is a safety net; it is no
// longer offered for jeans (they have waist sizes), bedsheets, bags, trims or machinery. In edit mode, where the
// category steps are skipped, the listing's own sub-category decides (sellerIdsForCategoryId).
const FALLBACK_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"];
const GARMENT_CATEGORY = "apparel-home";

/**
 * The upload taxonomy exposes colour under three different field shapes:
 * `colors` as a multiselect (string[]), `colors` as free text ("20+ colors"),
 * and `color` as a single select. `products.colour` is one text value, so a
 * multiselect keeps only its first pick. DynamicFormFields warns the vendor
 * when that truncation is about to happen.
 */
function resolveColour(values: Record<string, string | string[]>): string | null {
  const raw = values["colors"] ?? values["color"];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return (raw as string) || null;
}

type Step = "category" | "subcategory" | "details" | "images" | "pricing";

/** A photo on the form: one the listing already has (`rowId`), or a newly picked File. */
type PickedImage = { src: string; rowId?: string; file?: File };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
  const { data: vplan } = useVendorPlan(user?.id);
  // Product-cap gate: how many listing slots the vendor's plan allows vs. used
  // (under_review + live, computed live by get_vendor_plan). Only blocks NEW
  // listings — editing an existing product and saving drafts are always allowed.
  const productCap = vplan?.limits.product_cap ?? -1;
  const productsUsed = vplan?.usage.products_used ?? 0;
  const productCapReached = !isEdit && capReached(productsUsed, productCap);
  // In edit mode the category/sub-category steps are skipped (the taxonomy
  // isn't reverse-mappable); the vendor edits details/images/pricing directly.
  const steps = isEdit ? ALL_STEPS.filter((s) => s.id !== "category" && s.id !== "subcategory") : ALL_STEPS;
  const [submitting, setSubmitting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [currentStep, setCurrentStep] = useState<Step>(isEdit ? "details" : "category");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [selectedSubType, setSelectedSubType] = useState<string | null>(null);
  // The listing's photos in display order. One list for both kinds (2026-10-21): a photo the listing already
  // has carries its product_images row id; a newly picked one carries its File, uploaded on submit. Two
  // parallel arrays (previews and Files) fell out of step in edit mode, so removing an existing photo dropped
  // a new one instead.
  const [images, setImages] = useState<PickedImage[]>([]);
  // Real files since 2026-10-17 (only their names were kept, and nothing uploaded). A video becomes a Video
  // Closeup tagged to this listing (same upload, moderation and player); a PDF goes to product-files.
  const [videoFiles, setVideoFiles] = useState<{ file: File; probe: VideoProbe }[]>([]);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [mediaProgress, setMediaProgress] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string | string[]>>({});
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  // Whether this listing accepts customization requests. Drives whether the
  // buyer's Request Quotation form shows its customization section at all.
  const [customizationAvailable, setCustomizationAvailable] = useState(false);

  // Prefill the form from the loaded product when editing.
  useEffect(() => {
    if (!editing) return;
    setProductName(editing.name);
    setProductDescription(editing.description ?? "");
    setPrice(editing.price_value != null ? String(editing.price_value) : "");
    setImages(editing.imageRows.map((r) => ({ src: r.url, rowId: r.id })));
    setCustomizationAvailable(editing.customization_available);
    setUnit(editing.unit ?? "");
    setSku(typeof editing.attributes?.sku === "string" ? editing.attributes.sku : "");
    // Edit mode skips the category/subcategory steps, so none of the dynamic
    // fields render and the vendor never re-answers them. Seeding formValues
    // here is what makes handleSubmit write the existing values straight back —
    // without it every save would null out attributes set at listing time.
    //
    // The other category answers (Ranking F1) are seeded too, first, so the column
    // fields below win on a shared key. A ticked checkbox comes back as "true", the
    // form's own value for it.
    const fromAttributes = Object.fromEntries(
      Object.entries(editing.attributes ?? {}).map(([k, v]) => [k, v === true ? "true" : v]),
    ) as Record<string, string | string[]>;
    setFormValues((prev) => ({
      ...prev,
      ...fromAttributes,
      location: editing.location ?? "",
      fabric: editing.fabric ?? "",
      gsm: editing.gsm ?? "",
      fit: editing.fit_type ?? "",
      gender: editing.gender ?? "",
      sizes: editing.sizes ?? [],
      colors: editing.colour ? [editing.colour] : [],
      pattern: editing.pattern ?? [],
      occasion: editing.occasion ?? [],
      neckType: editing.neck_type ?? "",
      sleeveType: editing.sleeve_type ?? "",
      collarType: editing.collar_type ?? "",
      originCountry: editing.country_of_origin ?? "",
      waistSizes: editing.waist_sizes ?? [],
      lengths: editing.lengths ?? [],
    }));
  }, [editing]);

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const category = selectedCategory ? getCategoryById(selectedCategory) : null;
  const dynamicFields = selectedCategory ? getFieldsForCategory(selectedCategory, selectedSubCategory || undefined) : [];
  // Subcategory is passed so the category-level fallbacks skip anything the
  // subcategory already asks — see getOptionalCategoryFields.
  const optionalFields = selectedCategory
    ? getOptionalCategoryFields(selectedCategory, selectedSubCategory || undefined)
    : [];
  const [showOptionalSpecs, setShowOptionalSpecs] = useState(false);

  // Apparel-style categories already render a "sizes" size-selector among their
  // dynamic Details fields, writing to formValues.sizes. Only fall back to the
  // generic selector on the Pricing step when the category has no size field of
  // its own (and always in edit mode, where the Details step is skipped).
  const hasDynamicSizes = [...dynamicFields, ...optionalFields].some((f) => f.id === "sizes" || f.id === "waistSizes");
  const selectedSizes = (formValues["sizes"] as string[] | undefined) ?? [];
  // Edit mode: the listing's own sub-category, for its own sizes (it used to get the generic list, so a bra
  // was offered XS–XXXL when edited).
  const [editSeller, setEditSeller] = useState<{ categoryId: string; subCategoryId: string } | null>(null);
  useEffect(() => {
    if (!isEdit || !editing?.category_id) return;
    let live = true;
    void sellerIdsForCategoryId(editing.category_id).then((r) => { if (live) setEditSeller(r); });
    return () => { live = false; };
  }, [isEdit, editing?.category_id]);
  const editSub = editSeller ? getSubCategoryById(editSeller.categoryId, editSeller.subCategoryId) : undefined;
  const editSizeField = editSub?.fields.find((f) => f.id === "sizes" && f.type === "size-selector");
  // The chips the Pricing step offers, or null for none: the edited listing's own set; else, for a garment
  // without a size field, the generic letters. What's already chosen always stays visible.
  const pricingSizeBase: string[] | null = isEdit
    ? editSizeField?.options ?? (editSeller && editSeller.categoryId !== GARMENT_CATEGORY ? null : FALLBACK_SIZES)
    : !hasDynamicSizes && category?.id === GARMENT_CATEGORY ? FALLBACK_SIZES : null;
  const pricingSizes = pricingSizeBase
    ? [...pricingSizeBase, ...selectedSizes.filter((sz) => !pricingSizeBase.includes(sz))]
    : selectedSizes.length ? selectedSizes : null;
  const toggleSize = (size: string) =>
    handleFieldChange(
      "sizes",
      selectedSizes.includes(size) ? selectedSizes.filter((s) => s !== size) : [...selectedSizes, size],
    );

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Add real image Files (from drop or the file picker), capped at 6 photos in all. Storage takes pictures of
  // at most 10 MB (the bucket's limit since 2026-10-21), so a bigger one is refused here, with the reason.
  const addImageFiles = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    const tooBig = imgs.filter((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig.length) toast.error(tooBig.length === 1 ? "This photo is over 10 MB" : "Some photos are over 10 MB", { description: "Add a smaller photo." });
    const fit = imgs.filter((f) => f.size <= MAX_IMAGE_BYTES);
    if (fit.length === 0) return;
    setImages((prev) => [...prev, ...fit.map((file) => ({ src: URL.createObjectURL(file), file }))].slice(0, 6));
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
  };

  // Each file is checked before it's accepted: a video the reel couldn't play, or a "PDF" that isn't one, is
  // refused here with the reason rather than after the listing is saved.
  const pickVideos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, 3 - videoFiles.length));
    e.target.value = "";
    for (const file of files) {
      try {
        const probe = await validateVideoFile(file);
        setVideoFiles((prev) => [...prev, { file, probe }].slice(0, 3));
      } catch (err) {
        toast.error((err as Error).message, { description: (err as { detail?: string }).detail });
      }
    }
  };
  const pickPdfs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, MAX_PDFS - pdfFiles.length));
    e.target.value = "";
    for (const file of files) {
      try {
        await checkPdf(file);
        setPdfFiles((prev) => [...prev, file].slice(0, MAX_PDFS));
      } catch (err) {
        toast.error((err as Error).message, { description: "Add a PDF of at most 10 MB." });
      }
    }
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

  // Upload newly picked image Files to the product-images bucket under the vendor's own folder and return
  // their public URLs, in order. Every file gets a name of its own (2026-10-21): the name used to be its
  // index from 0, so a photo added while editing overwrote the listing's cover at <uid>/<pid>/0. Storage
  // also refuses to overwrite a picture a listing uses (migration 20261021100000), so no upsert.
  const uploadImages = async (productId: string, files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      const ext = fileExt(file.name, "jpg");
      const path = `${user!.id}/${productId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type || undefined });
      if (error) throw error;
      urls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
    }
    return urls;
  };

  // The edit form's photos, saved: rows the vendor removed are deleted (then their files), new files are
  // uploaded, and every photo's position follows the form's order. Removing or reordering a live listing's
  // photos sends it back to review (trg_product_images_rereview), as adding one always did.
  const saveEditedImages = async (productId: string) => {
    const before = editing?.imageRows ?? [];
    const keptIds = new Set(images.flatMap((i) => (i.rowId ? [i.rowId] : [])));
    const removed = before.filter((r) => !keptIds.has(r.id));
    const newFiles = images.flatMap((i) => (i.file ? [i.file] : []));
    if (removed.length === 0 && newFiles.length === 0
        && images.every((img, k) => img.rowId === before[k]?.id && before[k]?.position === k)) {
      return; // nothing changed
    }

    if (removed.length > 0) {
      const { data, error } = await supabase.from("product_images").delete()
        .eq("product_id", productId).in("id", removed.map((r) => r.id)).select("id");
      if (error) throw error;
      if ((data ?? []).length !== removed.length) throw new Error("Some photos couldn't be removed. Reload and try again.");
      // The rows are gone, so the files are no listing's now: remove the ones in this vendor's own folder
      // (not a photo linked from elsewhere, nor a second row's copy). A failure here only leaves a file behind.
      const base = supabase.storage.from("product-images").getPublicUrl("").data.publicUrl;
      const stillUsed = new Set(before.filter((r) => keptIds.has(r.id)).map((r) => r.url));
      const paths = removed.map((r) => r.url)
        .filter((u) => u.startsWith(`${base}${user!.id}/`) && !stillUsed.has(u))
        .map((u) => decodeURIComponent(u.slice(base.length)));
      if (paths.length) {
        const { error: rmErr } = await supabase.storage.from("product-images").remove(paths);
        if (rmErr) console.warn("[Upload] removed photos left in storage:", rmErr.message);
      }
    }

    const newUrls = await uploadImages(productId, newFiles);
    let next = 0;
    const order = images.map((img) => (img.file ? { url: newUrls[next++] } : { rowId: img.rowId! }));
    // Kept rows move to their place first; their positions can only shrink or swap, and position isn't unique.
    for (const [k, slot] of order.entries()) {
      if (!slot.rowId) continue;
      const was = before.find((r) => r.id === slot.rowId);
      if (was && was.position === k) continue;
      const { error } = await supabase.from("product_images").update({ position: k }).eq("id", slot.rowId);
      if (error) throw error;
    }
    const inserts = order.flatMap((slot, k) => (slot.url ? [{ product_id: productId, url: slot.url, position: k }] : []));
    if (inserts.length > 0) {
      const { error } = await supabase.from("product_images").insert(inserts);
      if (error) throw error;
    }
  };

  // Driven by the two action buttons: "Save as Draft" → draft (hidden),
  // "Publish" / "Save Changes" → under_review (queued for moderation).
  const handleSubmit = async (intent: "draft" | "review", e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting) return;

    // Only product listings are persisted in this phase; services/freelancers
    // keep the prior confirmation until their tables exist.
    //
    // `!isEdit` guard: edit mode skips the category/sub-category steps, so
    // `category` is always null there and this check would swallow every edit
    // (returning a bogus "Profile submitted!" toast without writing anything).
    // Editing is products-only by construction: the sole route is /upload, edit
    // is keyed off ?id=, the only two links to it iterate product rows
    // (Products.tsx, SellerHome.tsx), fetchProductForEdit reads `products`, and
    // no services/freelancers table exists to hold an editable row.
    if (!isEdit && category?.type !== "product") {
      toast.success(`${category?.type === "service" ? "Service" : "Profile"} submitted!`, {
        description: `Your ${category?.name || "listing"} is now pending review.`,
      });
      return;
    }
    if (!user) {
      toast.error("Sign in as a vendor to publish", { description: "Use the dev switcher (bottom-left) to sign in as Demo Vendor." });
      return;
    }
    // Price is required to publish (it's marked *); a draft can be saved without it.
    if (intent === "review" && !price) {
      toast.error("Add a price before publishing", { description: "Or use Save as Draft to finish it later." });
      return;
    }
    // Country of Origin is required on every product listing (it's in
    // productCommonFields with required: true), so publishing without it is
    // blocked the same way a missing price is — but only when the form is
    // actually asking. Edit mode skips the category/subcategory steps and so
    // renders no dynamic fields at all; an unconditional check would make every
    // listing created before this column existed impossible to republish.
    const asksOriginCountry = dynamicFields.some((f) => f.id === "originCountry");
    if (intent === "review" && asksOriginCountry && !(formValues["originCountry"] as string)?.trim()) {
      toast.error("Add a country of origin before publishing", {
        description: "It's required on every listing. Or use Save as Draft to finish it later.",
      });
      return;
    }
    // Plan product-cap: block publishing a NEW listing beyond the vendor's cap
    // (drafts and edits are unaffected — a draft doesn't occupy a listing slot).
    if (intent === "review" && productCapReached) {
      toast.error("Product limit reached", {
        description: `Your plan allows ${productCap} listed products. Upgrade to list more.`,
      });
      navigate("/subscription");
      return;
    }

    setSubmitting(true);
    try {
      // Respect the 24–48h moderation rule: a submitted listing is
      // 'under_review' (buyers can't see it yet); an explicit draft stays hidden.
      const nextStatus = intent === "draft" ? "draft" : "under_review";
      const pausedEdit = isEdit && editing?.status === "paused" && nextStatus === "under_review";
      const fabric = (formValues["fabric"] as string) || null;
      const gsm = (formValues["gsm"] as string) || null;
      const fitType = (formValues["fit"] as string) || (formValues["fit_type"] as string) || null;
      const gender = (formValues["gender"] as string) || null;
      // Empty selection persists as NULL rather than {}, so "no value specified"
      // and "value explicitly cleared" read the same downstream.
      //
      // `arr` checks Array.isArray rather than a truthy `.length`, because a
      // `text` field sharing an id would yield a *string* whose `.length` is
      // also > 0 — that's how "UK 6-11" reaches the sizes text[] column today
      // (Footwear and Other Ready-made Garments declare `sizes` as type "text").
      const arr = (id: string): string[] | null => {
        const v = formValues[id];
        return Array.isArray(v) && v.length > 0 ? v : null;
      };
      const str = (id: string): string | null => {
        const v = formValues[id];
        return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
      };
      const sizes = arr("sizes");
      const colour = resolveColour(formValues);
      // Attributes the upload form has always collected but never persisted.
      const pattern = arr("pattern");
      const occasion = arr("occasion");
      const neckType = str("neckType");
      const sleeveType = str("sleeveType");
      const collarType = str("collarType");
      const countryOfOrigin = str("originCountry");
      const waistSizes = arr("waistSizes");
      const lengths = arr("lengths");
      // Asked on every product ("Location / Origin") and has a column, but was never saved.
      const location = str("location");
      // Every other answer the category asked (Ranking F1). Before this, the form
      // collected them and kept only the fields above.
      // Asked but never kept until 2026-10-17: the SKU, the sub-type picked on the sub-category step, and every
      // colour picked (the colour column holds the first). The admin's review shows them all.
      const attributes = productAttributes(formValues);
      if (sku.trim()) attributes.sku = sku.trim();
      if (selectedSubType) attributes.subType = selectedSubType;
      const pickedColours = formValues["colors"];
      if (Array.isArray(pickedColours) && pickedColours.length > 1) attributes.colours = pickedColours;
      // The Details step's "Customization Available?" and the Pricing step's switch are one fact.
      const customizable = customizationAvailable || formValues["customizationAvailable"] === "true";
      const unitValue = unit || null;

      if (isEdit && editId) {
        // Edit: update the row, then the photos as the form now has them (saveEditedImages).
        await updateProduct(editId, {
          name: productName,
          description: productDescription || null,
          price_value: price ? Number(price) : null,
          moq: (formValues["moq"] as string) || undefined,
          fabric, gsm, fit_type: fitType, gender,
          sizes,
          colour,
          pattern,
          occasion,
          neck_type: neckType,
          sleeve_type: sleeveType,
          collar_type: collarType,
          country_of_origin: countryOfOrigin,
          waist_sizes: waistSizes,
          lengths,
          location,
          attributes,
          customization_available: customizable,
          unit: unitValue,
          // A paused listing (over the plan's limit, subscriptions P4) stays paused: sending
          // it to review would count against the limit that paused it. The database marks
          // the edit, so it goes through review when the plan has room for it again.
          status: pausedEdit ? undefined : nextStatus,
        });
        await saveEditedImages(editId);
        await uploadMedia(editId, subNameForMedia());
        queryClient.invalidateQueries({ queryKey: ["products"] });
        toast.success("Product updated", {
          description: pausedEdit
            ? "This listing is paused. It goes through review when your plan has room for it again."
            : nextStatus === "under_review" ? "Resubmitted for review (24–48h)." : "Saved as draft.",
        });
        navigate("/products");
        return;
      }

      // Use the subcategory the vendor actually picked. resolveCategoryId is
      // only a fallback for a taxonomy row that hasn't been seeded yet — it
      // regex-matches the product NAME down to one of the 11 legacy buckets,
      // which is what made the buyer-facing Categories filter useless.
      const subName = selectedSubCategory
        ? category?.subCategories.find((s) => s.id === selectedSubCategory)?.name
        : undefined;
      const category_id =
        (await resolveSubcategoryId(category?.name, subName)) ??
        (await resolveCategoryId(subName, category?.name, productName));

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
          sizes,
          colour,
          pattern,
          occasion,
          neck_type: neckType,
          sleeve_type: sleeveType,
          collar_type: collarType,
          country_of_origin: countryOfOrigin,
          waist_sizes: waistSizes,
          lengths,
          location,
          attributes,
          customization_available: customizable,
          unit: unitValue,
          status: nextStatus,
        })
        .select("id")
        .single();
      if (error) throw error;

      const urls = await uploadImages(inserted.id, images.flatMap((i) => (i.file ? [i.file] : [])));
      if (urls.length > 0) {
        const { error: imgErr } = await supabase
          .from("product_images")
          .insert(urls.map((url, position) => ({ product_id: inserted.id, url, position })));
        if (imgErr) throw imgErr;
      }
      await uploadMedia(inserted.id, subName ?? category?.name ?? null);

      // Refresh any cached product lists so the vendor's Products page and the
      // buyer feed reflect the new row immediately.
      queryClient.invalidateQueries({ queryKey: ["products"] });

      toast.success(nextStatus === "draft" ? "Saved as draft" : "Product submitted for review", {
        description: nextStatus === "draft"
          ? "Only you can see it — publish it anytime from Products."
          : "It becomes visible to buyers once approved (24–48h).",
      });
      navigate("/products");
    } catch (err) {
      toast.error("Upload failed", { description: errorMessage(err) });
    } finally {
      setSubmitting(false);
      setMediaProgress(null);
    }
  };

  // The sub-category's name in edit mode, where the category steps are skipped.
  const subNameForMedia = () => (editSub?.name ?? null);

  // Videos and PDFs, after the listing row exists. A failure here doesn't undo the saved listing: it says which
  // file didn't go, so the vendor can add it again from Edit.
  const uploadMedia = async (productId: string, categoryName: string | null) => {
    if (!user) return;
    const failed: string[] = [];
    for (const [i, { file, probe }] of videoFiles.entries()) {
      setMediaProgress(`Uploading video ${i + 1} of ${videoFiles.length}…`);
      try {
        await createProductVideo(user.id, {
          file,
          thumbnail: probe.poster ?? null,
          caption: productName.slice(0, 150),
          productId,
          category: categoryName ?? undefined,
          durationSeconds: Math.round(probe.durationSeconds),
          videoWidth: probe.width,
          videoHeight: probe.height,
          onProgress: (f) => setMediaProgress(`Uploading video ${i + 1} of ${videoFiles.length}… ${Math.round(f * 100)}%`),
        });
      } catch (err) {
        failed.push(`${file.name} (${errorMessage(err)})`);
      }
    }
    if (pdfFiles.length) {
      setMediaProgress("Uploading PDFs…");
      try {
        const { count } = await supabase.from("product_documents").select("*", { count: "exact", head: true }).eq("product_id", productId);
        await uploadProductDocuments(user.id, productId, pdfFiles, count ?? 0);
      } catch (err) {
        failed.push(`${pdfFiles.map((f) => f.name).join(", ")} (${errorMessage(err)})`);
      }
    }
    if (videoFiles.length) queryClient.invalidateQueries({ queryKey: ["product_videos"] });
    if (pdfFiles.length) queryClient.invalidateQueries({ queryKey: ["product_documents", productId] });
    if (failed.length) {
      toast.error("Some files didn't upload", { description: `${failed.join(", ")}. Your listing is saved; add them again from Edit.` });
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
        {/* Every change to a live listing goes back to review: the database sends it there whatever
            the page saves (20261010124955_listing_edit_rereview), so say so before the seller saves. */}
        {isEdit && editing?.status === "live" && (
          <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-testid="edit-rereview-note">
            This listing is live. Saving changes sends it back to review: buyers won't see it until it's approved (24–48h).
          </p>
        )}
      </motion.div>

      {/* Plan product-cap notice */}
      {productCapReached && (
        <motion.div variants={section} className="mb-6">
          <Link
            to="/subscription"
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
          >
            <span className="text-sm font-semibold text-amber-800">
              You've used all {productCap} product listings on your current plan. You can still save drafts — upgrade to publish more.
            </span>
            <span className="shrink-0 text-sm font-bold text-amber-900">Upgrade →</span>
          </Link>
        </motion.div>
      )}

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

      <motion.form variants={section} onSubmit={(e) => handleSubmit("review", e)}>
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
              <h2 className="mb-4 text-lg font-semibold text-card-foreground">
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
              <h2 className="mb-4 text-lg font-semibold text-card-foreground">
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
                <h2 className="mb-4 text-lg font-semibold text-card-foreground">
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
                  <h2 className="mb-4 text-lg font-semibold text-card-foreground">
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
                      <h2 className="text-lg font-semibold text-card-foreground">
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
              <h2 className="mb-4 text-lg font-semibold text-card-foreground">
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
                      accept="video/mp4,video/webm"
                      multiple
                      className="hidden"
                      data-testid="product-video-input"
                      onChange={pickVideos}
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
                      data-testid="product-pdf-input"
                      onChange={pickPdfs}
                    />
                    <FileText className="mr-2 h-4 w-4" />
                    Add PDF
                  </label>
                </div>
              </div>

              {images.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:gap-4">
                  {images.map(({ src, rowId }, index) => (
                    <motion.div
                      key={rowId ?? src}
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
                        aria-label={`Remove image ${index + 1}`}
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
                      <p className="mb-2 text-xs text-muted-foreground">Each goes to Cosora's review as a Video Closeup of this listing, and shows on the listing once approved.</p>
                      <div className="flex flex-wrap gap-2">
                        {videoFiles.map(({ file, probe }, index) => (
                          <span key={`${file.name}-${index}`} className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs text-foreground">
                            <Video className="mr-1 h-3 w-3 text-accent" />
                            {file.name} · {Math.round(probe.durationSeconds)}s
                            <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setVideoFiles((prev) => prev.filter((_, i) => i !== index))} className="ml-1.5 text-muted-foreground hover:text-foreground">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {pdfFiles.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">PDFs</p>
                      <div className="flex flex-wrap gap-2">
                        {pdfFiles.map((file, index) => (
                          <span key={`${file.name}-${index}`} className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs text-foreground">
                            <FileText className="mr-1 h-3 w-3 text-accent" />
                            {file.name} · {fileSizeLabel(file.size)}
                            <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setPdfFiles((prev) => prev.filter((_, i) => i !== index))} className="ml-1.5 text-muted-foreground hover:text-foreground">
                              <X className="h-3 w-3" />
                            </button>
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
                <h2 className="mb-4 text-lg font-semibold text-card-foreground">
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

                {/* Sizes + customization. Both drive the buyer's product-scoped
                    Request Quotation form: sizes populate its size/quantity rows,
                    and the toggle decides whether it offers customization at all. */}
                <div className="mt-6 space-y-4 border-t border-border pt-6">
                  {!hasDynamicSizes && pricingSizes && (
                    <div className="space-y-2">
                      <Label>{editSizeField?.label ?? "Available sizes"}</Label>
                      <div className="flex flex-wrap gap-2">
                        {pricingSizes.map((size) => {
                          const isSelected = selectedSizes.includes(size);
                          return (
                            <button
                              key={size}
                              type="button"
                              onClick={() => toggleSize(size)}
                              className={cn(
                                "flex h-10 min-w-[40px] items-center justify-center rounded-lg border px-3 text-sm font-medium transition-all",
                                isSelected
                                  ? "border-accent bg-accent text-accent-foreground"
                                  : "border-border bg-card text-foreground hover:border-accent/50 hover:bg-accent/5",
                              )}
                            >
                              {size}
                              {isSelected && <Check className="ml-1 h-3 w-3" />}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedSizes.length > 0
                          ? `Selected: ${selectedSizes.join(", ")}`
                          : "Optional. Buyers pick from these when requesting a quotation."}
                      </p>
                    </div>
                  )}

                  {hasDynamicSizes && (
                    <div className="space-y-1">
                      <Label>Available sizes</Label>
                      <p className="text-xs text-muted-foreground">
                        {selectedSizes.length > 0
                          ? `${selectedSizes.join(", ")} (set in Details)`
                          : "None selected. Go back to Details to choose sizes."}
                      </p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label>Colour</Label>
                    <p className="text-xs text-muted-foreground">
                      {resolveColour(formValues) ?? "Not set. Buyers see no colour on this listing."}
                    </p>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="customization">Customization available</Label>
                      <p className="text-xs text-muted-foreground">
                        Let buyers send custom design notes and reference images with a quote request.
                      </p>
                    </div>
                    <Switch
                      id="customization"
                      checked={customizationAvailable}
                      onCheckedChange={setCustomizationAvailable}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 lg:space-y-6">
                {/* Summary */}
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 lg:p-6">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
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
                <motion.button type="button" onClick={() => handleSubmit("draft")} whileTap={TAP} transition={TAP_T} disabled={submitting} className="inline-flex items-center justify-center rounded-md border border-border bg-background px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/5 disabled:opacity-60">
                  {submitting ? "Saving…" : "Save as Draft"}
                </motion.button>
                <motion.button type="submit" whileTap={TAP} transition={TAP_T} disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-md bg-yellow-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-yellow-600 disabled:opacity-60">
                  <Check className="h-4 w-4" />
                  {mediaProgress ?? (isEdit ? (submitting ? "Saving…" : "Save Changes") : submitting ? "Publishing…" : "Publish")}
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
