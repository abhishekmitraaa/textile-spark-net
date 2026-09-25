-- ─────────────────────────────────────────────────────────────
-- MPF-23: log_engagement_event() swallowed every error, so a rejected event
-- disappeared with no trace.
--
-- It ended in `exception when others then return;`. Phase 16 found an event whose
-- `source` wasn't in engagement_events_source_check: nothing was written and the
-- call returned OK. A client sending a wrong event type or source would
-- under-count vendors' views and clicks, with no error anywhere.
--
-- Now:
--   - a foreign-key failure (a product, ad or vendor id that doesn't exist) stays
--     quiet. That is junk a client can send, and the product/ad/vendor checks
--     above it already drop the common cases;
--   - anything else (a bad event type or source, or any unexpected error) is
--     recorded in admin.engagement_event_failures, one row per hour per error, with
--     a count and the last event type and source that caused it. The call still
--     returns normally: a page view must never fail because analytics did;
--   - admin_engagement_event_failures() reads it for Cosora-Admin's System Health
--     page, gated like admin_embedding_pipeline_health() (super_admin, vendor_ops).
--
-- The table is bounded: its key is (hour, error code, constraint), not anything a
-- client sends, and rows older than 30 days are removed as new ones arrive.
-- Everything else in the function is unchanged.
--
-- The column is error_code, not sqlstate: inside a PL/pgSQL exception handler
-- SQLSTATE is a special variable, so an INSERT naming a `sqlstate` column there
-- fails, and the rehearsal caught exactly that silent loss.
-- ─────────────────────────────────────────────────────────────

create table if not exists admin.engagement_event_failures (
  hour              timestamptz not null,
  error_code        text        not null,
  constraint_name   text        not null default '',
  count             integer     not null default 1,
  message           text,
  last_event_type   text,
  last_source       text,
  first_at          timestamptz not null default now(),
  last_at           timestamptz not null default now(),
  primary key (hour, error_code, constraint_name)
);

comment on table admin.engagement_event_failures is
  'Events log_engagement_event() could not record (MPF-23): one row per hour per error. Read through admin_engagement_event_failures().';

alter table admin.engagement_event_failures enable row level security;
revoke all on admin.engagement_event_failures from public, anon, authenticated;

create or replace function public.log_engagement_event(
  p_event_type text,
  p_vendor_id  uuid default null,
  p_product_id uuid default null,
  p_ad_id      uuid default null,
  p_session_id text default null,
  p_source     text default null,
  p_query_text text default null,
  p_cta_name   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor     uuid;
  v_state      text;
  v_constraint text;
  v_msg        text;
begin
  if p_event_type = 'product_view' and p_product_id is not null
     and not exists (select 1 from public.products
                     where id = p_product_id and status = 'live') then
    return;
  end if;

  if p_event_type in ('ad_impression', 'ad_click') and p_ad_id is not null
     and not exists (select 1 from public.advertisements
                     where id = p_ad_id and status = 'active') then
    return;
  end if;

  if p_product_id is not null then
    select vendor_id into v_vendor from public.products where id = p_product_id;
  elsif p_ad_id is not null then
    select vendor_id into v_vendor from public.advertisements where id = p_ad_id;
  end if;

  if v_vendor is null then
    v_vendor := p_vendor_id;
  end if;

  if v_vendor is null then
    return;
  end if;

  insert into public.engagement_events (
    event_type, vendor_id, product_id, ad_id, viewer_id, session_id,
    source, query_text, cta_name
  ) values (
    p_event_type, v_vendor, p_product_id, p_ad_id, auth.uid(),
    case when auth.uid() is null then p_session_id else null end,
    p_source, p_query_text, p_cta_name
  );
exception
  when foreign_key_violation then
    return;
  when others then
    get stacked diagnostics v_state = returned_sqlstate,
                            v_constraint = constraint_name,
                            v_msg = message_text;
    begin
      insert into admin.engagement_event_failures as f
        (hour, error_code, constraint_name, message, last_event_type, last_source)
      values
        (date_trunc('hour', now()), v_state, coalesce(v_constraint, ''), left(v_msg, 300),
         left(p_event_type, 60), left(p_source, 60))
      on conflict (hour, error_code, constraint_name) do update
        set count = f.count + 1,
            last_at = now(),
            message = excluded.message,
            last_event_type = excluded.last_event_type,
            last_source = excluded.last_source;
      delete from admin.engagement_event_failures where hour < now() - interval '30 days';
    exception when others then
      null;  -- recording the failure must not fail the page either
    end;
    return;
end;
$$;

create or replace function public.admin_engagement_event_failures(p_days integer default 7)
returns table (
  hour timestamptz, error_code text, constraint_name text, count integer, message text,
  last_event_type text, last_source text, first_at timestamptz, last_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops'), false) then
    raise exception 'not authorized: viewing refused analytics events requires the super_admin or vendor_ops role'
      using errcode = '42501';
  end if;
  return query
    select f.hour, f.error_code, f.constraint_name, f.count, f.message,
           f.last_event_type, f.last_source, f.first_at, f.last_at
      from admin.engagement_event_failures f
     where f.hour >= date_trunc('hour', now()) - make_interval(days => greatest(coalesce(p_days, 7), 1))
     order by f.last_at desc
     limit 500;
end;
$$;

revoke all on function public.admin_engagement_event_failures(integer) from public, anon, authenticated;
grant execute on function public.admin_engagement_event_failures(integer) to authenticated;

-- Self-check.
do $check$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc
   where proname = 'log_engagement_event' and pronamespace = 'public'::regnamespace;
  if v_src !~ 'when foreign_key_violation then' or v_src !~ 'admin\.engagement_event_failures' then
    raise exception 'self-check: log_engagement_event does not record failures';
  end if;
  if has_function_privilege('anon', 'public.admin_engagement_event_failures(integer)', 'execute') then
    raise exception 'self-check: anon can call admin_engagement_event_failures';
  end if;
  if not has_function_privilege('anon', 'public.log_engagement_event(text, uuid, uuid, uuid, text, text, text, text)', 'execute') then
    raise exception 'self-check: log_engagement_event lost its anon grant (signed-out views would stop recording)';
  end if;
  if has_table_privilege('authenticated', 'admin.engagement_event_failures', 'select') then
    raise exception 'self-check: clients can read admin.engagement_event_failures';
  end if;
end
$check$;
