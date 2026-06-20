import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Phone, Star, Bookmark, Share2 } from "lucide-react";

export interface VideoCloseUp {
  id: string;
  vendorId: string;
  category: string;
  brandName: string;
  brandLine: string;
  price: string;
  moq: string;
  rating: number;
  reviews: string;
  thumbnail: string;
}

interface VideoCloseUpsViewerProps {
  videos: VideoCloseUp[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function VideoCloseUpsViewer({ videos, initialIndex, isOpen, onClose }: VideoCloseUpsViewerProps) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(initialIndex);
  const [saved, setSaved] = useState(false);

  const current = videos[index];

  const goNext = () => setIndex(i => (i + 1) % videos.length);
  const goPrev = () => setIndex(i => (i - 1 + videos.length) % videos.length);

  if (!current) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black flex items-center justify-center"
        >
          {/* Close */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3">
            <button onClick={onClose} className="p-1.5">
              <X className="w-6 h-6 text-white" />
            </button>
            <span className="text-sm text-white font-medium">{current.category}</span>
            <div className="w-8" />
          </div>

          {/* Progress indicator */}
          <div className="absolute top-12 left-3 right-3 z-10 flex gap-1">
            {videos.map((_, i) => (
              <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                <div className={`h-full bg-white transition-all ${i === index ? "w-full" : i < index ? "w-full" : "w-0"}`} />
              </div>
            ))}
          </div>

          {/* Video / image area — tap zones */}
          <div className="relative w-full h-full max-w-md mx-auto">
            <img
              src={current.thumbnail}
              alt={current.brandLine}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />

            {/* tap left/right to navigate */}
            <button onClick={goPrev} className="absolute left-0 top-0 w-1/2 h-full" aria-label="Previous video" />
            <button onClick={goNext} className="absolute right-0 top-0 w-1/2 h-full" aria-label="Next video" />

            {/* Right-side actions */}
            <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5 z-10">
              <button onClick={() => setSaved(p => !p)} className="flex flex-col items-center gap-1">
                <div className="w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                  <Bookmark className={`w-5 h-5 ${saved ? "fill-white text-white" : "text-white"}`} />
                </div>
                <span className="text-[10px] text-white">Save</span>
              </button>
              <button className="flex flex-col items-center gap-1">
                <div className="w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                  <Share2 className="w-5 h-5 text-white" />
                </div>
                <span className="text-[10px] text-white">Share</span>
              </button>
            </div>

            {/* Bottom product info card */}
            <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
              <div className="bg-white/95 backdrop-blur rounded-2xl p-3 flex items-center gap-3">
                <img src={current.thumbnail} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">{current.brandName}</p>
                  <p className="text-[11px] text-gray-500 truncate">{current.brandLine}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-bold text-[#ef4d62]">{current.price}</span>
                    <span className="text-[10px] text-gray-400">MOQ: {current.moq}</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                      <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" /> {current.rating} · {current.reviews}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/chats/${current.vendorId}`)}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 bg-[#ef4d62] text-white text-xs font-bold rounded-xl hover:bg-[#ef4d62]/90 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" /> Call Now
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}