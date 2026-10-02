import { Link } from "react-router-dom";
import { LogIn } from "lucide-react";

// Buyer requirements are for signed-in accounts only: since RFQ/leads R1 the
// rfqs_select policy is TO authenticated, so a signed-out visitor reads none.
// Shown in place of the "no open requirements" empty state, which would tell a
// signed-out visitor something untrue. Links to the existing sign-in page; the
// sign-in flow itself is not touched here.
export default function SignInForLeads({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        <Link to="/login" className="font-semibold text-brand-vendor underline-offset-2 hover:underline">
          Sign in to see buyer requirements
        </Link>
      </p>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-vendor/10">
        <LogIn className="h-6 w-6 text-brand-vendor" />
      </div>
      <p className="text-base font-bold text-gray-900">Sign in to see buyer requirements</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">Buyer requirements are shown to signed-in sellers only.</p>
      <Link
        to="/login"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-brand-vendor px-4 py-2 text-xs font-bold text-white hover:bg-brand-vendor/90 transition-colors"
      >
        <LogIn className="h-4 w-4" /> Sign in
      </Link>
    </div>
  );
}
