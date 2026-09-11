-- Rate limiting for the image-search edge function.
--
-- image-search is JWT-gated, but the anon key ships in the bundle, so in
-- practice anyone can call it — and every call is a billable gpt-4o-mini vision
-- request. Until now it had no limit at all (logged in
-- documentation/securityflags.md, 2026-09-10).
--
-- This deliberately REUSES the pattern embed-query already proved
-- (20260910160000): the same fixed-window UPSERT, the same global-before-per-IP
-- ordering, and the SAME TABLE, public.embed_query_rate_limit. Nothing about
-- embed-query changes — its function, its keys ('global', 'ip:<addr>') and its
-- rows are untouched. image-search's counters are namespaced under an 'img:'
-- prefix, so the two budgets can never collide:
--
--   'img:global'          total image-search calls, platform-wide
--   'img:ip:<addr>'       per claimed client IP (x-forwarded-for, spoofable)
--   'img:user:<uuid>'     per signed-in user (the JWT `sub` — signed, so NOT
--                         spoofable; the reason this bucket exists at all)
--
-- Two differences from embed-query, both on purpose:
--   * There is no cache in front of image-search, so the edge function calls
--     this on EVERY request that would reach OpenAI. embed-query only meters a
--     cache miss because a cache hit costs nothing; a photo always costs money.
--   * The budgets are much tighter (10 per IP/user per 10 minutes, 300 globally
--     per hour, versus 30 / 10,000 for embeddings). A vision call costs orders
--     of magnitude more than an embedding, and nobody searches by photo more
--     than a handful of times in ten minutes.
--
-- Housekeeping comes free: the existing nightly `prune-embed-rate-limit` job
-- deletes every row whose caller is not exactly 'global' and whose window is a
-- day old — which includes every 'img:*' row. 'img:global' being pruned when
-- stale is harmless; the next call recreates it.
--
-- Fail-open lives in the EDGE FUNCTION, not here — the same split embed-query
-- uses. This function raises on a real error; the caller's catch lets the
-- request through, because a limiter outage must not take image search down.

create or replace function public.image_search_rate_check(
  p_ip                 text,
  p_user_id            text    default null,
  p_ip_limit           integer default 10,
  p_ip_window_secs     integer default 600,
  p_global_limit       integer default 300,
  p_global_window_secs integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_count integer;
begin
  -- Global scope first, exactly as embed_query_rate_check: the ceiling that
  -- bounds total spend however many IPs or accounts the calls come from.
  insert into public.embed_query_rate_limit (caller, window_start, count)
  values ('img:global', now(), 1)
  on conflict (caller) do update
    set window_start = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_global_window_secs, 3600), 1))
          then now() else public.embed_query_rate_limit.window_start end,
        count = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_global_window_secs, 3600), 1))
          then 1 else public.embed_query_rate_limit.count + 1 end
  returning count into v_count;

  if v_count > greatest(coalesce(p_global_limit, 300), 1) then
    return false;
  end if;

  -- Per-IP scope. An absent address collapses to one shared 'img:ip:unknown'
  -- bucket — unattributable traffic shares a budget rather than each call
  -- getting a fresh one.
  insert into public.embed_query_rate_limit (caller, window_start, count)
  values ('img:ip:' || coalesce(nullif(trim(p_ip), ''), 'unknown'), now(), 1)
  on conflict (caller) do update
    set window_start = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 600), 1))
          then now() else public.embed_query_rate_limit.window_start end,
        count = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 600), 1))
          then 1 else public.embed_query_rate_limit.count + 1 end
  returning count into v_count;

  if v_count > greatest(coalesce(p_ip_limit, 10), 1) then
    return false;
  end if;

  -- Per-user scope, only when the caller has a user id. Same limit and window
  -- as per-IP. x-forwarded-for is client-supplied; a JWT `sub` is signed, so a
  -- signed-in caller rotating claimed IPs is still bounded here.
  if nullif(trim(p_user_id), '') is not null then
    insert into public.embed_query_rate_limit (caller, window_start, count)
    values ('img:user:' || trim(p_user_id), now(), 1)
    on conflict (caller) do update
      set window_start = case
            when public.embed_query_rate_limit.window_start
                 < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 600), 1))
            then now() else public.embed_query_rate_limit.window_start end,
          count = case
            when public.embed_query_rate_limit.window_start
                 < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 600), 1))
            then 1 else public.embed_query_rate_limit.count + 1 end
    returning count into v_count;

    if v_count > greatest(coalesce(p_ip_limit, 10), 1) then
      return false;
    end if;
  end if;

  return true;
end
$function$;

comment on function public.image_search_rate_check(text, text, integer, integer, integer, integer) is
  'Returns true if this caller may make one more image-search vision call. Fixed-window counters in embed_query_rate_limit under img:global, img:ip:<addr> and (when signed in) img:user:<uuid>; false if any budget is exhausted. Called by image-search on EVERY request that would reach OpenAI — there is no cache to exempt.';

-- Both grants, not just PUBLIC: Supabase's default privileges give every new
-- public function explicit anon/authenticated grants that revoking PUBLIC alone
-- never touches (see claude.md, "TWO independent grants"). Only the edge
-- function, holding the service-role key, may call this.
revoke execute on function public.image_search_rate_check(text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.image_search_rate_check(text, text, integer, integer, integer, integer) to service_role;
