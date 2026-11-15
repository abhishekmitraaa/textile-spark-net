import { Link } from "react-router-dom";
import { AlertCircle, Loader2, LogIn, Store } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SellerHomeBlockedState = "loading" | "signed-out" | "not-a-seller" | "error";

/**
 * Seller Home's states other than the page itself (SH-007, SH-016). Signed out, signed in without a seller account,
 * and a failed read each say what they are; none of them shows a number. The page's own loading (signed in, data on
 * its way) renders the page with skeletons instead.
 */
export function SellerHomeState({ state, onRetry }: { state: SellerHomeBlockedState; onRetry: () => void }) {
  if (state === "loading") {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="Loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const content = {
    "signed-out": {
      Icon: LogIn,
      title: "Sign in to see your business",
      body: "Your listings, leads, quotes and messages appear here once you're signed in.",
      action: <Button asChild><Link to="/login">Sign in</Link></Button>,
    },
    "not-a-seller": {
      Icon: Store,
      title: "Start selling on Cosora",
      body: "Register your business to list products, get buyer requirements and send quotes.",
      action: <Button asChild><Link to="/onboarding">Register as a seller</Link></Button>,
    },
    error: {
      Icon: AlertCircle,
      title: "We couldn't load your dashboard",
      body: "Check your connection and try again.",
      action: <Button onClick={onRetry}>Retry</Button>,
    },
  }[state];

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <content.Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">{content.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{content.body}</p>
      <div className="mt-5 flex justify-center">{content.action}</div>
    </div>
  );
}
