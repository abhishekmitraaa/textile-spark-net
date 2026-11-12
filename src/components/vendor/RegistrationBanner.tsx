import { Link } from "react-router-dom";
import { AlertCircle, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { canPublish, useSellerRegistration } from "@/lib/queries/sellerRegistration";

/**
 * On every seller page: why this seller can't publish yet, and the one step that fixes it (2026-11-13).
 *
 * Shown only while the seller_registration_required switch is on for the account and the database's rule
 * (seller_registered) says no. The database refuses the write either way; this is the explanation.
 */
export function RegistrationBanner() {
  const { user } = useAuth();
  const { data: reg } = useSellerRegistration(user?.id);
  if (!reg || canPublish(reg)) return null;

  const pending = reg.status === "pending";
  const unsigned = reg.status === "registered" && !reg.contractSigned;
  const text = pending
    ? "Your seller registration is waiting for Cosora's approval. You can add listings, videos and catalogues once it's approved."
    : unsigned
      ? "Sign the Supplier Agreement to add listings, videos, catalogues, ads and quotes."
      : reg.status === "rejected"
        ? "Your seller registration needs changes. Update it to add listings, videos, catalogues, ads and quotes."
        : "Finish your seller registration to add listings, videos, catalogues, ads and quotes.";
  const action = pending
    ? { to: "/kyc", label: "View your documents" }
    : unsigned
      ? { to: "/kyc", label: "Sign the agreement" }
      : { to: "/onboarding", label: "Finish registration" };

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-2xl border border-brand-vendor/30 bg-brand-vendor/5 p-3 text-sm text-brand-ink"
    >
      {pending ? <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-vendor" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-vendor" />}
      <div className="min-w-0 space-y-1">
        <p>{text}</p>
        <Link to={action.to} className="inline-block font-semibold text-brand-vendor underline underline-offset-2">
          {action.label}
        </Link>
      </div>
    </div>
  );
}
