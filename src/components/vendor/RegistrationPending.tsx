import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * /onboarding for an overseas seller whose registration is waiting for staff approval (2026-11-13). The form
 * would only be refused ("awaiting_approval"), so the seller is told where things stand instead.
 */
export function RegistrationPending() {
  return (
    <div className="vendor-shell flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-md space-y-5 text-center">
        <img src="/cosoravendorlogo.png" alt="Cosora For Sellers" className="mx-auto h-10 w-auto object-contain" draggable={false} />
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-vendor/10">
          <Clock className="h-8 w-8 text-brand-vendor" />
        </span>
        <h1 className="text-xl font-semibold text-brand-ink">Your registration is waiting for Cosora's approval</h1>
        <p className="text-sm text-brand-ink/80">
          Our team checks the documents you sent, usually within 3–5 days. We'll tell you here as soon as it's
          approved, or if anything needs changing. You can look around your seller pages meanwhile.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild className="rounded-full bg-brand-vendor text-white">
            <Link to="/kyc">View your documents</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/seller-home">Go to seller home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
