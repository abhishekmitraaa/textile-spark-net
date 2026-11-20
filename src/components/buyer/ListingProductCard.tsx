import { useDisplayCurrency } from "@/contexts/DisplayCurrencyContext";
import { useState } from "react";
import { CardSpecs } from "@/components/buyer/CardSpecs";
import { RatingChip } from "@/components/buyer/RatingChip";
import { Link } from "react-router-dom";
import { Bookmark, BookmarkCheck, MapPin, Phone, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListingProduct } from "@/lib/listingProducts";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import { useCallVendor } from "@/lib/queries/calls";
import CardLinkOverlay, { ABOVE_CARD_LINK } from "@/components/buyer/CardLinkOverlay";
import InternationalSupplierTag from "@/components/buyer/InternationalSupplierTag";
import { CardPhotos } from "@/components/buyer/CardPhotos";

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
  const { showText } = useDisplayCurrency();
  const callVendor = useCallVendor();
  const saved = useSaved();
  const isSaved = Boolean(saved.products[product.id]);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={cn("rounded-xl border border-gray-200 overflow-hidden bg-white flex flex-col h-full", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative aspect-[4/5] bg-gray-100">
        {/* The Save button sits beside the photo's link, not inside it (review L-12). */}
        <Link to={`/product/${product.id}`} className="absolute inset-0 block">
          <CardPhotos primary={product.image} secondary={product.secondaryImage} alt={product.name} hovered={hovered} />
          <div className="absolute bottom-1.5 right-1.5 lg:bottom-2 lg:right-2 text-[8px] lg:text-[10px] font-semibold text-white/70 bg-black/30 px-1.5 lg:px-2 py-0.5 rounded">COSORA</div>
  
          <RatingChip rating={product.rating} className="absolute bottom-2 lg:bottom-3 left-2 lg:left-3" />
        </Link>
          <button
            onClick={(e) => { e.preventDefault(); openSaveModal(product); }}
            className="absolute top-2 lg:top-3 right-2 lg:right-3 w-7 lg:w-9 h-7 lg:h-9 bg-white/90 rounded-full flex items-center justify-center shadow-sm"
            aria-label={isSaved ? "Edit saved folders" : "Save product"}
          >
            {isSaved ? <BookmarkCheck className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-brand-buyer fill-brand-buyer/15" /> : <Bookmark className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-gray-500" />}
          </button>
      </div>

      <div className="relative p-2 lg:p-3.5 flex flex-col flex-1">
        <CardLinkOverlay to={`/product/${product.id}`} />
        <p className="text-xs lg:text-sm font-bold text-brand-buyer leading-snug">
          {showText(product.price)} | {product.moq}{product.views && <> | {product.views}</>}
        </p>
        <p className="text-[10px] lg:text-xs text-gray-600 mt-1 lg:mt-1.5">
          {product.name} | <Link to={`/vendor/${product.vendorId}`} className={cn(ABOVE_CARD_LINK, "font-bold hover:underline")}>{product.manufacturer}</Link>
        </p>
        <div className="flex items-center gap-0.5 mt-1 lg:mt-1.5">
          <MapPin className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-gray-500 shrink-0" />
          <span className="text-[10px] lg:text-xs font-bold text-gray-700">{product.location}</span>
        </div>
        <InternationalSupplierTag countryCode={product.vendorCountryCode} className="mt-1 self-start text-[9px] lg:text-[10px]" />
        <CardSpecs fabric={product.fabric} gsm={product.gsm} fit={product.fitType} className="mt-1 lg:mt-1.5" lineClassName="text-[10px] lg:text-xs" />

        {/* Spacer absorbs uneven text height so every Call Now aligns at the card's bottom edge */}
        <div className="flex-1" />

        <button
          onClick={() => callVendor(product.vendorId, product.name)}
          className={cn(ABOVE_CARD_LINK, "mt-2 lg:mt-3 w-full flex items-center justify-center gap-1.5 bg-brand-buyer hover:bg-brand-buyer/90 text-white text-xs lg:text-sm font-bold py-2 lg:py-2.5 rounded-lg transition-colors")}
        >
          <Phone className="w-3 lg:w-3.5 h-3 lg:h-3.5" /> Call Now
        </button>
      </div>
    </div>
  );
};

export default ListingProductCard;
