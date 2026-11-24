-- Security audit run-2 (2026-11-23), the five findings left after F-01 (Mitra, 2026-11-25: "fix all the 5").
-- Report: ~/security-audit-skill/cosora-platform/run-2/INLINE-AUDIT.md; rows in documentation/securityflags.md.
--
--   F-02 (Medium) bunny-upload-url gave any account with a vendor_profiles row unlimited Bunny upload slots.
--        Now the function asks bunny_upload_slot_claim() first: a registered seller (seller_registered()), at most
--        BUNNY_DAILY_SLOTS slots a day and BUNNY_OPEN_SLOTS slots not yet used by a video, counted under a lock per
--        seller. The function records the Bunny video id on the slot (bunny_upload_slot_record()).
--   F-03 (Low)    image search's hourly budget (300) could be drained from ~30 addresses. Signed-out callers now share
--        half of it ('img:global:guest'), so a drain without accounts leaves signed-in buyers the other half.
--   F-04 (Low)    every staff role could hard-delete any review and add, rename or delete categories, unlogged. The
--        admin arms now name roles (reviews: super_admin, support; categories: super_admin, manager), and the four
--        tables get trg_admin_audit. Cosora-Admin writes none of them directly (reports go through
--        admin_review_report_decide()), so no page changes. Broad staff READS are unchanged (see securityflags).
--   F-05 (Low)    a deletion code could be sent by WhatsApp to any number, because the dummy sign-in (otp-dev-verify)
--        creates accounts on numbers nobody proved. WhatsApp is offered only for a number not confirmed by the dummy.
--   F-06 (Low)    a plan invoice printed whatever GSTIN the checkout sent. subscription_fulfil() now prints only the
--        seller's saved GSTIN (vendor_profiles.gstin, which trg_vendor_profiles_tax_ids requires to contain the
--        seller's PAN). Covers every payment path (create-order, autopay, demo), which all fulfil here.

begin;

-- ─── F-02 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists admin.bunny_upload_slots (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null,
  bunny_video_id text,
  created_at timestamptz not null default now()
);
create index if not exists bunny_upload_slots_vendor_time on admin.bunny_upload_slots (vendor_id, created_at desc);
alter table admin.bunny_upload_slots enable row level security;
revoke all on admin.bunny_upload_slots from public, anon, authenticated;
comment on table admin.bunny_upload_slots is
  'Bunny upload slots handed out by bunny-upload-url (security audit run-2 F-02, 2026-11-25). Counted by bunny_upload_slot_claim().';

-- Returns null when a slot was reserved (its id in slot_id), else the reason. Service role only.
create or replace function public.bunny_upload_slot_claim(p_vendor uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  c_daily constant int := 10;          -- BUNNY_DAILY_SLOTS: slots per seller per 24 hours
  c_open  constant int := 3;           -- BUNNY_OPEN_SLOTS: slots in the last 6 hours no video uses yet
  v_daily int;
  v_open  int;
  v_id    uuid;
begin
  if p_vendor is null then
    return jsonb_build_object('reason', 'not_vendor');
  end if;
  if not coalesce(public.seller_registered(p_vendor), false) then
    return jsonb_build_object('reason', 'registration_required');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cosora.bunny_slot:' || p_vendor::text, 0));
  select count(*) into v_daily from admin.bunny_upload_slots s
   where s.vendor_id = p_vendor and s.created_at > now() - interval '24 hours';
  if v_daily >= c_daily then
    return jsonb_build_object('reason', 'daily_limit', 'limit', c_daily);
  end if;
  -- Six hours = bunny-upload-url's UPLOAD_WINDOW_SECONDS: after that a slot's signature has expired.
  select count(*) into v_open from admin.bunny_upload_slots s
   where s.vendor_id = p_vendor and s.created_at > now() - interval '6 hours'
     and not exists (select 1 from public.product_videos v
                      where v.vendor_id = p_vendor and v.bunny_video_id = s.bunny_video_id);
  if v_open >= c_open then
    return jsonb_build_object('reason', 'open_limit', 'limit', c_open);
  end if;
  insert into admin.bunny_upload_slots (vendor_id) values (p_vendor) returning id into v_id;
  return jsonb_build_object('slot_id', v_id);
end
$function$;

create or replace function public.bunny_upload_slot_record(p_slot uuid, p_video text)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  update admin.bunny_upload_slots set bunny_video_id = left(p_video, 100) where id = p_slot;
$function$;

revoke all on function public.bunny_upload_slot_claim(uuid) from public, anon, authenticated;
revoke all on function public.bunny_upload_slot_record(uuid, text) from public, anon, authenticated;
grant execute on function public.bunny_upload_slot_claim(uuid) to service_role;
grant execute on function public.bunny_upload_slot_record(uuid, text) to service_role;

-- ─── F-03 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Production's body (2026-11-25) with the guest share added before the global count.
create or replace function public.image_search_rate_check(p_ip text, p_user_id text default null::text,
  p_ip_limit integer default 10, p_ip_window_secs integer default 600, p_global_limit integer default 300,
  p_global_window_secs integer default 3600)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_count integer;
begin
  -- Per-IP scope first (2026-10-19). It used to come after the global count, so a caller already over their own
  -- limit still spent the shared budget on every refused call, and one caller could empty it for everyone. An
  -- absent address collapses to one shared 'img:ip:unknown' bucket.
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

  -- Per-user scope, only when the caller has a user id. Same limit and window as per-IP. x-forwarded-for is
  -- client-supplied; a JWT `sub` is signed, so a signed-in caller rotating claimed IPs is still bounded here.
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
  else
    -- Signed-out callers share half the global budget (security audit run-2 F-03, 2026-11-25), so draining it from
    -- many addresses without accounts leaves signed-in buyers the other half.
    insert into public.embed_query_rate_limit (caller, window_start, count)
    values ('img:global:guest', now(), 1)
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

    if v_count > greatest(coalesce(p_global_limit, 300) / 2, 1) then
      return false;
    end if;
  end if;

  -- Global scope last: the ceiling that bounds total spend however many IPs or accounts the calls come from. Only
  -- calls within their own limits reach it.
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

  return v_count <= greatest(coalesce(p_global_limit, 300), 1);
end
$function$;
revoke execute on function public.image_search_rate_check(text, text, integer, integer, integer, integer) from public, anon, authenticated;

-- ─── F-04 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
-- ALTER POLICY, not drop and create: no moment without the policy on a live table.
alter policy reviews_delete_own on public.reviews using (
  ((buyer_id = (select auth.uid()))
   or ((select public.is_admin()) and (select public.admin_role()) = any (array['super_admin', 'support']::public.admin_role_type[])))
  and (select public.account_not_deleted((select auth.uid()))));
alter policy product_reviews_delete_own on public.product_reviews using (
  ((buyer_id = (select auth.uid()))
   or ((select public.is_admin()) and (select public.admin_role()) = any (array['super_admin', 'support']::public.admin_role_type[])))
  and (select public.account_not_deleted((select auth.uid()))));
alter policy service_reviews_delete_own on public.service_reviews using (
  ((buyer_id = (select auth.uid()))
   or ((select public.is_admin()) and (select public.admin_role()) = any (array['super_admin', 'support']::public.admin_role_type[])))
  and (select public.account_not_deleted((select auth.uid()))));

alter policy categories_insert on public.categories with check (
  (select public.is_admin()) and (select public.admin_role()) = any (array['super_admin', 'manager']::public.admin_role_type[]));
alter policy categories_update on public.categories
  using ((select public.is_admin()) and (select public.admin_role()) = any (array['super_admin', 'manager']::public.admin_role_type[]))
  with check ((select public.is_admin()) and (select public.admin_role()) = any (array['super_admin', 'manager']::public.admin_role_type[]));
alter policy categories_delete on public.categories using (
  (select public.is_admin()) and (select public.admin_role()) = any (array['super_admin', 'manager']::public.admin_role_type[]));

-- Staff changes to them reach the Admin Log (admin.audit_row_change() records admin actors only).
drop trigger if exists trg_admin_audit on public.reviews;
create trigger trg_admin_audit after insert or update or delete on public.reviews
  for each row execute function admin.audit_row_change('buyer_id');
drop trigger if exists trg_admin_audit on public.product_reviews;
create trigger trg_admin_audit after insert or update or delete on public.product_reviews
  for each row execute function admin.audit_row_change('buyer_id');
drop trigger if exists trg_admin_audit on public.service_reviews;
create trigger trg_admin_audit after insert or update or delete on public.service_reviews
  for each row execute function admin.audit_row_change('buyer_id');
drop trigger if exists trg_admin_audit on public.categories;
create trigger trg_admin_audit after insert or update or delete on public.categories
  for each row execute function admin.audit_row_change();

-- ─── F-05 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.account_deletion_channels(p_user uuid)
 returns text[]
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(
    (select array_remove(array[
              case when u.email is not null and u.email not like '%.invalid' and u.email_confirmed_at is not null
                   then 'email' end,
              -- Not a number the dummy sign-in confirmed: it proves nothing (security audit run-2 F-05, 2026-11-25).
              case when coalesce(u.phone, '') <> '' and u.phone_confirmed_at is not null
                        and coalesce(u.raw_app_meta_data ->> 'created_by', '') <> 'otp-dev-verify'
                   then 'whatsapp' end
            ], null)
       from auth.users u
      where u.id = p_user),
    '{}');
$function$;

-- ─── F-06 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Patched by anchored text (each anchor must appear once), production's body normalised to LF first.
do $patch$
declare
  v_def text := replace(pg_get_functiondef('public.subscription_fulfil(text,text,text)'::regprocedure), E'\r\n', E'\n');
  a1 text := $a$v_rec_gstin := upper(btrim(coalesce(nullif(btrim(o.gst_number), ''), vp.gstin, '')));$a$;
  b1 text := $b$v_rec_gstin := upper(btrim(coalesce(vp.gstin, '')));  -- the seller's saved GSTIN only (audit run-2 F-06)$b$;
  a2 text := $a$(v_gst_paise / 100)::integer, o.gst_number, null, 'paid'$a$;
  b2 text := $b$(v_gst_paise / 100)::integer, v_rec_gstin, null, 'paid'$b$;
begin
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1
     or (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then
    raise exception 'F-06 patch: subscription_fulfil anchors not found exactly once';
  end if;
  execute replace(replace(v_def, a1, b1), a2, b2);
end
$patch$;

-- ─── Self-check ─────────────────────────────────────────────────────────────────────────────────────────────────────
do $check$
begin
  if has_function_privilege('authenticated', 'public.bunny_upload_slot_claim(uuid)', 'EXECUTE') then
    raise exception 'self-check: browsers can claim Bunny slots';
  end if;
  if position('img:global:guest' in pg_get_functiondef('public.image_search_rate_check(text,text,integer,integer,integer,integer)'::regprocedure)) = 0 then
    raise exception 'self-check: no guest share in image search';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and policyname in ('reviews_delete_own', 'product_reviews_delete_own', 'service_reviews_delete_own',
                                 'categories_insert', 'categories_update', 'categories_delete')
              and coalesce(qual, '') || coalesce(with_check, '') not like '%admin_role%') then
    raise exception 'self-check: a staff write policy still admits every role';
  end if;
  if (select count(*) from pg_trigger where tgname = 'trg_admin_audit' and not tgisinternal
       and tgrelid in ('public.reviews'::regclass, 'public.product_reviews'::regclass,
                       'public.service_reviews'::regclass, 'public.categories'::regclass)) <> 4 then
    raise exception 'self-check: an audit trigger is missing';
  end if;
  if position('otp-dev-verify' in pg_get_functiondef('public.account_deletion_channels(uuid)'::regprocedure)) = 0 then
    raise exception 'self-check: deletion channels still trust the dummy sign-in';
  end if;
  if position('o.gst_number' in pg_get_functiondef('public.subscription_fulfil(text,text,text)'::regprocedure)) > 0 then
    raise exception 'self-check: invoices still print the GSTIN the checkout sent';
  end if;
end
$check$;

commit;
