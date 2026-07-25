import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMyVendorProfile, saveVendorProfile, uploadVendorGalleryImage } from "@/lib/queries/vendorStore";
import { useVendorReviews } from "@/lib/queries/reviews";

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

// Office photos now come from vendor_profiles.office_photos as plain URLs.
// The old hardcoded array carried per-photo labels ("Factory Floor", ...);
// those were decorative fiction with no way for a vendor to set them, so the
// real feature stores URLs only.

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
  // This component stays mounted while closed, so `local` would otherwise keep
  // whatever it was seeded with on first render. That used to be harmless
  // against a hardcoded array; now that `categories` arrives asynchronously
  // from the profile row, a stale seed would let "Proceed" save an empty list
  // over the vendor's real categories. Re-seed each time the sheet opens.
  useEffect(() => { if (isOpen) setLocal(categories); }, [isOpen, categories]);
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

// Shared chrome for the edit sheets below: bottom sheet on mobile, centered
// card on desktop, back-arrow header. Lifted out of AddBusinessCategoriesModal
// so the new sheets can't drift from the existing one.
function EditSheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={onClose}><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="px-5 py-4 border-t border-gray-100">{footer}</div>
      </div>
    </div>
  );
}

const fieldClass =
  "w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600";

function LabelledInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-700">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={fieldClass} />
    </label>
  );
}

function EditAboutModal({ isOpen, onClose, initial, onSave }: { isOpen: boolean; onClose: () => void; initial: string; onSave: (about: string) => Promise<void> }) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  // Re-seed whenever the sheet is reopened, so a cancelled edit doesn't persist
  // in local state and reappear next time.
  useEffect(() => { if (isOpen) setText(initial); }, [isOpen, initial]);
  if (!isOpen) return null;
  const submit = async () => {
    setSaving(true);
    try { await onSave(text.trim()); onClose(); } finally { setSaving(false); }
  };
  return (
    <EditSheet
      title="About Us"
      onClose={onClose}
      footer={
        <button onClick={submit} disabled={saving} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? "Saving..." : "Save"}
        </button>
      }
    >
      <p className="text-sm text-gray-600 mb-3">Tell buyers what your business does, what you manufacture, and who you supply.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        autoFocus
        placeholder="e.g. Surat-based manufacturer focused on high-volume knitwear and denim essentials for private labels across India and the GCC."
        className={`${fieldClass} resize-none leading-relaxed`}
      />
    </EditSheet>
  );
}

type ContactForm = {
  ownerName: string; phone: string; ownerEmail: string; website: string;
  addressLine: string; area: string; city: string; state: string; postalCode: string;
};

function EditContactModal({ isOpen, onClose, initial, onSave }: { isOpen: boolean; onClose: () => void; initial: ContactForm; onSave: (v: ContactForm) => Promise<void> }) {
  const [form, setForm] = useState<ContactForm>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (isOpen) setForm(initial); }, [isOpen, initial]);
  if (!isOpen) return null;
  const set = (k: keyof ContactForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  };
  return (
    <EditSheet
      title="Contact Details"
      onClose={onClose}
      footer={
        <button onClick={submit} disabled={saving} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? "Saving..." : "Save"}
        </button>
      }
    >
      <div className="space-y-3">
        <LabelledInput label="Owner name" value={form.ownerName} onChange={set("ownerName")} placeholder="Mr. R. Sharma" />
        <LabelledInput label="Phone number" value={form.phone} onChange={set("phone")} placeholder="+91 90110 60851" type="tel" />
        <LabelledInput label="Email address" value={form.ownerEmail} onChange={set("ownerEmail")} placeholder="you@business.in" type="email" />
        <LabelledInput label="Website" value={form.website} onChange={set("website")} placeholder="https://yourbusiness.in" type="url" />
        <div className="pt-1">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Address</p>
          <div className="space-y-3">
            <LabelledInput label="Address line" value={form.addressLine} onChange={set("addressLine")} placeholder="2nd Floor, Umiya Nagar" />
            <LabelledInput label="Area" value={form.area} onChange={set("area")} placeholder="Ring Road" />
            <div className="grid grid-cols-2 gap-3">
              <LabelledInput label="City" value={form.city} onChange={set("city")} placeholder="Surat" />
              <LabelledInput label="State" value={form.state} onChange={set("state")} placeholder="Gujarat" />
            </div>
            <LabelledInput label="Postal code" value={form.postalCode} onChange={set("postalCode")} placeholder="395002" />
          </div>
        </div>
      </div>
    </EditSheet>
  );
}

// Oldest selectable founding year. Anything earlier is vanishingly rare in this
// market and a long <select> is worse than an edge case we can handle by hand.
const EARLIEST_ESTABLISHED_YEAR = 1950;

function YearEstablishedModal({ isOpen, onClose, selected, onSave }: { isOpen: boolean; onClose: () => void; selected: number | null; onSave: (year: number) => Promise<void> }) {
  const [year, setYear] = useState(selected ? String(selected) : "");
  const [saving, setSaving] = useState(false);
  // Built per render rather than at module scope so the list stays correct if
  // the tab is left open across New Year.
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: now - EARLIEST_ESTABLISHED_YEAR + 1 }, (_, i) => now - i);
  }, []);
  useEffect(() => { if (isOpen) setYear(selected ? String(selected) : ""); }, [isOpen, selected]);
  if (!isOpen) return null;
  const submit = async () => {
    if (!year) return;
    setSaving(true);
    try { await onSave(Number(year)); onClose(); } finally { setSaving(false); }
  };
  return (
    <EditSheet
      title="Year of Establishment"
      onClose={onClose}
      footer={
        <button onClick={submit} disabled={saving || !year} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? "Saving..." : "Save"}
        </button>
      }
    >
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
        <AlertTriangle className="w-4 h-4 text-blue-500 shrink-0" />
        <p className="text-xs text-blue-700">Buyers use this to judge how established your business is.</p>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gray-700">Year your business was established</span>
        <select value={year} onChange={(e) => setYear(e.target.value)} className={fieldClass} autoFocus>
          <option value="" disabled>Select a year</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
    </EditSheet>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const BusinessProfile = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { data: store } = useMyVendorProfile(user?.id);
  const { data: reviewData } = useVendorReviews(user?.id);
  const brand = store?.brandName?.trim() || "CARAMEL";
  // Real ratings for this vendor (falls back to the store aggregate / demo bars).
  const hasRealReviews = (reviewData?.count ?? 0) > 0;
  const reviewAvg = hasRealReviews ? reviewData!.avg : Number(store?.ratingAvg ?? 0) || 4.5;
  const reviewCount = hasRealReviews ? reviewData!.count : store?.reviewsCount ?? 0;
  const reviewBars = hasRealReviews
    ? reviewData!.breakdown.map((b) => ({ stars: b.stars, percent: b.percent, color: "#14ae5c" }))
    : ratingBreakdown;
  const storeLocation = [store?.city, store?.state].filter(Boolean).join(", ") || "Surat, Gujarat";
  const storeCountry = store?.country || "India";
  const vendorTypeLabel = store?.businessType?.trim() || "Manufacturer | Exporter";
  const [detailsOpen, setDetailsOpen]       = useState(true);
  const [editMode, setEditMode]             = useState(false);
  const [gridCols, setGridCols]             = useState<2 | 3>(2);
  const [activeVideo, setActiveVideo]       = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth]   = useState("");
  const [selectedYear, setSelectedYear]     = useState("");
  const [selectedCapacity, setSelectedCapacity] = useState<string[]>(["Medium"]);
  const [businessCategories, setBusinessCategories] = useState<string[]>([]);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showEmployeesModal, setShowEmployeesModal]   = useState(false);
  const [showAboutModal, setShowAboutModal]           = useState(false);
  const [showContactModal, setShowContactModal]       = useState(false);
  const [showYearModal, setShowYearModal]             = useState(false);
  const [highlight, setHighlight]                     = useState<string | null>(null);
  const [employeeCount, setEmployeeCount]   = useState("");
  const [productSearch, setProductSearch]   = useState("");
  const [genderFilter, setGenderFilter]     = useState("");
  const [bookmarkedProducts, setBookmarkedProducts] = useState<Set<number>>(new Set());
  const [bookmarkedPage, setBookmarkedPage] = useState(false);
  const [recommendItems, setRecommendItems] = useState(recommendationProducts);
  const [dragIndex, setDragIndex]           = useState<number | null>(null);

  const selectedVideo = activeVideo === null ? null : videoProducts[activeVideo];

  // ── Persistence ───────────────────────────────────────────────
  // Every editable field on this page funnels through here so the two cache
  // keys stay in lockstep: "vendor_profile" backs what this page renders,
  // "vendor_dashboard" backs the profile score, which most of these fields feed.
  const qc = useQueryClient();
  const persist = async (patch: Parameters<typeof saveVendorProfile>[1], successMsg: string): Promise<boolean> => {
    if (!user) { toast.error("Sign in to edit your business profile"); return false; }
    try {
      await saveVendorProfile(user.id, patch);
      qc.invalidateQueries({ queryKey: ["vendor_profile", "mine", user.id] });
      qc.invalidateQueries({ queryKey: ["vendor_dashboard", user.id] });
      toast.success(successMsg);
      return true;
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : String(e) });
      return false;
    }
  };

  // Address is stored as five columns but read as one line.
  const fullAddress = [store?.addressLine, store?.area, store?.city, store?.state, store?.postalCode]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

  // Categories and employee count are edited through modals that own their own
  // local state, so this page mirrors the profile row rather than reading it
  // directly. Hydrate once, the first time the profile lands: re-syncing on
  // every `store` change would stomp an optimistic edit with the stale
  // pre-invalidation cache value.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!store || hydratedRef.current) return;
    hydratedRef.current = true;
    setBusinessCategories(store.category ?? []);
    setEmployeeCount(store.employeeCount ?? "");
  }, [store]);

  // Both write straight through: the copy in AddBusinessCategoriesModal warns
  // about 24-48h moderation, but no moderation queue exists for category edits
  // anywhere in this codebase, so pretending to stage the value would be worse
  // than saving it. Optimistic with rollback, matching VendorSettings.
  const handleCategoriesChange = async (cats: string[]) => {
    const previous = businessCategories;
    setBusinessCategories(cats);
    if (!(await persist({ category: cats }, "Business categories updated"))) setBusinessCategories(previous);
  };

  const handleEmployeeSelect = async (value: string) => {
    const previous = employeeCount;
    setEmployeeCount(value);
    if (!(await persist({ employeeCount: value }, "Employee count updated"))) setEmployeeCount(previous);
  };

  // ── Office photos ─────────────────────────────────────────────
  // Read straight from the profile row (no local mirror): uploads finish by
  // invalidating the query, so the refetch is the single source of truth.
  const officePhotos = store?.officePhotos ?? [];
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(0);
  // The strip's dot indicator tracks real scroll position rather than being a
  // fixed row of four dots that always highlighted the first one.
  const [photoPage, setPhotoPage] = useState(0);

  const handlePhotoFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // let the same file be picked again after a failure
    if (files.length === 0) return;
    if (!user) { toast.error("Sign in to add office photos"); return; }
    setUploadingPhotos(files.length);
    try {
      const urls = await Promise.all(files.map((f) => uploadVendorGalleryImage(user.id, f)));
      await persist(
        { officePhotos: [...officePhotos, ...urls] },
        urls.length === 1 ? "Photo added" : `${urls.length} photos added`
      );
    } catch (err) {
      toast.error("Couldn't upload photos", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploadingPhotos(0);
    }
  };

  // ── ?focus= deep links ────────────────────────────────────────
  // The Business Profile Score checklist links straight at the control that
  // fills each item in. Section targets scroll and flash; modal targets open
  // the sheet directly.
  const MODAL_TARGETS: Record<string, () => void> = {
    "business-category": () => setShowCategoriesModal(true),
    employees: () => setShowEmployeesModal(true),
    "year-established": () => setShowYearModal(true),
  };
  const SECTION_TARGETS = ["about-us", "contact-details", "office-pictures", "detailed-information"];

  const focusHandledRef = useRef(false);
  useEffect(() => {
    const target = searchParams.get("focus");
    if (!target || focusHandledRef.current) return;
    focusHandledRef.current = true;

    if (MODAL_TARGETS[target]) {
      MODAL_TARGETS[target]();
      return;
    }
    if (!SECTION_TARGETS.includes(target)) return;

    // "Total Employees" / "Year of Establishment" / "Business Category" live
    // inside the collapsible, so make sure it is open before scrolling.
    if (target === "detailed-information") setDetailsOpen(true);

    // Wait a frame so the section has laid out (and expanded) before measuring.
    const raf = requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlight(target);
    });
    return () => cancelAnimationFrame(raf);
  }, [searchParams]);

  // Drop the highlight ring after it has been seen.
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 2400);
    return () => clearTimeout(t);
  }, [highlight]);

  const contactInitial = useMemo(
    () => ({
      ownerName: store?.ownerName ?? "",
      phone: store?.phone ?? "",
      ownerEmail: store?.ownerEmail ?? "",
      website: store?.website ?? "",
      addressLine: store?.addressLine ?? "",
      area: store?.area ?? "",
      city: store?.city ?? "",
      state: store?.state ?? "",
      postalCode: store?.postalCode ?? "",
    }),
    [store]
  );

  const toggleCapacity = (key: string) =>
    setSelectedCapacity(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const toggleBookmark = (index: number) =>
    setBookmarkedProducts(prev => { const n = new Set(prev); n.has(index) ? n.delete(index) : n.add(index); return n; });

  const filteredProducts = useMemo(() =>
    allProducts.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())),
  [productSearch]);

  const detailRows = useMemo(() => [
    { label: "Business Type",          value: vendorTypeLabel },
    // Same field as the Contact Details "owner name" row, so it has to show the
    // same empty state rather than a fabricated fallback name.
    { label: "Company MD",             value: store?.ownerName?.trim() || "Add owner name", clickable: true, onClick: () => setShowContactModal(true) },
    { label: "Total Employees",        value: employeeCount || "Add employee count", clickable: true, onClick: () => setShowEmployeesModal(true) },
    { label: "Year of Establishment",  value: store?.yearEstablished ? String(store.yearEstablished) : "Add year", clickable: true, onClick: () => setShowYearModal(true) },
    { label: "Cosora Member Since",    value: "1 Year" },
    { label: "Annual Turnover",        value: "Rs 2 - 5 Cr" },
    { label: "PAN",                    value: store?.pan || "ABCPR1234D" },
  ], [employeeCount, vendorTypeLabel, store?.ownerName, store?.pan, store?.yearEstablished]);

  const reduced = useReducedMotion();

  return (
    <DashboardLayout>
      <motion.div
        className="space-y-3 pb-24 max-w-2xl mx-auto lg:max-w-3xl"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >

        {/* ══════════════════════════════════════════════════════
            HERO BANNER — full background image, all info on top
        ══════════════════════════════════════════════════════ */}
        <motion.section variants={section} className="rounded-2xl overflow-hidden relative">
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
              <span className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-[0.3em] text-white/20 uppercase truncate max-w-full px-4">
                {brand}
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
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide leading-tight uppercase">
                {brand}
              </h1>

              {/* City, Country */}
              <div className="flex items-center gap-1 mt-0.5 mb-2">
                <MapPin className="h-3 w-3 text-white/80 shrink-0" />
                <span className="text-xs text-white/80">{storeLocation} · {storeCountry}</span>
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
              <p className="text-xs text-white/80 font-medium">{vendorTypeLabel}</p>
            </div>
          </div>

          {/* Office photo strip — white card below banner */}
          <div className="bg-white px-4 py-3">
            <div
              className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide"
              onScroll={(e) => {
                const el = e.currentTarget;
                // 82px = 80px tile + 2.5 gap; keeps the dot in step with the tile scrolled to.
                setPhotoPage(Math.round(el.scrollLeft / 82));
              }}
            >
              {/* Add photo button */}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhotos > 0}
                className="flex-shrink-0 flex flex-col items-center disabled:opacity-60"
              >
                <div className="h-20 w-20 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50">
                  <Plus className="h-6 w-6 text-blue-500" />
                </div>
                <p className="mt-1 text-[10px] text-gray-400">Add Photo</p>
              </button>

              {/* Placeholder tiles while the picked files upload */}
              {Array.from({ length: uploadingPhotos }).map((_, i) => (
                <div key={`up-${i}`} className="flex-shrink-0 text-center">
                  <div className="h-20 w-20 animate-pulse rounded-xl bg-gray-200" />
                  <p className="mt-1 text-[10px] text-gray-400">Uploading</p>
                </div>
              ))}

              {officePhotos.map((url, i) => (
                <div key={url} className="flex-shrink-0 text-center">
                  <div className="h-20 w-20 overflow-hidden rounded-xl border border-gray-100 bg-gray-100">
                    <img src={url} alt={`Office photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                </div>
              ))}
            </div>
            {/* Scroll dots — one per photo, hidden entirely when there's nothing to scroll */}
            {officePhotos.length > 1 && (
              <div className="flex items-center justify-center gap-1 mt-2">
                {officePhotos.map((url, i) => (
                  <span key={url} className={`h-1.5 rounded-full transition-all ${i === photoPage ? "w-4 bg-blue-500" : "w-1.5 bg-gray-300"}`} />
                ))}
              </div>
            )}
          </div>
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            ABOUT US
        ══════════════════════════════════════════════════════ */}
        <motion.section id="about-us" variants={section} className={`rounded-2xl border bg-white p-4 transition-colors duration-500 ${highlight === "about-us" ? "border-blue-400 ring-2 ring-blue-200" : "border-gray-200"}`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-900">About Us</h2>
            <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setShowAboutModal(true)} className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 px-3 py-1.5 rounded-full hover:bg-blue-700 transition-colors">
              Edit profile <Pencil className="h-3 w-3" />
            </motion.button>
          </div>
          {store?.about?.trim() ? (
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{store.about}</p>
          ) : (
            <button onClick={() => setShowAboutModal(true)} className="text-left text-sm text-gray-400 leading-relaxed hover:text-gray-600">
              Tell buyers what your business does
            </button>
          )}
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            CONTACT DETAILS
        ══════════════════════════════════════════════════════ */}
        <motion.section id="contact-details" variants={section} className={`rounded-2xl border bg-white p-4 transition-colors duration-500 ${highlight === "contact-details" ? "border-blue-400 ring-2 ring-blue-200" : "border-gray-200"}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Contact Details</h2>
            <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setShowContactModal(true)} className="flex items-center gap-1 text-xs font-semibold text-blue-600">
              Edit profile <Pencil className="h-3 w-3" />
            </motion.button>
          </div>
          <div className="space-y-0 divide-y divide-gray-100">
            {[
              { Icon: Users, value: store?.ownerName?.trim(), empty: "Add owner name" },
              { Icon: MapPin, value: fullAddress, empty: "Add address" },
              { Icon: Phone, value: store?.phone?.trim(), empty: "Add phone number" },
            ].map(({ Icon, value, empty }, i) => (
              <div key={i} className={`flex items-start gap-3 ${i === 0 ? "pb-3" : "py-3"}`}>
                <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                {value ? (
                  <span className="text-sm text-gray-700">{value}</span>
                ) : (
                  <button onClick={() => setShowContactModal(true)} className="text-left text-sm text-gray-400 hover:text-gray-600">{empty}</button>
                )}
              </div>
            ))}

            {/* Email */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                {store?.ownerEmail?.trim() ? (
                  <span className="text-sm text-gray-700 break-all">{store.ownerEmail}</span>
                ) : (
                  <button onClick={() => setShowContactModal(true)} className="text-sm text-gray-400 hover:text-gray-600">Add email ID</button>
                )}
              </div>
              {!store?.ownerEmail?.trim() && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-500">
                  <AlertTriangle className="h-3 w-3" /> Missing Info
                </span>
              )}
            </div>

            {/* Website */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-gray-400 shrink-0" />
                {store?.website?.trim() ? (
                  <span className="text-sm text-gray-700 break-all">{store.website}</span>
                ) : (
                  <button onClick={() => setShowContactModal(true)} className="text-sm text-gray-400 hover:text-gray-600">Add Website</button>
                )}
              </div>
              {!store?.website?.trim() && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-500">
                  <AlertTriangle className="h-3 w-3" /> Missing Info
                </span>
              )}
            </div>

            {/* Social Media */}
            <div className="flex items-center justify-between pt-3">
              <span className="text-sm font-semibold text-gray-800">Social Media</span>
              <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/add-social-links")} className="text-xs font-semibold text-blue-600 underline">
                Add your social links
              </motion.button>
            </div>
          </div>
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            REVIEWS AND RATINGS
        ══════════════════════════════════════════════════════ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-bold text-gray-900 mb-4">Reviews and Ratings</h2>

          {/* Score row */}
          <div className="flex items-center gap-4 mb-5">
            <div className="text-center">
              <span className="text-4xl font-extrabold text-gray-900">{reviewAvg.toFixed(1)}</span>
              <span className="text-base text-gray-400">/5</span>
            </div>
            <div>
              <div className="flex items-center gap-0.5 mb-0.5">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} className={`h-5 w-5 ${i <= Math.round(reviewAvg) ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200"}`} />
                ))}
              </div>
              <p className="text-xs text-gray-400">Reviewed by {reviewCount.toLocaleString("en-IN")} {reviewCount === 1 ? "User" : "Users"}</p>
            </div>
          </div>

          {/* Bars */}
          <motion.div variants={listContainer} className="space-y-2.5">
            {reviewBars.map(row => (
              <motion.div variants={listItem} key={row.stars} className="flex items-center gap-3">
                <span className="w-10 text-xs text-gray-500 shrink-0 text-right">{row.stars} Star</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${row.percent}%`, backgroundColor: row.color }} />
                </div>
                <span className="w-8 text-right text-xs text-gray-500 shrink-0">{row.percent}%</span>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            DETAILED INFORMATION (collapsible)
        ══════════════════════════════════════════════════════ */}
        <motion.section id="detailed-information" variants={section} className={`rounded-2xl border bg-white overflow-hidden transition-colors duration-500 ${highlight === "detailed-information" ? "border-blue-400 ring-2 ring-blue-200" : "border-gray-200"}`}>
          <motion.button whileTap={TAP} transition={TAP_T}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left"
            onClick={() => setDetailsOpen(p => !p)}
          >
            <h2 className="text-sm font-bold text-gray-900">Detailed information</h2>
            <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`} />
          </motion.button>

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
                  {businessCategories.length === 0 ? (
                    <button onClick={() => setShowCategoriesModal(true)} className="text-xs text-gray-400 hover:text-gray-600">
                      Add the categories buyers should find you under
                    </button>
                  ) : (
                    businessCategories.map(cat => (
                      <span key={cat} className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-600">{cat}</span>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            OFFICE PICTURES (grid)
        ══════════════════════════════════════════════════════ */}
        <motion.section id="office-pictures" variants={section} className={`rounded-2xl border bg-white p-4 transition-colors duration-500 ${highlight === "office-pictures" ? "border-blue-400 ring-2 ring-blue-200" : "border-gray-200"}`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Office Pictures</h2>
            {/* The profile score rewards 5 or more, so show progress toward that. */}
            {officePhotos.length > 0 && officePhotos.length < 5 && (
              <span className="text-[10px] font-medium text-gray-400">{officePhotos.length} of 5 added</span>
            )}
          </div>
          <motion.div variants={listContainer} className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhotos > 0}
              className="aspect-square rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50 disabled:opacity-60"
            >
              <Plus className="h-7 w-7 text-blue-500" />
            </button>
            {Array.from({ length: uploadingPhotos }).map((_, i) => (
              <div key={`gup-${i}`} className="aspect-square animate-pulse rounded-xl bg-gray-200" />
            ))}
            {officePhotos.slice(0, 5).map((url, i) => (
              <motion.div variants={listItem} key={url} className="aspect-square overflow-hidden rounded-xl">
                <img src={url} alt={`Office photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
              </motion.div>
            ))}
          </motion.div>
          {officePhotos.length === 0 && uploadingPhotos === 0 && (
            <p className="mt-3 text-xs text-gray-400">
              Add photos of your factory, sampling unit and packing area so buyers can see how you operate.
            </p>
          )}
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            BRAND'S CATEGORIES (horizontal scroll)
        ══════════════════════════════════════════════════════ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
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
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            BRAND'S RECOMMENDATIONS (draggable grid)
        ══════════════════════════════════════════════════════ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Brand's Recommendations</h2>
            <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setEditMode(p => !p)}
              className="rounded-full border border-blue-500 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50">
              {editMode ? "Done" : "Edit"}
            </motion.button>
          </div>
          {editMode && <p className="text-xs text-gray-400 mb-3">Drag to rearrange your products</p>}
          <motion.div variants={listContainer} className="grid grid-cols-3 gap-2">
            {recommendItems.map((product, idx) => (
              <motion.div variants={listItem}
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
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            BRAND PRODUCT VIDEOS
        ══════════════════════════════════════════════════════ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Brand Product Videos</h2>
          <motion.div variants={listContainer} className="grid grid-cols-3 gap-2">
            <div className="aspect-[3/4] rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50">
              <Plus className="h-7 w-7 text-blue-500" />
            </div>
            {videoProducts.slice(0, 5).map((video, index) => (
              <motion.button variants={listItem} whileTap={TAP} transition={TAP_T} key={video.name} onClick={() => setActiveVideo(index)}
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
              </motion.button>
            ))}
          </motion.div>
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            ALL PRODUCTS
        ══════════════════════════════════════════════════════ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Caramel Fashion</h2>
            <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setBookmarkedPage(p => !p)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200">
              {bookmarkedPage
                ? <BookmarkCheck className="h-4 w-4 text-blue-600 fill-blue-100" />
                : <Bookmark className="h-4 w-4 text-gray-500" />}
            </motion.button>
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
        </motion.section>

      </motion.div>

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
        onCategoriesChange={handleCategoriesChange}
      />

      <NumberOfEmployeesModal
        isOpen={showEmployeesModal}
        onClose={() => setShowEmployeesModal(false)}
        selected={employeeCount}
        onSelect={handleEmployeeSelect}
      />

      <EditAboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        initial={store?.about ?? ""}
        onSave={async (about) => { await persist({ about }, "About Us updated"); }}
      />

      <EditContactModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
        initial={contactInitial}
        onSave={async (v) => { await persist(v, "Contact details updated"); }}
      />

      {/* One hidden picker shared by both "+" tiles (strip and grid). */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoFiles}
      />

      <YearEstablishedModal
        isOpen={showYearModal}
        onClose={() => setShowYearModal(false)}
        selected={store?.yearEstablished ?? null}
        onSave={async (year) => { await persist({ yearEstablished: year }, "Year of establishment updated"); }}
      />
    </DashboardLayout>
  );
};

export default BusinessProfile;