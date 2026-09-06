-- Postgres grants EXECUTE to PUBLIC by default, so the original
-- `grant ... to service_role` on has_query_embedding left it callable by anon
-- as well. Low severity (it leaks only whether a term has been searched before)
-- but it has no business being on the public surface.
--
-- The revoke is also folded into 20260906180000_search_query_embedding_cache.sql
-- so a fresh deploy is correct in one step; this file exists to keep the applied
-- migration history reproducible. Idempotent either way.
revoke all on function public.has_query_embedding(text) from public, anon, authenticated;
grant execute on function public.has_query_embedding(text) to service_role;
