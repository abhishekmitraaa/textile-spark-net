import { useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, BookmarkCheck, MapPin, Phone, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListingProduct } from "@/lib/listingProducts";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import { useCallVendor } from "@/lib/queries/calls";

// ─────────────────────────────────────────────────────────────
// Shared compact listing card used across buyer feed pages
// (New Arrivals / Trends / Following). Matches the card in the
// reference mockups: pink price line, "Name | Manufacturer",
// location, fabric/GSM, Call Now.
//
// Types + mock-data helpers live in "@/lib/listingProducts".
// ─────────────────────────────────────────────────────────────

interface ListingProductCardProps {
  product: ListingProduct;
  className?: string;
}

const ListingProductCard = ({ product, className }: ListingProductCardProps) => {
  const callVendor = useCallVendor();
  const saved = useSaved();
  const isSaved = Boolean(saved.products[product.id]);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={cn("rounded-xl border border-gray-200 overflow-hidden bg-white", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to={`/product/${product.id}`} className="relative aspect-[4/5] block bg-gray-100">
        <img
          src={product.image}
          alt={product.name}
          className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", hovered ? "opacity-0" : "opacity-100")}
        />
        <img
          src={product.secondaryImage}
          alt=""
          className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", hovered ? "opacity-100" : "opacity-0")}
        />
        <div className="absolute bottom-1.5 right-1.5 lg:bottom-2 lg:right-2 text-[8px] lg:text-[10px] font-semibold text-white/70 bg-black/30 px-1.5 lg:px-2 py-0.5 rounded">COSORA</div>

        <button
          onClick={(e) => { e.preventDefault(); openSaveModal(product); }}
          className="absolute top-2 lg:top-3 right-2 lg:right-3 w-7 lg:w-9 h-7 lg:h-9 bg-white/90 rounded-full flex items-center justify-center shadow-sm"
          aria-label={isSaved ? "Edit saved folders" : "Save product"}
        >
          {isSaved ? <BookmarkCheck className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-[#ef4d62] fill-[#ef4d62]/15" /> : <Bookmark className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-gray-500" />}
        </button>

        <div className="absolute bottom-2 lg:bottom-3 left-2 lg:left-3 flex items-center gap-0.5 bg-white/90 rounded-full px-1.5 lg:px-2 py-0.5 lg:py-1">
          <Star className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-yellow-400 fill-yellow-400" />
          <span className="text-[9px] lg:text-xs font-bold text-gray-800">{product.rating.toFixed(1)}</span>
          <span className="text-[9px] lg:text-xs text-gray-400">| {product.enquiries}</span>
        </div>
      </Link>

      <div className="p-2 lg:p-3.5">
        <p className="text-xs lg:text-sm font-bold text-[#ef4d62] leading-snug">
          {product.price} | {product.moq} | {product.soldCount}
        </p>
        <p className="text-[10px] lg:text-xs text-gray-600 mt-1 lg:mt-1.5">
          {product.name} | <Link to={`/vendor/${product.vendorId}`} className="font-bold hover:underline">{product.manufacturer}</Link>
        </p>
        <div className="flex items-center gap-0.5 mt-1 lg:mt-1.5">
          <MapPin className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-gray-500 shrink-0" />
          <span className="text-[10px] lg:text-xs font-bold text-gray-700">{product.location}</span>
        </div>
        <p className="text-[10px] lg:text-xs text-gray-500 mt-1 lg:mt-1.5">Fabric: {product.fabric} | GSM: {product.gsm}</p>
        <p className="text-[10px] lg:text-xs text-gray-500 mt-0.5">Fit Type: {product.fitType}</p>

        <button
          onClick={() => callVendor(product.vendorId, product.name)}
          className="mt-2 lg:mt-3 w-full flex items-center justify-center gap-1.5 bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-xs lg:text-sm font-bold py-2 lg:py-2.5 rounded-lg transition-colors"
        >
          <Phone className="w-3 lg:w-3.5 h-3 lg:h-3.5" /> Call Now
        </button>
      </div>
    </div>
  );
};

export default ListingProductCard;
