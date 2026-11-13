import { cn } from "@/lib/utils";
import type { PremisesPhotoStatus } from "@/lib/queries/premisesPhotos";

// The review state of one of the seller's premises photos (2026-11-13). Approved photos carry no badge: they are
// what buyers see.
export default function PhotoStatusBadge({ status, className }: { status: PremisesPhotoStatus; className?: string }) {
  if (status === "live") return null;
  return (
    <span
      className={cn(
        "absolute inset-x-0 bottom-0 px-1 py-0.5 text-center text-[9px] font-semibold text-white",
        status === "rejected" ? "bg-brand-buyer/90" : "bg-gray-900/70",
        className,
      )}
    >
      {status === "rejected" ? "Not approved" : "In review"}
    </span>
  );
}
