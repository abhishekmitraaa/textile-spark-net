import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────────
// "Delete my account" (Phase 2 of the My Profile brief, 2026-09-23).
//
// sendDeletionCode() → the `account-deletion` edge function sends a 6-digit
// code → confirmDeletion(code) starts a 14-day cooling-off → the daily
// account-deletion-sweep anonymizes the account. cancelDeletion() stops it at
// any point before the sweep.
//
// The code goes to the confirmed email on auth.users, or, for an account with
// no usable email and a confirmed phone, to that number on WhatsApp (Phase 18,
// MPF-6). The database picks the channel when the request opens and keeps it on
// the request row.
//
// Every write is a server function. The client holds SELECT on its own request
// row and nothing else, so a stolen session cannot skip the code or the 14 days
// by writing the row itself. Schema, rules and the reasons below:
// supabase/migrations/20260923115839_account_deletion_requests.sql and
// 20260923213225_account_deletion_whatsapp_channel.sql.
// ─────────────────────────────────────────────────────────────

export type OpenDeletionStatus = "pending_confirmation" | "cooling_off";
export type DeletionChannel = "email" | "whatsapp";

export interface OpenDeletionRequest {
  id: string;
  status: OpenDeletionStatus;
  channel: DeletionChannel;
  requestedAt: string;
  scheduledFor: string | null;
  codeExpiresAt: string | null;
}

/**
 * The signed-in user's open request, if any. Filtered on user_id explicitly:
 * the SELECT policy also admits support admins, so an RLS-only read would hand
 * an admin someone else's row (see claude.md, "A 'my N' count filters on the
 * owner column").
 */
export function useOpenDeletionRequest() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["account_deletion", user?.id],
    queryFn: async (): Promise<OpenDeletionRequest | null> => {
      const { data, error } = await supabase
        .from("account_deletion_requests")
        .select("id, status, channel, requested_at, scheduled_for, code_expires_at")
        .eq("user_id", user!.id)
        .in("status", ["pending_confirmation", "cooling_off"])
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        status: data.status as OpenDeletionStatus,
        channel: data.channel === "whatsapp" ? "whatsapp" : "email",
        requestedAt: data.requested_at,
        scheduledFor: data.scheduled_for,
        codeExpiresAt: data.code_expires_at,
      };
    },
    enabled: Boolean(user?.id),
    // A deletion scheduled or cancelled on another device must show at once.
    staleTime: 0,
  });
}

/**
 * Every answer the server can give, flattened. A flat shape rather than a
 * discriminated union because this project compiles with `strict: false`, where
 * union narrowing is unreliable (see the note on CallBlock in calls.ts).
 */
export interface DeletionResult {
  status: string;
  /** Where the code went, or would have gone: on sent, not_configured and send_failed. */
  channel?: string;
  to?: string;
  expires_at?: string;
  scheduled_for?: string;
  retry_after_seconds?: number;
  attempts_left?: number;
  message?: string;
}

export async function sendDeletionCode(): Promise<DeletionResult> {
  const { data, error } = await supabase.functions.invoke("account-deletion", { body: { action: "request" } });
  if (error) throw error;
  return (data ?? { status: "error", message: "No answer from the server." }) as DeletionResult;
}

export async function confirmDeletion(code: string): Promise<DeletionResult> {
  const { data, error } = await supabase.rpc("confirm_account_deletion", { p_code: code });
  if (error) throw error;
  return data as unknown as DeletionResult;
}

export async function cancelDeletion(): Promise<DeletionResult> {
  const { data, error } = await supabase.rpc("cancel_account_deletion");
  if (error) throw error;
  return data as unknown as DeletionResult;
}

/** "7 October 2026", in IST (claude.md, Locale). */
export function formatDeletionDate(iso: string | null | undefined): string {
  if (!iso) return "the scheduled date";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
  });
}

/**
 * Where the code will probably go, for the wording BEFORE anything is sent. The
 * same rule as account_deletion_channels() in the database, which decides: a
 * confirmed email that isn't a ".invalid" placeholder, else a confirmed phone.
 * Null when the account has neither (the server will answer no_contact).
 */
export function expectedDeletionChannel(user: User | null | undefined): DeletionChannel | null {
  if (!user) return null;
  if (user.email && !user.email.endsWith(".invalid") && user.email_confirmed_at) return "email";
  if (user.phone && user.phone_confirmed_at) return "whatsapp";
  return null;
}

export interface DeletionCopy { title: string; description?: string }

const SUPPORT = "hello@cosora.in";

/**
 * The sentence for any non-success answer from sendDeletionCode() or
 * confirmDeletion(). One table, so the Help card and anything else that grows a
 * delete button word each reason the same way.
 */
export function deletionCopy(r: DeletionResult): DeletionCopy {
  switch (r.status) {
    case "not_configured":
      return r.channel === "whatsapp"
        ? { title: "Account deletion isn't available online yet", description: `Your account has no email, so we confirm over WhatsApp, and that isn't set up yet. Write to ${SUPPORT} and we'll delete it for you.` }
        : { title: "Account deletion isn't available online yet", description: `Email confirmation isn't set up. Write to ${SUPPORT} and we'll delete it for you.` };
    case "vendor":
      return { title: "Seller accounts can't be deleted here", description: `Your account has a store. Write to ${SUPPORT} to close it.` };
    case "admin":
      return { title: "Admin accounts can't be deleted here", description: "Ask a super admin to remove your admin access first." };
    case "suspended":
      return { title: "This account can't be deleted right now", description: `It is suspended. Write to ${SUPPORT}.` };
    case "no_contact":
    case "no_email": // the database's name for it before Phase 18
      return { title: "We can't send you a code", description: `Your account has no confirmed email address or phone number. Write to ${SUPPORT}.` };
    case "deleted":
      return { title: "This account has already been deleted" };
    case "not_found":
      return { title: "We couldn't find your account", description: "Sign out, sign back in and try again." };
    case "already_scheduled":
      return { title: "Your account is already scheduled for deletion", description: `On ${formatDeletionDate(r.scheduled_for)}. You can cancel it from your profile.` };
    case "rate_limited":
      return { title: "A code was just sent", description: `Wait ${r.retry_after_seconds ?? 60} seconds before asking for another.` };
    case "too_many_codes":
      return { title: "Too many codes sent for this request", description: "Try again tomorrow." };
    case "invalid":
      return { title: "That code isn't right", description: `${r.attempts_left ?? 0} ${r.attempts_left === 1 ? "attempt" : "attempts"} left.` };
    case "locked":
      return { title: "Too many wrong codes", description: "Send a new code and try again." };
    case "expired":
      return { title: "That code has expired", description: "Send a new code and try again." };
    case "no_code":
      return { title: "There is no live code", description: "Send a new code and try again." };
    case "no_request":
      return { title: "This request is no longer open", description: "Start again from “Delete my account”." };
    case "send_failed":
      return { title: r.channel === "whatsapp" ? "We couldn't send the WhatsApp message" : "We couldn't send the email", description: r.message };
    default:
      return { title: "Something went wrong", description: r.message };
  }
}
