import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A seller's round logo: the one they uploaded, else their initials (2026-10-14).
 * It used to be a photo from a placeholder service, different for every seller and
 * belonging to none of them (claude.md: nothing hotlinked from a placeholder service).
 */
export default function BrandAvatar({ name, logo, className }: { name: string; logo?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
  if (logo && !broken) {
    return <img src={logo} alt={name} onError={() => setBroken(true)} className={cn("rounded-full object-cover", className)} />;
  }
  return (
    <span
      role="img"
      aria-label={name}
      data-no-translate
      className={cn("flex items-center justify-center rounded-full bg-brand-buyer/10 font-bold text-brand-buyer", className)}
    >
      {initials}
    </span>
  );
}
