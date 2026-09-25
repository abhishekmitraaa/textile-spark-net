import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CurrencyCode, FxRates } from "@/lib/currency";

// public.fx_rates: one row, INR-based, refreshed daily by the fx-rates-refresh
// edge function (MPF-11). Public read, signed out too. The rates change once a
// working day, so an hour's cache is plenty; nothing reads it for a buyer who
// shows INR (the query is disabled then).
export function useFxRates(enabled: boolean) {
  return useQuery({
    queryKey: ["fx_rates"],
    queryFn: async (): Promise<FxRates | null> => {
      const { data, error } = await supabase
        .from("fx_rates")
        .select("rates, rates_date, updated_at")
        .eq("base_currency", "INR")
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        rates: data.rates as Partial<Record<CurrencyCode, number>>,
        ratesDate: data.rates_date,
        updatedAt: data.updated_at,
      };
    },
    enabled,
    staleTime: 60 * 60 * 1000,
  });
}
