import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMyProducts, deleteProduct, duplicateProduct, type VendorProductRow } from "@/lib/queries/products";

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
  Plus, Search, Filter, Share2, MoreVertical,
  Eye, MessageSquare, Edit2, Trash2, Copy,
  ChevronDown, Camera,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// PRODUCT ROW CARD — matches screenshot exactly
// Data comes from Supabase (the vendor's own products, any status).
// ─────────────────────────────────────────────────────────────

function ProductRow({ product, onDelete, onDuplicate }: {
  product: VendorProductRow;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const statusStyle = {
    active:  "bg-green-100 text-green-700",
    draft:   "bg-gray-100 text-gray-500",
    pending: "bg-amber-100 text-amber-700",
  }[product.status];

  return (
    <motion.div
      variants={listItem}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden"
    >
      {/* Main row — clicking anywhere goes to edit */}
      <button
        onClick={() => navigate(`/upload?id=${product.id}`)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
      >
        {/* Thumbnail */}
        <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0 relative">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          {/* Camera icon overlay */}
          <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-end justify-start p-1">
            <Camera className="w-3 h-3 text-white opacity-0 hover:opacity-100" />
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
            {product.name}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-sm font-bold text-gray-900">₹ {product.price}</span>
            <span className="text-xs text-gray-400">/ {product.unit}</span>
          </div>
          {/* Views + inquiries */}
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
          {/* Profile score + Status */}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex items-center gap-1">
              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#256fef] rounded-full"
                  style={{ width: `${product.profileScore}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400">{product.profileScore}% Score</span>
            </div>
            {product.status !== "active" && (
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", statusStyle)}>
                {product.status === "pending" ? "Under review" : "Draft"}
              </span>
            )}
          </div>
        </div>

        {/* Right controls */}
        <div
          className="flex flex-col items-end gap-2 shrink-0"
          onClick={e => e.stopPropagation()}
        >
          {/* Share + 3-dot */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => { navigator.clipboard.writeText(window.location.origin + "/product/" + product.id); toast.success("Link copied!"); }}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Share2 className="w-4 h-4 text-gray-500" />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen(p => !p)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <MoreVertical className="w-4 h-4 text-gray-500" />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.1 }}
                      className="absolute right-0 top-8 z-20 bg-white border border-gray-100 rounded-xl shadow-xl py-1 w-36"
                    >
                      <button
                        onClick={() => { onDuplicate(product.id); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Copy className="w-4 h-4" /> Duplicate
                      </button>
                      <button
                        onClick={() => { onDelete(product.id); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Product code */}
          <span className="text-[9px] text-gray-300 font-mono">{product.productCode}</span>

          {/* Edit button */}
          <button
            onClick={() => navigate(`/upload?id=${product.id}`)}
            className="flex items-center gap-1 px-2.5 py-1 border border-[#256fef] text-[#256fef] rounded-lg text-xs font-semibold hover:bg-blue-50 transition-colors"
          >
            <Edit2 className="w-3 h-3" /> Edit
          </button>
        </div>
      </button>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

const Products = () => {
  const navigate = useNavigate();
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
        <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-24">

          {/* ── Header ── */}
          <motion.div variants={section}>
            <h1 className="text-xl font-bold text-gray-900">Products</h1>
            <p className="text-xs text-gray-400">Manage your product catalog</p>
          </motion.div>

          {/* ── Upload New Product button ── */}
          <motion.div variants={section}>
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
          <motion.div variants={section} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2.5">
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none placeholder-gray-400"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                  ✕
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {/* Category */}
              <div className="relative flex-1">
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 focus:outline-none pr-7"
                >
                  <option value="all">All Categories</option>
                  <option value="apparel">Apparel</option>
                  <option value="fabrics">Fabrics</option>
                  <option value="accessories">Accessories</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              {/* Status */}
              <div className="relative flex-1">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 focus:outline-none pr-7"
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
          <motion.p variants={section} className="text-xs text-gray-500 px-1">
            {!user ? "Sign in as a vendor to manage your products"
              : isLoading ? "Loading your products…"
              : `${filtered.length} product${filtered.length !== 1 ? "s" : ""}`}
          </motion.p>

          {/* ── Product list ── */}
          {filtered.length === 0 ? (
            <motion.div variants={section} className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <p className="text-gray-400 text-sm">No products found</p>
              <Link to="/upload">
                <motion.button
                  whileTap={TAP}
                  transition={TAP_T}
                  className="mt-3 text-[#256fef] text-sm font-semibold hover:underline"
                >
                  + Upload your first product
                </motion.button>
              </Link>
            </motion.div>
          ) : (
            <motion.div variants={listContainer} className="space-y-2.5">
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

        {/* ── Floating Upload button ── */}
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 lg:bottom-6">
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