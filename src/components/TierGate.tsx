import { useEffect, useRef, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useVendorEntitlements, type EntitlementFeature } from "@/lib/queries/entitlements";

// What a vendor reads when a page isn't part of their plan (or isn't open to them yet).
const NOT_YOURS: Record<EntitlementFeature, { title: string; description: string }> = {
  lead_alerts: {
    title: "Lead alerts come with a paid plan",
    description: "Choose Basic or above to be told when a buyer's requirement suits what you sell.",
  },
  crm: { title: "The CRM comes with Silver and above", description: "Choose a plan that includes it to manage your leads here." },
  account_manager: { title: "An account manager comes with Silver and above", description: "Choose a plan that includes one." },
  international: { title: "Overseas requirements come with Gold and VIP", description: "Choose a plan that includes them." },
  realtime_alerts: { title: "Instant alerts come with Silver and above", description: "Choose a plan that includes them." },
};

/**
 * A route that belongs to a plan (subscriptions P6). The page renders only when the
 * database says the feature is this vendor's: the plan in force includes it and its
 * switch lists them. Anyone else is sent to the plans with a line saying why.
 *
 * This is navigation, not protection. Each page's data is refused by the database for a
 * vendor it doesn't belong to, whatever the browser shows.
 */
export function TierGate({ feature, children }: { feature: EntitlementFeature; children: ReactNode }) {
  const { user, loading } = useAuth();
  const { data, isLoading, isError } = useVendorEntitlements(user?.id);
  const allowed = Boolean(data?.features?.[feature]);
  const settled = !loading && Boolean(user) && !isLoading;
  const told = useRef(false);

  useEffect(() => {
    if (!settled || allowed || isError || told.current) return;
    told.current = true;
    toast(NOT_YOURS[feature].title, { description: NOT_YOURS[feature].description });
  }, [settled, allowed, isError, feature]);

  if (loading || (user && isLoading)) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-16" role="status" aria-label="Loading">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <Navigate to="/subscription#plans" replace />;
  return <>{children}</>;
}
