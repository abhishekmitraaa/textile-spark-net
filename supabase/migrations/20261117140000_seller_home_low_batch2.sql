-- Seller Home audit, Low items batch 2 (2026-11-17): the database part.
-- Plan and record: documentation/seller-home-low-fixes-plan-2026-11-17.md.
--
--   SH-084  the lead alert history leaves out requirements of a buyer with a block either way
--   SH-099  ad_impression records every impression: no daily cap (Mitra, 2026-11-18)
--   SH-107  chat_buyer_card(): the small buyer card in a chat (Mitra, "Small buyer card")
--   SH-108  vendor_review_stats(): review averages and breakdowns from the database; replies at most 2,000 characters
--
-- my_lead_alerts below is 20261114110000's body (the last migration that wrote it) with the block filter added.

-- ── SH-084 ──
create or replace function public.my_lead_alerts(p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me    uuid := auth.uid();
  e       record;
  v_lim   jsonb;
  v_name  text;
  s       public.lead_alert_settings;
  v_on    boolean;
  v_peers uuid[];
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_on := admin.feature_on_for('lead_alerts', v_me);
  -- Everyone with a block either way, read once (SH-084).
  v_peers := coalesce(public.my_block_peers(), '{}'::uuid[]);
  select * into e from admin.vendor_effective_plan(v_me, now());
  select p.name, coalesce(p.limits -> 'lead_alert_channels', '[]'::jsonb) into v_name, v_lim
    from public.subscription_plans p where p.id = e.plan_id;
  select * into s from public.lead_alert_settings ls where ls.vendor_id = v_me;

  return jsonb_build_object(
    'available', v_on and jsonb_array_length(coalesce(v_lim, '[]'::jsonb)) > 0,
    'switch_on', v_on,
    'plan_id', e.plan_id, 'plan_name', v_name,
    'channels', coalesce(v_lim, '[]'::jsonb),
    'live_channels', to_jsonb(array(
      select c from unnest(array['app', 'email', 'whatsapp', 'sms', 'digest']) c
       where case c
               when 'app' then true
               when 'digest' then exists (select 1 from cron.job j where j.jobname = 'lead-alert-digest' and j.active)
                                  and exists (select 1 from admin.notification_templates t where t.key = 'lead_digest' and t.channel = 'email' and t.active)
               else exists (select 1 from admin.notification_templates t where t.key = 'lead_alert' and t.channel = c and t.active)
             end)),
    'settings', jsonb_build_object(
      'instant', coalesce(s.instant, true), 'digest', coalesce(s.digest, true),
      'category_ids', coalesce(to_jsonb(s.category_ids), 'null'::jsonb),
      'quiet_start', to_char(s.quiet_start, 'HH24:MI'), 'quiet_end', to_char(s.quiet_end, 'HH24:MI')),
    'whatsapp_consent', exists (select 1 from public.contact_consent c where c.profile_id = v_me and c.channel = 'whatsapp' and c.opted_in),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
        from public.categories c
       where c.id in (select p.category_id from public.products p where p.vendor_id = v_me and p.status::text = 'live' and p.category_id is not null)), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(x.row order by x.created_at desc)
        from (select la.created_at,
                     jsonb_build_object(
                       'id', la.id, 'rfq_id', la.rfq_id, 'at', la.created_at,
                       'title', case when q.removed_at is not null then 'A requirement Cosora removed'
                                     else admin.alert_text(coalesce(nullif(btrim(q.title), ''), q.product_name), 120) end,
                       'category', case when q.removed_at is null then c.name end,
                       'quantity', case when q.removed_at is null then q.quantity end,
                       'open', q.status::text = 'active' and q.removed_at is null and (q.expires_at is null or q.expires_at > now()),
                       'channels', to_jsonb(la.channels), 'held', la.held, 'in_digest', la.digest_at is not null) as row
                from admin.lead_alerts la
                join public.rfqs q on q.id = la.rfq_id
                left join public.categories c on c.id = q.category_id
               where la.vendor_id = v_me
                 -- A block either way hides the buyer's requirements from the seller, the alert history too (SH-084).
                 and not (q.buyer_id = any (v_peers))
               order by la.created_at desc
               limit least(greatest(coalesce(p_limit, 30), 1), 100)) x), '[]'::jsonb));
end
$function$;

-- ── SH-099: every impression is recorded (Mitra, 2026-11-18: "there should be no daily cap and all the impressions
-- should be recorded") ──
-- ad_impression skipped a call when ad_frequency_capped (8 a day per viewer) or ad_logging_throttled (5 seconds) said
-- so, and both read engagement_events rows only the browser wrote, so the cap held for the app and for nobody else.
-- There is no cap now, for anyone: each call counts one impression on a running campaign. The browser's ad_impression
-- engagement event is analytics only. The two helpers are left in place, read by nothing.
create or replace function public.ad_impression(ad uuid, p_session text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if ad is null then return; end if;
  update public.advertisements set impressions = impressions + 1 where id = ad and status = 'active';
end $function$;

-- ── SH-107: the small buyer card in a chat (Mitra, 2026-11-17, "Small buyer card") ──
-- What the buyer already shows a seller: name, company, city, member since. Only to someone the buyer has written to
-- in a chat (a message from the buyer in a conversation with the caller), never while either has blocked the other.
-- A conversation row alone isn't enough: anyone can start one with a first message, so it would have opened any
-- buyer's company and city to anyone (commit security review, 2026-11-17). No contact details.
create or replace function public.chat_buyer_card(p_other uuid)
returns table (name text, company text, city text, member_since timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(nullif(btrim(bp.display_name), ''), nullif(btrim(pr.full_name), ''), 'Cosora buyer'),
         nullif(btrim(bp.company), ''),
         nullif(btrim(coalesce(bp.city, bp.business_city)), ''),
         pr.created_at
    from public.profiles pr
    left join public.buyer_profiles bp on bp.id = pr.id
   where pr.id = p_other
     and (select auth.uid()) is not null
     and p_other <> (select auth.uid())
     and exists (select 1 from public.conversations c
                   join public.messages m on m.conversation_id = c.id and m.sender_id = p_other
                  where (c.user_a = (select auth.uid()) and c.user_b = p_other)
                     or (c.user_b = (select auth.uid()) and c.user_a = p_other))
     and not public.chat_blocked_between((select auth.uid()), p_other)
$function$;
revoke all on function public.chat_buyer_card(uuid) from public, anon;
grant execute on function public.chat_buyer_card(uuid) to authenticated;

-- ── SH-108: review stats from the database; replies have a limit ──
-- The pages averaged every row in the browser, which PostgREST cuts at 1,000. Reviews are public (SELECT true), so
-- this reads with the caller's rights.
create or replace function public.vendor_review_stats(p_vendor uuid)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'count', (select count(*) from public.reviews r where r.vendor_id = p_vendor),
    'avg', (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.vendor_id = p_vendor),
    'breakdown', (select jsonb_agg(jsonb_build_object('stars', s, 'count',
                     (select count(*) from public.reviews r where r.vendor_id = p_vendor and r.rating = s)) order by s desc)
                    from generate_series(1, 5) s),
    'product_count', (select count(*) from public.product_reviews pr join public.products p on p.id = pr.product_id
                       where p.vendor_id = p_vendor))
$function$;
grant execute on function public.vendor_review_stats(uuid) to anon, authenticated;

create or replace function public.reply_to_review(review_id uuid, reply text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.account_is_active(auth.uid()) then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  if coalesce(btrim(reply), '') = '' then
    raise exception 'A reply can''t be empty' using errcode = '22023';
  end if;
  if char_length(btrim(reply)) > 2000 then
    raise exception 'Keep the reply under 2,000 characters.' using errcode = '22023';
  end if;
  -- A seller can't answer someone who blocked them, or whom they blocked (20261018160200).
  if exists (select 1 from public.reviews x where x.id = review_id and x.vendor_id = auth.uid()
              and public.chat_blocked_between(auth.uid(), x.buyer_id)) then
    raise exception 'You can''t reply to this review: one of you has blocked the other.' using errcode = '42501';
  end if;
  perform set_config('cosora.review_reply', 'on', true);
  update public.reviews
     set reply_body = btrim(reply), replied_at = now()
   where id = review_id and vendor_id = auth.uid();
  if not found then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  perform set_config('cosora.review_reply', '', true);
end $function$;

create or replace function public.reply_to_product_review(review_id uuid, reply text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.account_is_active(auth.uid()) then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  if coalesce(btrim(reply), '') = '' then
    raise exception 'A reply can''t be empty' using errcode = '22023';
  end if;
  if char_length(btrim(reply)) > 2000 then
    raise exception 'Keep the reply under 2,000 characters.' using errcode = '22023';
  end if;
  -- A seller can't answer someone who blocked them, or whom they blocked (20261018160200).
  if exists (select 1 from public.product_reviews x join public.products p on p.id = x.product_id where x.id = review_id and p.vendor_id = auth.uid()
              and public.chat_blocked_between(auth.uid(), x.buyer_id)) then
    raise exception 'You can''t reply to this review: one of you has blocked the other.' using errcode = '42501';
  end if;
  perform set_config('cosora.review_reply', 'on', true);
  update public.product_reviews pr
     set reply_body = btrim(reply), replied_at = now()
    from public.products p
   where pr.id = review_id and p.id = pr.product_id and p.vendor_id = auth.uid();
  if not found then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  perform set_config('cosora.review_reply', '', true);
end $function$;

alter table public.reviews drop constraint if exists reviews_reply_length;
alter table public.reviews add constraint reviews_reply_length
  check (reply_body is null or char_length(reply_body) <= 2000) not valid;
alter table public.product_reviews drop constraint if exists product_reviews_reply_length;
alter table public.product_reviews add constraint product_reviews_reply_length
  check (reply_body is null or char_length(reply_body) <= 2000) not valid;

-- Self-check.
do $check$
begin
  if position('v_peers' in pg_get_functiondef('public.my_lead_alerts(integer)'::regprocedure)) = 0 then
    raise exception 'SH-084 self-check: lead alert history ignores blocks';
  end if;
  if position('ad_frequency_capped' in pg_get_functiondef('public.ad_impression(uuid, text)'::regprocedure)) > 0 then
    raise exception 'SH-099 self-check: ad_impression still caps';
  end if;
  if has_function_privilege('anon', 'public.chat_buyer_card(uuid)', 'execute') then
    raise exception 'SH-107 self-check: a visitor can read a buyer card';
  end if;
end
$check$;
