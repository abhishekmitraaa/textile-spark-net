import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMyProducts } from "@/lib/queries/products";
import {
  useMyVideos, createProductVideo, deleteProductVideo, probeVideoFile,
  MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, ACCEPTED_VIDEO_MIME, type VideoProbe,
} from "@/lib/queries/videos";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, Video, Upload, X, CheckCircle2, Clock,
  Play, Heart, MessageCircle, Share2, Bookmark,
  AlertCircle, Sparkles, Tag, Image, Eye,
  Trash2, TrendingUp, ChevronDown, ChevronRight,
  Volume2, ShoppingBag,
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

interface UploadedVideoCloseup {
  id: string;
  caption: string;
  productName: string;
  thumbnail: string;
  duration: string;
  uploadedAt: string;
  status: "live" | "under_review" | "rejected";
  views: number;
  likes: number;
  shares: number;
}

const THUMB_PLACEHOLDER = "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=400&h=700&fit=crop";

const statusConfig = {
  live:         { label: "Live",         bg: "bg-green-50",  text: "text-green-600",  border: "border-green-200",  icon: CheckCircle2 },
  under_review: { label: "Under Review", bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200", icon: Clock        },
  rejected:     { label: "Rejected",     bg: "bg-red-50",    text: "text-red-500",    border: "border-red-200",    icon: AlertCircle  },
};

// ─────────────────────────────────────────────────────────────
// PHONE MOCKUP — buyer-side video closeup preview
// ─────────────────────────────────────────────────────────────

function VideoCloseupPhoneMockup({
  caption,
  productName,
  thumbnail,
  hasVideo,
}: {
  caption: string;
  productName: string;
  thumbnail: string | null;
  hasVideo: boolean;
}) {
  const displayCaption = caption || "Your caption will appear here…";
  const displayProduct = productName || "Tag a product";
  const bgImage = thumbnail || "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=700&fit=crop";

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Preview in Buyer Feed
      </p>

      {/* Phone frame */}
      <div className="relative w-[180px] h-[320px] rounded-[28px] border-[6px] border-gray-800 bg-black shadow-2xl overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-3 bg-gray-800 rounded-b-xl z-20" />

        {/* Video / thumbnail background */}
        <div className="absolute inset-0">
          <img src={bgImage} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10" />
        </div>

        {/* Play icon (when no real video) */}
        {!hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>
        )}

        {/* Top bar */}
        <div className="absolute top-4 left-0 right-0 flex items-center justify-between px-3 z-10">
          <span className="text-[7px] font-bold text-white bg-[#256fef] px-1.5 py-0.5 rounded-full tracking-wide">
            CLOSEUP
          </span>
          <Volume2 className="w-3 h-3 text-white" />
        </div>

        {/* Right action buttons */}
        <div className="absolute right-2 bottom-20 flex flex-col items-center gap-3 z-10">
          {[
            { Icon: Heart,         label: "312"  },
            { Icon: MessageCircle, label: "48"   },
            { Icon: Share2,        label: "Share" },
            { Icon: Bookmark,      label: ""     },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <div className="w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
              {label && <span className="text-[8px] text-white font-semibold">{label}</span>}
            </div>
          ))}
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 z-10">
          {/* Vendor row */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-5 h-5 rounded-full bg-[#256fef] border border-white flex items-center justify-center">
              <span className="text-[6px] font-bold text-white">TM</span>
            </div>
            <span className="text-[9px] font-bold text-white">Textile Mfr.</span>
            <span className="text-[8px] text-white/60 ml-auto">{hasVideo ? "Now" : "2h ago"}</span>
          </div>

          {/* Caption */}
          <p className="text-[8px] text-white leading-tight line-clamp-2 mb-2">
            {displayCaption}
          </p>

          {/* Product tag chip */}
          <div className="flex items-center gap-1 bg-white/15 backdrop-blur-sm rounded-full px-2 py-1">
            <ShoppingBag className="w-2.5 h-2.5 text-white" />
            <span className="text-[8px] text-white font-medium truncate max-w-[100px]">
              {displayProduct}
            </span>
            <ChevronRight className="w-2.5 h-2.5 text-white shrink-0" />
          </div>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 text-center max-w-[180px]">
        Buyers browse video closeups like this — your product is one tap away
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VIDEO CLOSEUP CARD — existing closeups list
// ─────────────────────────────────────────────────────────────

function VideoCloseupCard({
  closeup,
  onDelete,
}: {
  closeup: UploadedVideoCloseup;
  onDelete: (id: string) => void;
}) {
  const status = statusConfig[closeup.status];
  const StatusIcon = status.icon;

  return (
    <motion.div
      variants={listItem}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      <div className="flex gap-3 p-4">
        {/* Thumbnail */}
        <div className="relative w-16 h-24 rounded-xl overflow-hidden shrink-0 bg-gray-100">
          <img src={closeup.thumbnail} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <Play className="w-4 h-4 text-white fill-white" />
          </div>
          {closeup.duration && (
            <span className="absolute bottom-1 right-1 text-[9px] text-white font-bold bg-black/60 rounded px-1">
              {closeup.duration}
            </span>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className={cn(
              "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
              status.bg, status.text, status.border
            )}>
              <StatusIcon className="w-2.5 h-2.5" />
              {status.label}
            </span>
            <button
              onClick={() => onDelete(closeup.id)}
              className="p-1 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs font-semibold text-gray-900 mt-1.5 line-clamp-2 leading-snug">
            {closeup.caption}
          </p>
          <p className="text-[10px] text-[#256fef] mt-0.5 flex items-center gap-1 truncate">
            <Tag className="w-2.5 h-2.5" /> {closeup.productName}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">{closeup.uploadedAt}</p>

          {closeup.status === "live" && (
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <Eye className="w-3 h-3" /> {closeup.views.toLocaleString()}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <Heart className="w-3 h-3" /> {closeup.likes}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <Share2 className="w-3 h-3" /> {closeup.shares}
              </span>
            </div>
          )}

          {closeup.status === "under_review" && (
            <p className="text-[10px] text-orange-500 mt-1.5 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> Under review · 24–48 hrs
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

const UploadVideo = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: myProducts = [] } = useMyProducts(user?.id);
  const { data: myVideos = [] } = useMyVideos(user?.id);

  const [dragActive, setDragActive]           = useState(false);
  const [selectedFile, setSelectedFile]       = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile]     = useState<File | null>(null);
  const [thumbnailUrl, setThumbnailUrl]       = useState<string | null>(null);
  const [caption, setCaption]                 = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [productOpen, setProductOpen]         = useState(false);
  const [isSubmitting, setIsSubmitting]       = useState(false);
  // Duration / intrinsic size / generated poster, read off the picked file.
  const [probe, setProbe]                     = useState<VideoProbe | null>(null);
  const [probing, setProbing]                 = useState(false);
  // Set when probeVideoFile() came back null, i.e. the browser could not read
  // this file's duration. Blocks submit — see handleFileSelect.
  const [probeFailed, setProbeFailed]         = useState(false);
  // 0..1, driven by TUS chunk callbacks so a long upload isn't a dead spinner.
  const [progress, setProgress]               = useState(0);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const selectedProductObj = myProducts.find((p) => p.id === selectedProduct);

  // 45 -> "0:45", 92 -> "1:32"
  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

  // Vendor's own closeups (any status) mapped into the card shape.
  const closeups: UploadedVideoCloseup[] = myVideos.map((v) => ({
    id: v.id,
    caption: v.caption,
    productName: v.productName || v.category,
    thumbnail: v.thumbnail ?? THUMB_PLACEHOLDER,
    // Real length now that it's probed at upload; blank on rows created before
    // duration_seconds existed rather than showing a made-up number.
    duration: v.durationSeconds != null ? formatDuration(v.durationSeconds) : "",
    uploadedAt: v.createdAt,
    status: v.status === "draft" ? "under_review" : v.status,
    views: v.views,
    likes: v.likes,
    shares: 0,
  }));

  // ── File handlers ──
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

  const handleFileSelect = async (file: File) => {
    // .mov is no longer accepted: an iPhone's default .mov is HEVC, which
    // plays on Safari and fails on Chrome and Android — most buyers here —
    // and there is no transcoding step to rescue it. The bucket enforces the
    // same allowlist server-side.
    if (!(ACCEPTED_VIDEO_MIME as readonly string[]).includes(file.type)) {
      toast.error("Please upload an MP4 or WebM file", {
        description: "On iPhone, share the clip as \"Most Compatible\" to get an MP4.",
      });
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(`Video must be under ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB`, {
        description: "Shorter clips at 1080×1920 look better in the reel and load far faster for buyers.",
      });
      return;
    }
    setSelectedFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    // Clear any previous file's probe before starting a new one. Without this,
    // picking a good clip and then a bad one leaves the OLD probe in state —
    // the duration check would pass on the previous file's numbers, and those
    // numbers would be persisted against the new upload.
    setProbe(null);
    setProbeFailed(false);

    // Probe for duration/size and take a poster frame from the file itself.
    setProbing(true);
    const probe = await probeVideoFile(file);
    setProbing(false);

    // A failed probe used to fall through here and leave the file selected and
    // submittable — which silently skipped the MAX_VIDEO_SECONDS check below,
    // leaving only the 50MB byte cap. At a low bitrate that is many minutes of
    // video. Duration is not optional, so an unverifiable clip is held back
    // rather than waved through.
    if (!probe) {
      setProbeFailed(true);
      toast.error("Couldn't read this video's length", {
        description: "Re-export it as an MP4 (H.264) and try again — we can't publish a clip we can't check against the 60s limit.",
      });
      return;
    }

    if (probe.durationSeconds > MAX_VIDEO_SECONDS) {
      toast.error(`Clip must be ${MAX_VIDEO_SECONDS} seconds or shorter`, {
        description: `This one is ${Math.round(probe.durationSeconds)}s.`,
      });
      removeFile();
      return;
    }
    if (probe.width > probe.height) {
      toast.warning("This clip is landscape", {
        description: "The reel is full-screen portrait (9:16), so a landscape video will be cropped.",
      });
    }
    setProbe(probe);
    // The vendor's own cover always wins — only fill in when they haven't set one.
    if (probe.poster && !thumbnailFile) {
      setThumbnailFile(probe.poster);
      setThumbnailUrl(URL.createObjectURL(probe.poster));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleThumbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setThumbnailFile(file); setThumbnailUrl(URL.createObjectURL(file)); }
  };

  const removeFile = () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setSelectedFile(null);
    setVideoPreviewUrl(null);
    setProbe(null);
    setProbeFailed(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatBytes = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  // ── Submit ──
  const handleSubmit = async () => {
    if (!user) { toast.error("Sign in as a vendor to publish"); return; }
    if (!selectedFile) { toast.error("Please select a video to upload"); return; }
    if (!caption.trim()) { toast.error("Add a caption for your video closeup"); return; }
    if (!selectedProduct) { toast.error("Tag a product so buyers can shop directly"); return; }
    if (probing) { toast.error("Still checking your video — one moment"); return; }
    // The real duration gate. handleFileSelect rejects anything over
    // MAX_VIDEO_SECONDS, but only when it managed to read a duration at all;
    // this is what stops an unverifiable file being submitted anyway.
    if (!probe || probeFailed) {
      toast.error("Couldn't verify this video's length", {
        description: `We can't publish a clip without checking it against the ${MAX_VIDEO_SECONDS}s limit. Re-export as MP4 (H.264) and reselect it.`,
      });
      return;
    }

    setIsSubmitting(true);
    setProgress(0);
    try {
      await createProductVideo(user.id, {
        file: selectedFile,
        thumbnail: thumbnailFile,
        caption: caption.trim(),
        productId: selectedProduct,
        durationSeconds: probe ? Math.round(probe.durationSeconds) : null,
        videoWidth: probe?.width ?? null,
        videoHeight: probe?.height ?? null,
        onProgress: setProgress,
      });
      qc.invalidateQueries({ queryKey: ["product_videos"] });
      removeFile();
      setCaption("");
      setSelectedProduct("");
      setThumbnailFile(null);
      setThumbnailUrl(null);
      setProbe(null);
      setProbeFailed(false);
      toast.success("Video closeup uploaded!", {
        description: "It'll appear in the buyer feed after review (24–48 hours).",
      });
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProductVideo(id);
      qc.invalidateQueries({ queryKey: ["product_videos"] });
      toast.success("Video closeup removed");
    } catch (err) {
      toast.error("Couldn't remove", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="max-w-4xl mx-auto pb-12 space-y-5">

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
            <h1 className="text-lg font-bold text-gray-900 leading-none">Upload Video Closeup</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Short product videos that appear in the buyer browsing feed
            </p>
          </div>
        </motion.div>

        {/* ── Reach stat banner ── */}
        <motion.div variants={section} className="bg-gradient-to-r from-[#256fef] to-[#1a55cc] rounded-2xl p-4 text-white flex items-center gap-4">
          <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold">Video Closeups get 5× more reach</p>
            <p className="text-xs text-white/75 mt-0.5">
              Buyers discover products through short videos before enquiring. Tag a product and let the video closeup drive the lead.
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-center shrink-0">
            <TrendingUp className="w-5 h-5 text-white/80" />
            <span className="text-[10px] text-white/60 mt-0.5">More leads</span>
          </div>
        </motion.div>

        {/* ── Tips row ── */}
        <motion.div variants={section} className="grid grid-cols-3 gap-2">
          {[
            { label: "Duration", value: "15–60 sec", hint: "Sweet spot for engagement" },
            { label: "Ratio",    value: "9 : 16",    hint: "Portrait for full-screen"  },
            { label: "Max Size", value: "50 MB",     hint: "MP4 or WebM"              },
          ].map((tip) => (
            <div key={tip.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
              <p className="text-xs font-bold text-gray-900">{tip.value}</p>
              <p className="text-[10px] text-[#256fef] font-semibold mt-0.5">{tip.label}</p>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{tip.hint}</p>
            </div>
          ))}
        </motion.div>

        {/* ── Two-column layout: form + phone preview ── */}
        <div className="flex flex-col lg:flex-row gap-5 items-start">

          {/* LEFT — Upload form */}
          <motion.div variants={section} className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Upload Video</h2>

            {/* Drop zone / video preview */}
            {!selectedFile ? (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all min-h-[200px]",
                  dragActive
                    ? "border-[#256fef] bg-[#256fef]/5"
                    : "border-gray-200 hover:border-[#256fef]/50 hover:bg-gray-50"
                )}
              >
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors",
                  dragActive ? "bg-[#256fef]/10" : "bg-gray-100"
                )}>
                  <Video className={cn("w-8 h-8 transition-colors", dragActive ? "text-[#256fef]" : "text-gray-400")} />
                </div>
                <div className="text-center px-4">
                  <p className="text-sm font-semibold text-gray-900">
                    {dragActive ? "Drop your video here" : "Drag & drop your video"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    or <span className="text-[#256fef] font-semibold">browse files</span>
                  </p>
                </div>
                <p className="text-[10px] text-gray-400">MP4 · WebM · Max 50 MB · up to 60s</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
                <video
                  src={videoPreviewUrl ?? undefined}
                  controls
                  className="w-full h-full object-contain"
                />
                <button
                  onClick={removeFile}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
                <div className="absolute bottom-2 left-2 bg-black/60 rounded-lg px-2 py-1">
                  <p className="text-[10px] text-white font-semibold">
                    {selectedFile.name} · {formatBytes(selectedFile.size)}
                  </p>
                </div>
              </div>
            )}

            {/* Duration could not be read — submit is blocked, so say so here
                rather than letting the vendor fill the whole form first. */}
            {probeFailed && selectedFile && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="text-[11px] leading-relaxed text-amber-800">
                  <span className="font-bold">We couldn't read this video's length.</span>{" "}
                  Closeups have to be {MAX_VIDEO_SECONDS}s or shorter, and we can't publish a clip we
                  weren't able to check. Re-export it as an MP4 (H.264) and select it again.
                </p>
              </div>
            )}

            {/* Caption */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-700">
                  Caption <span className="text-red-400">*</span>
                </label>
                <span className={cn("text-[10px]", caption.length > 150 ? "text-red-400" : "text-gray-400")}>
                  {caption.length}/150
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={150}
                placeholder="Describe your product video closeup — what it's made of, MOQ, why buyers love it…"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#256fef]/30 focus:border-[#256fef]/50 resize-none transition-all"
              />
            </div>

            {/* Tag a product */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Tag a Product <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <button
                  onClick={() => setProductOpen((p) => !p)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 border rounded-xl text-sm transition-all",
                    selectedProduct
                      ? "border-[#256fef]/50 bg-[#256fef]/5 text-gray-900"
                      : "border-gray-200 text-gray-400 hover:border-gray-300"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Tag className={cn("w-3.5 h-3.5 shrink-0", selectedProduct ? "text-[#256fef]" : "text-gray-400")} />
                    <span className="truncate">{selectedProductObj?.name ?? "Select a product"}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                </button>

                <AnimatePresence>
                  {productOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setProductOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute left-0 right-0 top-12 z-20 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden"
                      >
                        {myProducts.length === 0 && (
                          <p className="px-4 py-3 text-xs text-gray-400">No products yet — upload a product first, then tag it here.</p>
                        )}
                        {myProducts.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => { setSelectedProduct(p.id); setProductOpen(false); }}
                            className={cn(
                              "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0",
                              selectedProduct === p.id && "bg-[#256fef]/5"
                            )}
                          >
                            <div className="w-6 h-6 rounded-lg bg-[#256fef]/10 flex items-center justify-center mt-0.5 shrink-0">
                              <ShoppingBag className="w-3 h-3 text-[#256fef]" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 leading-snug">{p.name}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{p.productCode}</p>
                            </div>
                            {selectedProduct === p.id && (
                              <CheckCircle2 className="w-4 h-4 text-[#256fef] ml-auto shrink-0 mt-0.5" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Buyers can tap your tagged product directly from the video closeup
              </p>
            </div>

            {/* Cover thumbnail */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Cover Thumbnail{" "}
                <span className="text-gray-400 font-normal">
                  {probing ? "(generating a cover from your video…)" : "(optional — taken from your video if blank)"}
                </span>
              </label>
              <div
                onClick={() => thumbInputRef.current?.click()}
                className="flex items-center gap-3 border border-dashed border-gray-200 rounded-xl p-3 cursor-pointer hover:border-[#256fef]/50 hover:bg-gray-50 transition-all"
              >
                {thumbnailUrl ? (
                  <>
                    <img src={thumbnailUrl} alt="Thumbnail" className="w-12 h-16 rounded-lg object-cover shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-900">Custom thumbnail set</p>
                      <p className="text-[10px] text-gray-400">Click to change</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setThumbnailFile(null); setThumbnailUrl(null); }}
                      className="p-1 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                      <Image className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700">Upload thumbnail</p>
                      <p className="text-[10px] text-gray-400">JPG or PNG · 9:16 ratio preferred</p>
                    </div>
                  </>
                )}
              </div>
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleThumbChange}
              />
            </div>

            {/* Moderation notice */}
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5">
              <Clock className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
              <p className="text-xs text-orange-700 leading-relaxed">
                All video closeups are reviewed before going live in the buyer feed.
                This takes <span className="font-semibold">24–48 hours</span>.
              </p>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={cn(
                "w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2 shadow-sm",
                isSubmitting
                  ? "bg-[#256fef]/60 cursor-not-allowed"
                  : "bg-[#256fef] hover:bg-[#256fef]/90 active:scale-[0.99]"
              )}
            >
              {isSubmitting ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                    className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full"
                  />
                  {progress > 0 ? `Uploading… ${Math.round(progress * 100)}%` : "Uploading…"}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" /> Publish Video Closeup
                </>
              )}
            </button>

            {/* Real chunk-level progress from the resumable upload. Worth
                showing: a 50MB clip on a phone connection is a long wait, and
                if it drops the next attempt resumes rather than restarting. */}
            {isSubmitting && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-[#256fef] transition-[width] duration-200"
                  style={{ width: `${Math.max(3, Math.round(progress * 100))}%` }}
                />
              </div>
            )}
          </motion.div>

          {/* RIGHT — Phone mockup preview */}
          <motion.div variants={section} className="lg:sticky lg:top-6 self-start">
            <VideoCloseupPhoneMockup
              caption={caption}
              productName={selectedProductObj?.name ?? ""}
              thumbnail={thumbnailUrl}
              hasVideo={!!selectedFile}
            />
          </motion.div>
        </div>

        {/* ── Published video closeups ── */}
        {closeups.length > 0 && (
          <motion.div variants={section} className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900 px-1">
              Your Video Closeups ({closeups.length})
            </h2>
            <motion.div variants={listContainer} className="space-y-3">
              {closeups.map((closeup) => (
                <VideoCloseupCard key={closeup.id} closeup={closeup} onDelete={handleDelete} />
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* ── Empty state ── */}
        {closeups.length === 0 && (
          <motion.div variants={section} className="bg-white rounded-2xl border border-gray-100 py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Video className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-400">No video closeups yet</p>
            <p className="text-xs text-gray-400 max-w-xs">
              Upload your first product video and let buyers discover you through video closeups in the feed.
            </p>
          </motion.div>
        )}
      </motion.div>
    </DashboardLayout>
  );
};

export default UploadVideo;
