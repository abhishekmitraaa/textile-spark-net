import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import cosoraStudioHero from "@/assets/cosora-studio-hero.jpg";
import brandChuu from "@/assets/brands/chuu-fashion.png";
import brandCherry from "@/assets/brands/cherrykoko.png";
import brandBrandi from "@/assets/brands/brandi.png";
import brandStyleNanda from "@/assets/brands/style-nanda.png";
import brandStyleOnMe from "@/assets/brands/styleonme.png";
import brandHotPing from "@/assets/brands/hotping.png";
import {
  AlertTriangle, Bookmark, BookmarkCheck, ChevronDown,
  Download, FileText, Filter, GripVertical, MapPin,
  MoreVertical, Pencil, Phone, Play, Plus, Search,
  Star, Users, Mail, Globe, ArrowUpDown, Grid2X2,
  Grid3X3, X, Upload, ArrowLeft, Check,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const DEMO_BANNER = "/vendorregistration1banner.png";

const officePhotos = [
  { label: "Factory Floor",  src: "/vendorhelp.png" },
  { label: "Sampling Unit",  src: cosoraStudioHero },
  { label: "Cutting Zone",   src: "/vendorregistration1banner.png" },
  { label: "Finishing Area", src: cosoraStudioHero },
  { label: "Packing Bay",    src: "/vendorhelp.png" },
];

const brandCategories = [
  { label: "T-Shirts",       src: brandChuu },
  { label: "Denim",          src: brandCherry },
  { label: "Printing",       src: brandBrandi },
  { label: "Manufacturing",  src: brandStyleNanda },
  { label: "Embroidery",     src: brandStyleOnMe },
  { label: "Finishing",      src: brandHotPing },
];

const capacityOptions = [
  { key: "Small-batch",  desc: "Small-batch manufacturers (10–200 pcs per design)" },
  { key: "Medium",       desc: "Medium-scale manufacturers (200–5,000 pcs)" },
  { key: "Large",        desc: "Large-scale mass manufacturers (5,000–1 lakh+)" },
  { key: "Export-grade", desc: "Export-grade manufacturers (international compliance)" },
];

const employeeOptions = [
  "Less than 10", "10 - 100", "100 - 500",
  "500 - 1,000", "1,000 - 2,000", "2,000 - 5,000",
  "5,000 - 10,000", "More than 10,000",
];

const recommendationProducts = [
  { name: "Cotton T-Shirt 180 GSM",       price: "₹199", moq: "200", sold: "800+", rating: "3.8", reviews: "1.6k", image: cosoraStudioHero },
  { name: "Denim Jacket 12 Oz",           price: "₹1,299", moq: "120", sold: "800+", rating: "3.8", reviews: "1.6k", image: "/vendorregistration1banner.png" },
  { name: "Printing Service (All-Over)",  price: "₹55",  moq: "500", sold: "800+", rating: "3.8", reviews: "1.6k", image: "/vendorhelp.png" },
  { name: "Polyblend Hoodies",            price: "₹699", moq: "150", sold: "800+", rating: "3.8", reviews: "1.6k", image: cosoraStudioHero },
];

const videoProducts = [
  { name: "Ribbed Tank Tops",   price: "₹249", category: "Apparel",  sub: "Tops",    duration: "00:32", thumbnail: cosoraStudioHero },
  { name: "Denim Shorts",       price: "₹399", category: "Denim",    sub: "Shorts",  duration: "00:21", thumbnail: "/vendorregistration1banner.png" },
  { name: "Printed Overshirt",  price: "₹649", category: "Printing", sub: "Shirts",  duration: "00:27", thumbnail: "/vendorhelp.png" },
  { name: "Athleisure Joggers", price: "₹529", category: "Apparel",  sub: "Bottoms", duration: "00:45", thumbnail: cosoraStudioHero },
  { name: "Cotton Polo",        price: "₹359", category: "Apparel",  sub: "Polo",    duration: "00:19", thumbnail: "/vendorregistration1banner.png" },
];

const allProducts = [
  { name: "Caramel Classic Tee",   price: "₹499", moq: "2", sold: "800+", location: "Bangalore", fabric: "Cotton", gsm: "200", fit: "Regular", rating: "4.1", reviews: "5.6k", latest: true,  image: cosoraStudioHero },
  { name: "Denim Straight Fit",    price: "₹499", moq: "2", sold: "800+", location: "Bangalore", fabric: "Denim",  gsm: "200", fit: "Regular", rating: "3.8", reviews: "1.6k", latest: false, image: "/vendorregistration1banner.png" },
  { name: "Custom Print Hoodie",   price: "₹499", moq: "2", sold: "800+", location: "Bangalore", fabric: "Cotton", gsm: "200", fit: "Regular", rating: "3.5", reviews: "2.1k", latest: false, image: "/vendorhelp.png" },
  { name: "Stretch Denim Skirt",   price: "₹499", moq: "2", sold: "800+", location: "Bangalore", fabric: "Denim",  gsm: "200", fit: "Regular", rating: "4.0", reviews: "1.8k", latest: false, image: cosoraStudioHero },
  { name: "Oversized Crewneck",    price: "₹499", moq: "2", sold: "800+", location: "Bangalore", fabric: "Cotton", gsm: "200", fit: "Oversized", rating: "4.3", reviews: "3.2k", latest: true, image: "/vendorregistration1banner.png" },
  { name: "Cargo Joggers",         price: "₹499", moq: "2", sold: "800+", location: "Bangalore", fabric: "Cotton", gsm: "200", fit: "Regular", rating: "3.8", reviews: "1.4k", latest: false, image: cosoraStudioHero },
];

const ratingBreakdown = [
  { stars: 5, percent: 80, color: "#14ae5c" },
  { stars: 4, percent: 5,  color: "#14ae5c" },
  { stars: 3, percent: 0,  color: "#14ae5c" },
  { stars: 2, percent: 0,  color: "#14ae5c" },
  { stars: 1, percent: 15, color: "#14ae5c" },
];

const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const years  = ["2024","2025","2026"];

const CATEGORY_GROUPS = [
  { group: "MANUFACTURER", items: ["Garment Manufacturer","Fabric Manufacturer","Accessories Manufacturer","Embroidery manufacturers","Printing manufacturers","Luxury/premium wear manufacturers","Home Textile Manufacturers","Export-grade manufacturers","Leather Goods Manufacturer","Footwear Manufacturer","Uniforms / Corporate Wear","Sportswear / Athleisure Manufacturer","Private Label Manufacturer","Made-to-Order / Custom Manufacturing","Recycled fabric manufacturers","Sustainable & organic wear manufacturers"] },
  { group: "TRADER / WHOLESALER", items: ["Textile Trader","Garment Wholesaler","Fabric Wholesaler","Export House","Import / Trading Company","Multi-brand Distributor"] },
  { group: "RETAILER", items: ["Apparel Retail Store","Online Fashion Retailer","Multi-brand Outlet","Boutique / Designer Studio","Departmental Store"] },
  { group: "SERVICES", items: ["Logistics & Shipping","Quality Inspection / Testing Lab","Fashion Designer / Consultant","Sourcing Agent","Buying House"] },
];

// ─────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────

function NumberOfEmployeesModal({ isOpen, onClose, selected, onSelect }: { isOpen: boolean; onClose: () => void; selected: string; onSelect: (v: string) => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={onClose}><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
          <h3 className="text-base font-bold text-gray-900">Number of Employees</h3>
        </div>
        <div className="overflow-y-auto flex-1">
          <div className="mx-4 mt-4 mb-2 flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-blue-500 shrink-0" />
            <p className="text-xs text-blue-700">Please select the number of employees at your company</p>
          </div>
          <div className="divide-y divide-gray-100 px-4 pb-4">
            {employeeOptions.map(opt => (
              <button key={opt} onClick={() => { onSelect(opt); onClose(); }}
                className="flex items-center justify-between w-full py-4 text-left">
                <span className="text-sm text-gray-800">{opt}</span>
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selected === opt ? "border-blue-600 bg-blue-600" : "border-gray-300"}`}>
                  {selected === opt && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
              </button>
            ))}
          </div>
          <div className="px-4 pb-4">
            <button onClick={onClose} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectCategoryModal({ isOpen, onClose, selected, onToggle }: { isOpen: boolean; onClose: () => void; selected: string[]; onToggle: (cat: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return CATEGORY_GROUPS;
    const q = search.toLowerCase();
    return CATEGORY_GROUPS.map(g => ({ ...g, items: g.items.filter(i => i.toLowerCase().includes(q)) })).filter(g => g.items.length > 0);
  }, [search]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={onClose}><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
          <h3 className="text-base font-bold text-gray-900">Add Business Categories</h3>
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-xs text-blue-600 font-semibold mb-2">Add Categories</p>
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search categories..." className="bg-transparent flex-1 text-sm text-gray-700 placeholder-gray-400 focus:outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-10">No results for "{search}"</p>}
          {filtered.map(group => (
            <div key={group.group}>
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">{group.group}</p>
              <div className="flex flex-wrap gap-2">
                {group.items.map(item => {
                  const isSel = selected.includes(item);
                  return (
                    <button key={item} onClick={() => onToggle(item)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${isSel ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"}`}>
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">
            Done {selected.length > 0 && `(${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddBusinessCategoriesModal({ isOpen, onClose, categories, onCategoriesChange }: { isOpen: boolean; onClose: () => void; categories: string[]; onCategoriesChange: (cats: string[]) => void }) {
  const [showSelect, setShowSelect] = useState(false);
  const [local, setLocal] = useState<string[]>(categories);
  const toggle = (cat: string) => setLocal(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50">
        <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <button onClick={onClose}><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
            <h3 className="text-base font-bold text-gray-900">Add Business Categories</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <p className="text-sm text-gray-600 mb-1">Categories describe what your business is and the products and services your business offers. Please add at least one category for customers to find your business.</p>
            <p className="text-xs text-gray-400 italic mb-5">Please note: Edits may go for moderation and it can take up to 24-48 hours to be published.</p>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Selected Categories</p>
            {local.length === 0 && <p className="text-sm text-gray-400 mb-4">No categories added yet.</p>}
            <div className="flex flex-wrap gap-2 mb-4">
              {local.map(cat => (
                <span key={cat} className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-full">
                  {cat}
                  <button onClick={() => toggle(cat)}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <button onClick={() => setShowSelect(true)} className="flex items-center gap-1.5 text-blue-600 font-semibold text-sm">
              <span className="text-lg font-bold">+</span> Add New Category
            </button>
          </div>
          <div className="px-5 py-4 border-t border-gray-100 space-y-3">
            <button onClick={() => setShowSelect(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-blue-600 text-blue-600 font-bold rounded-xl hover:bg-blue-50">
              <Plus className="w-4 h-4" /> Add
            </button>
            <button onClick={() => { onCategoriesChange(local); onClose(); }} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">Proceed</button>
          </div>
        </div>
      </div>
      <SelectCategoryModal isOpen={showSelect} onClose={() => setShowSelect(false)} selected={local} onToggle={toggle} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const BusinessProfile = () => {
  const navigate = useNavigate();
  const [detailsOpen, setDetailsOpen]       = useState(true);
  const [editMode, setEditMode]             = useState(false);
  const [gridCols, setGridCols]             = useState<2 | 3>(2);
  const [activeVideo, setActiveVideo]       = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth]   = useState("");
  const [selectedYear, setSelectedYear]     = useState("");
  const [selectedCapacity, setSelectedCapacity] = useState<string[]>(["Medium"]);
  const [businessCategories, setBusinessCategories] = useState<string[]>(["T-Shirts", "Denim", "Printing", "Manufacturing"]);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showEmployeesModal, setShowEmployeesModal]   = useState(false);
  const [employeeCount, setEmployeeCount]   = useState("250 - 500");
  const [productSearch, setProductSearch]   = useState("");
  const [genderFilter, setGenderFilter]     = useState("");
  const [bookmarkedProducts, setBookmarkedProducts] = useState<Set<number>>(new Set());
  const [bookmarkedPage, setBookmarkedPage] = useState(false);
  const [recommendItems, setRecommendItems] = useState(recommendationProducts);
  const [dragIndex, setDragIndex]           = useState<number | null>(null);

  const selectedVideo = activeVideo === null ? null : videoProducts[activeVideo];

  const toggleCapacity = (key: string) =>
    setSelectedCapacity(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const toggleBookmark = (index: number) =>
    setBookmarkedProducts(prev => { const n = new Set(prev); n.has(index) ? n.delete(index) : n.add(index); return n; });

  const filteredProducts = useMemo(() =>
    allProducts.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())),
  [productSearch]);

  const detailRows = useMemo(() => [
    { label: "Business Type",          value: "Apparel Manufacturer" },
    { label: "Company MD",             value: "Mr. R. Sharma" },
    { label: "Total Employees",        value: employeeCount, clickable: true, onClick: () => setShowEmployeesModal(true) },
    { label: "Year of Establishment",  value: "2014" },
    { label: "Cosora Member Since",    value: "1 Year" },
    { label: "Annual Turnover",        value: "Rs 2 - 5 Cr" },
    { label: "PAN",                    value: "ABCPR1234D" },
  ], [employeeCount]);

  return (
    <DashboardLayout>
      <div className="space-y-3 pb-24 max-w-2xl mx-auto lg:max-w-3xl">

        {/* ══════════════════════════════════════════════════════
            HERO BANNER — full background image, all info on top
        ══════════════════════════════════════════════════════ */}
        <section className="rounded-2xl overflow-hidden relative">
          {/* Background image */}
          <div className="relative h-52 sm:h-60 lg:h-64">
            <img
              src={DEMO_BANNER}
              alt="Brand banner"
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Dark gradient overlay — stronger at bottom left where text sits */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/20" />

            {/* Large watermark brand name — centered, semi-transparent */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <span className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-[0.3em] text-white/20 uppercase">
                CARAMEL
              </span>
            </div>

            {/* TrustedSEAL — top right */}
            <div className="absolute top-3 right-3 z-10">
              <span className="rounded-md bg-[#f59e0b] px-2.5 py-1 text-[10px] font-bold text-white tracking-wide italic">
                TrustedSEAL
              </span>
            </div>

            {/* 3-dot menu — top right below seal */}
            <button className="absolute right-3 top-12 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors">
              <MoreVertical className="h-4 w-4" />
            </button>

            {/* All text content — bottom left */}
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 z-10">
              {/* Brand name */}
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide leading-tight">
                CARAMEL
              </h1>

              {/* City, Country */}
              <div className="flex items-center gap-1 mt-0.5 mb-2">
                <MapPin className="h-3 w-3 text-white/80 shrink-0" />
                <span className="text-xs text-white/80">Surat, Gujarat · India</span>
              </div>

              {/* Followers + All Items in a row */}
              <div className="flex items-center gap-6 mb-1">
                <div>
                  <p className="text-[10px] text-white/70 uppercase tracking-wider leading-none">Followers</p>
                  <p className="text-lg font-bold text-white leading-tight">7,333</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/70 uppercase tracking-wider leading-none">All Items</p>
                  <p className="text-lg font-bold text-white leading-tight">3,538</p>
                </div>
              </div>

              {/* Vendor type */}
              <p className="text-xs text-white/80 font-medium">Manufacturer | Exporter</p>
            </div>
          </div>

          {/* Office photo strip — white card below banner */}
          <div className="bg-white px-4 py-3">
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
              {/* Add photo button */}
              <div className="flex-shrink-0 flex flex-col items-center">
                <div className="h-20 w-20 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50">
                  <Plus className="h-6 w-6 text-blue-500" />
                </div>
                <p className="mt-1 text-[10px] text-gray-400">Add Photo</p>
              </div>
              {officePhotos.map(photo => (
                <div key={photo.label} className="flex-shrink-0 text-center">
                  <div className="h-20 w-20 overflow-hidden rounded-xl border border-gray-100 bg-gray-100">
                    <img src={photo.src} alt={photo.label} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500 truncate w-20">{photo.label}</p>
                </div>
              ))}
            </div>
            {/* Scroll dots */}
            <div className="flex items-center justify-center gap-1 mt-2">
              {[0,1,2,3].map(i => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === 0 ? "w-4 bg-blue-500" : "w-1.5 bg-gray-300"}`} />
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            ABOUT US
        ══════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-900">About Us</h2>
            <button className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 px-3 py-1.5 rounded-full hover:bg-blue-700 transition-colors">
              Edit profile <Pencil className="h-3 w-3" />
            </button>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Caramel Fashion is a Surat-based manufacturer focused on high-volume knitwear, denim essentials, and in-house printing services for private labels across India and the GCC.
          </p>
        </section>

        {/* ══════════════════════════════════════════════════════
            CONTACT DETAILS
        ══════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Contact Details</h2>
            <button className="flex items-center gap-1 text-xs font-semibold text-blue-600">
              Edit profile <Pencil className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-0 divide-y divide-gray-100">
            {[
              { Icon: Users, value: "Mr. R. Sharma", missing: false },
              { Icon: MapPin, value: "2nd Floor, Umiya Nagar, Surat, Gujarat, India", missing: false },
              { Icon: Phone, value: "+91 90110 60851", missing: false },
            ].map(({ Icon, value, missing }, i) => (
              <div key={i} className={`flex items-start gap-3 ${i === 0 ? "pb-3" : "py-3"}`}>
                <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <span className={`text-sm ${missing ? "text-gray-400" : "text-gray-700"}`}>{value}</span>
              </div>
            ))}

            {/* Email — missing */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-400">Add email ID</span>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-500">
                <AlertTriangle className="h-3 w-3" /> Missing Info
              </span>
            </div>

            {/* Website — missing */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-400">Add Website</span>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-500">
                <AlertTriangle className="h-3 w-3" /> Missing Info
              </span>
            </div>

            {/* Social Media */}
            <div className="flex items-center justify-between pt-3">
              <span className="text-sm font-semibold text-gray-800">Social Media</span>
              <button onClick={() => navigate("/add-social-links")} className="text-xs font-semibold text-blue-600 underline">
                Add your social links
              </button>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            REVIEWS AND RATINGS
        ══════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-bold text-gray-900 mb-4">Reviews and Ratings</h2>

          {/* Score row */}
          <div className="flex items-center gap-4 mb-5">
            <div className="text-center">
              <span className="text-4xl font-extrabold text-gray-900">4.5</span>
              <span className="text-base text-gray-400">/5</span>
            </div>
            <div>
              <div className="flex items-center gap-0.5 mb-0.5">
                {[0,1,2,3].map(i => <Star key={i} className="h-5 w-5 text-yellow-400 fill-yellow-400" />)}
                {/* half star approximation */}
                <Star className="h-5 w-5 text-yellow-300 fill-yellow-200" />
              </div>
              <p className="text-xs text-gray-400">Reviewed by 20 Users</p>
            </div>
          </div>

          {/* Bars */}
          <div className="space-y-2.5">
            {ratingBreakdown.map(row => (
              <div key={row.stars} className="flex items-center gap-3">
                <span className="w-10 text-xs text-gray-500 shrink-0 text-right">{row.stars} Star</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${row.percent}%`, backgroundColor: row.color }} />
                </div>
                <span className="w-8 text-right text-xs text-gray-500 shrink-0">{row.percent}%</span>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            DETAILED INFORMATION (collapsible)
        ══════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <button
            className="flex w-full items-center justify-between px-4 py-3.5 text-left"
            onClick={() => setDetailsOpen(p => !p)}
          >
            <h2 className="text-sm font-bold text-gray-900">Detailed information</h2>
            <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`} />
          </button>

          {detailsOpen && (
            <div className="border-t border-gray-100 px-4 py-4 space-y-5">
              {/* Month / Year */}
              <div className="flex gap-3">
                {[
                  { val: selectedMonth, set: setSelectedMonth, opts: months, placeholder: "Month" },
                  { val: selectedYear,  set: setSelectedYear,  opts: years,  placeholder: "Year"  },
                ].map(({ val, set, opts, placeholder }) => (
                  <div key={placeholder} className="relative flex-1">
                    <select value={val} onChange={e => set(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">{placeholder}</option>
                      {opts.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                ))}
              </div>

              {/* Detail rows */}
              <div className="space-y-3.5 divide-y divide-gray-50">
                {detailRows.map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-4 text-sm pt-3 first:pt-0">
                    <span className="text-gray-500">{row.label}</span>
                    {row.clickable
                      ? <button onClick={row.onClick} className="font-semibold text-blue-600 text-right">{row.value}</button>
                      : <span className="font-semibold text-gray-800 text-right">{row.value}</span>}
                  </div>
                ))}
              </div>

              {/* Capacity */}
              <div>
                <p className="text-sm font-bold text-gray-900 mb-0.5">Capacity</p>
                <p className="text-xs text-gray-400 mb-3">(Only if manufacturer)</p>
                <div className="space-y-2">
                  {capacityOptions.map(opt => {
                    const isSel = selectedCapacity.includes(opt.key);
                    return (
                      <button key={opt.key} onClick={() => toggleCapacity(opt.key)}
                        className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${isSel ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}>
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${isSel ? "border-blue-600 bg-blue-600" : "border-gray-300"}`}>
                          {isSel && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <span className={`text-xs leading-relaxed ${isSel ? "font-medium text-blue-700" : "text-gray-500"}`}>{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Catalogue upload */}
              <div>
                <p className="text-sm font-bold text-gray-900 mb-3">Catalogue</p>
                <div className="rounded-xl border-2 border-dashed border-gray-200 p-4 text-center mb-3 cursor-pointer hover:border-blue-300 transition-colors">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Upload className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold text-blue-600">Upload Catalogue PDF</p>
                  <p className="text-xs text-gray-400 mt-0.5">All PDFs will appear here once uploaded.</p>
                </div>
                <div className="space-y-2">
                  {["Caramel_Tshirts_2026.pdf", "Denim_Lookbook_Q2.pdf"].map(doc => (
                    <div key={doc} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                          <FileText className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-800">{doc}</p>
                          <p className="text-[10px] text-gray-400">PDF • 3.2 MB</p>
                        </div>
                      </div>
                      <button className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                        <Download className="h-3.5 w-3.5" /> Download
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Business Category */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-gray-900">Business Category</p>
                  <button onClick={() => setShowCategoriesModal(true)} className="text-xs font-semibold text-blue-600">Edit</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {businessCategories.map(cat => (
                    <span key={cat} className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-600">{cat}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════════════
            OFFICE PICTURES (grid)
        ══════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Office Pictures</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="aspect-square rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50">
              <Plus className="h-7 w-7 text-blue-500" />
            </div>
            {officePhotos.slice(0, 5).map(photo => (
              <div key={photo.label} className="aspect-square overflow-hidden rounded-xl">
                <img src={photo.src} alt={photo.label} className="h-full w-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            BRAND'S CATEGORIES (horizontal scroll)
        ══════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Brand's Categories</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {brandCategories.map(cat => (
              <div key={cat.label} className="flex-shrink-0 text-center">
                <div className="h-20 w-20 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                  <img src={cat.src} alt={cat.label} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <p className="mt-1.5 text-xs font-medium text-gray-700 truncate w-20">{cat.label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-1 mt-2">
            {[0,1,2,3].map(i => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === 0 ? "w-4 bg-blue-500" : "w-1.5 bg-gray-300"}`} />
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            BRAND'S RECOMMENDATIONS (draggable grid)
        ══════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Brand's Recommendations</h2>
            <button onClick={() => setEditMode(p => !p)}
              className="rounded-full border border-blue-500 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50">
              {editMode ? "Done" : "Edit"}
            </button>
          </div>
          {editMode && <p className="text-xs text-gray-400 mb-3">Drag to rearrange your products</p>}
          <div className="grid grid-cols-3 gap-2">
            {recommendItems.map((product, idx) => (
              <div
                key={product.name}
                draggable={editMode}
                onDragStart={() => setDragIndex(idx)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex === null || dragIndex === idx) return;
                  const next = [...recommendItems];
                  const [moved] = next.splice(dragIndex, 1);
                  next.splice(idx, 0, moved);
                  setRecommendItems(next);
                  setDragIndex(null);
                }}
                className={`rounded-xl border border-gray-200 overflow-hidden ${editMode ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <div className="relative aspect-[3/4] bg-gray-100">
                  {editMode && (
                    <div className="absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow">
                      <GripVertical className="h-3 w-3 text-gray-500" />
                    </div>
                  )}
                  <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                  {/* rating badge */}
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 py-0.5">
                    <Star className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />
                    <span className="text-[9px] font-bold text-gray-800">{product.rating}</span>
                    <span className="text-[9px] text-gray-400">| {product.reviews}</span>
                  </div>
                </div>
                <div className="p-1.5">
                  <p className="text-[10px] font-bold text-[#ef4d62]">{product.price} | MOQ: {product.moq} | {product.sold} sold</p>
                  <p className="text-[9px] text-gray-500 truncate">Product name | <span className="font-bold">SOHO</span></p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            BRAND PRODUCT VIDEOS
        ══════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Brand Product Videos</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="aspect-[3/4] rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50">
              <Plus className="h-7 w-7 text-blue-500" />
            </div>
            {videoProducts.slice(0, 5).map((video, index) => (
              <button key={video.name} onClick={() => setActiveVideo(index)}
                className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gray-100">
                <img src={video.thumbnail} alt={video.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-black/25" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80">
                    <Play className="h-4 w-4 text-blue-600 fill-blue-600" />
                  </div>
                </div>
                <span className="absolute top-1.5 right-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] text-white">{video.duration}</span>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 py-2">
                  <p className="text-[9px] font-bold text-white truncate">{video.name}</p>
                  <p className="text-[9px] text-white/85">{video.price}</p>
                  <p className="text-[9px] text-white/70 truncate">{video.category} • {video.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            ALL PRODUCTS
        ══════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Caramel Fashion</h2>
            <button onClick={() => setBookmarkedPage(p => !p)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200">
              {bookmarkedPage
                ? <BookmarkCheck className="h-4 w-4 text-blue-600 fill-blue-100" />
                : <Bookmark className="h-4 w-4 text-gray-500" />}
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 mb-3">
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
              placeholder="Search items"
              className="flex-1 text-sm text-gray-700 placeholder-gray-400 focus:outline-none bg-transparent" />
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <div className="relative">
              <select value={genderFilter} onChange={e => setGenderFilter(e.target.value)}
                className="appearance-none rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-700 font-semibold focus:outline-none pr-6">
                <option value="">GENDER</option>
                <option>Men</option><option>Women</option><option>Unisex</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
            </div>
            <button className="flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700">
              <ArrowUpDown className="h-3 w-3" /> SORT
            </button>
            <button className="flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700">
              <Filter className="h-3 w-3" /> FILTER
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setGridCols(2)}
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${gridCols === 2 ? "border-blue-500 text-blue-600" : "border-gray-200 text-gray-400"}`}>
                <Grid2X2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setGridCols(3)}
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${gridCols === 3 ? "border-blue-500 text-blue-600" : "border-gray-200 text-gray-400"}`}>
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <p className="text-sm font-semibold text-gray-700 mb-3">
            Product <span className="text-blue-600">3,538</span>
          </p>

          {/* Product grid */}
          <div className={`grid ${gridCols === 2 ? "grid-cols-2 gap-3" : "grid-cols-3 gap-2"}`}>
            {filteredProducts.map((product, idx) => (
              gridCols === 2 ? (
                /* ── 2-COL CARD — equal height via flex + fixed text block ── */
                <div key={product.name} className="rounded-xl border border-gray-200 overflow-hidden bg-white flex flex-col">
                  {/* Image — fixed aspect ratio */}
                  <div className="relative aspect-[3/4] bg-gray-100 shrink-0">
                    <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                    <button onClick={() => toggleBookmark(idx)}
                      className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow">
                      {bookmarkedProducts.has(idx)
                        ? <BookmarkCheck className="h-3.5 w-3.5 text-blue-600 fill-blue-100" />
                        : <Bookmark className="h-3.5 w-3.5 text-gray-500" />}
                    </button>
                    <div className="absolute bottom-2 left-2 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 py-0.5">
                      <Star className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />
                      <span className="text-[9px] font-bold text-gray-800">{product.rating}</span>
                      <span className="text-[9px] text-gray-400">| {product.reviews}</span>
                    </div>
                  </div>
                  {/* Text block — fixed height so all cards are same size */}
                  <div className="p-2 flex flex-col flex-1">
                    {/* Reserve space for badge whether present or not */}
                    <div className="h-5 mb-0.5">
                      {product.latest && (
                        <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-600">
                          Latest Products
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-[#ef4d62] leading-tight">
                      {product.price} | MOQ: {product.moq} | {product.sold} sold
                    </p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      Product name | <span className="font-bold">Manufacturer</span>
                    </p>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <MapPin className="h-2.5 w-2.5 text-gray-500 shrink-0" />
                      <span className="text-[10px] font-bold text-gray-700">{product.location}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">Fabric: {product.fabric} | GSM: {product.gsm}</p>
                    <p className="text-[10px] text-gray-500">Fit Type: {product.fit}</p>
                    {/* Call Now always at bottom */}
                    <button className="mt-auto pt-2 w-full flex items-center justify-center gap-1.5 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-xs font-bold py-2 rounded-lg transition-colors">
                      <Phone className="h-3 w-3" /> Call Now
                    </button>
                  </div>
                </div>
              ) : (
                /* ── 3-COL CARD — compact, image fills card, all info overlaid ── */
                <div key={product.name} className="rounded-xl overflow-hidden bg-gray-100 relative">
                  {/* Image */}
                  <div className="relative aspect-[3/4]">
                    <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                    {/* Bookmark — small, top right */}
                    <button onClick={() => toggleBookmark(idx)}
                      className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm">
                      {bookmarkedProducts.has(idx)
                        ? <BookmarkCheck className="h-3 w-3 text-blue-600 fill-blue-100" />
                        : <Bookmark className="h-3 w-3 text-gray-500" />}
                    </button>
                    {/* Rating badge — bottom left on image */}
                    <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 bg-white/90 rounded-full px-1 py-0.5">
                      <Star className="h-2 w-2 text-yellow-400 fill-yellow-400" />
                      <span className="text-[8px] font-bold text-gray-800">{product.rating}</span>
                      <span className="text-[8px] text-gray-400">| {product.reviews}</span>
                    </div>
                  </div>
                  {/* Minimal text below image */}
                  <div className="bg-white px-1.5 py-1.5">
                    <p className="text-[9px] font-bold text-[#ef4d62] leading-tight truncate">
                      {product.price} | MOQ: {product.moq} | {product.sold} sold
                    </p>
                    <p className="text-[8px] text-gray-500 truncate mt-0.5">
                      Product name | <span className="font-bold text-gray-700">Manufacturer</span>
                    </p>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <MapPin className="h-2 w-2 text-gray-500 shrink-0" />
                      <span className="text-[8px] font-bold text-gray-700 truncate">{product.location}</span>
                    </div>
                    <p className="text-[8px] text-gray-400 truncate">Fabric: {product.fabric} | GSM: {product.gsm}</p>
                    <p className="text-[8px] text-gray-400 truncate">Fit Type: {product.fit}</p>
                    {/* Call Now — compact pill */}
                    <button className="mt-1.5 w-full flex items-center justify-center gap-1 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white font-bold py-1.5 rounded-lg transition-colors">
                      <Phone className="h-2.5 w-2.5" />
                      <span className="text-[9px]">Call Now</span>
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400">No products found</div>
          )}
          <div className="mt-5 text-center text-xs text-gray-400">Loading more products...</div>
        </section>

      </div>

      {/* ── Video Modal ── */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white">
            <button onClick={() => setActiveVideo(null)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80">
              <X className="h-4 w-4 text-gray-800" />
            </button>
            <div className="relative h-72">
              <img src={selectedVideo.thumbnail} alt={selectedVideo.name} className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90">
                  <Play className="h-6 w-6 text-blue-600 fill-blue-600" />
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <p className="text-sm font-bold text-white">{selectedVideo.name}</p>
                <p className="text-xs text-white/80">{selectedVideo.price} • {selectedVideo.category} • {selectedVideo.sub}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <AddBusinessCategoriesModal
        isOpen={showCategoriesModal}
        onClose={() => setShowCategoriesModal(false)}
        categories={businessCategories}
        onCategoriesChange={setBusinessCategories}
      />

      <NumberOfEmployeesModal
        isOpen={showEmployeesModal}
        onClose={() => setShowEmployeesModal(false)}
        selected={employeeCount}
        onSelect={setEmployeeCount}
      />
    </DashboardLayout>
  );
};

export default BusinessProfile;