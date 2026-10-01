import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { GRIEVANCE_OFFICER } from "@/lib/grievance";
import NotFound from "./NotFound";

/**
 * /grievance (Help & Support P6c, D-15): who Cosora's Grievance Officer is and how to reach
 * them. Hidden until the officer is named in src/lib/grievance.ts: until then this is the
 * ordinary not-found page, so nothing half-finished is ever public.
 */
export default function Grievance() {
  const navigate = useNavigate();
  const officer = GRIEVANCE_OFFICER;
  if (!officer) return <NotFound />;

  const mailto = `mailto:${officer.email}?subject=${encodeURIComponent("Grievance")}`;
  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'Open Sans', Roboto, system-ui, sans-serif" }}>
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Grievance Officer</h1>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28 space-y-4">
        <Card>
          <CardContent className="p-5 space-y-2">
            <p className="text-base font-semibold text-gray-900" data-no-translate>{officer.name}</p>
            <p className="text-sm text-gray-600" data-no-translate>{officer.designation}</p>
            <a href={mailto} className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline">
              <Mail className="w-4 h-4" /> <span data-no-translate>{officer.email}</span>
            </a>
            {officer.address && (
              <p className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" /> <span data-no-translate>{officer.address}</span>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-3 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">How to raise a grievance</p>
            <p>Write to the Grievance Officer with the mobile number you sign in with, what happened, and any request number you have (it starts with CS-).</p>
            <p>{`We acknowledge every grievance within ${officer.acknowledgeWithin} and resolve it within ${officer.resolveWithin}.`}</p>
            <p>
              <Link to="/help" className="font-medium text-blue-600 hover:underline">For anything else, Help &amp; Support is faster.</Link>
            </p>
          </CardContent>
        </Card>
      </div>
      <MobileBottomNav />
    </div>
  );
}
