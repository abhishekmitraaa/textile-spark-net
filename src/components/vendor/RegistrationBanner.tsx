import { Link } from "react-router-dom";
import { AlertCircle, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { canPublish, useSellerRegistration } from "@/lib/queries/sellerRegistration";

/**
 * On the publishing pages (DashboardLayout `registrationBanner`): what stands between this seller and publishing, and
 * the one step that fixes it (2026-11-13; SH-002, 2026-11-16).
 *
 * An unsigned agreement, a registration sent back and one waiting for approval show whatever the
 * seller_registration_required switch says; only the "can't publish" wording depends on it (while it is on, the
 * database refuses the write and this is the explanation). A registration never finished shows only while it is on.
 */
export function RegistrationBanner() {
  const { user } = useAuth();
  const { data: reg } = useSellerRegistration(user?.id);
  if (!reg || reg.status === "exempt") return null;

  const pending = reg.status === "pending";
  const unsigned = reg.status === "registered" && !reg.contractSigned;
  const rejected = reg.status === "rejected";
  if (!pending && !unsigned && !rejected && (!reg.gateOn || canPublish(reg))) return null;
  // Switch off: they can publish, so say what is outstanding without saying it blocks anything.
  const text = !reg.gateOn
    ? pending
      ? "Your seller registration is waiting for Cosora's approval."
      : unsigned
        ? "Your Supplier Agreement isn't signed yet."
        : "Your seller registration needs changes."
    : pending
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
      : rejected
        ? { to: "/onboarding", label: "Update your registration" }
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
