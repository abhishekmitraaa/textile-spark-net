-- Hardening pass over the search work, from `get_advisors(security)`.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, so the three TRIGGER
-- functions added for search were reachable at /rest/v1/rpc/<name> by anon.
-- Calling a trigger function directly errors ("can only be called as a
-- trigger"), so this was noise rather than a hole — but this codebase already
-- treats that as worth closing (see 20260801100327 and 20260905182854), and a
-- SECURITY DEFINER function on the public API surface should never be there by
-- accident.
revoke all on function public.sync_product_category_name()  from public, anon, authenticated;
revoke all on function public.enqueue_product_embedding()   from public, anon, authenticated;
revoke all on function public.cascade_category_rename()     from public, anon, authenticated;

-- match_products is the ranking engine, not the entry point. search_products is
-- what the client calls, and being SECURITY DEFINER it invokes match_products as
-- the definer — so the caller needs no grant of its own. Revoking it removes an
-- endpoint that let anyone POST an arbitrary 1536-float vector.
--
-- Verified through the real REST path with the public anon key: search_products
-- still returns results, match_products answers 42501 permission denied.
revoke all on function public.match_products(text, extensions.halfvec, int, double precision)
  from public, anon, authenticated;

-- Both helpers ran with a role-mutable search_path. They are pure and call only
-- pg_catalog builtins, but immutable_array_to_string feeds a GENERATED column
-- and normalise_search_query feeds a primary-key lookup, so neither should be
-- resolvable to anything a caller can influence. Verified: pinning the path is
-- accepted despite the generated-column dependency, and search_text survives.
alter function public.immutable_array_to_string(text[], text) set search_path = pg_catalog, public;
alter function public.normalise_search_query(text)            set search_path = pg_catalog, public;

-- Deliberately NOT changed, recorded so it is not "fixed" later by mistake:
--   * search_products / related_products / search_suggestions stay executable by
--     anon and authenticated. They are the buyer-facing search API and signed-out
--     buyers must be able to search. Each is SECURITY DEFINER *and* filters
--     status = 'live' internally, which is the only thing keeping drafts out.
--   * search_query_embeddings has RLS enabled with no policies. That is the
--     intent: deny everything, reachable only via SECURITY DEFINER / service_role.
--     The advisor reports it as INFO rls_enabled_no_policy; it is correct as is.
