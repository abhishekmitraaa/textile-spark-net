import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { recordProductEnquiry } from "@/lib/queries/products";

/**
 * Enquiries a signed-out buyer started (2026-10-17). "Chat directly" on a listing counts an enquiry, which ranking
 * reads (weight 10), but only a signed-in account may count one (migration 20261017160000). A signed-out tap leads
 * to sign-in first, so the tap is kept here and counted only when the buyer, signed in, actually reaches that
 * seller's chat (/chats/<seller>) within a day. Every tap is kept (one per listing), so tapping A then B and
 * chatting with both counts both; signing in for something else counts nothing (code review 2026-10-17: it counted
 * whatever was last tapped on any sign-in). The server still decides: once per account, listing and day, never the
 * seller's own.
 */
const KEY = "cosora.pendingEnquiries";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_KEPT = 10;

interface Pending {
  productId: string;
  vendorId: string;
  at: number;
}

function read(): Pending[] {
  try {
    const list = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Pending[];
    const now = Date.now();
    return Array.isArray(list)
      ? list.filter((p) => typeof p?.productId === "string" && typeof p?.vendorId === "string" && now - p.at < MAX_AGE_MS)
      : [];
  } catch {
    return [];
  }
}

function write(list: Pending[]): void {
  try {
    if (list.length) sessionStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_KEPT)));
    else sessionStorage.removeItem(KEY);
  } catch {
    // private mode: the enquiry just isn't counted
  }
}

export function rememberPendingEnquiry(productId: string, vendorId: string): void {
  write([...read().filter((p) => p.productId !== productId), { productId, vendorId, at: Date.now() }]);
}

/** Mounted once (App): counts the kept enquiries for the seller whose chat a signed-in buyer opens. */
export function PendingEnquiry(): null {
  const { user } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!user) return;
    const m = /^\/chats\/([^/?#]+)/.exec(pathname);
    if (!m) return;
    const vendorId = decodeURIComponent(m[1]);
    const list = read();
    const mine = list.filter((p) => p.vendorId === vendorId);
    if (!mine.length) return;
    write(list.filter((p) => p.vendorId !== vendorId));
    for (const p of mine) void recordProductEnquiry(p.productId).catch(() => {});
  }, [user, pathname]);
  return null;
}
