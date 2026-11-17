-- Ad types done by hand (Mitra, 2026-11-17: "bring back all the ad types except the mobile banner and the website
-- banner … those ads will go to the admin dashboard as they will be done manually").
--
-- fbInsta, googleProduct, socialCombo and directBroadcast have no slot in the app. A campaign that holds any of them is
-- paid for and reviewed as usual; once approved, it is listed in Cosora-Admin › Ads › Manual work, the team carries it
-- out outside the app, and marks it done (with a note). The seller sees "Cosora is setting this up" until then, and is
-- told when it's done. src/lib/adSlots.ts MANUAL_AD_TYPES holds the same four.
--
--   admin.ad_manual_work            one row per campaign the team has done (deleted again by "Not done")
--   public.admin_ad_manual_list()   the campaigns, for super admins, ads moderators and support (the Ads section's readers)
--   public.admin_ad_manual_done()   mark done / not done, for super admins and ads moderators (the Ads section's writers)
--   public.my_ad_manual_work()      the seller's own campaigns that hold a manual type, and whether each is done
--
-- Direct Broadcast is bought by the message (Mitra, 2026-11-17, "add the field for message"): the count per listing is
-- in the paid order's spec (ad_orders.spec ->> 'messages', clamped by razorpay-create-order), and both lists return it.

create table if not exists admin.ad_manual_work (
  ad_id   uuid primary key references public.advertisements (id) on delete cascade,
  done_at timestamptz not null default now(),
  done_by uuid not null,
  note    text check (note is null or char_length(note) <= 500)
);
revoke all on table admin.ad_manual_work from public, anon, authenticated;

drop trigger if exists trg_admin_audit on admin.ad_manual_work;
create trigger trg_admin_audit after insert or update or delete on admin.ad_manual_work
  for each row execute function admin.audit_row_change('');

-- A broadcast's paid message count, from the order that published the campaign (null without one).
create or replace function admin.ad_broadcast_messages(p_order text)
returns integer
language sql
stable
set search_path = ''
as $function$
  select case when o.spec ->> 'messages' ~ '^[0-9]{1,6}$' then (o.spec ->> 'messages')::integer end
    from public.ad_orders o
   where o.order_id = p_order
$function$;

-- The four, in one place for the functions below.
create or replace function admin.manual_ad_types()
returns text[]
language sql
immutable
set search_path = ''
as $function$ select array['fbInsta', 'googleProduct', 'socialCombo', 'directBroadcast']::text[] $function$;

create or replace function public.admin_ad_manual_list()
returns table (
  ad_id uuid, vendor_id uuid, vendor_name text, title text, placement text, manual_types text[],
  status text, starts_at timestamptz, ends_at timestamptz, created_at timestamptz,
  product_id uuid, product_name text, done_at timestamptz, done_by_name text, note text, messages integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (coalesce(public.is_admin(), false)
          and public.admin_role() = any (array['super_admin', 'ads_moderator', 'support']::public.admin_role_type[])) then
    raise exception 'Only Cosora''s ads team can see manual ad work.' using errcode = '42501';
  end if;
  return query
  select a.id, a.vendor_id, vp.brand_name, a.title, a.placement,
         array(select t from unnest(string_to_array(replace(coalesce(a.placement, ''), ' ', ''), ',')) t
                where t = any (admin.manual_ad_types())),
         a.status::text, a.starts_at, a.ends_at, a.created_at,
         a.product_id, p.name, w.done_at,
         (select pr.full_name from public.profiles pr where pr.id = w.done_by), w.note,
         case when string_to_array(replace(coalesce(a.placement, ''), ' ', ''), ',') @> array['directBroadcast']
              then admin.ad_broadcast_messages(a.ad_order_id) end
    from public.advertisements a
    left join public.vendor_profiles vp on vp.id = a.vendor_id
    left join public.products p on p.id = a.product_id
    left join admin.ad_manual_work w on w.ad_id = a.id
   where string_to_array(replace(coalesce(a.placement, ''), ' ', ''), ',') && admin.manual_ad_types()
     and a.status::text not in ('draft', 'rejected', 'archived')
   order by (w.done_at is null) desc, a.created_at desc
   limit 500;
end
$function$;

create or replace function public.admin_ad_manual_done(p_ad uuid, p_done boolean, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_ad record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not (coalesce(public.is_admin(), false)
          and public.admin_role() = any (array['super_admin', 'ads_moderator']::public.admin_role_type[])) then
    raise exception 'Only super admins and ads moderators can mark manual ad work.' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;
  select a.id, a.vendor_id, a.title, a.status::text as status, a.placement into v_ad
    from public.advertisements a where a.id = p_ad for update;
  if v_ad.id is null then
    raise exception 'That campaign doesn''t exist.' using errcode = 'P0002';
  end if;
  if not (string_to_array(replace(coalesce(v_ad.placement, ''), ' ', ''), ',') && admin.manual_ad_types()) then
    raise exception 'This campaign has no ad type that is done by hand.' using errcode = '22023';
  end if;

  if coalesce(p_done, true) then
    -- Only once Cosora has approved it: a campaign in review may yet be rejected.
    if v_ad.status not in ('active', 'scheduled', 'paused_by_vendor', 'paused_by_admin', 'paused', 'expired', 'ended') then
      raise exception 'Approve the campaign before marking it done.' using errcode = '22023';
    end if;
    insert into admin.ad_manual_work (ad_id, done_at, done_by, note)
    values (v_ad.id, now(), auth.uid(), v_note)
    on conflict (ad_id) do update set done_at = excluded.done_at, done_by = excluded.done_by, note = excluded.note
     where admin.ad_manual_work.ad_id = excluded.ad_id;
    perform public.notify(v_ad.vendor_id, 'ad_manual_done', 'Cosora has set up your ad',
      'The Cosora team has done the part of "' || left(coalesce(v_ad.title, 'your campaign'), 120)
      || '" that is run by hand. See Your Campaigns.');
  else
    delete from admin.ad_manual_work where ad_id = v_ad.id;
  end if;
  return jsonb_build_object('ad_id', v_ad.id, 'done', coalesce(p_done, true));
end
$function$;

create or replace function public.my_ad_manual_work()
returns table (ad_id uuid, done_at timestamptz, messages integer)
language sql
stable
security definer
set search_path = ''
as $function$
  select a.id, w.done_at,
         case when string_to_array(replace(coalesce(a.placement, ''), ' ', ''), ',') @> array['directBroadcast']
              then admin.ad_broadcast_messages(a.ad_order_id) end
    from public.advertisements a
    left join admin.ad_manual_work w on w.ad_id = a.id
   where a.vendor_id = (select auth.uid())
     and string_to_array(replace(coalesce(a.placement, ''), ' ', ''), ',') && admin.manual_ad_types()
$function$;

revoke all on function public.admin_ad_manual_list() from public, anon;
revoke all on function public.admin_ad_manual_done(uuid, boolean, text) from public, anon;
revoke all on function public.my_ad_manual_work() from public, anon;
grant execute on function public.admin_ad_manual_list() to authenticated;
grant execute on function public.admin_ad_manual_done(uuid, boolean, text) to authenticated;
grant execute on function public.my_ad_manual_work() to authenticated;

-- Self-check: a seller can't call the admin functions; the seller function answers only for the caller.
do $check$
declare
  v_vendor uuid;
begin
  select id into v_vendor from public.vendor_profiles order by created_at limit 1;
  if v_vendor is null then return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.admin_ad_manual_list();
    raise exception 'manual ad work self-check: a seller listed manual ad work';
  exception when insufficient_privilege then null;
  end;
  perform * from public.my_ad_manual_work();
  reset role;
end
$check$;
