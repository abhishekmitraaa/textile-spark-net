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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Seller ids are UUIDs, so the path is matched as one and never decoded: a malformed link (/chats/%E0%A4%A) must
// not throw here, as this runs on every page (security review 2026-10-17).
const CHAT_PATH = /^\/chats\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

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
      ? list
          .filter(
            (p) =>
              typeof p?.productId === "string" && UUID.test(p.productId) &&
              typeof p?.vendorId === "string" && UUID.test(p.vendorId) &&
              typeof p?.at === "number" && p.at <= now && now - p.at < MAX_AGE_MS,
          )
          .slice(-MAX_KEPT)
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
  if (!UUID.test(productId) || !UUID.test(vendorId)) return;
  write([...read().filter((p) => p.productId !== productId), { productId, vendorId, at: Date.now() }]);
}

/** Mounted once (App): counts the kept enquiries for the seller whose chat a signed-in buyer opens. */
export function PendingEnquiry(): null {
  const { user } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!user) return;
    const m = CHAT_PATH.exec(pathname);
    if (!m) return;
    const vendorId = m[1].toLowerCase();
    const list = read();
    const mine = list.filter((p) => p.vendorId.toLowerCase() === vendorId);
    if (!mine.length) return;
    write(list.filter((p) => p.vendorId.toLowerCase() !== vendorId));
    for (const p of mine) void recordProductEnquiry(p.productId).catch(() => {});
  }, [user, pathname]);
  return null;
}
