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
import { motion } from "framer-motion";
import { Upload as UploadIcon, X, Image, Check, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const Upload = () => {
  const [images, setImages] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);

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

    // Simulate image upload with placeholder
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Product uploaded successfully!", {
      description: "Your product is now pending review.",
    });
  };

  return (
    <DashboardLayout>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <Link
          to="/products"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Products
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Upload Product
        </h1>
        <p className="mt-1 text-muted-foreground">
          Add a new product to your catalog
        </p>
      </motion.div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-6 lg:col-span-2"
          >
            {/* Basic info */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                Basic Information
              </h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Premium Cotton Blend Fabric"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="textiles">Textiles</SelectItem>
                        <SelectItem value="premium">Premium Fabrics</SelectItem>
                        <SelectItem value="eco">Eco-Friendly</SelectItem>
                        <SelectItem value="luxury">Luxury</SelectItem>
                        <SelectItem value="casual">Casual Wear</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input id="sku" placeholder="e.g., FCT-001" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe your product, its features, and benefits..."
                    className="min-h-[120px]"
                  />
                </div>
              </div>
            </div>

            {/* Images */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                Product Images
              </h2>
              <div
                className={cn(
                  "relative rounded-lg border-2 border-dashed p-8 text-center transition-all",
                  dragActive
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/50"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <UploadIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mb-2 text-sm font-medium text-foreground">
                  Drag and drop your images here
                </p>
                <p className="mb-4 text-xs text-muted-foreground">
                  PNG, JPG, or WEBP up to 10MB (max 6 images)
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPlaceholderImage}
                >
                  <Image className="mr-2 h-4 w-4" />
                  Browse Files
                </Button>
              </div>

              {images.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
                  {images.map((src, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-border"
                    >
                      <img
                        src={src}
                        alt={`Product ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                      {index === 0 && (
                        <span className="absolute bottom-1 left-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                          Main
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Specifications */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                Specifications
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="material">Material Composition</Label>
                  <Input id="material" placeholder="e.g., 80% Cotton, 20% Polyester" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">Fabric Weight</Label>
                  <Input id="weight" placeholder="e.g., 200 GSM" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="width">Width</Label>
                  <Input id="width" placeholder="e.g., 58 inches" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="moq">Minimum Order Quantity</Label>
                  <Input id="moq" placeholder="e.g., 100 yards" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {/* Pricing */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                Pricing
              </h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price per Unit</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input id="price" className="pl-7" placeholder="0.00" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yard">Per Yard</SelectItem>
                      <SelectItem value="meter">Per Meter</SelectItem>
                      <SelectItem value="kg">Per Kilogram</SelectItem>
                      <SelectItem value="piece">Per Piece</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-semibold text-card-foreground">
                Status
              </h2>
              <Select defaultValue="draft">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Submit for Review</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                Draft products won't be visible to buyers until approved.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <Button type="submit" variant="gold" size="lg" className="w-full">
                <Check className="mr-2 h-4 w-4" />
                Publish Product
              </Button>
              <Button type="button" variant="outline" size="lg" className="w-full">
                Save as Draft
              </Button>
            </div>
          </motion.div>
        </div>
      </form>
    </DashboardLayout>
  );
};

export default Upload;
