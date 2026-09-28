-- Admin completion, Phase 6 (Mitra, 2026-09-28): Customers, from the real tables.
--
-- Cosora-Admin's Customers page showed a dev-seed fixture: there was no tag table, no
-- last-active time and no per-account spend. This adds them:
--
--   admin.customer_summary        a materialized view, one row per customer account
--   admin.customer_rows           the same rows with the six segments, computed at read
--                                 time from the stored times so they're never stale
--   admin.customer_tags           the tag vocabulary (lowercase, 1-32 of a-z 0-9 -)
--   admin.profile_tags            which account carries which tag
--   admin_customer_refresh()      refreshes the summary, at most once every 10 minutes,
--                                 when an admin opens the page or presses Refresh. No
--                                 scheduled job (Mitra's rule on new jobs).
--   admin_customer_list(...)      filtered, sorted, paged rows with their tags
--   admin_customer_segment_counts()
--   admin_customer_tags(), admin_customer_tag_create/_delete/_apply/_remove
--
-- Who: super_admin, support and finance_admin read; super_admin and support write tags
-- (Cosora-Admin roles.ts "customers").
--
-- Who counts as a customer: every account that isn't deleted, except active Cosora staff
-- (admin.admin_users). A "vendor" has a vendor_profiles row; everyone else is a buyer.
-- Spend is what the account paid Cosora, in paise: paid subscription invoices (with GST)
-- and paid ad orders, less processed refunds. Buyers pay nothing today, so theirs is 0.

-- ── 1. The summary ──────────────────────────────────────────────────────────
create materialized view if not exists admin.customer_summary as
with
acct as (
  select p.id,
         p.created_at                     as joined_at,
         p.full_name,
         p.email,
         p.account_status::text           as account_status,
         v.id is not null                 as is_vendor,
         v.brand_name,
         v.city                           as vendor_city,
         b.company,
         b.display_name,
         coalesce(b.city, b.business_city) as buyer_city,
         u.last_sign_in_at
    from public.profiles p
    left join public.vendor_profiles v on v.id = p.id
    left join public.buyer_profiles b on b.id = p.id
    left join auth.users u on u.id = p.id
   where p.account_status::text <> 'deleted'
     and not exists (select 1 from admin.admin_users a where a.id = p.id and a.is_active)
),
msg  as (select m.sender_id as id, max(m.created_at) as last_at
           from public.messages m group by 1),
conv as (select x.id, count(*) as n
           from (select c.user_a as id from public.conversations c
                 union all
                 select c.user_b from public.conversations c) x
          group by 1),
rfq  as (select r.buyer_id as id, count(*) as n, max(r.created_at) as last_at
           from public.rfqs r group by 1),
quo  as (select q.vendor_id as id, count(*) as n, max(q.created_at) as last_at
           from public.quotes q group by 1),
inv  as (select i.vendor_id as id,
                coalesce(sum((i.amount + coalesce(i.gst_amount, 0))::bigint * 100)
                           filter (where i.status = 'paid'), 0) as paid,
                coalesce(sum(coalesce(i.refunded_amount::bigint, (i.amount + coalesce(i.gst_amount, 0))::bigint * 100))
                           filter (where i.refund_status = 'processed'), 0) as refunded,
                count(*) filter (where i.status = 'paid') as n
           from public.subscription_invoices i group by 1),
ads  as (select o.vendor_id as id,
                coalesce(sum(o.amount::bigint) filter (where o.status = 'paid'), 0) as paid,
                count(*) filter (where o.status = 'paid') as n
           from public.ad_orders o group by 1)
select a.id,
       case when a.is_vendor then 'vendor' else 'buyer' end                   as kind,
       coalesce(nullif(btrim(case when a.is_vendor then a.brand_name end), ''),
                nullif(btrim(a.company), ''),
                nullif(btrim(a.full_name), ''),
                nullif(btrim(a.display_name), ''),
                'Unnamed account')                                            as name,
       a.email,
       coalesce(nullif(btrim(case when a.is_vendor then a.vendor_city end), ''),
                nullif(btrim(a.buyer_city), ''))                              as city,
       a.account_status,
       a.joined_at,
       a.last_sign_in_at,
       -- A message, an RFQ or a quote: what "active" and "at risk" read.
       greatest(msg.last_at, rfq.last_at, quo.last_at)                        as last_engaged_at,
       -- Anything, a sign-in included: what "dormant" and "last seen" read.
       greatest(a.last_sign_in_at, msg.last_at, rfq.last_at, quo.last_at)     as last_active_at,
       (coalesce(conv.n, 0) + coalesce(rfq.n, 0) + coalesce(quo.n, 0))::int   as interactions,
       (coalesce(inv.paid, 0) + coalesce(ads.paid, 0) - coalesce(inv.refunded, 0))::bigint as spend_paise,
       (coalesce(inv.n, 0) + coalesce(ads.n, 0))::int                         as payments
  from acct a
  left join msg  on msg.id  = a.id
  left join conv on conv.id = a.id
  left join rfq  on rfq.id  = a.id
  left join quo  on quo.id  = a.id
  left join inv  on inv.id  = a.id
  left join ads  on ads.id  = a.id
with data;

-- REFRESH ... CONCURRENTLY needs a unique index; the others serve the sorts.
create unique index if not exists customer_summary_id_idx on admin.customer_summary (id);
create index if not exists customer_summary_spend_idx on admin.customer_summary (spend_paise desc, interactions desc);
create index if not exists customer_summary_active_idx on admin.customer_summary (last_active_at desc nulls last);

create table if not exists admin.customer_summary_meta (
  singleton    boolean primary key default true check (singleton),
  refreshed_at timestamptz not null
);
insert into admin.customer_summary_meta (singleton, refreshed_at) values (true, now())
on conflict (singleton) do update set refreshed_at = excluded.refreshed_at;
alter table admin.customer_summary_meta enable row level security;

-- The six segments, one definition, read by both RPCs. A customer can be in several.
create or replace view admin.customer_rows as
select s.*,
       s.joined_at >= now() - interval '30 days'                                   as seg_new,
       s.last_engaged_at >= now() - interval '30 days'                             as seg_active,
       s.spend_paise >= 2500000                                                    as seg_high_value,
       s.last_engaged_at <  now() - interval '60 days'
         and s.last_engaged_at >= now() - interval '120 days'                      as seg_at_risk,
       coalesce(s.last_active_at, s.joined_at) < now() - interval '120 days'       as seg_dormant,
       s.payments = 0                                                              as seg_never_transacted
  from admin.customer_summary s;

revoke all on admin.customer_summary, admin.customer_rows, admin.customer_summary_meta from public, anon, authenticated;

-- ── 2. Tags ───────────────────────────────────────────────────────────────────
create table if not exists admin.customer_tags (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique check (label ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists admin.profile_tags (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tag_id     uuid not null references admin.customer_tags(id) on delete cascade,
  applied_by uuid,
  applied_at timestamptz not null default now(),
  unique (profile_id, tag_id)
);
create index if not exists profile_tags_tag_idx on admin.profile_tags (tag_id);
alter table admin.customer_tags enable row level security;
alter table admin.profile_tags enable row level security;
revoke all on admin.customer_tags, admin.profile_tags from public, anon, authenticated;

drop trigger if exists trg_admin_audit on admin.customer_tags;
create trigger trg_admin_audit after insert or update or delete on admin.customer_tags
  for each row execute function admin.audit_row_change('created_by');
drop trigger if exists trg_admin_audit on admin.profile_tags;
create trigger trg_admin_audit after insert or update or delete on admin.profile_tags
  for each row execute function admin.audit_row_change('applied_by');

-- ── 3. RPCs ───────────────────────────────────────────────────────────────────
-- Gates in one place each: read, and write.
-- Plain (invoker) helpers: only the definer RPCs below call them.
create or replace function admin.customers_can_read()
returns boolean language sql stable set search_path = '' as $function$
  select coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'support', 'finance_admin']::public.admin_role_type[]), false);
$function$;
create or replace function admin.customers_can_write()
returns boolean language sql stable set search_path = '' as $function$
  select coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'support']::public.admin_role_type[]), false);
$function$;

create or replace function public.admin_customer_refresh()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_at timestamptz;
begin
  if not admin.customers_can_read() then
    raise exception 'not authorized: customers are for super admins, support and finance' using errcode = '42501';
  end if;
  select m.refreshed_at into v_at from admin.customer_summary_meta m;
  if v_at > now() - interval '10 minutes' then
    return jsonb_build_object('refreshed', false, 'refreshed_at', v_at, 'reason', 'fresh');
  end if;
  -- One refresh at a time; a second caller gets the current data rather than a queue.
  if not pg_try_advisory_xact_lock(hashtext('admin_customer_refresh')) then
    return jsonb_build_object('refreshed', false, 'refreshed_at', v_at, 'reason', 'busy');
  end if;
  refresh materialized view concurrently admin.customer_summary;
  update admin.customer_summary_meta set refreshed_at = now() where singleton;
  return jsonb_build_object('refreshed', true, 'refreshed_at', now());
end
$function$;

create or replace function public.admin_customer_segment_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v jsonb;
begin
  if not admin.customers_can_read() then
    raise exception 'not authorized: customers are for super admins, support and finance' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'customers',        count(*),
           'vendors',          count(*) filter (where c.kind = 'vendor'),
           'buyers',           count(*) filter (where c.kind = 'buyer'),
           'new',              count(*) filter (where c.seg_new),
           'active',           count(*) filter (where c.seg_active),
           'high_value',       count(*) filter (where c.seg_high_value),
           'at_risk',          count(*) filter (where c.seg_at_risk),
           'dormant',          count(*) filter (where c.seg_dormant),
           'never_transacted', count(*) filter (where c.seg_never_transacted),
           'spend_paise',      coalesce(sum(c.spend_paise), 0),
           'refreshed_at',     (select m.refreshed_at from admin.customer_summary_meta m))
    into v
    from admin.customer_rows c;
  return v;
end
$function$;

create or replace function public.admin_customer_list(
  p_kind    text default null,
  p_segment text default null,
  p_tag     uuid default null,
  p_search  text default null,
  p_sort    text default 'spend',
  p_offset  int  default 0,
  p_limit   int  default 50)
returns table(id uuid, kind text, name text, email text, city text, account_status text,
              joined_at timestamptz, last_active_at timestamptz, interactions int,
              spend_paise bigint, payments int, segments text[], tags jsonb,
              total_count bigint, total_spend_paise bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_limit  int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int  := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_sort   text := coalesce(p_sort, 'spend');
  v_search text := nullif(btrim(p_search), '');
  v_like   text;
begin
  if not admin.customers_can_read() then
    raise exception 'not authorized: customers are for super admins, support and finance' using errcode = '42501';
  end if;
  if p_kind is not null and p_kind not in ('buyer', 'vendor') then
    raise exception 'unknown kind %', p_kind using errcode = '22023';
  end if;
  if p_segment is not null and p_segment not in ('new', 'active', 'high_value', 'at_risk', 'dormant', 'never_transacted') then
    raise exception 'unknown segment %', p_segment using errcode = '22023';
  end if;
  if v_sort not in ('spend', 'recent', 'joined', 'name') then
    raise exception 'unknown sort %', v_sort using errcode = '22023';
  end if;
  if v_search is not null then
    -- Literal text: % and _ match themselves.
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    with f as (
      select c.*
        from admin.customer_rows c
       where (p_kind is null or c.kind = p_kind)
         and (p_segment is null
              or (p_segment = 'new' and c.seg_new)
              or (p_segment = 'active' and c.seg_active)
              or (p_segment = 'high_value' and c.seg_high_value)
              or (p_segment = 'at_risk' and c.seg_at_risk)
              or (p_segment = 'dormant' and c.seg_dormant)
              or (p_segment = 'never_transacted' and c.seg_never_transacted))
         and (p_tag is null or exists (select 1 from admin.profile_tags pt where pt.profile_id = c.id and pt.tag_id = p_tag))
         and (v_search is null
              or c.name ilike v_like
              or c.email ilike v_like
              or c.city ilike v_like
              or exists (select 1 from admin.profile_tags pt join admin.customer_tags t on t.id = pt.tag_id
                          where pt.profile_id = c.id and t.label ilike v_like))
    )
    select f.id, f.kind, f.name,
           -- A phone sign-in account's address is a placeholder no one reads.
           case when f.email like '%@phone.cosora.invalid' then 'Phone sign-in' else f.email end,
           f.city, f.account_status, f.joined_at, f.last_active_at, f.interactions,
           f.spend_paise, f.payments,
           array_remove(array[
             case when f.seg_new then 'new' end,
             case when f.seg_active then 'active' end,
             case when f.seg_high_value then 'high_value' end,
             case when f.seg_at_risk then 'at_risk' end,
             case when f.seg_dormant then 'dormant' end,
             case when f.seg_never_transacted then 'never_transacted' end], null),
           coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label) order by t.label)
                       from admin.profile_tags pt join admin.customer_tags t on t.id = pt.tag_id
                      where pt.profile_id = f.id), '[]'::jsonb),
           count(*) over (),
           sum(f.spend_paise) over ()::bigint
      from f
     order by
       case when v_sort = 'spend'  then f.spend_paise end desc nulls last,
       case when v_sort = 'spend'  then f.interactions end desc nulls last,
       case when v_sort = 'recent' then f.last_active_at end desc nulls last,
       case when v_sort = 'joined' then f.joined_at end desc nulls last,
       case when v_sort = 'name'   then lower(f.name) end asc nulls last,
       f.id
    offset v_offset
     limit v_limit;
end
$function$;

create or replace function public.admin_customer_tags()
returns table(id uuid, label text, uses bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if not admin.customers_can_read() then
    raise exception 'not authorized: customers are for super admins, support and finance' using errcode = '42501';
  end if;
  return query
    select t.id, t.label, (select count(*) from admin.profile_tags pt where pt.tag_id = t.id)
      from admin.customer_tags t
     order by t.label;
end
$function$;

create or replace function public.admin_customer_tag_create(p_label text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_label text := lower(btrim(coalesce(p_label, '')));
  v_id    uuid;
begin
  if not admin.customers_can_write() then
    raise exception 'not authorized: customer tags are for super admins and support' using errcode = '42501';
  end if;
  if v_label !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
    raise exception 'a tag is 1 to 32 lowercase letters, digits or hyphens, starting with a letter or digit' using errcode = '22023';
  end if;
  insert into admin.customer_tags (label, created_by) values (v_label, auth.uid())
  on conflict (label) do nothing
  returning id into v_id;
  if v_id is null then
    select t.id into v_id from admin.customer_tags t where t.label = v_label;
  end if;
  return v_id;
end
$function$;

create or replace function public.admin_customer_tag_delete(p_tag_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not admin.customers_can_write() then
    raise exception 'not authorized: customer tags are for super admins and support' using errcode = '42501';
  end if;
  delete from admin.customer_tags t where t.id = p_tag_id;
  if not found then
    raise exception 'no tag %', p_tag_id using errcode = 'P0002';
  end if;
end
$function$;

create or replace function public.admin_customer_tag_apply(p_profile_id uuid, p_tag_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not admin.customers_can_write() then
    raise exception 'not authorized: customer tags are for super admins and support' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.account_status::text <> 'deleted') then
    raise exception 'no customer account %', p_profile_id using errcode = 'P0002';
  end if;
  if not exists (select 1 from admin.customer_tags t where t.id = p_tag_id) then
    raise exception 'no tag %', p_tag_id using errcode = 'P0002';
  end if;
  insert into admin.profile_tags (profile_id, tag_id, applied_by) values (p_profile_id, p_tag_id, auth.uid())
  on conflict (profile_id, tag_id) do nothing;
end
$function$;

create or replace function public.admin_customer_tag_remove(p_profile_id uuid, p_tag_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not admin.customers_can_write() then
    raise exception 'not authorized: customer tags are for super admins and support' using errcode = '42501';
  end if;
  delete from admin.profile_tags pt where pt.profile_id = p_profile_id and pt.tag_id = p_tag_id;
end
$function$;

revoke all on function admin.customers_can_read() from public, anon, authenticated;
revoke all on function admin.customers_can_write() from public, anon, authenticated;
revoke all on function public.admin_customer_refresh() from public, anon, authenticated;
revoke all on function public.admin_customer_segment_counts() from public, anon, authenticated;
revoke all on function public.admin_customer_list(text, text, uuid, text, text, int, int) from public, anon, authenticated;
revoke all on function public.admin_customer_tags() from public, anon, authenticated;
revoke all on function public.admin_customer_tag_create(text) from public, anon, authenticated;
revoke all on function public.admin_customer_tag_delete(uuid) from public, anon, authenticated;
revoke all on function public.admin_customer_tag_apply(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_customer_tag_remove(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_customer_refresh() to authenticated;
grant execute on function public.admin_customer_segment_counts() to authenticated;
grant execute on function public.admin_customer_list(text, text, uuid, text, text, int, int) to authenticated;
grant execute on function public.admin_customer_tags() to authenticated;
grant execute on function public.admin_customer_tag_create(text) to authenticated;
grant execute on function public.admin_customer_tag_delete(uuid) to authenticated;
grant execute on function public.admin_customer_tag_apply(uuid, uuid) to authenticated;
grant execute on function public.admin_customer_tag_remove(uuid, uuid) to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  f text;
  v_rows bigint;
  v_expected bigint;
begin
  foreach f in array array[
    'public.admin_customer_refresh()', 'public.admin_customer_segment_counts()',
    'public.admin_customer_list(text, text, uuid, text, text, int, int)', 'public.admin_customer_tags()',
    'public.admin_customer_tag_create(text)', 'public.admin_customer_tag_delete(uuid)',
    'public.admin_customer_tag_apply(uuid, uuid)', 'public.admin_customer_tag_remove(uuid, uuid)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'self-check: grants on % are wrong', f;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'self-check: % is not SECURITY DEFINER', f;
    end if;
  end loop;
  foreach f in array array['admin.customer_summary', 'admin.customer_rows', 'admin.customer_tags', 'admin.profile_tags', 'admin.customer_summary_meta'] loop
    if has_table_privilege('authenticated', f, 'SELECT') or has_table_privilege('anon', f, 'SELECT') then
      raise exception 'self-check: a client role can read %', f;
    end if;
  end loop;
  -- One row per account that isn't deleted and isn't active staff.
  select count(*) into v_rows from admin.customer_summary;
  select count(*) into v_expected from public.profiles p
   where p.account_status::text <> 'deleted'
     and not exists (select 1 from admin.admin_users a where a.id = p.id and a.is_active);
  if v_rows <> v_expected then
    raise exception 'self-check: % customer rows for % customer accounts', v_rows, v_expected;
  end if;
end
$check$;
