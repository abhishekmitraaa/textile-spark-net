import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteConfig } from "@/lib/siteConfig";
import { useFeatureFlag } from "@/lib/queries/featureFlags";
import { isShowable, parseSearchTrends, type SearchTrends } from "@/lib/searchTrends";

// ─────────────────────────────────────────────────────────────
// /search's trending list (lib/searchTrends.ts says what it is).
//
// READ PATH, for 10k people at once: the list rides in site-config/site.json, which every page already
// loads from the Storage CDN, so with the `search_trending` switch on for everyone this adds no request
// at all. Only while the switch is on for listed accounts alone does one of those accounts ask
// trending_searches() itself (its own switch answer comes from my_feature_flags, which the app loads
// anyway). Everyone else gets nothing and makes no call.
// ─────────────────────────────────────────────────────────────

/** How long a list fetched by a listed account counts as fresh. It changes once a night. */
export const SEARCH_TRENDS_STALE_TIME_MS = 30 * 60_000;

async function fetchTrendingSearches(): Promise<SearchTrends | null> {
  const { data, error } = await supabase.rpc("trending_searches");
  if (error) {
    // Before the migration the function doesn't exist: no list.
    if (error.code === "PGRST202") return null;
    throw error;
  }
  return parseSearchTrends(data);
}

/** The list to show, or null (nothing qualifies, switched off, or not yet loaded: see `loading`). */
export function useTrendingSearches(): { trends: SearchTrends | null; loading: boolean } {
  const config = useSiteConfig();
  const { user } = useAuth();
  const listed = useFeatureFlag("search_trending");
  const fromFile = config.data?.searchTrends ?? null;
  const askServer = Boolean(user) && listed === true && !fromFile?.public && !config.isLoading;
  const own = useQuery({
    queryKey: ["search-trends", user?.id ?? null],
    queryFn: fetchTrendingSearches,
    enabled: askServer,
    staleTime: SEARCH_TRENDS_STALE_TIME_MS,
    retry: 1,
  });
  const candidate = fromFile?.public ? fromFile : askServer ? own.data ?? null : null;
  return {
    trends: isShowable(candidate) ? candidate : null,
    loading: config.isLoading || (askServer && own.isLoading),
  };
}
