import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Sample sellers (Mitra, 2026-11-24, option 1; migration 20261124120000): 28 stores that show how Cosora looks. The
 * database refuses chats, requirements and reviews to them (admin.refuse_sample_contact). The app reads their ids once
 * per visit (`sample_vendor_ids()`), labels their cards and pages, and never dials or opens a chat with one.
 * An unknown answer (loading, or before the migration) is "not a sample": nothing real is hidden.
 */
export function useSampleVendorIds(): ReadonlySet<string> {
  const { data } = useQuery({
    queryKey: ["sample_vendor_ids"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("sample_vendor_ids" as never);
      if (error) return [];
      return Array.isArray(data) ? (data as string[]) : [];
    },
  });
  return useMemo(() => new Set(data ?? []), [data]);
}

export function useIsSampleVendor(vendorId: string | null | undefined): boolean {
  const ids = useSampleVendorIds();
  return Boolean(vendorId) && ids.has(vendorId as string);
}

/**
 * Whether the app labels sample sellers and their listings. Off while Cosora isn't open to customers (Mitra,
 * 2026-11-24: "remove the sample listing from all the 280 posts ... will show how it will actually look"), so testers
 * see the site as a customer will. The contact guard still holds: no chat, call, requirement or review reaches a
 * sample seller. Every sample must be removed before launch (ToDo.md, securityflags.md); true puts the labels back.
 */
export const SAMPLES_LABELLED = false;

/** What a tap on Call or Chat says for a sample seller. */
export const SAMPLE_CONTACT_COPY = SAMPLES_LABELLED
  ? {
      title: "Sample listing",
      description: "This is a sample listing, shown to illustrate Cosora. Its seller can't be contacted.",
    }
  : {
      title: "Not taking enquiries yet",
      description: "This seller isn't taking calls or messages on Cosora yet.",
    };

/** A sample seller's card shows the sample tag in place of Call Now only while samples are labelled. */
export function useShowsSampleTag(vendorId: string | null | undefined): boolean {
  return useIsSampleVendor(vendorId) && SAMPLES_LABELLED;
}
