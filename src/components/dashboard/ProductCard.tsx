import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck, MapPin, Phone, Star, MoreVertical, Edit, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProductCardProps {
  id: string;
  name: string;
  category: string;
  price: string;
  image: string;
  status: "active" | "draft" | "pending";
  views: number;
  inquiries: number;
  delay?: number;
  // optional extras — will show fallbacks if not provided
  moq?: string;
  sold?: string;
  location?: string;
  fabric?: string;
  gsm?: string;
  fitType?: string;
  rating?: string;
  reviews?: string;
}

export const ProductCard = ({
  name,
  category,
  price,
  image,
  status,
  views,
  inquiries,
  delay = 0,
  moq = "2",
  sold = "800+",
  location = "Bangalore",
  fabric = "Cotton",
  gsm = "200",
  fitType = "Regular",
  rating = "4.1",
  reviews = "5.6k",
}: ProductCardProps) => {
  const [bookmarked, setBookmarked] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="rounded-xl border border-gray-200 overflow-hidden bg-white"
    >
      {/* ── Image ── */}
      <div className="relative aspect-[3/4] bg-gray-100">
        <img
          src={image}
          alt={name}
          className="h-full w-full object-cover"
        />

        {/* Bookmark — top right */}
        <button
          onClick={() => setBookmarked(p => !p)}
          className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors"
        >
          {bookmarked
            ? <BookmarkCheck className="w-3.5 h-3.5 text-[#256fef] fill-blue-100" />
            : <Bookmark className="w-3.5 h-3.5 text-gray-500" />}
        </button>

        {/* 3-dot menu — top left */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="absolute top-2 left-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors">
              <MoreVertical className="w-3.5 h-3.5 text-gray-600" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" /> Edit Product
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Rating badge — bottom left */}
        <div className="absolute bottom-2 left-2 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 py-0.5 shadow-sm">
          <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
          <span className="text-[9px] font-bold text-gray-800">{rating}</span>
          <span className="text-[9px] text-gray-400">| {reviews}</span>
        </div>

        {/* Status badge — bottom right */}
        <div className={cn(
          "absolute bottom-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full capitalize",
          status === "active"  ? "bg-green-100 text-green-700" :
          status === "pending" ? "bg-amber-100 text-amber-700" :
                                 "bg-gray-100 text-gray-500"
        )}>
          {status}
        </div>
      </div>

      {/* ── Info ── */}
      <div className="p-2 flex flex-col">
        {/* Badge row — fixed height so all cards align even without badge */}
        <div className="h-5 mb-1">
          {status === "active" && (
            <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-600">
              Latest Products
            </span>
          )}
        </div>

        {/* Price | MOQ | Sold */}
        <p className="text-xs font-bold text-[#ef4d62] leading-snug">
          {price} | MOQ: {moq} | {sold} sold
        </p>

        {/* Name | Manufacturer */}
        <p className="text-[10px] text-gray-600 mt-1">
          Product name | <span className="font-bold">Manufacturer</span>
        </p>

        {/* Location */}
        <div className="flex items-center gap-0.5 mt-1">
          <MapPin className="w-2.5 h-2.5 text-gray-500 shrink-0" />
          <span className="text-[10px] font-bold text-gray-700">{location}</span>
        </div>

        {/* Fabric | GSM */}
        <p className="text-[10px] text-gray-500 mt-1">
          Fabric: {fabric} | GSM: {gsm}
        </p>

        {/* Fit Type */}
        <p className="text-[10px] text-gray-500 mt-0.5">Fit Type: {fitType}</p>

        {/* Call Now — always at bottom */}
        <button className="mt-2 w-full flex items-center justify-center gap-1.5 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-xs font-bold py-2 rounded-lg transition-colors">
          <Phone className="w-3 h-3" /> Call Now
        </button>
      </div>
    </motion.div>
  );
};