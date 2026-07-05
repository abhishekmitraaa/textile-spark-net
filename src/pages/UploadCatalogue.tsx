import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMyCatalogues, createCatalogue, deleteCatalogue } from "@/lib/queries/catalogues";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, FileText, Upload, X, CheckCircle2,
  Eye, Trash2, Download, Clock, Lock, Globe, Users,
  AlertCircle, BookOpen, Plus,
} from "lucide-react";

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

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface CatalogueFile {
  id: string;
  name: string;
  size: string;
  pages: number;
  uploadedAt: string;
  status: "live" | "under_review" | "rejected";
  visibility: "all" | "verified" | "private";
  downloads: number;
  views: number;
}

// ─────────────────────────────────────────────────────────────
// STATUS CONFIG
// ─────────────────────────────────────────────────────────────

const statusConfig = {
  live: {
    label: "Live",
    bg: "bg-green-50",
    text: "text-green-600",
    border: "border-green-200",
    icon: CheckCircle2,
  },
  under_review: {
    label: "Under Review",
    bg: "bg-orange-50",
    text: "text-orange-600",
    border: "border-orange-200",
    icon: Clock,
  },
  rejected: {
    label: "Rejected",
    bg: "bg-red-50",
    text: "text-red-500",
    border: "border-red-200",
    icon: AlertCircle,
  },
};

const visibilityConfig = {
  all: { label: "All Buyers", icon: Globe },
  verified: { label: "Verified Buyers", icon: Users },
  private: { label: "Private", icon: Lock },
};

// ─────────────────────────────────────────────────────────────
// EXISTING CATALOGUE CARD
// ─────────────────────────────────────────────────────────────

function CatalogueCard({
  catalogue,
  onDelete,
}: {
  catalogue: CatalogueFile;
  onDelete: (id: string) => void;
}) {
  const status = statusConfig[catalogue.status];
  const visibility = visibilityConfig[catalogue.visibility];
  const StatusIcon = status.icon;
  const VisibilityIcon = visibility.icon;

  return (
    <motion.div
      variants={listItem}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
    >
      <div className="flex items-start gap-3">
        {/* PDF icon */}
        <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
          <FileText className="w-6 h-6 text-red-500" />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 leading-snug truncate">
              {catalogue.name}
            </p>
            <button
              onClick={() => onDelete(catalogue.id)}
              className="p-1 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                status.bg,
                status.text,
                status.border
              )}
            >
              <StatusIcon className="w-2.5 h-2.5" />
              {status.label}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
              <VisibilityIcon className="w-3 h-3" />
              {visibility.label}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>{catalogue.size}</span>
            {catalogue.pages > 0 && (<><span>·</span><span>{catalogue.pages} pages</span></>)}
            <span>·</span>
            <span>Uploaded {catalogue.uploadedAt}</span>
          </div>

          {catalogue.status === "live" && (
            <div className="flex items-center gap-4 mt-2 text-xs">
              <span className="flex items-center gap-1 text-gray-500">
                <Eye className="w-3 h-3" /> {catalogue.views} views
              </span>
              <span className="flex items-center gap-1 text-gray-500">
                <Download className="w-3 h-3" /> {catalogue.downloads} downloads
              </span>
            </div>
          )}

          {catalogue.status === "under_review" && (
            <p className="text-xs text-orange-500 mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Under review · typically 24–48 hours
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const UploadCatalogue = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: myCatalogues = [] } = useMyCatalogues(user?.id);

  // Upload state
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [catalogueName, setCatalogueName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"all" | "verified" | "private">("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Vendor's own catalogues (any status) mapped into the card shape.
  const catalogues: CatalogueFile[] = myCatalogues.map((c) => ({
    id: c.id,
    name: c.title,
    size: "PDF",
    pages: c.pageCount ?? 0,
    uploadedAt: c.createdAt,
    status: c.status === "draft" ? "under_review" : c.status,
    visibility: "all",
    downloads: 0,
    views: 0,
  }));

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Drag handlers ──
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleFileSelect = (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File must be under 20 MB");
      return;
    }
    setSelectedFile(file);
    if (!catalogueName) setCatalogueName(file.name.replace(".pdf", ""));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (!user) { toast.error("Sign in as a vendor to publish"); return; }
    if (!selectedFile) {
      toast.error("Please select a PDF file to upload");
      return;
    }
    if (!catalogueName.trim()) {
      toast.error("Please enter a catalogue name");
      return;
    }
    setIsSubmitting(true);
    try {
      await createCatalogue(user.id, {
        title: catalogueName.trim(),
        description: description || null,
        file: selectedFile,
      });
      qc.invalidateQueries({ queryKey: ["catalogues"] });
      setSelectedFile(null);
      setCatalogueName("");
      setDescription("");
      setVisibility("all");
      toast.success("Catalogue uploaded!", {
        description: "It'll go live after review (24–48 hours).",
      });
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCatalogue(id);
      qc.invalidateQueries({ queryKey: ["catalogues"] });
      toast.success("Catalogue removed");
    } catch (err) {
      toast.error("Couldn't remove", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="max-w-2xl mx-auto pb-12 space-y-5">

        {/* ── Header ── */}
        <motion.div variants={section} className="flex items-center gap-3">
          <motion.button
            whileTap={TAP}
            transition={TAP_T}
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </motion.button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-none">
              Upload Catalogue
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Share your product catalogue with buyers
            </p>
          </div>
        </motion.div>

        {/* ── Info banner ── */}
        <motion.div variants={section} className="bg-accent/5 border border-accent/20 rounded-2xl p-4 flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-accent mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Why upload a catalogue?
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Buyers browsing your profile can download your catalogue directly.
              Vendors with catalogues get <span className="font-semibold text-accent">3× more inquiries</span> on average.
            </p>
          </div>
        </motion.div>

        {/* ── Upload section ── */}
        <motion.div variants={section} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-900">Upload PDF</h2>

          {/* Drop zone or selected file */}
          {!selectedFile ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all",
                dragActive
                  ? "border-accent bg-accent/5"
                  : "border-gray-200 hover:border-accent/50 hover:bg-gray-50"
              )}
            >
              <div
                className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
                  dragActive ? "bg-accent/10" : "bg-gray-100"
                )}
              >
                <Upload
                  className={cn(
                    "w-7 h-7 transition-colors",
                    dragActive ? "text-accent" : "text-gray-400"
                  )}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900">
                  {dragActive ? "Drop your PDF here" : "Drag & drop your catalogue"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  or <span className="text-accent font-semibold">browse files</span>
                </p>
              </div>
              <p className="text-[10px] text-gray-400">PDF only · Max 20 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleInputChange}
              />
            </div>
          ) : (
            <div className="border border-gray-200 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatBytes(selectedFile.size)} · PDF
                </p>
              </div>
              <button
                onClick={removeFile}
                className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Catalogue name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Catalogue Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Summer Collection 2025"
              value={catalogueName}
              onChange={(e) => setCatalogueName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Description{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Briefly describe what's in this catalogue — categories, season, MOQ range, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none transition-all"
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              Who can view this catalogue?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: "all", label: "All Buyers", icon: Globe, desc: "Anyone on Cosora" },
                  { value: "verified", label: "Verified Only", icon: Users, desc: "TradeSEAL buyers" },
                  { value: "private", label: "Private", icon: Lock, desc: "Only you" },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const isSelected = visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setVisibility(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all",
                      isSelected
                        ? "border-accent bg-accent/5 text-accent"
                        : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-semibold leading-tight">
                      {opt.label}
                    </span>
                    <span className="text-[10px] text-gray-400 leading-tight">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Moderation notice */}
          <div className="flex items-start gap-2 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5">
            <Clock className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
            <p className="text-xs text-orange-700 leading-relaxed">
              Catalogues are reviewed by the Cosora team before going live.
              This usually takes <span className="font-semibold">24–48 hours</span>.
            </p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={cn(
              "w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2 shadow-sm",
              isSubmitting
                ? "bg-accent/60 cursor-not-allowed"
                : "bg-accent hover:bg-accent/90 active:scale-[0.99]"
            )}
          >
            {isSubmitting ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full"
                />
                Uploading…
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> Upload Catalogue
              </>
            )}
          </button>
        </motion.div>

        {/* ── Existing catalogues ── */}
        {catalogues.length > 0 && (
          <motion.div variants={section} className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900 px-1">
              Your Catalogues ({catalogues.length})
            </h2>
            <motion.div variants={listContainer} className="space-y-3">
              {catalogues.map((cat) => (
                <CatalogueCard
                  key={cat.id}
                  catalogue={cat}
                  onDelete={handleDelete}
                />
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* ── Empty state (no catalogues) ── */}
        {catalogues.length === 0 && !selectedFile && (
          <motion.div variants={section} className="bg-white rounded-2xl border border-gray-100 py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <FileText className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-400">No catalogues yet</p>
            <p className="text-xs text-gray-400 max-w-xs">
              Upload your first PDF catalogue to share your full product range with buyers.
            </p>
          </motion.div>
        )}
      </motion.div>
    </DashboardLayout>
  );
};

export default UploadCatalogue;
