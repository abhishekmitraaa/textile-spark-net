import { useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import CosoraLogo from "@/components/CosoraLogo";
import { cn } from "@/lib/utils";

/** The buyer sign-up steps, in order (SignupStep wraps each). A new step goes here, or its counter is missing. */
const SIGNUP_STEPS = [
  "/auth/role-selection",
  "/auth/sub-role",
  "/auth/account-info",
  "/auth/interest-preference",
  "/auth/terms",
] as const;

/**
 * One header for every buyer sign-up step (review L-57): Back on the left (where the step has one), the Cosora logo in
 * the middle, and "Step N of 5" under it. The steps had four different headers and no counter. `dark` is for the Terms
 * step's dark page.
 */
export default function SignupHeader({ onBack, dark = false, className }: { onBack?: () => void; dark?: boolean; className?: string }) {
  const { pathname } = useLocation();
  const index = SIGNUP_STEPS.indexOf(pathname as (typeof SIGNUP_STEPS)[number]);
  return (
    <div className={cn("mb-6", className)}>
      <div className="relative flex justify-center">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className={cn(
              "absolute left-0 top-1/2 -translate-y-1/2 -ml-1.5 p-1.5 rounded-full",
              dark ? "hover:bg-white/10" : "hover:bg-gray-100",
            )}
          >
            <ArrowLeft className={cn("w-5 h-5", dark ? "text-white" : "text-gray-700")} />
          </button>
        )}
        <CosoraLogo height={30} variant={dark ? "white" : undefined} />
      </div>
      {index >= 0 && (
        <p className={cn("mt-2 text-center text-xs font-medium", dark ? "text-white/80" : "text-gray-500")}>
          {`Step ${index + 1} of ${SIGNUP_STEPS.length}`}
        </p>
      )}
    </div>
  );
}
