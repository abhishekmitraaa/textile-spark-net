import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Admin-editable FAQs (Phase 9, 2026-09-23). Written from Cosora-Admin's FAQs
// page through admin_faq_* RPCs. The apps only ever read them. Signed-out
// visitors read them too: faqs_select_active admits anon for active rows.
// Schema and rules: supabase/migrations/20260923144549_faqs_admin_editable.sql.
// ─────────────────────────────────────────────────────────────

export type FaqSurface = "buyer_help" | "seller_registration" | "subscription";

export interface FaqRow {
  id: string;
  category_label: string | null;
  question: string;
  answer: string;
  position: number;
}

/**
 * One surface's active FAQs, in admin order. `active` is filtered explicitly
 * even though the policy already requires it: an admin browsing the app would
 * otherwise be judged by whatever RLS lets them see, not by what buyers get.
 */
export function useFaqs(surface: FaqSurface) {
  return useQuery({
    queryKey: ["faqs", surface],
    queryFn: async (): Promise<FaqRow[]> => {
      const { data, error } = await supabase
        .from("faqs")
        .select("id, category_label, question, answer, position")
        .eq("surface", surface)
        .eq("active", true)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface FaqGroup {
  label: string;
  faqs: FaqRow[];
}

/**
 * Group rows by category_label. Groups come out in order of their first
 * (smallest-position) row, which is how the admin orders them. Rows without a
 * label fall into "General".
 */
export function groupFaqs(rows: FaqRow[]): FaqGroup[] {
  const groups = new Map<string, FaqRow[]>();
  for (const r of rows) {
    const label = r.category_label?.trim() || "General";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(r);
  }
  return Array.from(groups, ([label, faqs]) => ({ label, faqs }));
}
