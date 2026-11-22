-- Cosora-Admin review 2026-11-22, Medium batch 2 (AR-M22 to AR-M41).
-- Plan: documentation/admin-review-medium2-plan-2026-11-22.md. Applies after 20261122110000 (Medium batch 1).

-- ── AR-M25 Account search uses indexes for names and emails ──────────────────────────────────────────────────────
-- admin_profile_search matches `ilike '%term%'` on full_name and email; trigram indexes serve both.
create index if not exists profiles_full_name_trgm_idx on public.profiles using gin (full_name extensions.gin_trgm_ops);
create index if not exists profiles_email_trgm_idx on public.profiles using gin (email extensions.gin_trgm_ops);

-- ── AR-M28 Customers is rebuilt by a job every 10 minutes, never inside a page request ───────────────────────────
-- Mitra, 2026-11-22: "Add a 10-minute job". The page used to rebuild the materialized view on open, under the API's
-- 8-second timeout, and showed nothing when that failed. The job records each attempt and its error.
alter table admin.customer_summary_meta
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text;

create or replace function admin.customer_summary_rebuild()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- One rebuild at a time: a run that finds the last one still going leaves it be.
  if not pg_try_advisory_xact_lock(hashtext('admin_customer_refresh')) then
    return;
  end if;
  update admin.customer_summary_meta set last_attempt_at = now() where singleton;
  begin
    refresh materialized view concurrently admin.customer_summary;
    update admin.customer_summary_meta set refreshed_at = now(), last_error = null where singleton;
  exception when others then
    update admin.customer_summary_meta set last_error = left(sqlerrm, 500) where singleton;
  end;
end
$function$;
revoke all on function admin.customer_summary_rebuild() from public, anon, authenticated;

-- What the page reads: when the data was built, and whether the last attempt failed. It no longer rebuilds; the
-- released app still calls it on open and reads refreshed_at, which keeps working.
create or replace function public.admin_customer_refresh()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  m record;
begin
  if not admin.customers_can_read() then
    raise exception 'not authorized: customers are for super admins, support and finance' using errcode = '42501';
  end if;
  select x.refreshed_at, x.last_attempt_at, x.last_error into m from admin.customer_summary_meta x;
  return jsonb_build_object('refreshed', false, 'refreshed_at', m.refreshed_at, 'reason', 'scheduled',
                            'last_attempt_at', m.last_attempt_at, 'last_error', m.last_error, 'every_minutes', 10);
end
$function$;

select cron.schedule('customer-summary-refresh', '*/10 * * * *', $$select admin.customer_summary_rebuild()$$);

-- ── AR-M29 Admin Log's list of admins reads the index, not the whole log ─────────────────────────────────────────
-- A loose index scan over audit_log_actor_idx (actor_id, at desc): one probe per actor, then that actor's newest row
-- for the name and role shown. `entries` isn't shown anywhere and needed a full count, so it is null now.
create or replace function public.admin_audit_log_actors()
returns table(actor_id uuid, actor_name text, actor_role admin_role_type, entries bigint, last_at timestamp with time zone)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'manager'), false) then
    raise exception 'not authorized: the Admin Log requires the super_admin or manager role'
      using errcode = '42501';
  end if;
  return query
    with recursive ids(id) as (
      (select l.actor_id from admin.audit_log l where l.actor_id is not null order by l.actor_id limit 1)
      union all
      select (select l.actor_id from admin.audit_log l where l.actor_id > ids.id order by l.actor_id limit 1)
        from ids where ids.id is not null
    )
    select ids.id, last.actor_name, last.actor_role, null::bigint, last.at
      from ids
      cross join lateral (
        select l.actor_name, l.actor_role, l.at from admin.audit_log l
         where l.actor_id = ids.id order by l.at desc limit 1
      ) last
     where ids.id is not null;
end;
$function$;

-- ── AR-M32 The chats list is ordered by an index ─────────────────────────────────────────────────────────────────
create index if not exists conversations_last_message_idx on public.conversations (last_message_at desc nulls last, id desc);

-- ── AR-M31 The requirement review queue pages instead of stopping at 200 ─────────────────────────────────────────
-- Same rows as admin_rfq_submissions, a page at a time: pending oldest first by created_at, decided newest first by
-- reviewed_at (created_at when unstamped); keyset on (sort_at, id) so equal times are never skipped.
create or replace function public.admin_rfq_submissions_page(p_state text, p_after_at timestamptz, p_after_id uuid,
                                                             p_limit integer)
returns table(id uuid, buyer_id uuid, buyer_name text, buyer_phone_unverified boolean, title text, product_name text,
              quantity integer, budget_min numeric, budget_max numeric, description text, images text[], category text,
              attributes jsonb, state text, reason_label text, buyer_message text, review_note text,
              reviewed_at timestamp with time zone, reviewer_name text, rfq_id uuid, created_at timestamp with time zone,
              sort_at timestamp with time zone)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_pending boolean := p_state = 'pending';
begin
  perform admin.require_rfq_reviewer();
  if p_state not in ('pending', 'approved', 'rejected') then
    raise exception 'Unknown state %', p_state using errcode = '22023';
  end if;
  return query
  select s.id, s.buyer_id, p.full_name,
         coalesce((select u.raw_app_meta_data ->> 'created_by' = 'otp-dev-verify' from auth.users u where u.id = s.buyer_id), false),
         s.title, s.product_name, s.quantity, s.budget_min, s.budget_max, s.description,
         coalesce(s.images, case when s.image is not null then array[s.image] end),
         c.name, s.attributes, s.state, rr.label, s.buyer_message, s.review_note, s.reviewed_at,
         rp.full_name, s.rfq_id, s.created_at, k.sort_at
    from public.rfq_submissions s
    cross join lateral (select case when v_pending then s.created_at else coalesce(s.reviewed_at, s.created_at) end as sort_at) k
    left join public.profiles p on p.id = s.buyer_id
    left join public.categories c on c.id = s.category_id
    left join admin.rfq_review_reasons rr on rr.id = s.reason_id
    left join public.profiles rp on rp.id = s.reviewed_by
   where s.state = p_state
     and (p_after_at is null
          or (v_pending and (k.sort_at, s.id) > (p_after_at, p_after_id))
          or (not v_pending and (k.sort_at, s.id) < (p_after_at, p_after_id)))
   order by case when v_pending then k.sort_at end asc, case when v_pending then s.id end asc,
            case when not v_pending then k.sort_at end desc, case when not v_pending then s.id end desc
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
end
$function$;
revoke all on function public.admin_rfq_submissions_page(text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.admin_rfq_submissions_page(text, timestamptz, uuid, integer) to authenticated;
create index if not exists rfq_submissions_state_created_idx on public.rfq_submissions (state, created_at, id);

-- ── AR-M36 Certificates read one status a page at a time ───────────────────────────────────────────────────────
create index if not exists certificate_orders_status_purchased_idx on public.certificate_orders (status, purchased_at, id);
