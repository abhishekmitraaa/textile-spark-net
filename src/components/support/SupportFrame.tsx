import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Phone, LogIn, Clock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/contexts/UserRoleContext";
import { cn } from "@/lib/utils";
import { SUPPORT_EMAIL, SUPPORT_HOURS_LABEL, SUPPORT_PHONE, SUPPORT_PHONE_LABEL, supportMailto } from "@/lib/supportContact";
import { istLabel, type SupportStatus } from "@/lib/queries/support";

/**
 * The frame and shared states of the Help & Support pages (plan P3).
 *
 * The frame follows the role, as Chat.tsx does: the seller dashboard for sellers,
 * a back header and the bottom nav for everyone else (signed out included). Accent
 * colours follow the surface: brand-vendor on seller pages, brand-buyer otherwise.
 */
export function useSupportSide() {
  const { role } = useUserRole();
  const isSeller = role === "seller";
  return {
    isSeller,
    side: isSeller ? ("vendor" as const) : ("buyer" as const),
    accent: isSeller
      ? { bg: "bg-brand-vendor", hoverBg: "hover:bg-brand-vendor/90", text: "text-brand-vendor", soft: "bg-brand-vendor/10", ring: "focus-visible:ring-brand-vendor/30", border: "border-brand-vendor/30" }
      : { bg: "bg-brand-buyer", hoverBg: "hover:bg-brand-buyer/90", text: "text-brand-buyer", soft: "bg-brand-buyer/10", ring: "focus-visible:ring-brand-buyer/30", border: "border-brand-buyer/30" },
  };
}

export function SupportFrame({ title, children, back }: { title: string; children: ReactNode; back?: string }) {
  const { isSeller } = useSupportSide();
  const navigate = useNavigate();
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(back ?? "/help");
  };
  if (isSeller) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto pb-8">
          <div className="mb-4 flex items-center gap-2">
            <button onClick={goBack} aria-label="Back" className="-ml-1 p-1 rounded-full hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">{title}</h1>
          </div>
          {children}
        </div>
      </DashboardLayout>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={goBack} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">{title}</h1>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">{children}</div>
      <MobileBottomNav />
    </div>
  );
}

/** The two channels that always work: the phone line in hours, and email. */
export function CallOrEmail({ subject = "Help request", className }: { subject?: string; className?: string }) {
  const { accent } = useSupportSide();
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button asChild className={cn(accent.bg, accent.hoverBg, "text-white")}>
        <a href={`tel:${SUPPORT_PHONE}`}>
          <Phone className="w-4 h-4 mr-2" /> Call {SUPPORT_PHONE_LABEL}
        </a>
      </Button>
      <Button asChild variant="outline">
        <a href={supportMailto(subject)}>
          <Mail className="w-4 h-4 mr-2" /> Email {SUPPORT_EMAIL}
        </a>
      </Button>
    </div>
  );
}

/**
 * Shown wherever chat, callbacks or reports aren't open to this person yet (rollout).
 * `title` is a whole sentence, so it translates as one (word order differs by language).
 */
export function SupportUnavailable({ title, subject }: { title: string; subject?: string }) {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-600">Call or email us and the Cosora team will help.</p>
        <p className="text-xs text-gray-500">{SUPPORT_HOURS_LABEL}</p>
        <CallOrEmail subject={subject} />
      </CardContent>
    </Card>
  );
}

/** Signed out: sign in, or call, or email. `title` is a whole sentence. */
export function SignInForSupport({ title }: { title: string }) {
  const { accent } = useSupportSide();
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-600">Or call or email us. You don't need an account for that.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild className={cn(accent.bg, accent.hoverBg, "text-white")}>
            <Link to="/login"><LogIn className="w-4 h-4 mr-2" /> Sign in</Link>
          </Button>
        </div>
        <CallOrEmail />
      </CardContent>
    </Card>
  );
}

/** "We're open now" / "Closed now. We'll reply from Mon, 5 Oct, 10:00 IST." */
export function HoursBanner({ status }: { status: SupportStatus | undefined }) {
  if (!status) return null;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm",
        status.open_now ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-700",
      )}
      role="status"
    >
      <Clock className="w-4 h-4 shrink-0 mt-0.5" />
      <span>
        {status.open_now
          ? "We're open now. Cosora Support replies during support hours."
          : status.next_open_at
            ? `We're closed now. You can still write to us, and we'll reply from ${istLabel(status.next_open_at)}.`
            : "We're closed now. You can still write to us, and we'll reply when we're next open."}
      </span>
    </div>
  );
}
