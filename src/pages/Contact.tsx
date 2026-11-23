import { Link } from "react-router-dom";
import { ArrowLeft, Building2, Clock, Mail, MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { LegalFooter } from "@/components/LegalFooter";
import { COMPANY, COMPANY_OWNERSHIP_LINE, COMPANY_WHATSAPP_URL } from "@/lib/company";
import { GRIEVANCE_OFFICER } from "@/lib/grievance";
import { SUPPORT_HOURS_LABEL } from "@/lib/supportContact";
import { useStepBack } from "@/hooks/useStepBack";
import { useHomePath } from "@/hooks/useHomePath";

/**
 * /contact (Mitra, 2026-11-24): who runs Cosora and how to reach it. The company's name, address and phone are the
 * ones the footer shows, from lib/company.ts, so they can't differ between pages. Hours are support's fallback
 * hours (lib/supportContact.ts), the same the Help page shows while support rollout is off.
 */
const Contact = () => {
  const homePath = useHomePath();
  const goBack = useStepBack(homePath);
  const officer = GRIEVANCE_OFFICER;

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={goBack} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Contact us</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-28 space-y-6">
        <p className="text-sm leading-relaxed text-gray-700" data-no-translate>
          {COMPANY_OWNERSHIP_LINE}
        </p>

        <section aria-labelledby="contact-company" className="rounded-2xl border border-gray-200 p-4">
          <h2 id="contact-company" className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <Building2 className="h-4 w-4 text-gray-500" /> Company details
          </h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Legal name</dt>
              <dd className="text-gray-900" data-no-translate>{COMPANY.legalName}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Registered office</dt>
              <dd className="flex items-start gap-1.5 text-gray-900">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span data-no-translate>{COMPANY.registeredAddress}</span>
              </dd>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-500">CIN</dt>
                <dd className="font-mono text-gray-900" data-no-translate>{COMPANY.cin}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">GSTIN</dt>
                <dd className="font-mono text-gray-900" data-no-translate>{COMPANY.gstin}</dd>
              </div>
            </div>
          </dl>
        </section>

        <section aria-labelledby="contact-reach" className="rounded-2xl border border-gray-200 p-4">
          <h2 id="contact-reach" className="text-sm font-bold text-gray-900">Customer support</h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li>
              <a href={`mailto:${COMPANY.email}`} className="flex items-center gap-2 font-medium text-blue-600 hover:underline">
                <Mail className="h-4 w-4 shrink-0" /> <span data-no-translate>{COMPANY.email}</span>
              </a>
            </li>
            <li>
              <a href={`tel:${COMPANY.phone}`} className="flex items-center gap-2 font-medium text-blue-600 hover:underline">
                <Phone className="h-4 w-4 shrink-0" /> <span data-no-translate>{COMPANY.phoneLabel}</span>
              </a>
              <p className="ml-6 text-xs text-gray-500">Phone and WhatsApp</p>
            </li>
            <li>
              <a href={COMPANY_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 font-medium text-blue-600 hover:underline">
                <MessageCircle className="h-4 w-4 shrink-0" /> Message us on WhatsApp
              </a>
            </li>
            <li className="flex items-start gap-2 text-gray-700">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <span>
                <span className="block text-xs text-gray-500">Business hours</span>
                {SUPPORT_HOURS_LABEL}
              </span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-gray-500">
            You can also reach us from <Link to="/help" className="font-medium text-blue-600 hover:underline">Help &amp; Support</Link>.
          </p>
        </section>

        {officer && (
          <section aria-labelledby="contact-grievance" className="rounded-2xl border border-gray-200 p-4">
            <h2 id="contact-grievance" className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <ShieldCheck className="h-4 w-4 text-gray-500" /> Grievance Officer
            </h2>
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium text-gray-900" data-no-translate>{officer.name}</p>
              <a href={`mailto:${officer.email}?subject=${encodeURIComponent("Grievance")}`} className="flex items-center gap-2 font-medium text-blue-600 hover:underline">
                <Mail className="h-4 w-4 shrink-0" /> <span data-no-translate>{officer.email}</span>
              </a>
              <a href={`tel:${officer.phone}`} className="flex items-center gap-2 font-medium text-blue-600 hover:underline">
                <Phone className="h-4 w-4 shrink-0" /> <span data-no-translate>{officer.phoneLabel}</span>
              </a>
              <p className="pt-1 text-gray-700">{`We acknowledge every grievance within ${officer.acknowledgeWithin} and resolve it within ${officer.resolveWithin}.`}</p>
              <p>
                <Link to="/grievance" className="text-xs font-medium text-blue-600 hover:underline">How to raise a grievance</Link>
              </p>
            </div>
          </section>
        )}

        <LegalFooter />
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default Contact;
