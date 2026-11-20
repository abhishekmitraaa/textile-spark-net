-- Low bugs, batch 5 (2026-11-20): the database items of the 2026-11-18 buyer review, L-86–L-98.
--
-- Apply this BEFORE deploying the batch's apps. The column withdrawals that close L-89 are in 20261120140100, applied
-- only once both apps are live (MPF-19: revoking first broke the live sites).
--
-- Mitra's calls (2026-11-20):
--   L-89 "Close it now": account status and seller settings get their own readers; the columns go in the next file.
--   L-92 "Add a daily job and also give an option to the buyer to extend it": rfq-deadline-close marks an open
--        requirement past its deadline closed (lapsed_at), and extend_rfq_deadline() reopens one closed that way.
--   L-95 "Keep it": notifications stay in the realtime publication (the fallback while the hub channel is down).
--   L-97/L-98 "Yes: new job + 2-day history": daily-dedupe-prune, and the run history keeps successes 2 days.

begin;

-- ── L-86, L-94: indexes ─────────────────────────────────────────────────────────────────────────────────────────
-- products_live_recent_idx (created_at) is covered by products_live_created_id_idx (created_at, id); 2 scans ever.
drop index if exists public.products_live_recent_idx;
-- No query searches search_text by trigram (search is full-text and vectors); 0 scans ever. Recreate if one does.
drop index if exists public.products_trgm_idx;
-- Photos are read by listing in position order; the old (product_id) index is the new one's prefix.
create index if not exists product_images_product_position_idx on public.product_images (product_id, position, id);
drop index if exists public.product_images_product_idx;
-- log_featured_impressions dedupes a signed-in viewer by viewer_id; the index had session_id only.
create index if not exists featured_impressions_dedupe_viewer
  on public.featured_impressions (product_id, placement, viewer_id, created_at desc) where viewer_id is not null;

-- ── L-87: objects nothing uses ─────────────────────────────────────────────────────────────────────────────────
drop table if exists admin.office_photos_before_20261113;            -- a migration's safety copy, 0 rows
drop function if exists public.ad_frequency_capped(uuid, text, integer);   -- unused since 2026-11-18
drop function if exists public.ad_logging_throttled(uuid, text, interval);

-- ── L-88: data ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Interest ids retired on 2026-10-11 (Interest Preference v2): past the month their map rows were kept, and no saved
-- profile holds them (interest_ids_translate() translates every write; the app translates a browser's own picks).
delete from public.pref_category_map where pref_id in ('activewear', 'bottomwear', 'dresses', 'shirts', 'tshirts');
-- The language moved to auth metadata (ui_language); this field is read by nothing.
update public.buyer_profiles set regional = regional - 'language' where regional ? 'language';
-- A seller following their own store: follows_count_sync() rightly leaves it out of the count, so the count looked
-- wrong. The follow goes, and so does any new one.
delete from public.follows where follower_id = vendor_id;
alter table public.follows drop constraint if exists follows_not_self;
alter table public.follows add constraint follows_not_self check (follower_id <> vendor_id);

-- ── L-89: readers that answer only what a screen needs ─────────────────────────────────────────────────────────
-- Whether this account may reach another, without naming the other's status (a signed-in account could read anyone's
-- account_status). 'caller_suspended' (the caller's own), 'target_unavailable' (suspended or deleted), or 'ok'.
-- The other's state is answered only where the caller has a reason to reach them: a registered seller (any buyer
-- may), a quote between them, a message between them, or staff. Anyone else gets 'ok': no screen offers a way to
-- reach them, and the contact functions refuse on their own rules (call_buyer_contact, call_vendor_contact).
create or replace function public.contact_check(p_other uuid)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  with me as (select (select auth.uid()) as id)
  select case
    when me.id is null then 'signed_out'
    when coalesce((select p.account_status::text from public.profiles p where p.id = me.id), 'active') = 'suspended'
      then 'caller_suspended'
    when not (
         coalesce(public.is_admin(), false)
      or exists (select 1 from public.vendor_profiles v where v.id = p_other and v.onboarding_complete)
      or exists (select 1 from public.quotes q join public.rfqs r on r.id = q.rfq_id
                  where (q.vendor_id = me.id and r.buyer_id = p_other) or (q.vendor_id = p_other and r.buyer_id = me.id))
      or exists (select 1 from public.conversations c join public.messages m on m.conversation_id = c.id
                  where c.user_a = least(me.id, p_other) and c.user_b = greatest(me.id, p_other))
    ) then 'ok'
    when coalesce((select p.account_status::text from public.profiles p where p.id = p_other), 'active') <> 'active'
      then 'target_unavailable'
    else 'ok'
  end
  from me
$function$;
revoke all on function public.contact_check(uuid) from public, anon;
grant execute on function public.contact_check(uuid) to authenticated, service_role;

-- The signed-in account's own status (the data export).
create or replace function public.my_account_status()
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p.account_status::text from public.profiles p where p.id = (select auth.uid())
$function$;
revoke all on function public.my_account_status() from public, anon;
grant execute on function public.my_account_status() to authenticated, service_role;

-- Staff read account statuses through this (Cosora-Admin read the column directly).
create or replace function public.admin_account_statuses(p_ids uuid[])
 returns table (id uuid, account_status public.account_status_type)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 500 then
    raise exception 'Up to 500 ids.' using errcode = '22023';
  end if;
  return query select p.id, p.account_status from public.profiles p where p.id = any (p_ids);
end
$function$;
revoke all on function public.admin_account_statuses(uuid[]) from public, anon;
grant execute on function public.admin_account_statuses(uuid[]) to authenticated, service_role;

-- A seller's own Settings (notifications, regional), which anyone could read off vendor_profiles.
create or replace function public.my_vendor_settings()
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object('notifications', v.notifications, 'regional', v.regional)
    from public.vendor_profiles v where v.id = (select auth.uid())
$function$;
revoke all on function public.my_vendor_settings() from public, anon;
grant execute on function public.my_vendor_settings() to authenticated, service_role;

-- account_is_active() and account_not_deleted() answered any id to anyone, which named any account's state. Every
-- policy and function passes the caller's own id; a browser asking about another account is refused. Cosora's jobs,
-- migrations and the service role (admin.trusted_caller()) may still ask about any account.
create or replace function public.account_is_active(p_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_id is distinct from auth.uid() and not admin.trusted_caller() then
    raise exception 'own_account_only' using errcode = '42501';
  end if;
  -- coalesce to FALSE: a missing profiles row means "unknown", and a content-creation gate must fail closed.
  return coalesce((select account_status = 'active' from public.profiles where id = p_id), false);
end
$function$;

create or replace function public.account_not_deleted(p_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if p_id is distinct from auth.uid() and not admin.trusted_caller() then
    raise exception 'own_account_only' using errcode = '42501';
  end if;
  -- coalesce to FALSE, as account_is_active(): a missing profiles row fails closed.
  return coalesce((select account_status <> 'deleted' from public.profiles where id = p_id), false);
end
$function$;

-- The one caller that asks about another account (ads, lead alerts, featured places, follow-ups: all definer code,
-- and not browser-callable) reads the status itself.
create or replace function public.vendor_account_in_good_standing(p_vendor uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((select account_status = 'active' from public.profiles where id = p_vendor), false);
$function$;
-- Already closed to browsers on production (checked 2026-11-20); said here so a rewrite can't open it.
revoke all on function public.vendor_account_in_good_standing(uuid) from public, anon, authenticated;
grant execute on function public.vendor_account_in_good_standing(uuid) to service_role;

-- messages_insert read the sender's account_status as the sender; account_is_active() reads it as the owner, with the
-- same answer (no row → not active), so the policy keeps working once the column is withdrawn.
alter policy messages_insert on public.messages
  with check (
    (sender_id = (select auth.uid()))
    and public.is_conversation_member(conversation_id)
    and ((select c.status from public.conversations c where c.id = messages.conversation_id) = 'active')
    and (select public.account_is_active((select auth.uid())))
  );

-- ── L-90: one policy per command on the saved tables; an account guard on product documents ─────────────────────
drop policy if exists sfolders_all on public.saved_folders;
create policy saved_folders_select on public.saved_folders for select to authenticated
  using (buyer_id = (select auth.uid()));
create policy saved_folders_insert on public.saved_folders for insert to authenticated
  with check (buyer_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));
create policy saved_folders_update on public.saved_folders for update to authenticated
  using (buyer_id = (select auth.uid()))
  with check (buyer_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));
create policy saved_folders_delete on public.saved_folders for delete to authenticated
  using (buyer_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));

drop policy if exists sitems_all on public.saved_items;
create policy saved_items_select on public.saved_items for select to authenticated
  using (buyer_id = (select auth.uid()));
create policy saved_items_insert on public.saved_items for insert to authenticated
  with check (buyer_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));
create policy saved_items_update on public.saved_items for update to authenticated
  using (buyer_id = (select auth.uid()))
  with check (buyer_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));
create policy saved_items_delete on public.saved_items for delete to authenticated
  using (buyer_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));

drop policy if exists saved_videos_owner on public.saved_videos;
create policy saved_videos_select on public.saved_videos for select to authenticated
  using (buyer_id = (select auth.uid()));
create policy saved_videos_insert on public.saved_videos for insert to authenticated
  with check (buyer_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));
create policy saved_videos_update on public.saved_videos for update to authenticated
  using (buyer_id = (select auth.uid()))
  with check (buyer_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));
create policy saved_videos_delete on public.saved_videos for delete to authenticated
  using (buyer_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));

drop policy if exists sfitems_all on public.saved_folder_items;
create policy saved_folder_items_select on public.saved_folder_items for select to authenticated
  using (exists (select 1 from public.saved_folders f where f.id = saved_folder_items.folder_id and f.buyer_id = (select auth.uid())));
create policy saved_folder_items_insert on public.saved_folder_items for insert to authenticated
  with check (exists (select 1 from public.saved_folders f where f.id = saved_folder_items.folder_id and f.buyer_id = (select auth.uid()))
              and (select public.account_not_deleted((select auth.uid()))));
create policy saved_folder_items_update on public.saved_folder_items for update to authenticated
  using (exists (select 1 from public.saved_folders f where f.id = saved_folder_items.folder_id and f.buyer_id = (select auth.uid())))
  with check (exists (select 1 from public.saved_folders f where f.id = saved_folder_items.folder_id and f.buyer_id = (select auth.uid()))
              and (select public.account_not_deleted((select auth.uid()))));
create policy saved_folder_items_delete on public.saved_folder_items for delete to authenticated
  using (exists (select 1 from public.saved_folders f where f.id = saved_folder_items.folder_id and f.buyer_id = (select auth.uid()))
         and (select public.account_not_deleted((select auth.uid()))));

-- A listing's PDF is content: a suspended or deleted seller can't add one (the other content tables' rule).
alter policy pdocs_insert on public.product_documents
  with check (
    (public.owns_product(product_id)
      and split_part(path, '/', 1) = ((select auth.uid()))::text
      and (select public.account_is_active((select auth.uid()))))
    or ((select public.is_admin()) and ((select public.admin_role()) = any (array['super_admin'::public.admin_role_type, 'product_moderator'::public.admin_role_type])))
  );

-- ── L-91: the caller's ids read once per query, not a function call per row ────────────────────────────────────
create or replace function public.my_conversation_ids()
 returns uuid[] language sql stable security definer set search_path to ''
as $function$
  select coalesce(array_agg(c.id), '{}'::uuid[]) from public.conversations c
   where c.user_a = (select auth.uid()) or c.user_b = (select auth.uid())
$function$;
create or replace function public.my_rfq_ids()
 returns uuid[] language sql stable security definer set search_path to ''
as $function$
  select coalesce(array_agg(r.id), '{}'::uuid[]) from public.rfqs r where r.buyer_id = (select auth.uid())
$function$;
create or replace function public.my_quoted_rfq_ids()
 returns uuid[] language sql stable security definer set search_path to ''
as $function$
  select coalesce(array_agg(distinct q.rfq_id), '{}'::uuid[]) from public.quotes q where q.vendor_id = (select auth.uid())
$function$;
revoke all on function public.my_conversation_ids() from public;
revoke all on function public.my_rfq_ids() from public;
revoke all on function public.my_quoted_rfq_ids() from public;
grant execute on function public.my_conversation_ids() to anon, authenticated, service_role;
grant execute on function public.my_rfq_ids() to anon, authenticated, service_role;
grant execute on function public.my_quoted_rfq_ids() to anon, authenticated, service_role;

alter policy messages_select on public.messages
  using (
    (conversation_id = any (((select public.my_conversation_ids()))::uuid[]))
    or ((select public.is_admin()) and ((select public.admin_role()) = any (array['support'::public.admin_role_type, 'super_admin'::public.admin_role_type])))
  );
alter policy quotes_select on public.quotes
  using ((vendor_id = (select auth.uid())) or (select public.is_admin()) or (rfq_id = any (((select public.my_rfq_ids()))::uuid[])));
alter policy quotes_update on public.quotes
  using ((vendor_id = (select auth.uid())) or (rfq_id = any (((select public.my_rfq_ids()))::uuid[]))
         or ((select public.is_admin()) and ((select public.admin_role()) = 'super_admin'::public.admin_role_type)))
  with check (((vendor_id = (select auth.uid())) or (rfq_id = any (((select public.my_rfq_ids()))::uuid[]))
               or ((select public.is_admin()) and ((select public.admin_role()) = 'super_admin'::public.admin_role_type)))
              and (select public.account_not_deleted((select auth.uid()))));
alter policy rfqs_select on public.rfqs
  using (
    (((status = 'active'::public.rfq_status)
      and (((vendor_id is null)
            and ((not overseas)
                 or ((select public.my_overseas_tier()) = 'vip'::text)
                 or (((select public.my_overseas_tier()) = 'gold'::text) and ((overseas_vip_until is null) or (now() >= overseas_vip_until)))
                 or (id = any (((select public.my_quoted_rfq_ids()))::uuid[]))))
           or (vendor_id = (select auth.uid())))
      and (not coalesce((buyer_id = any (((select public.my_block_peers()))::uuid[])), false)))
     or (buyer_id = (select auth.uid()))
     or (select public.is_admin()))
  );

-- ── L-92: an open requirement past its deadline is closed by a daily job, and the buyer can reopen it ───────────
alter table public.rfqs add column if not exists lapsed_at timestamptz;
comment on column public.rfqs.lapsed_at is
  'When rfq-deadline-close closed this open requirement for passing its deadline (review L-92). extend_rfq_deadline() reopens it and clears this.';
grant select (lapsed_at) on public.rfqs to authenticated;

-- Only Cosora's job and extend_rfq_deadline() write it: a browser's change is undone.
create or replace function public.rfqs_lapsed_guard()
 returns trigger language plpgsql set search_path to ''
as $function$
begin
  if current_user = 'authenticated' and not coalesce(public.is_admin(), false)
     and new.lapsed_at is distinct from old.lapsed_at then
    new.lapsed_at := old.lapsed_at;
  end if;
  return new;
end
$function$;
drop trigger if exists trg_rfqs_lapsed_guard on public.rfqs;
create trigger trg_rfqs_lapsed_guard before update of lapsed_at on public.rfqs
  for each row execute function public.rfqs_lapsed_guard();

create or replace function admin.rfqs_close_lapsed()
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare v_n integer;
begin
  update public.rfqs r
     set status = 'closed', lapsed_at = now()
   where r.status = 'active' and r.vendor_id is null and r.removed_at is null
     and r.expires_at is not null and r.expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end
$function$;
revoke all on function admin.rfqs_close_lapsed() from public, anon, authenticated;

create or replace function public.extend_rfq_deadline(p_rfq_id uuid)
 returns timestamp with time zone
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_rfq public.rfqs%rowtype;
  v_new timestamptz;
  v_lapsed boolean;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.account_is_active(v_uid) then
    raise exception 'This account can''t make changes right now.' using errcode = '42501';
  end if;
  select * into v_rfq from public.rfqs r where r.id = p_rfq_id for update;
  if not found or v_rfq.buyer_id <> v_uid then
    raise exception 'That requirement wasn''t found.' using errcode = 'P0002';
  end if;
  if v_rfq.removed_at is not null then
    raise exception 'Cosora removed this requirement, so it can''t be extended.' using errcode = '42501';
  end if;
  -- Closed by the daily job for passing its deadline: extending reopens it (Mitra, 2026-11-20, review L-92).
  v_lapsed := v_rfq.status = 'closed' and v_rfq.lapsed_at is not null;
  if not v_lapsed and (v_rfq.status <> 'active' or v_rfq.vendor_id is not null or v_rfq.expires_at is null) then
    raise exception 'Only an open requirement has a deadline to extend.' using errcode = '22023';
  end if;
  if not v_lapsed and v_rfq.expires_at > now() + interval '1 day' then
    raise exception 'You can extend it once the deadline is a day away.' using errcode = '22023', hint = 'too_early';
  end if;
  v_new := now() + interval '7 days';
  perform set_config('cosora.rfq_extend', 'on', true);
  update public.rfqs set expires_at = v_new, status = 'active', lapsed_at = null where id = p_rfq_id;
  perform set_config('cosora.rfq_extend', '', true);
  return v_new;
end
$function$;

-- ── L-93: search_path pinned with pg_temp last; active_ads asks ad_is_bumped once per ad ────────────────────────
-- A SECURITY DEFINER function whose search_path doesn't name pg_temp searches it FIRST for tables. Every definer in
-- public and admin with a non-empty search_path gets pg_temp at the end; their lookups don't otherwise change.
do $sp$
declare r record; v_path text;
begin
  for r in
    select p.oid::regprocedure as fn,
           substr(c, length('search_path=') + 1) as path
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral unnest(p.proconfig) c
     where n.nspname in ('public', 'admin') and p.prosecdef
       and c like 'search_path=%'
       and substr(c, length('search_path=') + 1) not in ('', '""')
       and c !~* 'pg_temp'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = %s, pg_temp', r.fn, r.path);
  end loop;
end
$sp$;

create or replace function public.active_ads(max_count integer default 12, filter_category uuid default null::uuid, filter_placements text[] default null::text[], filter_categories uuid[] default null::uuid[])
 returns table(ad_id uuid, product_id uuid, title text, placement text, product_name text, price_value numeric, currency text, image_url text, vendor_id uuid, vendor_name text, category_name text, is_bumped boolean)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select a.id, a.product_id, a.title, a.placement,
         p.name, p.price_value, p.currency,
         coalesce(a.image_url, (select url from public.product_images pi
                                 where pi.product_id = p.id order by position limit 1)),
         a.vendor_id, vp.brand_name,
         c.name,
         public.ad_is_bumped(a)
  from public.advertisements a
  join public.products p on p.id = a.product_id and p.status = 'live'
  left join public.vendor_profiles vp on vp.id = a.vendor_id
  left join public.categories c on c.id = p.category_id
  -- Where the viewer is, read once: no row for a signed-out viewer or one with no buyer profile.
  left join (select * from public.ad_viewer_location()) v on true
  -- SH-098 (2026-11-17): the running campaigns first, from the partial index; is_ad_eligible (not inlinable: a SET
  -- clause) then runs on those only instead of on every campaign ever sold. It requires the same three, so the rows
  -- returned don't change.
  where a.status = 'active'
    and (a.starts_at is null or a.starts_at <= now())
    and (a.ends_at is null or a.ends_at > now())
    and public.is_ad_eligible(
          a,
          nullif(array_remove(
            coalesce(filter_categories, array[]::uuid[]) || filter_category,
            null), array[]::uuid[]),
          v.city, v.state_code, v.country_code)
    and (
      filter_placements is null
      or exists (
        select 1 from unnest(filter_placements) fp
        where (',' || replace(coalesce(a.placement, ''), ' ', '') || ',')
              like ('%,' || fp || ',%')
      )
    )
  -- Ordered by the output column, so ad_is_bumped() runs once per ad, not twice (review L-93).
  order by 12 desc, a.created_at desc, a.id desc
  limit greatest(1, max_count);
$function$;

-- ── L-97, L-98: the scheduler's history and the daily dedupe tables ─────────────────────────────────────────────
create or replace function admin.daily_dedupe_prune()
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare v_n integer := 0; v_c integer;
begin
  -- Each table only answers "seen today?" (increment_product_view, increment_video_view, increment_product_enquiry,
  -- ad_click); two days kept so a viewer at midnight still dedupes.
  delete from public.product_view_daily where day < current_date - 2;  get diagnostics v_c = row_count; v_n := v_n + v_c;
  delete from public.video_view_daily where day < current_date - 2;    get diagnostics v_c = row_count; v_n := v_n + v_c;
  delete from public.product_enquiry_daily where day < current_date - 2; get diagnostics v_c = row_count; v_n := v_n + v_c;
  delete from public.ad_click_daily where day < current_date - 2;      get diagnostics v_c = row_count; v_n := v_n + v_c;
  return v_n;
end
$function$;
revoke all on function admin.daily_dedupe_prune() from public, anon, authenticated;

select cron.schedule('daily-dedupe-prune', '23 3 * * *', 'select admin.daily_dedupe_prune();');
-- 00:05 India time: open requirements whose 7 days ran out yesterday are closed.
select cron.schedule('rfq-deadline-close', '35 18 * * *', 'select admin.rfqs_close_lapsed();');
-- Successful runs are kept 2 days (they were 54 MB of the 100), failures 14 (Mitra, 2026-11-20).
do $prune$
begin
  if exists (select 1 from cron.job where jobname = 'cron-history-prune') then
    perform cron.alter_job(
      job_id := (select jobid from cron.job where jobname = 'cron-history-prune'),
      command := $cmd$ delete from cron.job_run_details where (status = 'succeeded' and coalesce(end_time, start_time) < now() - interval '2 days') or coalesce(end_time, start_time) < now() - interval '14 days'; $cmd$
    );
  end if;
end
$prune$;

-- ── Self-check ─────────────────────────────────────────────────────────────────────────────────────────────────
do $check$
declare v_left integer;
begin
  if to_regclass('public.products_trgm_idx') is not null or to_regclass('public.product_images_product_position_idx') is null then
    raise exception 'low_batch5: indexes';
  end if;
  if to_regprocedure('public.ad_frequency_capped(uuid,text,integer)') is not null then
    raise exception 'low_batch5: unused functions still there';
  end if;
  if (select p.prosrc from pg_proc p where p.oid = 'public.vendor_account_in_good_standing(uuid)'::regprocedure) ~ 'account_is_active'
     or (select p.prosrc from pg_proc p where p.oid = 'public.account_is_active(uuid)'::regprocedure) !~ 'own_account_only' then
    raise exception 'low_batch5: account status helpers';
  end if;
  if has_function_privilege('anon', 'public.vendor_account_in_good_standing(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.vendor_account_in_good_standing(uuid)', 'execute') then
    raise exception 'low_batch5: vendor_account_in_good_standing is browser-callable';
  end if;
  if exists (select 1 from public.follows where follower_id = vendor_id) then
    raise exception 'low_batch5: self-follows left';
  end if;
  select count(*) into v_left
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace cross join lateral unnest(p.proconfig) c
   where n.nspname in ('public', 'admin') and p.prosecdef and c like 'search_path=%'
     and substr(c, length('search_path=') + 1) not in ('', '""') and c !~* 'pg_temp'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if v_left > 0 then
    raise exception 'low_batch5: % definers without pg_temp', v_left;
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('saved_items', 'saved_folders', 'saved_folder_items', 'saved_videos') and cmd = 'ALL') > 0 then
    raise exception 'low_batch5: FOR ALL policies left on the saved tables';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('messages', 'quotes', 'rfqs')
        and coalesce(qual, '') || coalesce(with_check, '') ~ '(owns_rfq|vendor_quoted_rfq)\(') > 0 then
    raise exception 'low_batch5: per-row helpers left in messages/quotes/rfqs policies';
  end if;
  if not exists (select 1 from cron.job where jobname = 'daily-dedupe-prune') or not exists (select 1 from cron.job where jobname = 'rfq-deadline-close') then
    raise exception 'low_batch5: jobs missing';
  end if;
end
$check$;

commit;
