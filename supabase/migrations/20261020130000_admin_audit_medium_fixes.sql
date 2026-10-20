-- The 2026-10-20 admin audit's medium list (Mitra: "tackle leaked-password protection, the staff
-- temporary-password gaps, and also the medium list now, and after fixing test each fix"). Database side:
--
-- 1. A temporary password is enforced by the database, not only by Cosora-Admin's screen. While the
--    sign-in token says app_metadata.must_change_password (set by the admin-staff edge function on
--    register and reset), is_admin() is false, admin_role() is null and admin.am_staff() refuses, so an
--    account still on its temporary password can't use the API as staff. The edge function clears it
--    when the staff member chooses their own password, and the new sign-in carries the cleared flag.
-- 2. ad_click counted every call and increment_video_view counted every call: anyone, signed in or not,
--    could raise an ad's clicks or a video's views without limit. Both now work like
--    increment_product_view: one count per viewer per item per day (viewer = account, else the browser
--    key the app sends, else one shared "unkeyed"), the owner's own clicks and views don't count, and
--    signed-out counts stop at 100 per item per day. increment_video_view takes the app's viewer key
--    (p_viewer, optional, so the app already live keeps working).
-- 3. admin_refund_guarantee_close checked razorpay_refund_id, which a FAILED refund also has, so a
--    7-day guarantee could be closed (the plan ended) with money that never went back. It now needs
--    every invoice's refund processed or with Razorpay (refund_status processed / pending).
-- 4. The Journal (www.cosora.in/blogs) cache:
--    a. blog_settings (the landing hero edited in Cosora-Admin) had no revalidate trigger: a change
--       showed up only when the hour-long cache ran out. It has one now.
--    b. A post scheduled for later purged the cache and pinged IndexNow (with a URL that was still a 404)
--       when it was SAVED, and nothing ran when it went live. Now a change that is public neither before
--       nor after sends nothing, and admin.blog_scheduled_sweep() (cron, every 5 minutes) purges each
--       post whose publish time has passed since the last run.
--    The revalidate call is one helper, admin.blog_revalidate_send(); it posts to Vault's
--    blog_revalidate_url when set (the local stack points it nowhere) and otherwise to production's.
--
-- The pre-check stops the file if any replaced function isn't the version this was written against.
-- blog_posts_revalidate has two accepted versions: production's, and the local stack's copy, which
-- differs only in posting to a dead local address.

do $pin$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.is_admin()',                                   'a8ad286c55f39512084dc43fa3ea7483', null),
      ('public.admin_role()',                                 '73a3cf7e4c9039db67a47a10cffb40b0', null),
      ('admin.am_staff()',                                    '99295984490840a85eba8a4a47d5dc7b', null),
      ('public.ad_click(uuid,text)',                          '8de9b3a0ffc0f22aac67ed05daeabaa0', null),
      ('public.increment_video_view(uuid)',                   '7a345074c4529d9293646968ef024736', null),
      ('public.admin_refund_guarantee_close(uuid,text)',      'd6978bceb981c40f1f7013da0d97f008', null),
      ('public.blog_posts_revalidate()',                      'ab3bcdcd31ceb6064a302fbe510d7d9c', '8161836a2d7473c7805d2e6ee4406a5c')
    ) as v(fn, prod_md5, local_md5)
  loop
    if md5(replace((select p.prosrc from pg_proc p where p.oid = r.fn::regprocedure), chr(13), ''))
       not in (r.prod_md5, coalesce(r.local_md5, r.prod_md5)) then
      raise exception 'pre-check: % is not the version this migration was written against', r.fn;
    end if;
  end loop;
end
$pin$;

-- ── 1. Temporary passwords, enforced by the database ─────────────────────────
create or replace function admin.temp_password_pending()
returns boolean
language sql
stable
set search_path to ''
as $$
  -- The flag rides in the sign-in token's app_metadata, which only the service role can set. No token
  -- (cron, the service role) means no flag.
  select coalesce((auth.jwt() -> 'app_metadata' -> 'must_change_password') = 'true'::jsonb, false)
$$;
revoke all on function admin.temp_password_pending() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from admin.admin_users where id = auth.uid() and is_active)
     and not admin.temp_password_pending()
$function$;

CREATE OR REPLACE FUNCTION public.admin_role()
 RETURNS admin_role_type
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select admin_role from admin.admin_users
   where id = auth.uid() and is_active and not admin.temp_password_pending()
$function$;

CREATE OR REPLACE FUNCTION admin.am_staff()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or admin.temp_password_pending()
     or not exists (select 1 from admin.admin_users a where a.id = v_me and a.is_active
                                    and a.admin_role in ('super_admin', 'manager', 'account_manager')) then
    raise exception 'Account managers, managers and super admins only.' using errcode = '42501';
  end if;
  return v_me;
end
$function$;

-- ── 2. Ad clicks and video views, once per viewer per day ────────────────────
create table public.ad_click_daily (
  ad_id      uuid not null references public.advertisements(id) on delete cascade,
  viewer_key text not null check (char_length(viewer_key) between 1 and 80),
  day        date not null,
  primary key (ad_id, viewer_key, day)
);
alter table public.ad_click_daily enable row level security;
revoke all on public.ad_click_daily from anon, authenticated;

create table public.video_view_daily (
  video_id   uuid not null references public.product_videos(id) on delete cascade,
  viewer_key text not null check (char_length(viewer_key) between 1 and 80),
  day        date not null,
  primary key (video_id, viewer_key, day)
);
alter table public.video_view_daily enable row level security;
revoke all on public.video_view_daily from anon, authenticated;

CREATE OR REPLACE FUNCTION public.ad_click(ad uuid, p_session text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_ses  text := nullif(btrim(coalesce(p_session, '')), '');
  v_key  text;
  v_day  date := (now() at time zone 'Asia/Kolkata')::date;
  v_rows integer;
begin
  if ad is null then return; end if;
  if v_uid is not null then
    v_key := 'u:' || v_uid::text;
  elsif v_ses is not null and char_length(v_ses) <= 64 then
    v_key := 's:' || v_ses;
  else
    v_key := 'unkeyed';
  end if;

  -- Already counted today: nothing to do, and no lock taken.
  if exists (select 1 from public.ad_click_daily d where d.ad_id = ad and d.viewer_key = v_key and d.day = v_day) then
    return;
  end if;
  -- A running campaign, not the caller's own.
  if not exists (select 1 from public.advertisements a where a.id = ad and a.status = 'active'
                   and (v_uid is null or a.vendor_id <> v_uid)) then
    return;
  end if;
  if random() < 0.002 then delete from public.ad_click_daily d where d.day < v_day - 1; end if;

  -- Signed-out clicks: at most 100 per ad per day (the same rule as listing views).
  if v_uid is null then
    if (select count(*) from public.ad_click_daily d where d.ad_id = ad and d.day = v_day and d.viewer_key not like 'u:%') >= 100 then
      return;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('cosora.ad_click_cap:' || ad::text, 0));
    if (select count(*) from public.ad_click_daily d where d.ad_id = ad and d.day = v_day and d.viewer_key not like 'u:%') >= 100 then
      return;
    end if;
  end if;

  insert into public.ad_click_daily (ad_id, viewer_key, day) values (ad, v_key, v_day) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.advertisements set clicks = clicks + 1 where id = ad and status = 'active';
  end if;
end $function$;

-- A new parameter means a new signature: the one-argument version goes, and calls with only `p` (the app
-- live today) reach this one through the default.
drop function public.increment_video_view(uuid);
CREATE FUNCTION public.increment_video_view(p uuid, p_viewer text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_key  text;
  v_day  date := (now() at time zone 'Asia/Kolkata')::date;
  v_rows integer;
begin
  if p is null then return; end if;
  if v_uid is not null then
    v_key := 'u:' || v_uid::text;
  elsif p_viewer ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_key := 'b:' || p_viewer;
  else
    v_key := 'unkeyed';
  end if;

  if exists (select 1 from public.video_view_daily d where d.video_id = p and d.viewer_key = v_key and d.day = v_day) then
    return;
  end if;
  -- A live video, not the caller's own.
  if not exists (select 1 from public.product_videos x where x.id = p and x.status = 'live'
                   and (v_uid is null or x.vendor_id <> v_uid)) then
    return;
  end if;
  if random() < 0.002 then delete from public.video_view_daily d where d.day < v_day - 1; end if;

  if v_uid is null then
    if (select count(*) from public.video_view_daily d where d.video_id = p and d.day = v_day and d.viewer_key not like 'u:%') >= 100 then
      return;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('cosora.video_view_cap:' || p::text, 0));
    if (select count(*) from public.video_view_daily d where d.video_id = p and d.day = v_day and d.viewer_key not like 'u:%') >= 100 then
      return;
    end if;
  end if;

  insert into public.video_view_daily (video_id, viewer_key, day) values (p, v_key, v_day) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.product_videos set views_count = views_count + 1 where id = p and status = 'live';
  end if;
end $function$;
revoke all on function public.increment_video_view(uuid, text) from public;
grant execute on function public.increment_video_view(uuid, text) to anon, authenticated, service_role;

-- ── 3. The 7-day guarantee closes only on refunds that happened ──────────────
CREATE OR REPLACE FUNCTION public.admin_refund_guarantee_close(p_request_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_req public.refund_guarantee_requests;
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: closing a refund request requires the super_admin or finance_admin role'
      using errcode = '42501';
  end if;
  select * into v_req from public.refund_guarantee_requests where id = p_request_id for update;
  if not found then
    raise exception 'no refund request %', p_request_id using errcode = 'P0002';
  end if;
  if v_req.status <> 'open' then
    raise exception 'this request is already closed' using errcode = 'P0001';
  end if;
  -- Processed, or with Razorpay. Not "has a refund id": a failed refund keeps its id (2026-10-20).
  if exists (select 1 from public.subscription_invoices i
              where i.id = any (v_req.invoice_ids)
                and coalesce(i.refund_status, '') not in ('processed', 'pending')) then
    raise exception 'refund every payment in the request first' using errcode = 'P0001', hint = 'refund_first';
  end if;

  perform set_config('cosora.audit_reason', left(coalesce(nullif(btrim(p_note), ''), '7-day money-back guarantee'), 500), true);
  update public.vendor_subscriptions
     set status = 'canceled', auto_renew = false,
         current_period_end = case when current_period_end > now() then now() else current_period_end end,
         scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null,
         updated_at = now()
   where vendor_id = v_req.vendor_id and status = 'active';
  update public.vendor_profiles
     set plan_expires_at = now()
   where id = v_req.vendor_id and plan_expires_at > now();
  update public.refund_guarantee_requests
     set status = 'closed', closed_at = now(), closed_by = auth.uid(),
         close_note = nullif(left(btrim(coalesce(p_note, '')), 1000), '')
   where id = v_req.id;
  perform set_config('cosora.audit_reason', '', true);

  perform public.notify(v_req.vendor_id, 'refund_processed', 'Your refund is on its way',
    format('We refunded ₹%s under the 7-day money-back guarantee, and your plan has ended. A refund usually reaches your account in 5–7 working days.',
           to_char(v_req.total_rupees, 'FM99,99,99,999')),
    null);
end
$function$;

-- ── 4. The Journal's cache ───────────────────────────────────────────────────
create or replace function admin.blog_revalidate_send(p_body jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_secret text;
  v_url    text;
begin
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'blog_revalidate_secret';
  if v_secret is null then
    raise warning 'blog revalidate not sent: Vault secret blog_revalidate_secret is missing';
    return;
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'blog_revalidate_url';
  perform net.http_post(
    url     := coalesce(v_url, 'https://www.cosora.in/blogs/api/revalidate'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-revalidate-secret', v_secret),
    body    := p_body,
    timeout_milliseconds := 30000
  );
exception when others then
  -- A failed purge must never fail the save that caused it.
  raise warning 'blog revalidate not sent: %', sqlerrm;
end
$$;
revoke all on function admin.blog_revalidate_send(jsonb) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.blog_posts_revalidate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_new_slug    text := null;
  v_old_slug    text := null;
  v_old_visible boolean := false;
  v_new_visible boolean := false;
begin
  -- "Public" as blog_posts_select_published reads it, with a minute's grace so a post published "now"
  -- purges at once; admin.blog_scheduled_sweep() purges again once its time has passed.
  if tg_op <> 'INSERT' then
    v_old_slug := old.slug;
    v_old_visible := old.status in ('published', 'scheduled') and old.published_at is not null
                     and old.published_at <= now() + interval '1 minute';
  end if;
  if tg_op <> 'DELETE' then
    v_new_slug := new.slug;
    v_new_visible := new.status in ('published', 'scheduled') and new.published_at is not null
                     and new.published_at <= now() + interval '1 minute';
  end if;

  -- Not public before or after (a draft, or a post scheduled for later): nothing on the site changed,
  -- and pinging IndexNow now would send search engines to a page that is still a 404.
  if not v_old_visible and not v_new_visible then
    return null;
  end if;

  perform admin.blog_revalidate_send(jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'record', case when v_new_slug is null then null else jsonb_build_object('slug', v_new_slug) end,
    'old_record', case when v_old_slug is null then null else jsonb_build_object('slug', v_old_slug) end));
  return null;
end
$function$;

create or replace function public.blog_settings_revalidate()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- The landing hero is on the listing pages only; the revalidate route purges those for this table.
  perform admin.blog_revalidate_send(jsonb_build_object('type', tg_op, 'table', tg_table_name, 'record', null, 'old_record', null));
  return null;
end
$$;
revoke all on function public.blog_settings_revalidate() from public, anon, authenticated;

create trigger trg_blog_settings_revalidate
  after insert or update or delete on public.blog_settings
  for each row execute function public.blog_settings_revalidate();

create table admin.blog_publish_sweep (
  id       boolean primary key default true check (id),
  last_run timestamptz not null
);
alter table admin.blog_publish_sweep enable row level security;
revoke all on admin.blog_publish_sweep from anon, authenticated;
insert into admin.blog_publish_sweep (id, last_run) values (true, now());

create or replace function admin.blog_scheduled_sweep()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_since timestamptz;
  v_now   timestamptz := now();
  v_last  timestamptz;
  v_n     integer := 0;
  r       record;
begin
  select s.last_run into v_since from admin.blog_publish_sweep s where s.id for update;
  -- Each post whose publish time passed since the last run: it has just become public. At most 50 a run;
  -- the rest wait for the next one.
  for r in
    select p.slug, p.published_at from public.blog_posts p
     where p.status in ('published', 'scheduled')
       and p.published_at > v_since and p.published_at <= v_now
     order by p.published_at
     limit 50
  loop
    perform admin.blog_revalidate_send(jsonb_build_object(
      'type', 'UPDATE', 'table', 'blog_posts',
      'record', jsonb_build_object('slug', r.slug), 'old_record', null));
    v_n := v_n + 1;
    v_last := r.published_at;
  end loop;
  update admin.blog_publish_sweep s set last_run = case when v_n = 50 then v_last else v_now end where s.id;
  return v_n;
end
$$;
revoke all on function admin.blog_scheduled_sweep() from public, anon, authenticated;

select cron.schedule('blog-scheduled-sweep', '*/5 * * * *', 'select admin.blog_scheduled_sweep();');
