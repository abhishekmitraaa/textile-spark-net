-- Engagement events in one request (speed plan 4.6, 2026-11-27; documentation/speed-build-plan-2026-11-27.md §3.6).
--
-- Search results sent one log_engagement_event() call per card shown (27 on one page), each its own round trip to
-- Sydney. The app now queues events for up to 2 s and sends them together through this function.
--
-- It changes nothing about what is counted: each event goes through public.log_engagement_event() exactly as a single
-- call would, so every rule stays in one place (one counted view per visitor per listing or store per minute, 300
-- events per caller per 10 minutes, the per-seller caps for signed-out events; Mitra, 2026-10-20). It runs as the
-- caller (SECURITY INVOKER): log_engagement_event() reads the caller from the request as it always has. One event that
-- fails is skipped; the rest still count. At most 50 events per call.

begin;

create or replace function public.log_engagement_events(p_events jsonb)
returns integer
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_event jsonb;
  v_sent  integer := 0;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;
  for v_event in select e from jsonb_array_elements(p_events) with ordinality as t(e, n) where n <= 50 loop
    begin
      if jsonb_typeof(v_event) <> 'object' then
        continue;
      end if;
      perform public.log_engagement_event(
        v_event ->> 'p_event_type',
        nullif(v_event ->> 'p_vendor_id', '')::uuid,
        nullif(v_event ->> 'p_product_id', '')::uuid,
        nullif(v_event ->> 'p_ad_id', '')::uuid,
        v_event ->> 'p_session_id',
        v_event ->> 'p_source',
        v_event ->> 'p_query_text',
        v_event ->> 'p_cta_name'
      );
      v_sent := v_sent + 1;
    exception when others then
      -- A malformed or refused event is dropped, as a single call's failure was (telemetry is never load-bearing).
      null;
    end;
  end loop;
  return v_sent;
end
$function$;

revoke all on function public.log_engagement_events(jsonb) from public;
grant execute on function public.log_engagement_events(jsonb) to anon, authenticated;

do $check$
begin
  if (select prosecdef from pg_proc where oid = 'public.log_engagement_events(jsonb)'::regprocedure) then
    raise exception 'log_engagement_events self-check: must run as the caller (SECURITY INVOKER)';
  end if;
  if position('public.log_engagement_event(' in (select prosrc from pg_proc where oid = 'public.log_engagement_events(jsonb)'::regprocedure)) = 0 then
    raise exception 'log_engagement_events self-check: events must go through log_engagement_event()';
  end if;
end
$check$;

commit;
