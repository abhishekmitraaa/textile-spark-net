import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Search, Bell, RefreshCw, ChevronDown, ChevronRight,
  ArrowLeft, Clock, MapPin, Package, TrendingUp, Truck,
  CheckCircle2, Star, Repeat2, AlertCircle, Send,
  FileText, Video, Paperclip, Minus, Plus as PlusIcon,
  MessageSquare, Users, X, Filter,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface RFQ {
  id: string;
  rfqCode: string;
  title: string;
  category: string;
  subCategory: string;
  image: string;
  status: "open" | "closing_soon" | "closed";
  tags: string[];
  quotesCount: number;
  quantity: string;
  targetPrice: string;
  location: string;
  deliveryDays: number;
  minBid: number;
  maxBid: number;
  daysLeft: number;
  postedAgo: string;
  closesDate: string;
  buyerName: string;
  isExportFocused?: boolean;
  isClosingSoon?: boolean;
  referenceImages?: string[];
  buyerNote?: string;
  requirementDetails?: {
    fabricType: string;
    gsmRange: string;
    colors: string;
    sizes: string;
    printEmbellishment: string;
    fit: string;
  };
  buyerFullNote?: string;
}

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const RFQ_DATA: RFQ[] = [
  {
    id: "1",
    rfqCode: "RFQ-2024-001",
    title: "Women's Cotton Oversized T-Shirt - Acid Wash Finish",
    category: "Women's Wear",
    subCategory: "T-Shirts",
    image: "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=400&h=300&fit=crop",
    status: "open",
    tags: ["Open", "Verified", "Repeat"],
    quotesCount: 24,
    quantity: "500 - 5,000",
    targetPrice: "₹180 - ₹250",
    location: "Mumbai, Maharashtra",
    deliveryDays: 30,
    minBid: 235,
    maxBid: 320,
    daysLeft: 3,
    postedAgo: "5 days ago",
    closesDate: "Dec 10, 2025",
    buyerName: "Fashion Forward Pvt Ltd",
    isExportFocused: true,
    isClosingSoon: false,
    referenceImages: [
      "https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=100&h=100&fit=crop",
      "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=100&h=100&fit=crop",
      "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=100&h=100&fit=crop",
    ],
    buyerNote: "Looking for acid wash finish similar to reference images. Need soft hand feel. Open to fabric suggestions that can achieve this look at competitive pricing.",
    requirementDetails: {
      fabricType: "100% Cotton / Cotton Blend",
      gsmRange: "180-200 GSM",
      colors: "Black, White, Grey, Olive",
      sizes: "S, M, L, XL, XXL",
      printEmbellishment: "Screen printing on front, back label print",
      fit: "Relaxed oversized fit, dropped shoulders",
    },
    buyerFullNote: "Looking for premium quality cotton fabric with a soft hand feel. Prefer ring-spun cotton for durability. Interested in vendors with previous export experience.",
  },
  {
    id: "2",
    rfqCode: "RFQ-2024-002",
    title: "Women's Cotton Oversized T-Shirt - Acid Wash Finish",
    category: "Women's Wear",
    subCategory: "T-Shirts",
    image: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=400&h=300&fit=crop",
    status: "closing_soon",
    tags: ["Open", "Verified", "Repeat"],
    quotesCount: 9,
    quantity: "500 - 5,000",
    targetPrice: "₹180 - ₹250",
    location: "Mumbai, Maharashtra",
    deliveryDays: 30,
    minBid: 235,
    maxBid: 320,
    daysLeft: 1,
    postedAgo: "5 days ago",
    closesDate: "Dec 10, 2025",
    buyerName: "Style Street Exports",
    isClosingSoon: true,
    referenceImages: [],
    buyerNote: "Urgently needed. Prefer vendors who can deliver within 25 days.",
    requirementDetails: {
      fabricType: "100% Cotton",
      gsmRange: "160-180 GSM",
      colors: "White, Beige",
      sizes: "S, M, L, XL",
      printEmbellishment: "None",
      fit: "Oversized",
    },
    buyerFullNote: "Looking for reliable vendors who can handle urgent orders.",
  },
  {
    id: "3",
    rfqCode: "RFQ-2024-003",
    title: "Men's Formal Shirts - Premium Cotton",
    category: "Men's Wear",
    subCategory: "Shirts",
    image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&h=300&fit=crop",
    status: "open",
    tags: ["Open", "Verified"],
    quotesCount: 15,
    quantity: "1,000 - 10,000",
    targetPrice: "₹350 - ₹500",
    location: "Delhi NCR",
    deliveryDays: 45,
    minBid: 320,
    maxBid: 480,
    daysLeft: 7,
    postedAgo: "2 days ago",
    closesDate: "Dec 17, 2025",
    buyerName: "Corporate Threads Ltd",
    referenceImages: [],
    buyerNote: "Need formal shirts for corporate gifting. Must have proper packing.",
    requirementDetails: {
      fabricType: "Premium Cotton",
      gsmRange: "120-140 GSM",
      colors: "White, Light Blue, Grey",
      sizes: "S, M, L, XL, XXL",
      printEmbellishment: "Logo embroidery",
      fit: "Regular fit",
    },
    buyerFullNote: "Corporate order for formal shirts. Packaging must be individual polybags.",
  },
];

interface SubmittedQuote {
  id: string; quoteCode: string; rfqCode: string; rfqTitle: string; buyerName: string;
  pricePerUnit: number; moq: string; leadTime: string; submittedDate: string; lastUpdated: string;
  pcs: string; totalQuotes: number;
  status: "in_negotiation" | "accepted" | "awaiting" | "not_selected";
  rankBadge?: string; buyerResponse?: string; buyerResponseDate?: string; image?: string;
}

const SUBMITTED_QUOTES: SubmittedQuote[] = [
  { id:"q1", quoteCode:"QT-2024-001", rfqCode:"RFQ-2024-001", rfqTitle:"Women's Cotton Oversized T-Shirt - Acid Wash Finish", buyerName:"Fashion Forward Pvt Ltd", pricePerUnit:185, moq:"5,000 pcs", leadTime:"30 Days", submittedDate:"Dec 5, 2025", lastUpdated:"Dec 6, 2025", pcs:"5,000 pcs", totalQuotes:12, status:"in_negotiation", buyerResponse:"Your quote looks competitive. Can you provide sampling within 5 days instead of 7?", buyerResponseDate:"Dec 6, 2025" },
  { id:"q2", quoteCode:"QT-2024-002", rfqCode:"RFQ-2024-003", rfqTitle:"Printed Silk Scarves", buyerName:"Silk Route Exports", pricePerUnit:175, moq:"1,000 units", leadTime:"25 Days", submittedDate:"2024-01-08", lastUpdated:"2024-01-11", pcs:"1,000 units", totalQuotes:9, status:"accepted", image:"https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=400&h=200&fit=crop", buyerResponse:"Quote accepted! Please proceed with sampling.", buyerResponseDate:"Dec 5, 2025" },
  { id:"q3", quoteCode:"QT-2024-003", rfqCode:"RFQ-2024-005", rfqTitle:"Men's Polo T-Shirts - Premium Cotton Pique", buyerName:"Urban Threads Co.", pricePerUnit:265, moq:"3,000 pcs", leadTime:"20 Days", submittedDate:"Dec 3, 2025", lastUpdated:"Dec 5, 2025", pcs:"3,000 pcs", totalQuotes:24, status:"accepted", buyerResponse:"Congratulations! Your quote has been accepted. Please proceed with sampling.", buyerResponseDate:"Dec 5, 2025" },
  { id:"q4", quoteCode:"QT-2024-004", rfqCode:"RFQ-2024-007", rfqTitle:"Kids' Organic Cotton Rompers - Printed", buyerName:"Little Stars Retail", pricePerUnit:158, moq:"2,000 pcs", leadTime:"25 Days", submittedDate:"Dec 6, 2025", lastUpdated:"Dec 6, 2025", pcs:"2,000 pcs", totalQuotes:8, status:"awaiting", rankBadge:"Rank #3 of 8" },
  { id:"q5", quoteCode:"QT-2024-005", rfqCode:"RFQ-2024-009", rfqTitle:"Women's Chikankari Kurta Set - Pure Cotton", buyerName:"Ethnic Emporium", pricePerUnit:485, moq:"1,500 pcs", leadTime:"35 Days", submittedDate:"Nov 28, 2025", lastUpdated:"Dec 2, 2025", pcs:"1,500 pcs", totalQuotes:15, status:"not_selected", buyerResponse:"Thank you for your quote. We've decided to go with another vendor who offered faster delivery.", buyerResponseDate:"Dec 2, 2025" },
  { id:"q6", quoteCode:"QT-2024-006", rfqCode:"RFQ-2024-011", rfqTitle:"Denim Jeans - Slim Fit with Stretch", buyerName:"Denim World", pricePerUnit:365, moq:"8,000 pcs", leadTime:"40 Days", submittedDate:"Dec 4, 2025", lastUpdated:"Dec 4, 2025", pcs:"8,000 pcs", totalQuotes:31, status:"awaiting" },
];

// ─────────────────────────────────────────────────────────────
// RFQ CARD
// ─────────────────────────────────────────────────────────────

function RFQCard({ rfq, onClick }: { rfq: RFQ; onClick: () => void }) {
  return (
    <motion.div
      variants={listItem}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      {/* Image */}
      <div className="relative">
        <img src={rfq.image} alt={rfq.title} className="w-full h-44 object-cover" />

        {/* Closing soon banner */}
        {rfq.isClosingSoon && (
          <div className="absolute top-0 left-0 right-0 bg-[#ef4d62] text-white text-xs font-bold px-3 py-1.5 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> CLOSING SOON
          </div>
        )}

        {/* Days left badge */}
        <div className={cn(
          "absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold",
          rfq.isClosingSoon ? "bg-white text-[#ef4d62]" : "bg-black/50 text-white"
        )}>
          <Clock className="w-3 h-3" />
          {rfq.daysLeft} {rfq.daysLeft === 1 ? "day" : "days"}
        </div>

        {/* Side badges */}
        <div className="absolute top-10 right-2 flex flex-col gap-1">
          {rfq.isClosingSoon && (
            <span className="bg-orange-50 text-orange-600 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> Closing Soon
            </span>
          )}
          {rfq.isExportFocused && (
            <span className="bg-green-50 text-green-600 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              <TrendingUp className="w-2.5 h-2.5" /> Export-focused
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5">
        {/* Tags + quote count */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {rfq.tags.map(tag => (
            <span key={tag} className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1",
              tag === "Open"     ? "border-green-300 text-green-600 bg-green-50" :
              tag === "Verified" ? "border-blue-300 text-blue-600 bg-blue-50" :
                                   "border-orange-300 text-orange-500 bg-orange-50"
            )}>
              {tag === "Verified" && <CheckCircle2 className="w-2.5 h-2.5" />}
              {tag === "Repeat"   && <Repeat2 className="w-2.5 h-2.5" />}
              {tag}
            </span>
          ))}
          <span className="text-xs text-gray-500 ml-auto">{rfq.quotesCount} Quotes</span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-gray-900 leading-snug mb-0.5">{rfq.title}</h3>
        <p className="text-xs text-gray-400 mb-3">{rfq.category} &gt; {rfq.subCategory}</p>

        {/* Quantity + Target Price */}
        <div className="grid grid-cols-2 gap-3 mb-2.5">
          <div>
            <p className="text-[10px] text-gray-400 flex items-center gap-1">
              <Package className="w-3 h-3" /> Quantity
            </p>
            <p className="text-sm font-bold text-gray-900">{rfq.quantity}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Target Price
            </p>
            <p className="text-sm font-bold text-gray-900">{rfq.targetPrice}</p>
          </div>
        </div>

        {/* Location */}
        <p className="text-xs text-gray-500 flex items-center gap-1 mb-2.5">
          <MapPin className="w-3 h-3" /> {rfq.location}
        </p>

        {/* Delivery + RFQ code */}
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Truck className="w-3 h-3" /> Delivery <span className="font-semibold text-gray-700">{rfq.deliveryDays} Days</span>
          </p>
          <span className="text-[10px] text-gray-300 font-mono">{rfq.rfqCode}</span>
        </div>

        {/* Min Bid + Max Bid */}
        <div className="flex items-center gap-4 mb-3 p-2.5 bg-gray-50 rounded-xl">
          <div>
            <p className="text-[10px] text-gray-400">Min Bid</p>
            <p className="text-sm font-bold text-green-600 flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> ₹{rfq.minBid}
            </p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div>
            <p className="text-[10px] text-gray-400">Max Bid</p>
            <p className="text-sm font-bold text-[#ef4d62] flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> ₹{rfq.maxBid}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            Posted {rfq.postedAgo} · Closes {rfq.closesDate}
          </p>
          <motion.button
            onClick={onClick}
            whileTap={TAP}
            transition={TAP_T}
            className="bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-1"
          >
            View & Quote <ChevronRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// FILTER PANEL (shown when filter icon clicked)
// ─────────────────────────────────────────────────────────────

function FilterPanel({
  isOpen, onClose,
  category, setCategory,
  location, setLocation,
  status, setStatus,
  minQty, setMinQty,
}: {
  isOpen: boolean; onClose: () => void;
  category: string; setCategory: (v: string) => void;
  location: string; setLocation: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  minQty: number; setMinQty: (v: number) => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="space-y-2 mt-2">
      {/* Category */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="w-full px-4 py-3 text-sm text-gray-700 appearance-none focus:outline-none">
          <option value="all">All Categories</option>
          <option value="womens">Women's Wear</option>
          <option value="mens">Men's Wear</option>
          <option value="kids">Kids Wear</option>
          <option value="ethnic">Ethnic Wear</option>
          <option value="denim">Denim</option>
        </select>
      </div>

      {/* Location */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <select value={location} onChange={e => setLocation(e.target.value)}
          className="w-full px-4 py-3 text-sm text-gray-700 appearance-none focus:outline-none">
          <option value="all">All Locations</option>
          <option value="mumbai">Mumbai</option>
          <option value="delhi">Delhi NCR</option>
          <option value="bangalore">Bangalore</option>
          <option value="chennai">Chennai</option>
          <option value="kolkata">Kolkata</option>
        </select>
      </div>

      {/* Status */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="w-full px-4 py-3 text-sm text-gray-700 appearance-none focus:outline-none">
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="closing_soon">Closing Soon</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Minimum Quantity slider */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-700 mb-3">Minimum Quantity</p>
        <input type="range" min={10} max={10000} step={10} value={minQty}
          onChange={e => setMinQty(Number(e.target.value))}
          className="w-full accent-[#ef4d62]" />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>10</span>
          <span className="font-semibold text-[#ef4d62]">{minQty.toLocaleString()}+</span>
          <span>10,000+</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">10 - {minQty.toLocaleString()}+</p>
      </div>

      <button onClick={onClose}
        className="w-full py-3 bg-[#ef4d62] text-white font-bold rounded-xl text-sm hover:bg-[#ef4d62]/90 transition-colors">
        Apply Filters
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RFQ DETAIL + SUBMIT QUOTE PAGE
// ─────────────────────────────────────────────────────────────

function RFQDetailPage({ rfq, onBack }: { rfq: RFQ; onBack: () => void }) {
  const [chatMsg, setChatMsg] = useState("");
  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string }[]>([]);
  const [chatMinimised, setChatMinimised] = useState(false);
  const [quoteForm, setQuoteForm] = useState({
    pricePerUnit: "", moq: "", samplingCost: "", sampleTimeline: "",
    fabric: "", productionLeadTime: "", paymentTerms: "", notes: "",
  });
  const videoRef = useRef<HTMLInputElement>(null);
  const pdfRef   = useRef<HTMLInputElement>(null);

  const handleSubmitQuote = () => {
    if (!quoteForm.pricePerUnit || !quoteForm.moq) {
      toast.error("Please fill in Price per Unit and MOQ");
      return;
    }
    toast.success("Quote submitted successfully!", { description: "The buyer will be notified." });
    onBack();
  };

  const sendChatMsg = () => {
    if (!chatMsg.trim()) return;
    setChatMessages(p => [...p, { sender: "You", text: chatMsg }]);
    setChatMsg("");
  };

  const field = (label: string, key: keyof typeof quoteForm, placeholder: string) => (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <input type="text" placeholder={placeholder} value={quoteForm[key]}
        onChange={e => setQuoteForm(p => ({ ...p, [key]: e.target.value }))}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#ef4d62]/30 bg-white" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Back */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <span className="text-sm font-semibold text-gray-900">Back to Quotes</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* Hero image */}
        <div className="relative rounded-2xl overflow-hidden">
          <img src={rfq.image} alt={rfq.title} className="w-full h-52 object-cover" />
          {rfq.isClosingSoon && (
            <div className="absolute top-0 left-0 right-0 bg-[#ef4d62] text-white text-xs font-bold px-3 py-1.5 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> CLOSING SOON
            </div>
          )}
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/50 text-white text-xs font-semibold">
            <Clock className="w-3 h-3" /> {rfq.daysLeft} {rfq.daysLeft === 1 ? "day" : "days"}
          </div>
        </div>

        {/* Tags + quotes */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {rfq.tags.map(tag => (
            <span key={tag} className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1",
              tag === "Open"     ? "border-green-300 text-green-600 bg-green-50" :
              tag === "Verified" ? "border-blue-300 text-blue-600 bg-blue-50" :
                                   "border-orange-300 text-orange-500 bg-orange-50"
            )}>
              {tag === "Verified" && <CheckCircle2 className="w-2.5 h-2.5" />}
              {tag === "Repeat"   && <Repeat2 className="w-2.5 h-2.5" />}
              {tag}
            </span>
          ))}
          <span className="text-xs text-gray-500 ml-auto">{rfq.quotesCount} Quotes</span>
        </div>

        {/* Title */}
        <div>
          <h2 className="text-base font-bold text-gray-900 leading-snug">{rfq.title}</h2>
          <p className="text-xs text-gray-400">{rfq.category} &gt; {rfq.subCategory}</p>
        </div>

        {/* Specs grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-[10px] text-gray-400 flex items-center gap-1 mb-1"><Package className="w-3 h-3" /> Quantity</p>
            <p className="text-sm font-bold text-gray-900">{rfq.quantity}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-[10px] text-gray-400 flex items-center gap-1 mb-1"><TrendingUp className="w-3 h-3" /> Target Price</p>
            <p className="text-sm font-bold text-gray-900">{rfq.targetPrice}</p>
          </div>
        </div>

        {/* Location + Delivery */}
        <div className="bg-white rounded-xl p-3 border border-gray-100 space-y-2">
          <p className="text-xs text-gray-600 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" /> {rfq.location}</p>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-600 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-gray-400" /> Delivery <span className="font-semibold">{rfq.deliveryDays} Days</span>
            </p>
            <span className="text-[10px] text-gray-300 font-mono">{rfq.rfqCode}</span>
          </div>
          <div className="flex items-center gap-4 pt-1 border-t border-gray-100">
            <div>
              <p className="text-[10px] text-gray-400">Min Bid</p>
              <p className="text-sm font-bold text-green-600 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" /> ₹{rfq.minBid}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Max Bid</p>
              <p className="text-sm font-bold text-[#ef4d62] flex items-center gap-0.5"><TrendingUp className="w-3 h-3" /> ₹{rfq.maxBid}</p>
            </div>
          </div>
        </div>

        {/* Buyer */}
        <div className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm shrink-0">
            {rfq.buyerName.charAt(0)}
          </div>
          <span className="text-sm font-medium text-gray-700">Name - {rfq.buyerName}</span>
        </div>

        {/* Reference Images */}
        {rfq.referenceImages && rfq.referenceImages.length > 0 && (
          <div>
            <p className="text-sm font-bold text-gray-900 mb-2">Reference Images</p>
            <div className="flex gap-2">
              {rfq.referenceImages.map((img, i) => (
                <div key={i} className="w-20 h-20 rounded-xl overflow-hidden border border-gray-100">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buyer's Notes */}
        {rfq.buyerNote && (
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">Buyer's Notes</p>
            <p className="text-xs text-gray-600 leading-relaxed">{rfq.buyerNote}</p>
          </div>
        )}

        {/* Requirement Details */}
        {rfq.requirementDetails && (
          <div>
            <p className="text-sm font-bold text-gray-900 mb-2">Requirement Details</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Fabric Type",          value: rfq.requirementDetails.fabricType },
                { label: "GSM Range",             value: rfq.requirementDetails.gsmRange },
                { label: "Colors",                value: rfq.requirementDetails.colors },
                { label: "Sizes",                 value: rfq.requirementDetails.sizes },
                { label: "Print/Embellishment",   value: rfq.requirementDetails.printEmbellishment },
                { label: "Fit / Finish",          value: rfq.requirementDetails.fit },
              ].map(item => (
                <div key={item.label} className="bg-orange-50 rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-gray-500 mb-0.5">{item.label}</p>
                  <p className="text-xs font-medium text-gray-800 leading-snug">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buyer's Full Note */}
        {rfq.buyerFullNote && (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">Buyer's Note</p>
            <p className="text-xs text-gray-600 leading-relaxed">{rfq.buyerFullNote}</p>
          </div>
        )}

        {/* Chat with Buyer */}
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[#ef4d62]" /> Chat with Buyer
            </p>
            <p className="text-[10px] text-gray-400">Avg response ~2 hours</p>
          </div>
          <p className="text-xs text-gray-400 mb-3">Ask clarifications or negotiate</p>
          <div className="flex gap-2">
            <input type="text" value={chatMsg} onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") sendChatMsg(); }}
              placeholder="Ask a question about this requirement..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#ef4d62]/30" />
            <button onClick={sendChatMsg} disabled={!chatMsg.trim()}
              className="p-2.5 bg-[#ef4d62] text-white rounded-xl hover:bg-[#ef4d62]/90 transition-colors disabled:bg-gray-200">
              <Send className="w-4 h-4" />
            </button>
          </div>
          {chatMessages.length > 0 && (
            <div className="mt-3 space-y-2 max-h-32 overflow-y-auto">
              {chatMessages.map((m, i) => (
                <div key={i} className="bg-[#ef4d62]/10 rounded-lg px-3 py-2 text-xs text-gray-700">{m.text}</div>
              ))}
            </div>
          )}
        </div>

        {/* Competition */}
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-gray-400" /> Competition
          </p>
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900">{rfq.quotesCount}</p>
              <p className="text-xs text-gray-400">Quotes Received</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-[#ef4d62]">{rfq.daysLeft} days</p>
              <p className="text-xs text-gray-400">Closing In</p>
            </div>
          </div>
        </div>

        {/* Submit Your Quote */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-sm font-bold text-gray-900 mb-0.5">Submit Your Quote</p>
          <p className="text-xs text-gray-400 mb-4">Provide competitive pricing to win this order</p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            {field("Price per Unit (₹)", "pricePerUnit", "e.g. 195")}
            {field("Your MOQ", "moq", "e.g. 500")}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {field("Sampling Cost (₹)", "samplingCost", "e.g. 2500")}
            {field("Sample Timeline", "sampleTimeline", "e.g. 7 days")}
          </div>
          {field("Fabric", "fabric", "e.g. 100% Cotton / Cotton Blend")}
          <div className="mt-3">
            {field("Production Lead Time", "productionLeadTime", "e.g. 30-35 days")}
          </div>
          <div className="mt-3">
            {field("Payment Terms", "paymentTerms", "e.g. 50% advance, 50% before dispatch")}
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Notes / Value-adds</p>
            <textarea rows={3} placeholder="Mention any special capabilities, certifications, or value additions..."
              value={quoteForm.notes}
              onChange={e => setQuoteForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#ef4d62]/30 resize-none bg-white" />
          </div>

          {/* Attachments */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
            <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={() => toast.success("Video attached!")} />
            <input ref={pdfRef}   type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={() => toast.success("Document attached!")} />
            <button onClick={() => videoRef.current?.click()}
              className="flex flex-col items-center gap-1 text-[#ef4d62] hover:text-[#ef4d62]/80 transition-colors">
              <Video className="w-6 h-6" />
              <span className="text-[10px] font-semibold">ADD VIDEO</span>
            </button>
            <button onClick={() => pdfRef.current?.click()}
              className="flex flex-col items-center gap-1 text-[#ef4d62] hover:text-[#ef4d62]/80 transition-colors">
              <FileText className="w-6 h-6" />
              <span className="text-[10px] font-semibold">ADD PDF</span>
            </button>
            <button onClick={() => toast.info("Attach sample pictures or product images")}
              className="flex flex-col items-center gap-1 text-[#ef4d62] hover:text-[#ef4d62]/80 transition-colors">
              <Paperclip className="w-6 h-6" />
              <span className="text-[10px] font-semibold">ATTACH</span>
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Attach sample pictures, videos, Word doc or PDF</p>
        </div>

        {/* Submit button */}
        <button onClick={handleSubmitQuote}
          className="w-full py-4 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white font-bold rounded-2xl text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#ef4d62]/20">
          <FileText className="w-4 h-4" /> Submit Quote
        </button>

      </div>

      {/* Floating chat widget */}
      {!chatMinimised ? null : (
        <div className="fixed bottom-24 right-4 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-30">
          <div className="bg-gray-900 text-white px-3 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold">{rfq.buyerName}</p>
              <p className="text-[10px] text-green-400">● Online</p>
            </div>
            <button onClick={() => setChatMinimised(false)} className="text-gray-400 hover:text-white">
              <Minus className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3">
            <p className="text-xs text-gray-400 mb-2">Mention a professional note for better response rate</p>
            <textarea rows={3} value={chatMsg} onChange={e => setChatMsg(e.target.value)}
              placeholder="Ask a question about this requirement..."
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none" />
            <div className="flex justify-end mt-1.5">
              <button onClick={sendChatMsg}
                className="p-2 bg-[#ef4d62] text-white rounded-lg hover:bg-[#ef4d62]/90 transition-colors">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBMITTED QUOTES TAB
// ─────────────────────────────────────────────────────────────

function SubmittedQuotesView({ onSwitchToRequests }: { onSwitchToRequests: () => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = SUBMITTED_QUOTES.filter(q =>
    !search || q.rfqTitle.toLowerCase().includes(search.toLowerCase()) || q.buyerName.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "price_high") return b.pricePerUnit - a.pricePerUnit;
    if (sort === "price_low")  return a.pricePerUnit - b.pricePerUnit;
    if (sort === "status") return a.status.localeCompare(b.status);
    return 0;
  });

  const stats = {
    total: SUBMITTED_QUOTES.length,
    accepted: SUBMITTED_QUOTES.filter(q => q.status === "accepted").length,
    negotiating: SUBMITTED_QUOTES.filter(q => q.status === "in_negotiation").length,
    pending: SUBMITTED_QUOTES.filter(q => q.status === "awaiting").length,
  };

  const statusConfig = {
    in_negotiation: { label: "In Negotiation", bg: "bg-blue-50",   text: "text-blue-600",   border: "border-blue-200",   icon: MessageSquare },
    accepted:       { label: "Quote Accepted", bg: "bg-green-50",  text: "text-green-600",  border: "border-green-200",  icon: CheckCircle2  },
    awaiting:       { label: "Awaiting Response", bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200", icon: Clock        },
    not_selected:   { label: "Not Selected",   bg: "bg-red-50",    text: "text-red-500",    border: "border-red-200",    icon: X            },
  };

  const buyerResponseBg = {
    in_negotiation: "bg-blue-50 border-blue-100",
    accepted:       "bg-green-50 border-green-100",
    awaiting:       "bg-gray-50 border-gray-100",
    not_selected:   "bg-red-50 border-red-100",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">My Quotes</h2>
          <p className="text-xs text-gray-400">Track all your submitted quotes and buyer responses</p>
        </div>
        <div className="relative">
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#ef4d62] rounded-full text-[9px] text-white font-bold flex items-center justify-center">
            {stats.negotiating}
          </span>
          <Bell className="w-5 h-5 text-gray-500" />
        </div>
      </div>

      {/* Stats 2x2 */}
      <motion.div variants={listContainer} className="grid grid-cols-2 gap-3">
        {[
          { label: "Total Quotes",    value: stats.total,       icon: FileText,      color: "text-orange-400" },
          { label: "Accepted",        value: stats.accepted,    icon: CheckCircle2,  color: "text-green-500"  },
          { label: "In Negotiation",  value: stats.negotiating, icon: MessageSquare, color: "text-blue-500"   },
          { label: "Pending",         value: stats.pending,     icon: Clock,         color: "text-orange-400" },
        ].map(s => (
          <motion.div key={s.label} variants={listItem} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{s.label}</span>
              <s.icon className={cn("w-4 h-4", s.color)} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Performance card */}
      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-bold text-gray-900">Your Performance</span>
          </div>
          <span className="text-[10px] font-semibold bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full">
            This Month: 8 quotes
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <p className="text-xs text-gray-500">Acceptance Rate</p>
            <p className="text-lg font-bold text-green-600">25%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Avg. Response Time</p>
            <p className="text-lg font-bold text-gray-900">1.5 days</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Total Order Value</p>
            <p className="text-lg font-bold text-[#ef4d62]">₹24.5L</p>
          </div>
          <button onClick={onSwitchToRequests} className="flex items-center gap-1.5 px-4 py-2 bg-[#ef4d62] text-white text-xs font-bold rounded-xl hover:bg-[#ef4d62]/90 transition-colors">
            Browse RFQs <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input type="text" placeholder="Search quotes..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none placeholder-gray-400" />
        </div>
        <div className="relative">
          <button onClick={() => setSortOpen(p => !p)}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap">
            {sort === "recent" ? "Most Recent" : sort === "price_high" ? "Price: High" : sort === "price_low" ? "Price: Low" : "By Status"}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
              <div className="absolute right-0 top-11 z-20 bg-white border border-gray-100 rounded-xl shadow-xl py-1 w-40">
                {[
                  { v: "recent",     l: "Most Recent" },
                  { v: "price_high", l: "Price: High"  },
                  { v: "price_low",  l: "Price: Low"   },
                  { v: "status",     l: "By Status"    },
                ].map(o => (
                  <button key={o.v} onClick={() => { setSort(o.v); setSortOpen(false); }}
                    className={cn("w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2",
                      sort === o.v ? "text-[#ef4d62] font-semibold" : "text-gray-700")}>
                    {sort === o.v && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {o.l}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quote cards */}
      <motion.div variants={listContainer} className="space-y-3">
        {sorted.map(q => {
          const cfg = statusConfig[q.status];
          const respBg = buyerResponseBg[q.status];
          return (
            <motion.div key={q.id}
              variants={listItem}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Image (only if present — screenshot 6) */}
              {q.image && (
                <img src={q.image} alt={q.rfqTitle} className="w-full h-36 object-cover" />
              )}

              <div className="p-4">
                {/* Status badge + rank */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border",
                    cfg.bg, cfg.text, cfg.border
                  )}>
                    <cfg.icon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </span>
                  {q.rankBadge && (
                    <span className="text-[10px] font-semibold bg-orange-50 text-orange-500 border border-orange-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TrendingUp className="w-2.5 h-2.5" /> {q.rankBadge}
                    </span>
                  )}
                </div>

                {/* Code + date (screenshot 6 style) */}
                {q.image && (
                  <p className="text-[10px] text-gray-400 mb-1">{q.quoteCode} · Submitted {q.submittedDate}</p>
                )}

                {/* Title + price */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 leading-snug">{q.rfqTitle}</p>
                    <p className="text-xs text-gray-400">{q.buyerName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-[#ef4d62]">₹ {q.pricePerUnit}</p>
                    <p className="text-[10px] text-gray-400">per unit</p>
                  </div>
                </div>

                {/* RFQ code (screenshot 6) */}
                {q.image && (
                  <p className="text-xs text-gray-600 mb-1">RFQ: {q.rfqCode}</p>
                )}

                {/* Price + MOQ line (screenshot 6) */}
                {q.image && (
                  <p className="text-xs text-gray-700 mb-1">Price: ₹{q.pricePerUnit}/unit&nbsp;&nbsp;MOQ: {q.moq}</p>
                )}

                {/* Lead time (screenshot 6) */}
                {q.image && (
                  <p className="text-xs text-gray-700 mb-2">Lead Time: {q.leadTime}</p>
                )}

                {/* Pcs + submitted date */}
                {!q.image && (
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                    <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {q.pcs}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Submitted {q.submittedDate}</span>
                  </div>
                )}

                {/* Total quotes */}
                {!q.image && (
                  <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
                    <Star className="w-3 h-3" /> {q.totalQuotes} quotes total
                  </p>
                )}

                {/* Buyer Response box */}
                {q.buyerResponse && (
                  <div className={cn("rounded-xl border p-3 mb-3", respBg)}>
                    <p className="text-xs font-bold text-gray-700 mb-1">Buyer's Response:</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{q.buyerResponse}</p>
                    {q.buyerResponseDate && (
                      <p className="text-[10px] text-gray-400 mt-1.5">{q.buyerResponseDate}</p>
                    )}
                  </div>
                )}

                {/* Last updated (screenshot 6) */}
                {q.image && (
                  <p className="text-[10px] text-gray-400 mb-3">Last updated: {q.lastUpdated}</p>
                )}

                {/* Action button(s) */}
                {q.status === "in_negotiation" && (
                  <button onClick={() => navigate("/chat")} className="w-full py-3 bg-[#ef4d62] text-white text-sm font-bold rounded-xl hover:bg-[#ef4d62]/90 transition-colors flex items-center justify-center gap-2">
                    <MessageSquare className="w-4 h-4" /> Continue Chat
                  </button>
                )}
                {q.status === "accepted" && !q.image && (
                  <button onClick={() => navigate("/chat")} className="w-full py-3 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> View Order Details
                  </button>
                )}
                {q.status === "accepted" && q.image && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={onSwitchToRequests} className="py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                      <Star className="w-3.5 h-3.5" /> View RFQ
                    </button>
                    <button onClick={() => navigate("/chat")} className="py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Call Buyer
                    </button>
                  </div>
                )}
                {q.status === "not_selected" && (
                  <button onClick={onSwitchToRequests} className="w-full py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                    Browse New RFQs <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                {q.status === "awaiting" && (
                  <button onClick={onSwitchToRequests} className="w-full py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                    View RFQ <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const Quotes = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [activeTab, setActiveTab]     = useState<"requests" | "submitted">("requests");
  const [selectedRFQ, setSelectedRFQ] = useState<RFQ | null>(null);
  const [search, setSearch]           = useState("");
  const [filterOpen, setFilterOpen]   = useState(false);
  const [category, setCategory]       = useState("all");
  const [location, setLocation]       = useState("all");
  const [status, setStatus]           = useState("all");
  const [minQty, setMinQty]           = useState(10);

  const filtered = RFQ_DATA.filter(r => {
    const matchSearch = !search || r.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = status === "all" || r.status === status || (status === "closing_soon" && r.isClosingSoon);
    return matchSearch && matchStatus;
  });

  // If detail view is open
  if (selectedRFQ) {
    return (
      <DashboardLayout>
        <div className="-m-4 lg:-m-6">
          <RFQDetailPage rfq={selectedRFQ} onBack={() => setSelectedRFQ(null)} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 -m-4 lg:-m-6">
        <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-12">

          {/* ── Header ── */}
          <motion.div variants={section} className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Quotation Requests</h1>
              <p className="text-xs text-gray-400">Browse and quote on buyer requirements</p>
            </div>
            <motion.button whileTap={TAP} transition={TAP_T} className="relative p-2 hover:bg-gray-100 rounded-full transition-colors">
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-[#ef4d62] rounded-full" />
            </motion.button>
          </motion.div>

          {/* ── Tab switcher ── */}
          <motion.div variants={section} className="flex gap-2">
            <motion.button
              whileTap={TAP}
              transition={TAP_T}
              onClick={() => setActiveTab("requests")}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all",
                activeTab === "requests"
                  ? "bg-white border border-gray-200 text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              Quotation Requests
            </motion.button>
            <motion.button
              whileTap={TAP}
              transition={TAP_T}
              onClick={() => setActiveTab("submitted")}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                activeTab === "submitted"
                  ? "bg-[#ef4d62] text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              )}
            >
              My Submitted Quotes
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                activeTab === "submitted" ? "bg-white/20 text-white" : "bg-[#ef4d62] text-white"
              )}>
                {SUBMITTED_QUOTES.length}
              </span>
            </motion.button>
          </motion.div>

          {activeTab === "submitted" ? (
            <motion.div variants={section}>
              <SubmittedQuotesView onSwitchToRequests={() => setActiveTab("requests")} />
            </motion.div>
          ) : (
            <>
              {/* ── Stats 2×2 ── */}
              <motion.div variants={listContainer} className="grid grid-cols-2 gap-3">
                {[
                  { label: "Open RFQs",      value: "234", sub: "+12 today",        icon: FileText,    color: "text-blue-500"   },
                  { label: "Closing Soon",   value: "28",  sub: "< 3 days",         icon: Clock,       color: "text-orange-500" },
                  { label: "Chats Pending",  value: "6",   sub: "+8% this week",    icon: MessageSquare,color: "text-purple-500" },
                  { label: "Your Quotes",    value: "15",  sub: "Share more quotes", icon: Star,        color: "text-[#ef4d62]"  },
                ].map(s => (
                  <motion.div key={s.label} variants={listItem} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">{s.label}</span>
                      <s.icon className={cn("w-4 h-4", s.color)} />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{s.sub}</p>
                  </motion.div>
                ))}
              </motion.div>

              {/* ── RFQ alert ── */}
              <motion.div variants={section} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <Bell className="w-5 h-5 text-[#ef4d62] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-gray-900">Get notified for matching RFQs</p>
                    <p className="text-xs text-gray-400">Set up alerts for your product categories</p>
                  </div>
                </div>
                <motion.button
                  whileTap={TAP}
                  transition={TAP_T}
                  onClick={() => navigate("/leads")}
                  className="shrink-0 ml-3 px-4 py-2 rounded-xl border border-[#ef4d62] text-[#ef4d62] text-xs font-bold hover:bg-[#ef4d62]/5 transition-colors"
                >
                  Set Alerts
                </motion.button>
              </motion.div>

              {/* ── Search + filter ── */}
              <motion.div variants={section} className="space-y-2">
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm">
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                  <input type="text" placeholder="Search RFQs by product..." value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none placeholder-gray-400" />
                  <motion.button
                    whileTap={TAP}
                    transition={TAP_T}
                    onClick={() => setFilterOpen(p => !p)}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      filterOpen ? "bg-[#ef4d62] text-white" : "hover:bg-gray-100 text-gray-500"
                    )}
                  >
                    <Filter className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileTap={TAP}
                    transition={TAP_T}
                    onClick={() => setSearch("")}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </motion.button>
                </div>

                {/* Filter dropdowns — only visible when filter icon clicked */}
                <FilterPanel
                  isOpen={filterOpen} onClose={() => setFilterOpen(false)}
                  category={category} setCategory={setCategory}
                  location={location} setLocation={setLocation}
                  status={status} setStatus={setStatus}
                  minQty={minQty} setMinQty={setMinQty}
                />
              </motion.div>

              {/* ── RFQ cards ── */}
              {filtered.length === 0 ? (
                <motion.div variants={section} className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
                  <p className="text-gray-400 text-sm">No RFQs match your search</p>
                </motion.div>
              ) : (
                <motion.div variants={listContainer} className="space-y-4">
                  {filtered.map(rfq => (
                    <RFQCard key={rfq.id} rfq={rfq} onClick={() => setSelectedRFQ(rfq)} />
                  ))}
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default Quotes;