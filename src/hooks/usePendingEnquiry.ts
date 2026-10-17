import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { recordProductEnquiry } from "@/lib/queries/products";

/**
 * An enquiry a signed-out buyer started (2026-10-17). "Chat directly" on a listing counts an enquiry, which ranking
 * reads, but only a signed-in account may count one (migration 20261017160000). A signed-out tap leads to sign-in
 * first; the enquiry is kept here and counted once they're in, if it's under a day old. The server still decides:
 * once per account, listing and day, never the seller's own.
 */
const KEY = "cosora.pendingEnquiry";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function rememberPendingEnquiry(productId: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ productId, at: Date.now() }));
  } catch {
    // private mode: the enquiry just isn't counted
  }
}

function takePendingEnquiry(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const { productId, at } = JSON.parse(raw) as { productId?: string; at?: number };
    return typeof productId === "string" && typeof at === "number" && Date.now() - at < MAX_AGE_MS ? productId : null;
  } catch {
    return null;
  }
}

/** Mounted once (App): counts a pending enquiry when someone signs in. */
export function PendingEnquiry(): null {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const productId = takePendingEnquiry();
    if (productId) void recordProductEnquiry(productId).catch(() => {});
  }, [user]);
  return null;
}
