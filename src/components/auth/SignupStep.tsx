import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { signupDoneFor } from "@/lib/signupDone";

/**
 * Wraps a buyer sign-up screen. Once the signed-in account has finished sign-up
 * in this tab (see lib/signupDone.ts), reaching the screen again, which only
 * the back button does, goes to Home instead, replacing the entry.
 */
export default function SignupStep({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const doneFor = signupDoneFor();
  // After a reload the session isn't known yet; don't flash the step meanwhile.
  if (doneFor && loading) return null;
  if (doneFor && doneFor === session?.user.id) return <Navigate to="/home/new-arrivals" replace />;
  return <>{children}</>;
}
