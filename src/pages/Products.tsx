import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useMyProducts, deleteProduct, duplicateProduct, type VendorProductRow } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus, Search, Share2, MoreVertical,
  Eye, MessageSquare, Edit2, Trash2, Copy,
  ChevronDown, Camera, PackageOpen, SearchX, LogIn,
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
// `hidden` is declared even though it's empty: the list mounts *after* the page's
// one-shot stagger has finished, so it drives its own initial/animate. Without a
// `hidden` key it would keep whatever the previously-rendered branch resolved.
const listContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055 } },
};
const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};

// One grid definition shared by the desktop row and its skeleton so the columns
// stay locked together: thumb | name | price | performance | actions.
// Widths are sized against the narrowest desktop case (1024px viewport minus the
// 256px sidebar), which is why the columns step up again at xl instead of
// starting wide.
const DESKTOP_GRID =
  "lg:grid lg:items-center lg:gap-3 lg:grid-cols-[72px_minmax(0,1fr)_100px_176px_auto] " +
  "xl:gap-4 xl:grid-cols-[80px_minmax(0,1fr)_132px_208px_auto]";

const STATUS = {
  active:  { label: "Published",    pill: "bg-green-100 text-green-700" },
  pending: { label: "Under review", pill: "bg-amber-100 text-amber-700" },
  draft:   { label: "Draft",        pill: "bg-gray-100 text-gray-500" },
} as const;

// ─────────────────────────────────────────────────────────────
// PRODUCT ROW CARD
// Mobile keeps the compact stacked card; desktop spreads the same data across
// aligned columns so a catalog can be scanned instead of read one card at a time.
// Data comes from Supabase (the vendor's own products, any status).
// ─────────────────────────────────────────────────────────────

function ShareButton({ id, className }: { id: string; className?: string }) {
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(window.location.origin + "/product/" + id); toast.success("Link copied!"); }}
      aria-label="Copy product link"
      className={cn("p-1.5 hover:bg-gray-100 rounded-lg transition-colors", className)}
    >
      <Share2 className="w-4 h-4 text-gray-500" />
    </button>
  );
}

function RowMenu({ id, open, onOpenChange, onDelete, onDuplicate }: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => onOpenChange(!open)}
        aria-label="More actions"
        aria-expanded={open}
        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <MoreVertical className="w-4 h-4 text-gray-500" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => onOpenChange(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
              className="absolute right-0 top-8 z-20 bg-white border border-gray-100 rounded-xl shadow-xl py-1 w-36"
            >
              <button
                onClick={() => { onDuplicate(id); onOpenChange(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Copy className="w-4 h-4" /> Duplicate
              </button>
              <button
                onClick={() => { onDelete(id); onOpenChange(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScoreBar({ value, barClass }: { value: number; barClass?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-1.5 bg-gray-100 rounded-full overflow-hidden w-16", barClass)}>
        <div className="h-full bg-[#256fef] rounded-full" style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 whitespace-nowrap">{value}% Score</span>
    </div>
  );
}

function ProductRow({ product, onDelete, onDuplicate }: {
  product: VendorProductRow;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const status = STATUS[product.status];
  const editHref = `/upload?id=${product.id}`;

  return (
    <motion.div
      variants={reduced ? {} : listItem}
      // No `overflow-hidden` here: it would clip the row's own dropdown. The
      // open row is lifted above its siblings so the menu isn't painted over
      // by the next card.
      className={cn(
        "group relative bg-white border border-gray-200 rounded-xl transition-colors hover:bg-gray-50 lg:hover:border-gray-300",
        menuOpen ? "z-20" : "z-0",
      )}
    >
      {/* The whole row opens the editor. It sits *under* the content as a
          stretched overlay so the inline controls stay real buttons instead of
          being nested inside another button. */}
      <button
        type="button"
        onClick={() => navigate(editHref)}
        aria-label={`Edit ${product.name}`}
        className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#256fef] focus-visible:ring-inset"
      />

      {/* ── Mobile card ── */}
      <div className="relative z-10 pointer-events-none flex items-start gap-3 p-3 text-left lg:hidden">
        <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0 relative">
          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end justify-start p-1">
            <Camera className="w-3 h-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
            {product.name}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-sm font-bold text-gray-900">₹ {product.price}</span>
            <span className="text-xs text-gray-400">/ {product.unit}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Eye className="w-3.5 h-3.5" />
              <span>{product.views}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{product.inquiries} inquiries</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <ScoreBar value={product.profileScore} />
            {product.status !== "active" && (
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", status.pill)}>
                {status.label}
              </span>
            )}
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <ShareButton id={product.id} />
            <RowMenu id={product.id} open={menuOpen} onOpenChange={setMenuOpen} onDelete={onDelete} onDuplicate={onDuplicate} />
          </div>
          <span className="text-[9px] text-gray-300 font-mono">{product.productCode}</span>
          <button
            onClick={() => navigate(editHref)}
            className="flex items-center gap-1 px-2.5 py-1 border border-[#256fef] text-[#256fef] rounded-lg text-xs font-semibold hover:bg-blue-50 transition-colors"
          >
            <Edit2 className="w-3 h-3" /> Edit
          </button>
        </div>
      </div>

      {/* ── Desktop row ── */}
      <div className={cn("relative z-10 pointer-events-none hidden px-4 py-3 text-left", DESKTOP_GRID)}>
        {/* Thumbnail */}
        <div className="w-[72px] h-[72px] xl:w-20 xl:h-20 rounded-lg overflow-hidden bg-gray-100 relative">
          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end p-1">
            <Camera className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Name + code + status */}
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2">
            {product.name}
          </p>
          {/* Wraps as whole items so the code never breaks mid-token when the
              name column is at its narrowest. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] text-gray-400 font-mono whitespace-nowrap">{product.productCode}</span>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap", status.pill)}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Price */}
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-gray-900 truncate">₹ {product.price}</p>
          <p className="text-[11px] text-gray-400">per {product.unit}</p>
        </div>

        {/* Performance: engagement + listing completeness */}
        <div className="space-y-2 min-w-0">
          {/* Wraps rather than overflowing once the counts get into the thousands. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] xl:text-xs text-gray-500">
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Eye className="w-3.5 h-3.5 shrink-0" />{product.views} views
            </span>
            <span className="flex items-center gap-1 whitespace-nowrap">
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />{product.inquiries} inquiries
            </span>
          </div>
          <ScoreBar value={product.profileScore} barClass="w-20 xl:w-24" />
        </div>

        {/* Actions */}
        <div className="pointer-events-auto flex items-center justify-end gap-1">
          <button
            onClick={() => navigate(editHref)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#256fef] text-[#256fef] rounded-lg text-xs font-semibold hover:bg-blue-50 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>
          <ShareButton id={product.id} />
          <RowMenu id={product.id} open={menuOpen} onOpenChange={setMenuOpen} onDelete={onDelete} onDuplicate={onDuplicate} />
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOADING / EMPTY STATES
// ─────────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 lg:px-4 lg:py-3">
      <div className={cn("flex items-start gap-3", DESKTOP_GRID)}>
        <Skeleton className="w-20 h-20 lg:w-[72px] lg:h-[72px] xl:w-20 xl:h-20 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2 py-1">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-32 lg:hidden" />
        </div>
        <Skeleton className="hidden lg:block h-4 w-16" />
        <div className="hidden lg:block space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="hidden lg:block h-7 w-28" />
      </div>
    </div>
  );
}

function StatePanel({ icon: Icon, title, body, children }: {
  icon: typeof PackageOpen;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center lg:py-24">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gray-50 text-gray-400">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold text-gray-700">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400 lg:text-sm">{body}</p>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const Products = () => {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: products = [], isLoading } = useMyProducts(user?.id);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filtersActive = Boolean(search) || statusFilter !== "all" || categoryFilter !== "all";
  const pendingCount = products.filter(p => p.status === "pending").length;

  const clearFilters = () => { setSearch(""); setStatusFilter("all"); setCategoryFilter("all"); };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["products"] });

  const handleDelete = async (id: string) => {
    try {
      await deleteProduct(id);
      refresh();
      toast.success("Product deleted");
    } catch (e) {
      toast.error("Delete failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleDuplicate = async (id: string) => {
    if (!user) return;
    try {
      await duplicateProduct(user.id, id);
      refresh();
      toast.success("Product duplicated", { description: "Saved as a draft." });
    } catch (e) {
      toast.error("Duplicate failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 -m-4 lg:-m-6">
        <motion.div
          variants={reduced ? {} : page}
          initial="hidden"
          animate="show"
          className="max-w-2xl lg:max-w-6xl mx-auto px-4 py-4 lg:py-6 xl:px-6 space-y-3 lg:space-y-4 pb-24 lg:pb-10"
        >

          {/* ── Header ── */}
          <motion.div variants={section} className="lg:flex lg:items-center lg:justify-between lg:gap-6">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Products</h1>
              <p className="text-xs lg:text-sm text-gray-400">Manage your product catalog</p>
            </div>
            {/* Desktop keeps the primary action in the header, where it stays in
                view; mobile gets the full-width button and the floating one. */}
            <Link to="/upload" className="hidden lg:block shrink-0">
              <motion.button
                whileTap={TAP}
                transition={TAP_T}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" /> Upload New Product
              </motion.button>
            </Link>
          </motion.div>

          {/* ── Upload New Product button (mobile) ── */}
          <motion.div variants={section} className="lg:hidden">
            <Link to="/upload">
              <motion.button
                whileTap={TAP}
                transition={TAP_T}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" /> Upload New Product
              </motion.button>
            </Link>
          </motion.div>

          {/* ── Search + Filter ── */}
          <motion.div
            variants={section}
            className="bg-white rounded-xl border border-gray-200 p-3 space-y-2.5 lg:flex lg:items-center lg:gap-3 lg:space-y-0"
          >
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 lg:flex-1">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none placeholder-gray-500"
              />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Clear search" className="text-gray-400 hover:text-gray-600">
                  ✕
                </button>
              )}
            </div>

            <div className="flex gap-2 lg:gap-3 lg:shrink-0">
              {/* Category */}
              <div className="relative flex-1 lg:flex-none lg:w-44">
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  aria-label="Filter by category"
                  className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 focus:outline-none focus:border-[#256fef] pr-7 lg:text-sm lg:py-2.5"
                >
                  <option value="all">All Categories</option>
                  <option value="apparel">Apparel</option>
                  <option value="fabrics">Fabrics</option>
                  <option value="accessories">Accessories</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              {/* Status */}
              <div className="relative flex-1 lg:flex-none lg:w-44">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                  className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 focus:outline-none focus:border-[#256fef] pr-7 lg:text-sm lg:py-2.5"
                >
                  <option value="all">All Status</option>
                  <option value="active">Published</option>
                  <option value="draft">Draft</option>
                  <option value="pending">Pending Review</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </motion.div>

          {/* ── Product count ── */}
          <motion.div variants={section} className="flex min-h-[1.25rem] items-center justify-between gap-3 px-1">
            <p className="text-xs lg:text-sm text-gray-500">
              {!user ? ""
                : isLoading ? "Loading your products…"
                : `${filtered.length} product${filtered.length !== 1 ? "s" : ""}`}
              {/* Counts the whole catalog, so only shown against the unfiltered total. */}
              {!isLoading && user && !filtersActive && pendingCount > 0 && (
                <span className="hidden lg:inline text-gray-400"> · {pendingCount} awaiting review</span>
              )}
            </p>
            {filtersActive && !isLoading && (
              <button
                onClick={clearFilters}
                className="text-xs lg:text-sm font-semibold text-[#256fef] hover:underline shrink-0"
              >
                Clear filters
              </button>
            )}
          </motion.div>

          {/* ── Product list ──
              Each branch below resolves after the page's entry stagger has already
              run, so it carries its own initial/animate and a distinct key. Sharing
              a key would let React reuse one DOM node across branches, which leaves
              Framer Motion holding the previous branch's resolved variant. */}
          {!user ? (
            <motion.div key="signed-out" variants={reduced ? {} : section} initial="hidden" animate="show">
              <StatePanel
                icon={LogIn}
                title="You're signed out"
                body="Sign in with your vendor account to add products and manage the ones you've already listed."
              >
                <Link to="/login">
                  <motion.button whileTap={TAP} transition={TAP_T} className="mt-3 text-[#256fef] text-sm font-semibold hover:underline">
                    Sign in
                  </motion.button>
                </Link>
              </StatePanel>
            </motion.div>
          ) : isLoading ? (
            <motion.div key="loading" variants={reduced ? {} : section} initial="hidden" animate="show" className="space-y-2.5 lg:space-y-2">
              {[0, 1, 2].map(i => <RowSkeleton key={i} />)}
            </motion.div>
          ) : filtered.length === 0 ? (
            <motion.div key="empty" variants={reduced ? {} : section} initial="hidden" animate="show">
              {filtersActive ? (
                <StatePanel
                  icon={SearchX}
                  title="No products match these filters"
                  body="Try a different search term, or reset the category and status filters to see your full catalog."
                >
                  <motion.button
                    whileTap={TAP}
                    transition={TAP_T}
                    onClick={clearFilters}
                    className="mt-3 text-[#256fef] text-sm font-semibold hover:underline"
                  >
                    Clear filters
                  </motion.button>
                </StatePanel>
              ) : (
                <StatePanel
                  icon={PackageOpen}
                  title="No products yet"
                  body="Your catalog is empty. Upload a product and it goes live once our team reviews it, usually within 24 to 48 hours."
                >
                  <Link to="/upload">
                    <motion.button whileTap={TAP} transition={TAP_T} className="mt-3 text-[#256fef] text-sm font-semibold hover:underline">
                      + Upload your first product
                    </motion.button>
                  </Link>
                </StatePanel>
              )}
            </motion.div>
          ) : (
            <motion.div key="list" variants={reduced ? {} : listContainer} initial="hidden" animate="show" className="space-y-2.5 lg:space-y-2">
              {filtered.map(p => (
                <ProductRow
                  key={p.id}
                  product={p}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                />
              ))}
            </motion.div>
          )}

        </motion.div>

        {/* ── Floating Upload button (mobile only — desktop has it in the header) ── */}
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 lg:hidden">
          <Link to="/upload">
            <motion.button
              whileTap={TAP}
              transition={TAP_T}
              className="flex items-center gap-2 px-6 py-3 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold rounded-full shadow-lg shadow-[#ef4d62]/30 transition-all hover:scale-105"
            >
              <Plus className="w-4 h-4" /> Upload New Product
            </motion.button>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Products;
