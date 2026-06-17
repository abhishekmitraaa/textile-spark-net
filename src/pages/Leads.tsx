import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
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
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  ChevronDown,
  ChevronRight,
  Flame,
  Phone,
  Users,
  TrendingUp,
  Clock,
  UserCheck,
  Search,
  Mic,
  MapPin,
  Send,
  Trash2,
  MessageCircle,
  Eye,
  X,
  Check,
  ArrowLeft,
  Tag,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ViewedProduct {
  name: string;
  price: string;
  image: string;
}

interface Lead {
  id: number;
  title: string;
  quantity: number;
  location: string;
  buyerName: string;
  buyerPhone: string;
  category: string;
  requirement: string;
  time: string;
  country: string;
  buyerInfo: string;
  requirements: number;
  calls: number;
  chats: number;
  buys: string;
  isBookmarked: boolean;
  isNew: boolean;
  isUrgent: boolean;
  viewedProducts: ViewedProduct[];
  tab: "relevant" | "history" | "shortlisted" | "hidden";
  qtyValue: number; // numeric qty for filter
}

// ─── Category Data ─────────────────────────────────────────────────────────────

const CATEGORY_GROUPS = [
  {
    group: "MANUFACTURER",
    items: [
      "Garment Manufacturer (T-shirts, Shirts, Dresses, etc.)",
      "Fabric Manufacturer (Knits, Wovens, Denim, etc.)",
      "Accessories Manufacturer (Buttons, Zips, Labels)",
      "Embroidery manufacturers",
      "Printing manufacturers",
      "Luxury/premium wear manufacturers",
      "Home Textile Manufacturers",
      "Export-grade manufacturers",
      "Leather Goods Manufacturer",
      "Footwear Manufacturer",
      "Uniforms / Corporate Wear",
      "Sportswear / Athleisure Manufacturer",
      "Private Label Manufacturer",
      "Made-to-Order / Custom Manufacturing",
      "Recycled fabric manufacturers",
      "Sustainable & organic wear manufacturers",
    ],
  },
  {
    group: "TRADER / WHOLESALER",
    items: [
      "Textile Trader",
      "Garment Wholesaler",
      "Fabric Wholesaler",
      "Export House",
      "Import / Trading Company",
      "Multi-brand Distributor",
    ],
  },
  {
    group: "RETAILER",
    items: [
      "Apparel Retail Store",
      "Online Fashion Retailer",
      "Multi-brand Outlet",
      "Boutique / Designer Studio",
      "Departmental Store",
    ],
  },
  {
    group: "SERVICES",
    items: [
      "Logistics & Shipping",
      "Quality Inspection / Testing Lab",
      "Fashion Designer / Consultant",
      "Sourcing Agent",
      "Buying House",
    ],
  },
];

// ─── Dummy Data ───────────────────────────────────────────────────────────────

const sampleLeads: Lead[] = [
  {
    id: 1,
    title: "Cotton Men T-shirt",
    quantity: 50,
    location: "New Delhi, Noida sector 8",
    buyerName: "Karan Khanna",
    buyerPhone: "+91 98765 43210",
    category: "Round Neck Men T-shirt",
    requirement: "Cotton, Printed, Tshirt",
    time: "11:09 am",
    country: "IND",
    buyerInfo: "1 Month Active",
    requirements: 3,
    calls: 1,
    chats: 2,
    buys: "Mens Wear",
    isBookmarked: false,
    isNew: true,
    isUrgent: false,
    viewedProducts: [
      { name: "Dot Knit Polyester T Shirt", price: "₹75 / Piece", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=150&h=150&fit=crop" },
      { name: "Cotton Polo Shirt", price: "₹120 / Piece", image: "https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=150&h=150&fit=crop" },
      { name: "Sports Jersey", price: "₹95 / Piece", image: "https://images.unsplash.com/photo-1622445275463-afa2ab738c34?w=150&h=150&fit=crop" },
    ],
    tab: "relevant",
    qtyValue: 50,
  },
  {
    id: 2,
    title: "Premium Cotton Shirts - Bulk Order",
    quantity: 200,
    location: "Mumbai, Andheri West",
    buyerName: "Priya Sharma",
    buyerPhone: "+91 99887 76543",
    category: "Formal Men Shirt",
    requirement: "Cotton, Solid Colors, Full Sleeve",
    time: "2 hours ago",
    country: "IND",
    buyerInfo: "3 Months Active",
    requirements: 8,
    calls: 4,
    chats: 6,
    buys: "Mens & Womens Wear",
    isBookmarked: true,
    isNew: false,
    isUrgent: true,
    viewedProducts: [
      { name: "Formal White Shirt", price: "₹450 / Piece", image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=150&h=150&fit=crop" },
      { name: "Blue Oxford Shirt", price: "₹520 / Piece", image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=150&h=150&fit=crop" },
    ],
    tab: "shortlisted",
    qtyValue: 200,
  },
  {
    id: 3,
    title: "Denim Jeans - Wholesale",
    quantity: 150,
    location: "Bangalore, Koramangala",
    buyerName: "Rajesh Kumar",
    buyerPhone: "+91 88776 65432",
    category: "Men's Denim Jeans",
    requirement: "Denim, Blue/Black, Sizes 28-38",
    time: "29 May",
    country: "USA",
    buyerInfo: "6 Months Active",
    requirements: 12,
    calls: 7,
    chats: 10,
    buys: "Denim & Casual Wear",
    isBookmarked: true,
    isNew: false,
    isUrgent: false,
    viewedProducts: [
      { name: "Slim Fit Jeans", price: "₹899 / Piece", image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=150&h=150&fit=crop" },
      { name: "Regular Fit Jeans", price: "₹799 / Piece", image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=150&h=150&fit=crop" },
    ],
    tab: "history",
    qtyValue: 150,
  },
  {
    id: 4,
    title: "Women's Kurtis - Festival Collection",
    quantity: 300,
    location: "Jaipur, Rajasthan",
    buyerName: "Meera Patel",
    buyerPhone: "+91 77665 54321",
    category: "Women's Ethnic Wear",
    requirement: "Cotton/Rayon, Printed, Size S-XXL",
    time: "5 hours ago",
    country: "IND",
    buyerInfo: "2 Weeks Active",
    requirements: 5,
    calls: 2,
    chats: 4,
    buys: "Women's Ethnic Wear",
    isBookmarked: false,
    isNew: true,
    isUrgent: true,
    viewedProducts: [
      { name: "Floral Print Kurti", price: "₹350 / Piece", image: "https://images.unsplash.com/photo-1610652492500-ded49ceeb378?w=150&h=150&fit=crop" },
    ],
    tab: "relevant",
    qtyValue: 300,
  },
  {
    id: 5,
    title: "Sports Shoes - Running Collection",
    quantity: 100,
    location: "Chennai, T Nagar",
    buyerName: "Arjun Reddy",
    buyerPhone: "+91 66554 43210",
    category: "Sports Footwear",
    requirement: "Running Shoes, Sizes 6-11, Multiple Colors",
    time: "Yesterday",
    country: "IND",
    buyerInfo: "4 Months Active",
    requirements: 6,
    calls: 3,
    chats: 5,
    buys: "Sports & Fitness",
    isBookmarked: false,
    isNew: false,
    isUrgent: false,
    viewedProducts: [],
    tab: "history",
    qtyValue: 100,
  },
  {
    id: 6,
    title: "Saree - Silk Blend Festive",
    quantity: 75000,
    location: "Surat, Gujarat",
    buyerName: "Sunita Desai",
    buyerPhone: "+91 77123 98765",
    category: "Women's Saree",
    requirement: "Silk Blend, Zari Border, Festive Colors",
    time: "1 hour ago",
    country: "IND",
    buyerInfo: "8 Months Active",
    requirements: 10,
    calls: 5,
    chats: 8,
    buys: "Women's Ethnic Wear",
    isBookmarked: false,
    isNew: true,
    isUrgent: false,
    viewedProducts: [],
    tab: "relevant",
    qtyValue: 75000,
  },
  {
    id: 7,
    title: "Export Quality Bedsheets",
    quantity: 200000,
    location: "Karur, Tamil Nadu",
    buyerName: "Ahmed Al Rashid",
    buyerPhone: "+971 50 123 4567",
    category: "Home Textiles",
    requirement: "100% Cotton, 300 TC, King Size",
    time: "3 hours ago",
    country: "UAE",
    buyerInfo: "1 Year Active",
    requirements: 15,
    calls: 9,
    chats: 12,
    buys: "Home Textiles",
    isBookmarked: true,
    isNew: false,
    isUrgent: true,
    viewedProducts: [],
    tab: "hidden",
    qtyValue: 200000,
  },
];

// ─── Select Category Modal ────────────────────────────────────────────────────

interface SelectCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCategories: string[];
  onToggle: (cat: string) => void;
  onDone: () => void;
}

function SelectCategoryModal({ isOpen, onClose, selectedCategories, onToggle, onDone }: SelectCategoryModalProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return CATEGORY_GROUPS;
    const q = search.toLowerCase();
    return CATEGORY_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => item.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-gray-100">
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-bold text-gray-900">Select Category</h3>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories..."
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Category List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {filtered.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">No categories found for "{search}"</div>
          )}
          {filtered.map((group) => (
            <div key={group.group}>
              <p className="text-xs font-bold text-gray-400 tracking-widest mb-3 uppercase">{group.group}</p>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => {
                  const isSelected = selectedCategories.includes(item);
                  return (
                    <button
                      key={item}
                      onClick={() => onToggle(item)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        isSelected
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600"
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Done */}
        <div className="p-5 border-t border-gray-100">
          {selectedCategories.length > 0 && (
            <p className="text-xs text-blue-600 font-semibold mb-3 text-center">
              {selectedCategories.length} categor{selectedCategories.length > 1 ? "ies" : "y"} selected
            </p>
          )}
          <button
            onClick={onDone}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Business Categories Modal ────────────────────────────────────────────

interface AddBusinessCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedCategories: string[];
  onProceed: (cats: string[]) => void;
}

function AddBusinessCategoriesModal({ isOpen, onClose, savedCategories, onProceed }: AddBusinessCategoriesModalProps) {
  const [selected, setSelected] = useState<string[]>(savedCategories);
  const [showSelect, setShowSelect] = useState(false);

  useEffect(() => {
    setSelected(savedCategories);
  }, [savedCategories, isOpen]);

  const toggleCat = (cat: string) => {
    setSelected((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center gap-3 p-5 border-b border-gray-100">
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-gray-900">Add Business Categories</h3>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            <p className="text-sm text-gray-600 mb-1">
              Categories describe what your business is and the products and services your business offers. Please add at least one category for customers to find your business.
            </p>
            <p className="text-xs text-gray-400 italic mb-6">
              Please note: Edits may go for moderation and it can take up to 24-48 hours to be published.
            </p>

            <p className="text-xs font-bold text-gray-700 tracking-widest uppercase mb-3">Selected Categories</p>

            {selected.length === 0 && (
              <p className="text-sm text-gray-400 mb-4">No categories selected yet.</p>
            )}

            <div className="space-y-2 mb-4">
              {selected.map((cat) => (
                <div key={cat} className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-sm font-medium text-blue-800">{cat}</span>
                  </div>
                  <button onClick={() => toggleCat(cat)} className="text-blue-400 hover:text-red-500 transition-colors ml-2">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowSelect(true)}
              className="flex items-center gap-2 text-blue-600 font-semibold text-sm hover:text-blue-700 transition-colors"
            >
              <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg leading-none">+</span>
              Add New Category
            </button>
          </div>

          {/* Footer */}
          <div className="p-5 border-t border-gray-100">
            <button
              onClick={() => onProceed(selected)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
            >
              Proceed
            </button>
          </div>
        </div>
      </div>

      <SelectCategoryModal
        isOpen={showSelect}
        onClose={() => setShowSelect(false)}
        selectedCategories={selected}
        onToggle={toggleCat}
        onDone={() => setShowSelect(false)}
      />
    </>
  );
}

// ─── SearchBar ────────────────────────────────────────────────────────────────

function SearchBar({
  placeholder = "Search Product",
  value,
  onChange,
}: {
  placeholder?: string;
  value: string;
  onChange: (q: string) => void;
}) {
  return (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
      />
      {value ? (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full transition-colors z-10"
          aria-label="Clear search"
        >
          <X className="w-4 h-4 text-gray-600" />
        </button>
      ) : (
        <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full transition-colors z-10" aria-label="Voice search">
          <Mic className="w-5 h-5 text-gray-600" />
        </button>
      )}
    </div>
  );
}

// ─── FilterTabs ───────────────────────────────────────────────────────────────

function FilterTabs({
  tabs = ["Most Relevant", "History", "Shortlisted Leads"],
  activeTab,
  onTabChange,
}: {
  tabs?: string[];
  activeTab: string;
  onTabChange?: (tab: string, index: number) => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-gray-200 overflow-x-auto scrollbar-hide">
      {tabs.map((tab, index) => (
        <button
          key={index}
          onClick={() => onTabChange?.(tab, index)}
          className={`relative pb-3 px-1 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab ? "text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
        >
          {tab}
          {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      ))}
    </div>
  );
}

// ─── FilterChips ──────────────────────────────────────────────────────────────

interface FilterChipsProps {
  selectedChips: string[];
  onChipToggle: (id: string) => void;
  locationSearch: string;
  onLocationSearch: (q: string) => void;
  onOpenCategories: () => void;
  selectedCategories: string[];
}

function FilterChips({
  selectedChips,
  onChipToggle,
  locationSearch,
  onLocationSearch,
  onOpenCategories,
  selectedCategories,
}: FilterChipsProps) {
  const [searchExpanded, setSearchExpanded] = useState(false);

  const mainFilters = [
    { id: "categories", label: "Categories", type: "dropdown" },
    { id: "suggested", label: "Suggested", type: "chip" },
    { id: "india", label: "India", type: "chip" },
    { id: "state", label: "State", type: "chip" },
    { id: "search-location", label: "Search Location", type: "search" },
  ];
  const qtyFilters = [
    { id: "bulk", label: "Bulk" },
    { id: "above-50k", label: "Above 50,000" },
    { id: "above-1l", label: "Above 1 Lakh" },
    { id: "above-5l", label: "Above 5 Lakh" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
        {mainFilters.map((f) => {
          if (f.type === "search") return (
            <div key={f.id} className={`flex items-center gap-2 bg-white border rounded-md transition-all duration-300 overflow-hidden shrink-0 ${searchExpanded ? "w-56 border-blue-500 ring-2 ring-blue-50" : "w-[140px] border-gray-300"}`}>
              <div className={`pl-3 shrink-0 ${searchExpanded ? "text-blue-500" : "text-gray-400"}`}><Search className="w-4 h-4" /></div>
              <input
                type="text"
                value={locationSearch}
                onChange={(e) => onLocationSearch(e.target.value)}
                onFocus={() => setSearchExpanded(true)}
                onBlur={() => { if (!locationSearch) setSearchExpanded(false); }}
                placeholder={f.label}
                className="w-full py-1.5 pr-3 text-sm bg-transparent border-none focus:ring-0 placeholder:text-gray-400 outline-none"
              />
            </div>
          );
          if (f.type === "dropdown") return (
            <button
              key={f.id}
              onClick={onOpenCategories}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                selectedCategories.length > 0
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              <MapPin className={`w-4 h-4 ${selectedCategories.length > 0 ? "text-white" : "text-gray-400"}`} />
              <span>{f.label}{selectedCategories.length > 0 ? ` (${selectedCategories.length})` : ""}</span>
              <ChevronDown className={`w-4 h-4 ${selectedCategories.length > 0 ? "text-white" : "text-gray-400"}`} />
            </button>
          );
          return (
            <button
              key={f.id}
              onClick={() => onChipToggle(f.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap border ${selectedChips.includes(f.id) ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 border-t border-gray-100 pt-3">
        {qtyFilters.map((f) => (
          <button
            key={f.id}
            onClick={() => onChipToggle(f.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap border ${selectedChips.includes(f.id) ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── LeadsInsights ────────────────────────────────────────────────────────────

function LeadsInsights({ totalLeads, urgentCount }: { totalLeads: number; urgentCount: number }) {
  return (
    <div className="space-y-4 mb-6">
      {urgentCount > 0 && (
        <motion.div variants={section} className="bg-gradient-to-br from-red-50 to-orange-50/50 rounded-3xl p-4 md:p-6 border border-red-100 shadow-sm relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="w-12 h-12 md:w-14 md:h-14 bg-white/80 rounded-2xl flex items-center justify-center text-red-600 shadow-sm border border-red-100 shrink-0">
                <Flame className="w-6 h-6 md:w-8 md:h-8" />
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">{urgentCount} high-priority lead{urgentCount > 1 ? "s" : ""} need attention</h3>
                <p className="text-sm text-gray-600 mt-0.5">Respond quickly to increase conversion chances</p>
              </div>
            </div>
            <motion.button
              whileTap={TAP}
              transition={TAP_T}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 md:px-10 bg-white border border-red-200 text-red-600 font-bold rounded-2xl hover:bg-red-50 transition-all shadow-sm"
            >
              <Phone className="w-5 h-5" /> Call Now
            </motion.button>
          </div>
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-64 h-64 bg-red-200/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-48 h-48 bg-orange-100/20 rounded-full blur-3xl" />
        </motion.div>
      )}

      <motion.div variants={listContainer} className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "Total Leads", value: String(totalLeads), badge: "+12", badgeColor: "text-emerald-600 bg-emerald-50", Icon: Users, iconBg: "bg-orange-50 text-orange-600" },
          { label: "Conversion Rate", value: "32%", badge: "+5%", badgeColor: "text-emerald-600 bg-emerald-50", Icon: TrendingUp, iconBg: "bg-emerald-50 text-emerald-600" },
          { label: "Pending Response", value: "2", badge: "Awaiting action", badgeColor: "text-gray-400 bg-gray-50 uppercase tracking-wider text-[11px]", Icon: Clock, iconBg: "bg-amber-50 text-amber-600" },
          { label: "Converted", value: "1", badge: "This month", badgeColor: "text-emerald-600 bg-emerald-50", Icon: UserCheck, iconBg: "bg-blue-50 text-blue-600" },
        ].map(({ label, value, badge, badgeColor, Icon, iconBg }) => (
          <motion.div key={label} variants={listItem} className="bg-white p-4 md:p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[130px] md:min-h-[150px] hover:border-blue-100 transition-colors">
            <div className="flex justify-between items-start">
              <span className="text-[13px] md:text-sm font-semibold text-gray-500">{label}</span>
              <div className={`p-2 md:p-3 rounded-xl md:rounded-2xl shadow-sm ${iconBg}`}><Icon className="w-5 h-5 md:w-6 md:h-6" /></div>
            </div>
            <div className="mt-2 md:mt-4">
              <div className="text-2xl md:text-3xl font-bold text-gray-900">{value}</div>
              <div className={`text-[11px] md:text-[13px] font-semibold mt-1 w-fit px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

// ─── HideLeadModal ────────────────────────────────────────────────────────────

function HideLeadModal({ isOpen, onClose, lead }: { isOpen: boolean; onClose: () => void; lead: Lead | null }) {
  const [selectedReason, setSelectedReason] = useState("");
  const [otherReason, setOtherReason] = useState("");

  const reasons = [
    { id: "category", label: <>I do not deal in <span className="font-bold text-gray-900">'{lead?.category || "Men Polyester T Shirt"}'</span> Category</> },
    { id: "location", label: <>I do not deal in <span className="font-bold text-blue-500">{lead?.location?.split(",")[0] || "New Delhi"}</span></> },
    { id: "order_value", label: "I do not deal in low order value" },
    { id: "specification", label: "I do not deal in this specification" },
    { id: "less_info", label: "This BuyLead has less information" },
    { id: "remove_only", label: "Just remove this BuyLead Only" },
    { id: "others", label: "Others" },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] flex flex-col p-0">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 mb-1">This BuyLead is now hidden</h3>
          <p className="text-gray-500 text-sm">Not interested? Please tell us more:</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {reasons.map((reason) => (
            <label key={reason.id} className="flex items-center justify-between p-4 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 last:border-0">
              <span className="text-[15px] font-medium text-gray-700 pr-4">{reason.label}</span>
              <input type="radio" name="hideReason" value={reason.id} checked={selectedReason === reason.id} onChange={(e) => setSelectedReason(e.target.value)} className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-600 cursor-pointer" />
            </label>
          ))}
          {selectedReason === "others" && (
            <div className="px-3 py-2">
              <textarea value={otherReason} onChange={(e) => setOtherReason(e.target.value)} placeholder="Please share any other reason why this BuyLead is not relevant for you" className="w-full p-4 text-sm text-gray-700 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[120px] resize-none" />
            </div>
          )}
        </div>
        <div className="flex border-t border-gray-100">
          <button onClick={onClose} className="flex-1 py-4 text-base font-bold text-blue-500 hover:bg-gray-50 transition-colors border-r border-gray-100">Back</button>
          <button onClick={() => { toast.success("Lead hidden successfully"); onClose(); }} className="flex-1 py-4 text-base font-bold text-white bg-blue-500 hover:bg-blue-600 transition-colors">Submit</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── LeadCard ─────────────────────────────────────────────────────────────────

function LeadCard({ lead }: { lead: Lead }) {
  const navigate = useNavigate();
  const [isBookmarked, setIsBookmarked] = useState(lead.isBookmarked);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showHideModal, setShowHideModal] = useState(false);

  const { title, quantity, location, buyerName, buyerPhone, category, requirement, time, country, buyerInfo, requirements, calls, chats, buys, viewedProducts } = lead;

  const handleCall = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) { window.location.href = `tel:${buyerPhone}`; }
    else { setShowPhoneModal(true); }
  };

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText(buyerPhone);
      toast.success("Phone number copied!", { description: buyerPhone, duration: 3000 });
      setShowPhoneModal(false);
    } catch {
      toast.error("Copy failed", { description: `Please copy manually: ${buyerPhone}`, duration: 5000 });
    }
  };

  return (
    <motion.div variants={listItem} className="border rounded-xl border-gray-200 hover:border-blue-300 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden bg-white">
      <div className="p-3 md:p-4">
        {/* Badges */}
        {(lead.isNew || lead.isUrgent) && (
          <div className="flex gap-2 mb-2">
            {lead.isNew && <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">NEW</span>}
            {lead.isUrgent && <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Flame className="w-3 h-3" />URGENT</span>}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-2 md:mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900 leading-tight mb-2">{title}</h3>
            <div className="inline-flex items-center px-2.5 py-1 bg-gray-100 rounded-md mb-2">
              <span className="text-sm font-semibold text-gray-700">Qty: {quantity.toLocaleString()}</span>
            </div>
            <div className="space-y-1.5 mt-2">
              <div className="flex items-center gap-1.5 text-gray-600">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <p className="text-xs truncate">{location}</p>
              </div>
              <p className="text-sm font-semibold text-gray-900">{buyerName}</p>
              <div className="flex items-center gap-1.5 text-gray-500">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <p className="text-xs">{time} • {country}</p>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-1 ml-2">
            <button
              onClick={() => { setIsBookmarked(!isBookmarked); toast.success(isBookmarked ? "Removed from shortlist" : "Added to shortlist"); }}
              className={`p-2 rounded-lg transition-all ${isBookmarked ? "text-yellow-600 bg-yellow-50 hover:bg-yellow-100" : "text-gray-400 hover:text-yellow-600 hover:bg-yellow-50"}`}
              title={isBookmarked ? "Remove from shortlist" : "Add to shortlist"}
            >
              <Send className={`w-5 h-5 ${isBookmarked ? "fill-current" : ""}`} />
            </button>
            <button onClick={() => setShowHideModal(true)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Hide this lead">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="border-t border-gray-100 my-2 md:my-3" />

        {/* Requirement */}
        <div className="mb-3 md:mb-4 bg-gray-50 rounded-lg p-2 md:p-3">
          <p className="text-xs text-gray-500 mb-1">Category</p>
          <p className="text-sm text-gray-700 mb-2">{category}</p>
          <p className="text-xs text-gray-500 mb-1">Requirements</p>
          <p className="text-sm font-semibold text-gray-900">{requirement}</p>
        </div>

        {/* Call & Chat */}
        <div className="grid grid-cols-2 gap-2 mb-2 md:mb-3">
          <button onClick={handleCall} className="flex items-center justify-center gap-2 bg-[#ef4d62] hover:bg-[#ef4d62]/80 text-white font-medium py-2.5 rounded-lg transition-all">
            <Phone className="w-4 h-4" /><span className="text-sm">Call</span>
          </button>
          <button onClick={() => navigate("/chat")} className="flex items-center justify-center gap-2 bg-white hover:bg-blue-50 text-blue-600 font-medium py-2.5 rounded-lg border-2 border-blue-500 transition-all">
            <MessageCircle className="w-4 h-4" /><span className="text-sm">Chat</span>
          </button>
        </div>

        {/* Buyer Activity */}
        <div className="bg-blue-50 rounded-lg p-3 mb-3">
          <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center justify-between text-left">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-900">Buyer Activity</span>
            </div>
            <ChevronRight className={`w-4 h-4 text-blue-600 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          </button>
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-blue-100 space-y-2">
              {[
                { label: "Status", value: buyerInfo, color: "text-blue-700", valueColor: "text-blue-900" },
                { label: "Requirements", value: requirements, color: "text-blue-700", valueColor: "text-blue-900" },
                { label: "Calls Made", value: calls, color: "text-[#ef4d62]", valueColor: "text-[#ef4d62]" },
                { label: "Chats", value: chats, color: "text-blue-700", valueColor: "text-blue-900" },
                { label: "Buys", value: buys, color: "text-blue-700", valueColor: "text-blue-900" },
              ].map(({ label, value, color, valueColor }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className={`text-xs ${color}`}>{label}</span>
                  <span className={`text-xs font-semibold ${valueColor}`}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Viewed Products */}
        {viewedProducts.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-gray-600" />
              <p className="text-sm font-semibold text-gray-900">Products Viewed by Buyer</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
              {viewedProducts.map((product, i) => (
                <div key={i} className="shrink-0 w-28 bg-white rounded-lg border border-gray-200 p-2 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="w-full h-20 bg-gray-100 rounded mb-2 overflow-hidden">
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  </div>
                  <p className="text-xs text-gray-900 font-medium truncate mb-1">{product.name}</p>
                  <p className="text-xs text-green-600 font-semibold">{product.price}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Phone Modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPhoneModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-4">
              <h3 className="text-lg font-bold text-gray-900">Contact Buyer</h3>
              <button onClick={() => setShowPhoneModal(false)} className="text-gray-400 hover:text-gray-600 ml-auto">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="px-6 pb-6">
              <p className="text-sm text-gray-600 mb-2">Buyer Name</p>
              <p className="text-base font-semibold text-gray-900 mb-4">{buyerName}</p>
              <p className="text-sm text-gray-600 mb-2">Phone Number</p>
              <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg mb-6">
                <Phone className="w-5 h-5 text-blue-600" />
                <p className="text-lg font-mono font-semibold text-gray-900">{buyerPhone}</p>
              </div>
              <div className="space-y-2">
                <button onClick={handleCopyPhone} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors">Copy Phone Number</button>
                <button onClick={() => { setShowPhoneModal(false); navigate("/chat"); }} className="w-full flex items-center justify-center gap-2 bg-[#ef4d62] hover:bg-[#ef4d62]/80 text-white font-semibold py-3 rounded-lg transition-colors">
                  <MessageCircle className="w-5 h-5" /> Start Chat
                </button>
                <button onClick={() => setShowPhoneModal(false)} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <HideLeadModal isOpen={showHideModal} onClose={() => setShowHideModal(false)} lead={lead} />
    </motion.div>
  );
}

// ─── CompletionScoreScreen ────────────────────────────────────────────────────

function CompletionScoreScreen({ onComplete }: { onComplete: () => void }) {
  const [showEmailModal, setShowEmailModal] = useState(false);
  const sections = [
    { title: "Product Name", items: [{ label: "3 or more Words", current: 15, max: 15, color: "text-green-600" }, { label: "At least 1 Specification", current: 10, max: 10, color: "text-green-600" }] },
    { title: "Photos", items: [{ label: "1 Photo", current: 10, max: 10, color: "text-green-600" }, { label: "2 Photos", current: 10, max: 10, color: "text-green-600" }, { label: "3 or more Photos", current: 0, max: 10, color: "text-gray-400" }] },
    { title: "Price", items: [{ label: "Price added (100+ Characters)", current: 20, max: 20, color: "text-green-600" }, { label: "Price added", current: 10, max: 10, color: "text-green-600" }] },
    { title: "Specifications", items: [{ label: "1 Specification added", current: 10, max: 10, color: "text-green-600" }, { label: "4 Specifications added", current: 0, max: 5, color: "text-gray-400" }, { label: "6 or more Specifications added", current: 0, max: 5, color: "text-gray-400" }] },
  ];
  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md lg:max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-white text-2xl lg:text-3xl font-bold mb-2">View the summary</h1>
            <p className="text-white text-lg">of completion score at a glance</p>
          </div>
          <div className="bg-white rounded-2xl shadow-xl p-6 lg:p-8">
            <div className="flex justify-center mb-6">
              <div className="bg-gradient-to-r from-green-400 to-green-500 text-white px-6 py-2 rounded-full font-semibold text-sm flex items-center gap-2">
                <span>📊 PRODUCT SCORE:</span><span className="text-lg">80</span>
              </div>
            </div>
            <div className="space-y-6">
              {sections.map((section, idx) => (
                <div key={idx}>
                  <h3 className="font-semibold text-gray-900 mb-3">{section.title}</h3>
                  <div className="space-y-2">
                    {section.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className={item.color}>{item.label}</span>
                        <span className={item.color}>{item.current}/{item.max}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between font-bold text-gray-900">
                  <span>Total</span><span>80/100</span>
                </div>
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button onClick={onComplete} className="flex-1 px-6 py-3 border-2 border-blue-600 text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors">Skip for Now</button>
              <button onClick={() => setShowEmailModal(true)} className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">Next</button>
            </div>
          </div>
        </div>
      </div>
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button onClick={onComplete} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            <div className="text-center">
              <span className="text-sm font-semibold text-red-600 bg-red-50 px-3 py-1 rounded-full">IMPORTANT — Email ID Missing</span>
              <div className="my-6 w-48 h-48 mx-auto bg-blue-50 rounded-2xl flex items-center justify-center text-6xl">📧</div>
              <p className="text-gray-700 mb-6 text-sm leading-relaxed">Email ID is required to receive buyer leads, account alerts and latest notifications about new feature releases</p>
              <div className="space-y-3">
                <button className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">Add Email Now</button>
                <button onClick={onComplete} className="w-full px-6 py-3 text-blue-600 font-semibold hover:bg-blue-50 transition-colors rounded-lg">Skip for Now</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4">
        <Search className="w-9 h-9 text-blue-300" />
      </div>
      <p className="text-gray-500 font-medium text-base mb-1">{message}</p>
      <p className="text-gray-400 text-sm">Try adjusting your filters or search query</p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const Leads = () => {
  const reduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState("Most Relevant");
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [showCompletionScore, setShowCompletionScore] = useState(false);
  const [lastScroll, setLastScroll] = useState(0);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChips, setSelectedChips] = useState<string[]>(["suggested"]);
  const [locationSearch, setLocationSearch] = useState("");
  const [businessCategories, setBusinessCategories] = useState<string[]>([]);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("hasSeenCompletionScore")) setShowCompletionScore(true);
  }, []);

  useEffect(() => {
    let isScrolling = false;
    const handleScroll = (event: Event) => {
      if (isScrolling) return;
      isScrolling = true;
      setTimeout(() => { isScrolling = false; }, 100);
      const target = event.target as HTMLElement;
      if (target instanceof HTMLElement && target.closest?.('[role="dialog"]')) return;
      const scrollTop = target instanceof HTMLElement ? target.scrollTop : window.scrollY;
      if (scrollTop < 10) setIsFilterOpen(true);
      else if (scrollTop > 50 && scrollTop > lastScroll) setIsFilterOpen(false);
      setLastScroll(scrollTop);
    };
    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [lastScroll]);

  const toggleChip = (id: string) => {
    setSelectedChips((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  // ── Filtering logic ──────────────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    let leads = [...sampleLeads];

    // Tab filter
    const tabMap: Record<string, Lead["tab"]> = {
      "Most Relevant": "relevant",
      "History": "history",
      "Shortlisted Leads": "shortlisted",
      "Hidden Buy leads": "hidden",
    };
    const tabKey = tabMap[activeTab];
    if (tabKey) leads = leads.filter((l) => l.tab === tabKey);

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      leads = leads.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.requirement.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          l.buyerName.toLowerCase().includes(q) ||
          l.location.toLowerCase().includes(q)
      );
    }

    // Location search
    if (locationSearch.trim()) {
      const q = locationSearch.toLowerCase();
      leads = leads.filter((l) => l.location.toLowerCase().includes(q));
    }

    // India chip
    if (selectedChips.includes("india")) {
      leads = leads.filter((l) => l.country === "IND");
    }

    // Quantity filters (take the most restrictive one)
    const qtyFilters = [
      { id: "above-5l", min: 500000 },
      { id: "above-1l", min: 100000 },
      { id: "above-50k", min: 50000 },
      { id: "bulk", min: 50 },
    ];
    for (const qf of qtyFilters) {
      if (selectedChips.includes(qf.id)) {
        leads = leads.filter((l) => l.qtyValue >= qf.min);
        break;
      }
    }

    return leads;
  }, [activeTab, searchQuery, locationSearch, selectedChips]);

  const urgentCount = filteredLeads.filter((l) => l.isUrgent).length;

  if (showCompletionScore) {
    return (
      <CompletionScoreScreen onComplete={() => { localStorage.setItem("hasSeenCompletionScore", "true"); setShowCompletionScore(false); }} />
    );
  }

  const filterBar = (
    <>
      <FilterTabs
        tabs={["Most Relevant", "History", "Shortlisted Leads", "Hidden Buy leads"]}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
      />
      <FilterChips
        selectedChips={selectedChips}
        onChipToggle={toggleChip}
        locationSearch={locationSearch}
        onLocationSearch={setLocationSearch}
        onOpenCategories={() => setShowCategoriesModal(true)}
        selectedCategories={businessCategories}
      />
    </>
  );

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="min-h-screen bg-gray-50 -m-4 lg:-m-6">
        {/* Mobile */}
        <div className="lg:hidden">
          <motion.div variants={section} className="sticky -top-2 z-20 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
              <div className="flex-1">
                <SearchBar value={searchQuery} onChange={setSearchQuery} />
              </div>
              <motion.button
                whileTap={TAP}
                transition={TAP_T}
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`p-2 rounded-lg border border-gray-200 transition-all ${isFilterOpen ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-white text-gray-500"}`}
              >
                <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${isFilterOpen ? "rotate-180" : ""}`} />
              </motion.button>
            </div>
            <div className={`overflow-hidden transition-all duration-200 ${isFilterOpen ? "max-h-[500px]" : "max-h-0"}`}>
              <div className="p-4 border-b border-gray-50 bg-white">{filterBar}</div>
            </div>
          </motion.div>
          <motion.div variants={section} className="p-4 space-y-4">
            <LeadsInsights totalLeads={filteredLeads.length} urgentCount={urgentCount} />
            {filteredLeads.length === 0
              ? <EmptyState message="No leads match your filters" />
              : (
                <motion.div variants={listContainer} className="space-y-4">
                  {filteredLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
                </motion.div>
              )
            }
          </motion.div>
        </div>

        {/* Desktop */}
        <div className="hidden lg:block max-w-7xl mx-auto px-6 py-8">
          <motion.div variants={section} className="sticky -top-2 z-20 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 flex items-center gap-4 border-b border-gray-100">
                <div className="flex-1">
                  <SearchBar value={searchQuery} onChange={setSearchQuery} />
                </div>
                <motion.button
                  whileTap={TAP}
                  transition={TAP_T}
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${isFilterOpen ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
                >
                  <span className="text-sm font-semibold">Filters</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isFilterOpen ? "rotate-180" : ""}`} />
                </motion.button>
              </div>
              <div className={`overflow-hidden transition-all duration-200 ${isFilterOpen ? "max-h-[300px] p-6 pt-0" : "max-h-0"}`}>
                <div className="pt-6 space-y-6">{filterBar}</div>
              </div>
            </div>
          </motion.div>
          <LeadsInsights totalLeads={filteredLeads.length} urgentCount={urgentCount} />
          {filteredLeads.length === 0
            ? <EmptyState message="No leads match your filters" />
            : (
              <>
                <motion.div variants={listContainer} className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {filteredLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
                </motion.div>
                <motion.div variants={section} className="mt-8 text-center">
                  <motion.button
                    whileTap={TAP}
                    transition={TAP_T}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    Load More Leads
                  </motion.button>
                </motion.div>
              </>
            )
          }
        </div>
      </motion.div>

      {/* Add Business Categories Modal */}
      <AddBusinessCategoriesModal
        isOpen={showCategoriesModal}
        onClose={() => setShowCategoriesModal(false)}
        savedCategories={businessCategories}
        onProceed={(cats) => {
          setBusinessCategories(cats);
          setShowCategoriesModal(false);
          if (cats.length > 0) {
            toast.success(`${cats.length} categor${cats.length > 1 ? "ies" : "y"} saved`);
          }
        }}
      />
    </DashboardLayout>
  );
};

export default Leads;