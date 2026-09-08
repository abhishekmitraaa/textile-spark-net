import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { differenceInCalendarMonths, formatDistanceToNowStrict } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMyVendorProfile, saveVendorProfile, uploadVendorGalleryImage, uploadVendorImage,
} from "@/lib/queries/vendorStore";
import { useVendorReviews } from "@/lib/queries/reviews";
import { useVendorDashboard } from "@/lib/queries/vendorDashboard";
import { useMyCatalogues } from "@/lib/queries/catalogues";
import { useMyVideos, onThumbError } from "@/lib/queries/videos";
import { useMyProducts, type VendorProductRow } from "@/lib/queries/products";
import { trustSealFromParts } from "@/lib/plan";
import { AddBusinessCategoriesModal } from "@/components/vendor/AddBusinessCategoriesModal";

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
  AlertTriangle, ChevronDown, Download, FileText, GripVertical, MapPin,
  MessageCircle, Package, Pencil, Phone, Play, Plus, Search, Star, Tag, Users,
  Mail, Globe, ArrowUpDown, Grid2X2, Grid3X3, X, Upload, ArrowLeft, Check,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

// Office photos come from vendor_profiles.office_photos as plain URLs.
// The old hardcoded array carried per-photo labels ("Factory Floor", ...);
// those were decorative fiction with no way for a vendor to set them, so the
// real feature stores URLs only.
//
// Removed from this block, all of it demo data that rendered identically for
// every vendor on the platform:
//
//   DEMO_BANNER            a static banner image, rendered instead of
//                          vendor_profiles.banner_url — which the BUYER-facing
//                          /vendor/:id page has always read, so buyers could
//                          see a banner the vendor had no way to upload.
//   brandCategories        six imported KOREAN FASHION BRAND LOGOS (chuu,
//                          cherrykoko, brandi, stylenanda, styleonme, hotping)
//                          presented as this vendor's own categories. That is
//                          third-party brand IP on a vendor's storefront.
//   recommendationProducts four invented products behind a drag-to-reorder
//                          grid that persisted nothing.
//   videoProducts          five invented videos with fake durations.
//   allProducts            six invented listings, under a "Caramel Fashion"
//                          heading and a "3,538" product count.
//   ratingBreakdown        an 80/5/0/0/15 star split shown to any vendor with
//                          no reviews.
//   months / years         selects wired to useState and nothing else.
//   CATEGORY_GROUPS        moved to src/data/businessCategoryGroups.ts so
//                          /onboarding writes the same list.

const employeeOptions = [
  "Less than 10", "10 - 100", "100 - 500",
  "500 - 1,000", "1,000 - 2,000", "2,000 - 5,000",
  "5,000 - 10,000", "More than 10,000",
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

// SelectCategoryModal and AddBusinessCategoriesModal used to live here.
// They now live in src/components/vendor/AddBusinessCategoriesModal.tsx so
// /onboarding uses the SAME picker rather than a copy: both write
// vendor_profiles.category, and two copies would drift.

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
  ownerName: string; phone: string; whatsapp: string; ownerEmail: string; website: string;
  addressLine: string; area: string; landmark: string; city: string; state: string; postalCode: string;
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
        <LabelledInput label="WhatsApp number" value={form.whatsapp} onChange={set("whatsapp")} placeholder="+91 90110 60851" type="tel" />
        <LabelledInput label="Email address" value={form.ownerEmail} onChange={set("ownerEmail")} placeholder="you@business.in" type="email" />
        <LabelledInput label="Website" value={form.website} onChange={set("website")} placeholder="https://yourbusiness.in" type="url" />
        <div className="pt-1">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Address</p>
          <div className="space-y-3">
            <LabelledInput label="Address line" value={form.addressLine} onChange={set("addressLine")} placeholder="2nd Floor, Umiya Nagar" />
            <LabelledInput label="Area" value={form.area} onChange={set("area")} placeholder="Ring Road" />
            <LabelledInput label="Landmark" value={form.landmark} onChange={set("landmark")} placeholder="Opposite Udhna Depot" />
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
  const { data: dashboard } = useVendorDashboard(user?.id);
  const { data: catalogues, isLoading: cataloguesLoading } = useMyCatalogues(user?.id);
  const { data: videos = [], isLoading: videosLoading } = useMyVideos(user?.id);
  const { data: myProducts = [], isLoading: productsLoading } = useMyProducts(user?.id);

  // Brand name with no invented fallback. "CARAMEL" used to stand in, which put
  // another company's name on an un-named vendor's storefront.
  const brand = store?.brandName?.trim() || "";
  const brandDisplay = brand || "Your brand";

  // Real ratings for this vendor. No demo bars: an empty breakdown renders an
  // empty state, not an 80/5/0/0/15 split (see the Reviews section below).
  const hasRealReviews = (reviewData?.count ?? 0) > 0;
  const reviewAvg = hasRealReviews ? reviewData!.avg : 0;
  const reviewCount = hasRealReviews ? reviewData!.count : 0;
  const reviewBars = hasRealReviews
    ? reviewData!.breakdown.map((b) => ({ stars: b.stars, percent: b.percent, color: "#14ae5c" }))
    : [];

  const storeLocation = [store?.city, store?.state].filter(Boolean).join(", ");
  const storeCountry = store?.country || "India";
  const vendorTypeLabel = store?.businessType?.trim() || "";

  // The seal buyers actually see, computed by the same helper /vendor/:id and
  // every product card use — admin verification, an active paid plan, or an
  // ad-bought verification window.
  const isTrusted = trustSealFromParts(store?.isVerified, store?.planExpiresAt, store?.adVerifiedUntil);

  const productsTotal = dashboard?.productsTotal ?? 0;
  const liveProducts = useMemo(() => myProducts.filter((p) => p.status === "active"), [myProducts]);

  const [detailsOpen, setDetailsOpen]       = useState(true);
  const [editMode, setEditMode]             = useState(false);
  const [gridCols, setGridCols]             = useState<2 | 3>(2);
  const [activeVideo, setActiveVideo]       = useState<string | null>(null);
  const [businessCategories, setBusinessCategories] = useState<string[]>([]);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showEmployeesModal, setShowEmployeesModal]   = useState(false);
  const [showAboutModal, setShowAboutModal]           = useState(false);
  const [showContactModal, setShowContactModal]       = useState(false);
  const [showYearModal, setShowYearModal]             = useState(false);
  const [showRecommendPicker, setShowRecommendPicker] = useState(false);
  const [highlight, setHighlight]                     = useState<string | null>(null);
  const [employeeCount, setEmployeeCount]   = useState("");
  const [productSearch, setProductSearch]   = useState("");
  const [genderFilter, setGenderFilter]     = useState("");
  const [sortBy, setSortBy]                 = useState<"newest" | "price_asc" | "price_desc" | "name">("newest");
  const [uploadingBanner, setUploadingBanner]         = useState(false);
  const [recommendIds, setRecommendIds]     = useState<string[]>([]);
  const [dragIndex, setDragIndex]           = useState<number | null>(null);

  const selectedVideo = activeVideo === null ? null : videos.find((v) => v.id === activeVideo) ?? null;

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

  // Address is stored as six columns but read as one line. `landmark` used to
  // be left out of this join even though onboarding collects it and
  // saveVendorOnboarding writes it — so a vendor who typed "opposite the bus
  // depot" never saw it again anywhere in the app. It sits after the street
  // parts and before city, which is where a landmark reads naturally on an
  // Indian address.
  const fullAddress = [
    store?.addressLine, store?.area, store?.landmark,
    store?.city, store?.state, store?.postalCode,
  ]
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
    setRecommendIds(store.recommendedProductIds ?? []);
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
      whatsapp: store?.whatsapp ?? "",
      ownerEmail: store?.ownerEmail ?? "",
      website: store?.website ?? "",
      addressLine: store?.addressLine ?? "",
      area: store?.area ?? "",
      landmark: store?.landmark ?? "",
      city: store?.city ?? "",
      state: store?.state ?? "",
      postalCode: store?.postalCode ?? "",
    }),
    [store]
  );

  // ── Banner ────────────────────────────────────────────────────
  // vendor_profiles.banner_url has always existed, uploadVendorImage has always
  // handled it, and the BUYER-facing /vendor/:id page has always rendered it —
  // but this page painted a static DEMO_BANNER and offered no way to set one.
  // Buyers could therefore see a banner the vendor could never upload.
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const handleBannerFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!user) { toast.error("Sign in to change your banner"); return; }
    setUploadingBanner(true);
    try {
      const url = await uploadVendorImage(user.id, file, "banner");
      await persist({ bannerUrl: url }, "Banner updated");
    } catch (err) {
      toast.error("Couldn't upload the banner", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploadingBanner(false);
    }
  };

  // ── Brand's Recommendations ───────────────────────────────────
  // A curated SUBSET of live products in a vendor-chosen order, persisted to
  // vendor_profiles.recommended_product_ids. The drag-to-reorder grid was
  // already well built; it just wrote to component state and threw the order
  // away on unmount.
  //
  // Ids are resolved against the live catalogue on every render, so a product
  // that was deleted or taken off sale simply drops out of the strip instead of
  // rendering a dangling card.
  const recommendItems = useMemo(() => {
    const byId = new Map(liveProducts.map((p) => [p.id, p]));
    return recommendIds.map((id) => byId.get(id)).filter((p): p is VendorProductRow => Boolean(p));
  }, [recommendIds, liveProducts]);

  const saveRecommendations = async (ids: string[]) => {
    const previous = recommendIds;
    setRecommendIds(ids);
    if (!(await persist({ recommendedProductIds: ids }, "Featured products updated"))) setRecommendIds(previous);
  };

  const toggleRecommend = (id: string) => {
    const next = recommendIds.includes(id) ? recommendIds.filter((x) => x !== id) : [...recommendIds, id];
    void saveRecommendations(next);
  };

  // ── All Products ──────────────────────────────────────────────
  // Real rows for this vendor. SORT and FILTER are wired to this list — they
  // were bare <button>s with no handler, which is worse than no control.
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const rows = myProducts.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (genderFilter && (p.gender ?? "").toLowerCase() !== genderFilter.toLowerCase()) return false;
      return true;
    });
    const priceOf = (p: VendorProductRow) => Number(p.price) || 0;
    switch (sortBy) {
      case "price_asc":  return [...rows].sort((a, b) => priceOf(a) - priceOf(b));
      case "price_desc": return [...rows].sort((a, b) => priceOf(b) - priceOf(a));
      case "name":       return [...rows].sort((a, b) => a.name.localeCompare(b.name));
      default:           return rows; // already created_at desc from the query
    }
  }, [myProducts, productSearch, genderFilter, sortBy]);

  // "Cosora Member Since", derived from the real signup date rather than the
  // literal string "1 Year" every vendor used to see.
  const memberSince = useMemo(() => {
    if (!store?.createdAt) return null;
    const created = new Date(store.createdAt);
    if (Number.isNaN(created.getTime())) return null;
    // Under a month reads better as "New this month" than "0 months".
    if (differenceInCalendarMonths(new Date(), created) < 1) return "New this month";
    return formatDistanceToNowStrict(created, { unit: "month", roundingMethod: "floor" })
      .replace(/^(\d+) months?$/, (_m, n) => (Number(n) >= 12
        ? formatDistanceToNowStrict(created, { unit: "year", roundingMethod: "floor" })
        : `${n} month${Number(n) === 1 ? "" : "s"}`));
  }, [store?.createdAt]);

  const detailRows = useMemo(() => [
    { label: "Business Type",          value: vendorTypeLabel || "Not set" },
    // Same field as the Contact Details "owner name" row, so it has to show the
    // same empty state rather than a fabricated fallback name.
    { label: "Company MD",             value: store?.ownerName?.trim() || "Add owner name", clickable: true, onClick: () => setShowContactModal(true) },
    { label: "Total Employees",        value: employeeCount || "Add employee count", clickable: true, onClick: () => setShowEmployeesModal(true) },
    { label: "Year of Establishment",  value: store?.yearEstablished ? String(store.yearEstablished) : "Add year", clickable: true, onClick: () => setShowYearModal(true) },
    // Was the literal "1 Year" for a vendor who signed up yesterday.
    { label: "Cosora Member Since",    value: memberSince ?? "—" },
    // PAN used to fall back to "ABCPR1234D" — a plausible-looking fake PAN
    // presented to an unverified vendor as if it were their own.
    { label: "PAN",                    value: store?.pan?.trim() || "Add PAN", clickable: !store?.pan?.trim(), onClick: () => navigate("/kyc") },
    // GSTIN and CIN are collected at signup, have columns, are already read into
    // VendorStoreData — and were visible to the vendor NOWHERE in the app, while
    // GST is shown to buyers on /vendor/:id.
    { label: "GSTIN",                  value: store?.gstin?.trim() || "Not provided" },
    { label: "CIN",                    value: store?.cin?.trim() || "Not provided" },
    // "Annual Turnover" was the literal "Rs 2 - 5 Cr" here, with no column
    // behind it and nowhere to enter one. Removed rather than left fabricated;
    // whether to add an annual_turnover column with a range picker (same shape
    // as employeeOptions) or drop the field for good is a product decision,
    // flagged in the report rather than made here.
  ], [employeeCount, vendorTypeLabel, memberSince, navigate, store?.ownerName, store?.pan, store?.gstin, store?.cin, store?.yearEstablished]);

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
          {/* Background: the vendor's real banner, or a #256fef gradient with the
              brand watermarked over it. Never a stock photo. */}
          <div className="relative h-52 sm:h-60 lg:h-64">
            {store?.bannerUrl ? (
              <img
                src={store.bannerUrl}
                alt={brand ? `${brand} banner` : "Brand banner"}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#256fef] via-[#2f7bf5] to-[#1d5ed6]" />
            )}
            {/* Dark gradient overlay — stronger at bottom left where text sits */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/20" />

            {/* Large watermark brand name — centered, semi-transparent */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <span className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-[0.3em] text-white/20 uppercase truncate max-w-full px-4">
                {brandDisplay}
              </span>
            </div>

            {/* Trust seal — gated on the SAME rule the buyer side uses
                (trustSealFromParts: admin verification, an active paid plan, or
                an ad-bought verification window). It used to render
                unconditionally, so every vendor saw themselves as verified,
                including the ones buyers see no seal for at all. */}
            <div className="absolute top-3 right-3 z-10">
              {isTrusted ? (
                <span className="rounded-md bg-[#f59e0b] px-2.5 py-1 text-[10px] font-bold text-white tracking-wide italic">
                  TrustedSEAL
                </span>
              ) : (
                <button
                  onClick={() => navigate("/advertisements")}
                  className="rounded-md bg-white/20 px-2.5 py-1 text-[10px] font-bold text-white tracking-wide backdrop-blur hover:bg-white/30 transition-colors"
                >
                  Get verified
                </button>
              )}
            </div>

            {/* Banner edit — replaces a 3-dot menu that opened nothing. */}
            <button
              onClick={() => bannerInputRef.current?.click()}
              disabled={uploadingBanner}
              aria-label={store?.bannerUrl ? "Change banner" : "Add banner"}
              className="absolute right-3 top-12 z-10 flex h-7 items-center gap-1 rounded-full bg-white/20 px-2.5 text-white backdrop-blur hover:bg-white/30 transition-colors disabled:opacity-60"
            >
              <Pencil className="h-3 w-3" />
              <span className="text-[10px] font-semibold">{uploadingBanner ? "Uploading…" : "Banner"}</span>
            </button>

            {/* All text content — bottom left */}
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 z-10">
              {/* Brand name */}
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide leading-tight uppercase">
                {brandDisplay}
              </h1>

              {/* City, Country */}
              <div className="flex items-center gap-1 mt-0.5 mb-2">
                <MapPin className="h-3 w-3 text-white/80 shrink-0" />
                <span className="text-xs text-white/80">
                  {storeLocation ? `${storeLocation} · ${storeCountry}` : storeCountry}
                </span>
              </div>

              {/* Followers + All Items — real counts. Were "7,333" and "3,538". */}
              <div className="flex items-center gap-6 mb-1">
                <div>
                  <p className="text-[10px] text-white/70 uppercase tracking-wider leading-none">Followers</p>
                  <p className="text-lg font-bold text-white leading-tight">
                    {(store?.followers ?? 0).toLocaleString("en-IN")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-white/70 uppercase tracking-wider leading-none">All Items</p>
                  <p className="text-lg font-bold text-white leading-tight">
                    {productsTotal.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>

              {/* Vendor type */}
              {vendorTypeLabel && <p className="text-xs text-white/80 font-medium">{vendorTypeLabel}</p>}
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

            {/* WhatsApp — written at onboarding, read into VendorStoreData, and
                rendered by no vendor page until now. */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-4 w-4 text-gray-400 shrink-0" />
                {store?.whatsapp?.trim() ? (
                  <span className="text-sm text-gray-700">{store.whatsapp}</span>
                ) : (
                  <button onClick={() => setShowContactModal(true)} className="text-sm text-gray-400 hover:text-gray-600">
                    Add WhatsApp number
                  </button>
                )}
              </div>
              {store?.whatsapp?.trim() && (
                <span className="shrink-0 text-[10px] font-semibold text-gray-400">WhatsApp</span>
              )}
            </div>

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

          {/* A vendor with no reviews used to see a 4.5 average and an
              80/5/0/0/15 star split — a fabricated reputation, on their own
              profile, indistinguishable from a real one. Empty now renders
              empty, with the one action that changes it. */}
          {!hasRealReviews ? (
            <div className="py-6 text-center">
              <div className="mb-3 flex items-center justify-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-5 w-5 text-gray-200 fill-gray-200" />
                ))}
              </div>
              <p className="text-sm font-semibold text-gray-900">No reviews yet</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-gray-500">
                Share your review link to collect the first one.
              </p>
              <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/reviews")}
                className="mt-3 rounded-full bg-[#256fef] px-4 py-2 text-xs font-bold text-white hover:bg-[#1d5ed6] transition-colors">
                Get reviews
              </motion.button>
            </div>
          ) : (
            <>
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
            </>
          )}
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
              {/* A Month and a Year select sat at the top of this section, wired
                  to useState and to nothing else: they saved nothing and
                  filtered nothing. Removed. */}

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

              {/* A "Capacity" block sat here — four radio-style options
                  (Small-batch / Medium / Large / Export-grade) in local
                  useState, defaulting to ["Medium"] for every vendor. There is
                  no capacity column, so nothing it recorded ever left the page,
                  and every vendor's profile silently claimed "Medium-scale".
                  Removed rather than left non-persisting; whether to add a
                  capacity text[] column and persist it is a product decision
                  (the positioning treats small-batch/MOQ flexibility as a
                  differentiator, so it probably should be) — flagged in the
                  report rather than made here. */}

              {/* Catalogue — real rows from `catalogues`, replacing a dropzone
                  with no <input> and no handler, and two invented PDFs
                  ("Caramel_Tshirts_2026.pdf", "Denim_Lookbook_Q2.pdf",
                  "PDF • 3.2 MB") whose Download buttons did nothing. */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">Catalogue</p>
                  {(catalogues?.length ?? 0) > 0 && (
                    <button onClick={() => navigate("/upload-catalogue")} className="text-xs font-semibold text-blue-600">
                      Upload
                    </button>
                  )}
                </div>

                {cataloguesLoading ? (
                  <div className="space-y-2">
                    {[0, 1].map((i) => <div key={i} className="h-[52px] animate-pulse rounded-xl bg-gray-100" />)}
                  </div>
                ) : (catalogues?.length ?? 0) === 0 ? (
                  <button
                    onClick={() => navigate("/upload-catalogue")}
                    className="w-full rounded-xl border-2 border-dashed border-gray-200 p-4 text-center hover:border-blue-300 transition-colors"
                  >
                    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                      <Upload className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-blue-600">Upload Catalogue PDF</p>
                    <p className="text-xs text-gray-400 mt-0.5">Your uploaded catalogues will appear here.</p>
                  </button>
                ) : (
                  <div className="space-y-2">
                    {catalogues!.map((cat) => (
                      <div key={cat.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                            <FileText className="h-4 w-4 text-gray-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-gray-800">{cat.title}</p>
                            <p className="text-[10px] text-gray-400">
                              {cat.pageCount ? `${cat.pageCount} pages · ` : ""}
                              {cat.status === "live" ? "Live" : cat.status === "under_review" ? "In review" : cat.status === "rejected" ? "Rejected" : "Draft"}
                              {` · ${cat.createdAt}`}
                            </p>
                          </div>
                        </div>
                        {cat.fileUrl ? (
                          <a
                            href={cat.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                        ) : (
                          <span className="shrink-0 text-[10px] text-gray-400">No file</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Brand's Categories</h2>
            {businessCategories.length > 0 && (
              <button onClick={() => setShowCategoriesModal(true)} className="text-xs font-semibold text-blue-600">Edit</button>
            )}
          </div>
          {/* The real text[] the vendor sets through the shared category picker.
              This block used to render six imported Korean fashion brand logos
              (chuu, cherrykoko, brandi, stylenanda, styleonme, hotping) labelled
              "T-Shirts", "Denim", "Printing"… — other companies' brand IP
              presented as this vendor's own categories — under four hardcoded
              scroll dots that never moved. */}
          {businessCategories.length === 0 ? (
            <button
              onClick={() => setShowCategoriesModal(true)}
              className="w-full rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-center hover:border-blue-300 transition-colors"
            >
              <Tag className="mx-auto mb-2 h-6 w-6 text-blue-500" />
              <p className="text-sm font-semibold text-blue-600">Add your business categories</p>
              <p className="mt-0.5 text-xs text-gray-400">Buyers filter by these to find suppliers like you.</p>
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {businessCategories.map((cat) => (
                <span key={cat} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600">
                  {cat}
                </span>
              ))}
            </div>
          )}
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            BRAND'S RECOMMENDATIONS (draggable grid)
        ══════════════════════════════════════════════════════ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Brand's Recommendations</h2>
            <div className="flex items-center gap-2">
              <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setShowRecommendPicker(true)}
                className="rounded-full border border-blue-500 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50">
                Choose
              </motion.button>
              {recommendItems.length > 1 && (
                <motion.button whileTap={TAP} transition={TAP_T} onClick={() => setEditMode(p => !p)}
                  className="rounded-full border border-blue-500 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50">
                  {editMode ? "Done" : "Reorder"}
                </motion.button>
              )}
            </div>
          </div>
          {editMode && <p className="text-xs text-gray-400 mb-3">Drag to rearrange — the order is saved to your storefront.</p>}

          {/* Real live products, in the vendor's saved order. The drag-to-reorder
              was already well built and persisted NOTHING: four invented products
              ("Cotton T-Shirt 180 GSM", …) that reset on every reload, with a
              "Product name | SOHO" caption under each. */}
          {recommendItems.length === 0 ? (
            <button
              onClick={() => setShowRecommendPicker(true)}
              disabled={liveProducts.length === 0}
              className="w-full rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-center hover:border-blue-300 transition-colors disabled:cursor-not-allowed disabled:hover:border-gray-200"
            >
              <Star className="mx-auto mb-2 h-6 w-6 text-blue-500" />
              <p className="text-sm font-semibold text-blue-600">Pick products to feature on your storefront</p>
              <p className="mt-0.5 text-xs text-gray-400">
                {liveProducts.length === 0
                  ? "You'll be able to feature products once one of your listings is live."
                  : `${liveProducts.length} live ${liveProducts.length === 1 ? "listing" : "listings"} to choose from.`}
              </p>
            </button>
          ) : (
            <motion.div variants={listContainer} className="grid grid-cols-3 gap-2">
              {recommendItems.map((product, idx) => (
                <motion.div variants={listItem}
                  key={product.id}
                  draggable={editMode}
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex === null || dragIndex === idx) return;
                    const next = recommendItems.map((p) => p.id);
                    const [moved] = next.splice(dragIndex, 1);
                    next.splice(idx, 0, moved);
                    setDragIndex(null);
                    void saveRecommendations(next);
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
                    {product.reviewsCount > 0 && (
                      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 py-0.5">
                        <Star className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />
                        <span className="text-[9px] font-bold text-gray-800">{product.rating.toFixed(1)}</span>
                        <span className="text-[9px] text-gray-400">| {product.reviewsCount}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="text-[10px] font-bold text-gray-900">
                      {product.currency}{product.price} · MOQ {product.moq}
                    </p>
                    <p className="text-[9px] text-gray-500 truncate">{product.name}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            BRAND PRODUCT VIDEOS
        ══════════════════════════════════════════════════════ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Brand Product Videos</h2>
            {videos.length > 0 && (
              <button onClick={() => navigate("/upload-video")} className="text-xs font-semibold text-blue-600">Upload</button>
            )}
          </div>

          {/* This vendor's real product_videos rows, via the SAME useMyVideos
              hook /upload-video uses. It was a five-item demo array with invented
              names, prices and durations, and the "+" tile went nowhere. */}
          {videosLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-gray-100" />)}
            </div>
          ) : (
            <motion.div variants={listContainer} className="grid grid-cols-3 gap-2">
              <button
                onClick={() => navigate("/upload-video")}
                className="aspect-[3/4] rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-gray-50"
              >
                <Plus className="h-7 w-7 text-blue-500" />
                <span className="px-1 text-center text-[9px] text-gray-500">Add video</span>
              </button>
              {videos.slice(0, 5).map((video) => (
                <motion.button variants={listItem} whileTap={TAP} transition={TAP_T} key={video.id}
                  onClick={() => setActiveVideo(video.id)}
                  className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gray-100">
                  {video.thumbnail ? (
                    <img src={video.thumbnail} alt={video.caption || "Product video"} onError={onThumbError}
                      className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="absolute inset-0 bg-gray-200" />
                  )}
                  <div className="absolute inset-0 bg-black/25" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80">
                      <Play className="h-4 w-4 text-blue-600 fill-blue-600" />
                    </div>
                  </div>
                  {/* Real moderation status, not a fake duration chip. */}
                  <span className={`absolute top-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${
                    video.status === "live" ? "bg-green-500 text-white"
                    : video.status === "rejected" ? "bg-red-500 text-white"
                    : "bg-black/60 text-white"
                  }`}>
                    {video.status === "live" ? "Live" : video.status === "rejected" ? "Rejected" : video.status === "draft" ? "Draft" : "In review"}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 py-2 text-left">
                    <p className="text-[9px] font-bold text-white truncate">{video.productName || video.caption || "Untitled"}</p>
                    <p className="text-[9px] text-white/70 truncate">{video.category}</p>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* A rejected video is a dead end unless the vendor is told why —
              /upload-video shows the moderator's note, so this does too. */}
          {videos.some((v) => v.status === "rejected" && v.rejectionReason) && (
            <div className="mt-3 space-y-2">
              {videos.filter((v) => v.status === "rejected" && v.rejectionReason).map((v) => (
                <div key={v.id} className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                  <p className="text-[11px] leading-4 text-gray-700">
                    <span className="font-semibold">{v.productName || v.caption || "Video"} rejected:</span> {v.rejectionReason}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!videosLoading && videos.length === 0 && (
            <p className="mt-3 text-xs text-gray-400">
              Short product videos show buyers your fabric and finish in a way photos can't.
            </p>
          )}
        </motion.section>

        {/* ══════════════════════════════════════════════════════
            ALL PRODUCTS — this vendor's real listings
        ══════════════════════════════════════════════════════ */}
        <motion.section variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
          {/* Header. Was the literal "Caramel Fashion" next to a page-level
              bookmark toggle that stored a boolean nothing read. */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">{brandDisplay}</h2>
            <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/products")}
              className="text-xs font-semibold text-blue-600">
              Manage listings
            </motion.button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 mb-3">
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
              placeholder="Search items"
              className="flex-1 text-sm text-gray-700 placeholder-gray-400 focus:outline-none bg-transparent" />
          </div>

          {/* Filter row. SORT and FILTER were bare <button>s with no handler —
              a control that does nothing is worse than no control — so both are
              real selects now, driving the same filteredProducts memo. */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <div className="relative">
              <select value={genderFilter} onChange={e => setGenderFilter(e.target.value)}
                className="appearance-none rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-700 font-semibold focus:outline-none pr-6">
                <option value="">GENDER</option>
                <option>Men</option><option>Women</option><option>Unisex</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
            </div>
            <div className="relative">
              <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                className="appearance-none rounded-full border border-gray-200 py-1.5 pl-7 pr-6 text-xs font-semibold text-gray-700 focus:outline-none">
                <option value="newest">Newest</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="name">Name A–Z</option>
              </select>
              <ArrowUpDown className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
            </div>
            {(productSearch || genderFilter || sortBy !== "newest") && (
              <button
                onClick={() => { setProductSearch(""); setGenderFilter(""); setSortBy("newest"); }}
                className="flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setGridCols(2)} aria-label="Two columns"
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${gridCols === 2 ? "border-blue-500 text-blue-600" : "border-gray-200 text-gray-400"}`}>
                <Grid2X2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setGridCols(3)} aria-label="Three columns"
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${gridCols === 3 ? "border-blue-500 text-blue-600" : "border-gray-200 text-gray-400"}`}>
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Real count. Was "3,538" for every vendor. */}
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Product <span className="text-blue-600">{filteredProducts.length.toLocaleString("en-IN")}</span>
            {filteredProducts.length !== myProducts.length && (
              <span className="text-gray-400"> of {myProducts.length.toLocaleString("en-IN")}</span>
            )}
          </p>

          {productsLoading ? (
            <div className={`grid ${gridCols === 2 ? "grid-cols-2 gap-3" : "grid-cols-3 gap-2"}`}>
              {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-gray-100" />)}
            </div>
          ) : myProducts.length === 0 ? (
            /* Empty catalogue renders empty — with the one action that fills it. */
            <div className="py-10 text-center">
              <Package className="mx-auto mb-2 h-7 w-7 text-gray-300" />
              <p className="text-sm font-semibold text-gray-900">No listings yet</p>
              <p className="mt-1 text-sm text-gray-500">Add your first product so buyers can find you.</p>
              <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate("/upload")}
                className="mt-3 rounded-full bg-[#256fef] px-4 py-2 text-xs font-bold text-white hover:bg-[#1d5ed6] transition-colors">
                Add a product
              </motion.button>
            </div>
          ) : (
            <div className={`grid ${gridCols === 2 ? "grid-cols-2 gap-3" : "grid-cols-3 gap-2"}`}>
              {filteredProducts.map((product) => (
                /* One card shape for both densities. The per-index bookmark
                   Set<number> that used to sit on these cards reset on every
                   reload and had no meaning for a vendor on their OWN products —
                   removed. The "Call Now" button (in buyer coral, on a vendor
                   page) was a vendor calling themselves; it is now the edit
                   action a vendor actually wants on their own listing. */
                <div key={product.id} className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="relative aspect-[3/4] shrink-0 bg-gray-100">
                    <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                    <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                      product.status === "active" ? "bg-green-500 text-white"
                        : product.status === "pending" ? "bg-black/60 text-white"
                        : "bg-gray-200 text-gray-700"
                    }`}>
                      {product.status === "active" ? "Live" : product.status === "pending" ? "In review" : "Draft"}
                    </span>
                    {product.reviewsCount > 0 && (
                      <div className="absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full bg-white/90 px-1.5 py-0.5">
                        <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                        <span className="text-[9px] font-bold text-gray-800">{product.rating.toFixed(1)}</span>
                        <span className="text-[9px] text-gray-400">| {product.reviewsCount}</span>
                      </div>
                    )}
                  </div>
                  <div className={`flex flex-1 flex-col ${gridCols === 2 ? "p-2" : "px-1.5 py-1.5"}`}>
                    <p className={`font-bold leading-tight text-gray-900 ${gridCols === 2 ? "text-xs" : "text-[9px]"}`}>
                      {product.currency}{product.price} · MOQ {product.moq}
                    </p>
                    <p className={`mt-0.5 truncate text-gray-600 ${gridCols === 2 ? "text-[10px]" : "text-[8px]"}`}>
                      {product.name}
                    </p>
                    {product.location && (
                      <div className="mt-0.5 flex items-center gap-0.5">
                        <MapPin className={`shrink-0 text-gray-500 ${gridCols === 2 ? "h-2.5 w-2.5" : "h-2 w-2"}`} />
                        <span className={`truncate font-bold text-gray-700 ${gridCols === 2 ? "text-[10px]" : "text-[8px]"}`}>
                          {product.location}
                        </span>
                      </div>
                    )}
                    {(product.fabric || product.gsm) && (
                      <p className={`truncate text-gray-500 ${gridCols === 2 ? "text-[10px]" : "text-[8px]"}`}>
                        {[product.fabric && `Fabric: ${product.fabric}`, product.gsm && `GSM: ${product.gsm}`].filter(Boolean).join(" | ")}
                      </p>
                    )}
                    {product.fitType && (
                      <p className={`truncate text-gray-500 ${gridCols === 2 ? "text-[10px]" : "text-[8px]"}`}>
                        Fit Type: {product.fitType}
                      </p>
                    )}
                    <button
                      onClick={() => navigate(`/upload?edit=${product.id}`)}
                      className={`mt-auto flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#256fef] font-bold text-white transition-colors hover:bg-[#1d5ed6] ${
                        gridCols === 2 ? "mt-2 py-2 text-xs" : "mt-1.5 py-1.5 text-[9px]"
                      }`}
                    >
                      <Pencil className={gridCols === 2 ? "h-3 w-3" : "h-2.5 w-2.5"} /> Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!productsLoading && myProducts.length > 0 && filteredProducts.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400">No products match this search</div>
          )}

          {/* A permanent "Loading more products..." line used to sit here. It
              never loaded anything: the list was a fixed six-item array. Every
              listing this vendor has is on screen, so there is nothing to page. */}
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
            {/* Plays the real video_url. This used to be a static thumbnail
                with a decorative play button drawn on top of it — tapping it
                did nothing, and there was no video behind it to play. */}
            <div className="relative h-72 bg-black">
              {selectedVideo.videoUrl ? (
                <video
                  src={selectedVideo.videoUrl}
                  poster={selectedVideo.thumbnail ?? undefined}
                  controls
                  autoPlay
                  playsInline
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <Play className="h-8 w-8 text-white/40" />
                  <p className="text-xs text-white/70">
                    This video is still being processed. It will be playable here shortly.
                  </p>
                </div>
              )}
            </div>
            <div className="p-4">
              <p className="text-sm font-bold text-gray-900">
                {selectedVideo.productName || selectedVideo.caption || "Untitled"}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {selectedVideo.category}
                {" · "}
                {selectedVideo.status === "live" ? "Live" : selectedVideo.status === "rejected" ? "Rejected" : selectedVideo.status === "draft" ? "Draft" : "In review"}
                {" · "}
                {selectedVideo.createdAt}
              </p>
              {selectedVideo.status === "rejected" && selectedVideo.rejectionReason && (
                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-gray-700">
                  <span className="font-semibold">Rejected:</span> {selectedVideo.rejectionReason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Which live products to feature. Selection order is the display order,
          so picking is the same gesture as ordering for a vendor who has never
          dragged anything. */}
      {showRecommendPicker && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
              <button onClick={() => setShowRecommendPicker(false)} aria-label="Close">
                <ArrowLeft className="h-5 w-5 text-gray-500" />
              </button>
              <h3 className="text-base font-bold text-gray-900">Feature products</h3>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-4 text-sm text-gray-600">
                Pick the live listings you want at the top of your storefront. Only live products can be featured.
              </p>
              {liveProducts.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  You have no live listings yet. Once a product is approved it will appear here.
                </p>
              ) : (
                <div className="space-y-2">
                  {liveProducts.map((product) => {
                    const picked = recommendIds.includes(product.id);
                    const position = recommendIds.indexOf(product.id) + 1;
                    return (
                      <button
                        key={product.id}
                        onClick={() => toggleRecommend(product.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors ${
                          picked ? "border-[#256fef] bg-[#256fef]/5" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <img src={product.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-500">{product.currency}{product.price} · MOQ {product.moq}</p>
                        </div>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          picked ? "bg-[#256fef] text-white" : "border-2 border-gray-300 text-transparent"
                        }`}>
                          {picked ? position : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-5 py-4">
              <button
                onClick={() => setShowRecommendPicker(false)}
                className="w-full rounded-xl bg-[#256fef] py-3 font-bold text-white transition-colors hover:bg-[#1d5ed6]"
              >
                Done {recommendIds.length > 0 && `(${recommendIds.length})`}
              </button>
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

      {/* Banner picker. */}
      <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerFile} />

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