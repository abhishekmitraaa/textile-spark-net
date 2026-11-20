import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Whether the careers page is shown to this visitor (Mitra, 2026-11-20, review L-68: "Make a careers page but keep it
 * hidden for now"). The switch `careers_page` (migration 20261120130000), turned on in Cosora-Admin › Feature switches,
 * for everyone or for listed accounts. careers_page_on() answers signed-out visitors too. undefined while it loads;
 * a failed read is "off".
 */
export function useCareersPageOn(): boolean | undefined {
  const { user, loading } = useAuth();
  const query = useQuery({
    queryKey: ["careers_page_on", user?.id ?? "anon"],
    enabled: !loading,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("careers_page_on" as never);
      if (error) return false;
      return data === true;
    },
  });
  return query.data;
}
