import { Link } from "react-router-dom";
import { ArrowLeft, Briefcase, Loader2 } from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useStepBack } from "@/hooks/useStepBack";
import { useHomePath } from "@/hooks/useHomePath";
import { useCareersPageOn } from "@/lib/queries/careers";
import NotFound from "@/pages/NotFound";

// Careers at Cosora (Mitra, 2026-11-20, review L-68: "Make a careers page but keep it hidden for now, make the
// feature to be able to turned on from admin panel"). Behind the switch `careers_page`: while it is off this address
// is the 404 page and the seller landing page has no "Work with us" link. The copy claims nothing about the team or
// openings that isn't true; roles get listed here when there are any.

const Careers = () => {
  const on = useCareersPageOn();
  const homePath = useHomePath();
  const goBack = useStepBack(homePath);

  if (on === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-label="Loading" />
      </div>
    );
  }
  if (!on) return <NotFound />;

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={goBack} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Work with us</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        <div className="w-12 h-12 rounded-2xl bg-brand-vendor/10 flex items-center justify-center">
          <Briefcase className="w-6 h-6 text-brand-vendor" aria-hidden />
        </div>
        <h2 className="mt-4 text-xl font-bold text-gray-900">Careers at Cosora</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Cosora is a B2B sourcing platform for India's fashion and textile trade. It connects buyers with manufacturers,
          mills, suppliers and service providers, from the first requirement to the quote.
        </p>

        <section className="mt-6 rounded-2xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-900">Open roles</h3>
          <p className="mt-1 text-sm text-gray-600">There are no open roles listed right now.</p>
        </section>

        <section className="mt-4 rounded-2xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-900">Want to work with us anyway?</h3>
          <p className="mt-1 text-sm text-gray-600">
            Tell us who you are and what you'd like to do through Help, and the team will get back to you.
          </p>
          <Link to="/help" className="mt-3 inline-flex rounded-xl bg-brand-vendor px-4 py-2 text-sm font-bold text-white hover:bg-brand-vendor/90">
            Go to Help
          </Link>
        </section>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default Careers;
