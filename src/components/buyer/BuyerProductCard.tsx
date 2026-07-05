import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck, MapPin, Phone, Star, BadgeCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { openSaveModal, useSaved } from "@/lib/savedStore";
import { useCallVendor } from "@/lib/queries/calls";

export interface BuyerProductCardData {
  id: string;
  vendorId: string;
  name: string;
  manufacturer: string;
  location: string;
  price: string;
  moq: string;
  soldCount: string;
  enquiries: string;
  rating: number;
  reviews: number;
  fabric: string;
  gsm: string;
  fitType: string;
  image: string;
  secondaryImage: string;
  verified?: boolean;
}

interface BuyerProductCardProps {
  product: BuyerProductCardData;
  className?: string;
}

const BuyerProductCard = ({ product, className }: BuyerProductCardProps) => {
  const callVendor = useCallVendor();
  const savedState = useSaved();
  const saved = Boolean(savedState.products[product.id]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25 }}
      className={cn("group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg", className)}
    >
      <Link
        to={`/product/${product.id}`}
        className="relative aspect-[4/5] overflow-hidden bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <img src={product.image} alt={product.name} className="h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-0" />
        <img src={product.secondaryImage} alt={`${product.name} alternate`} className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/25 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-2 rounded-full bg-foreground/70 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-background backdrop-blur-sm">
          COSORA
        </div>

        {product.verified && (
          <Badge className="absolute left-2 top-2 bg-accent text-accent-foreground hover:bg-accent">
            <BadgeCheck className="mr-1 h-3 w-3" />
            TradeSEAL
          </Badge>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            openSaveModal(product);
          }}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-transform hover:scale-105"
          aria-label={saved ? "Edit saved folders" : "Save product"}
        >
          {saved
            ? <BookmarkCheck className="h-4 w-4 text-[#ef4d62] fill-[#ef4d62]/15" />
            : <Bookmark className="h-4 w-4 text-muted-foreground" />}
        </button>

        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-xl bg-background/90 px-3 py-2 text-xs backdrop-blur-sm">
          <div className="flex items-center gap-1 font-medium text-foreground">
            <Star className="h-3.5 w-3.5 fill-accent text-accent" />
            <span>{product.rating.toFixed(1)}</span>
            <span className="text-muted-foreground">| {product.enquiries}</span>
          </div>
          <span className="text-muted-foreground">{product.soldCount}</span>
        </div>
      </Link>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold leading-tight text-foreground">{product.price}</p>
            <p className="text-xs text-muted-foreground">{product.moq}</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {product.reviews} reviews
          </span>
        </div>

        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{product.name}</h3>

        <Link
          to={`/vendor/${product.vendorId}`}
          onClick={(event) => event.stopPropagation()}
          className="line-clamp-1 text-sm font-medium text-accent transition-colors hover:underline"
        >
          {product.manufacturer}
        </Link>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span>{product.location}</span>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>Fabric: {product.fabric}</span>
          <span>{product.gsm}</span>
          <span>{product.fitType}</span>
        </div>

        <Button
          size="sm"
          className="mt-1 w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          onClick={(event) => {
            event.stopPropagation();
            callVendor(product.vendorId, product.name);
          }}
        >
          <Phone className="h-4 w-4" />
          Call Now
        </Button>
      </div>
    </motion.article>
  );
};

export default BuyerProductCard;