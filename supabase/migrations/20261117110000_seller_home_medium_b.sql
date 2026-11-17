-- Seller Home audit, Medium items batch 2 (2026-11-17). Plan: documentation/seller-home-medium-fixes-plan-2026-11-17.md.
--
-- SH-095  ad_order_fulfil() refuses a campaign on a listing that isn't the order's vendor's (the payment functions also
--         check, before money moves, that every listing is the seller's own and live: _shared/adOrderChecks.ts).
-- SH-098  active_ads() reads running campaigns through a partial index before the per-row eligibility check.
-- SH-080  vendor_response_threads(): one row per thread for the seller's reply times, computed here. The browser used to
--         read every message of every chat (cut at 1,000 rows) with every conversation id in one GET URL.
--
-- Both functions are recreated from their live definitions (20261116110200 and the active_ads in force), each with
-- the one addition marked above; grants are unchanged by CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.ad_order_fulfil(p_order_id text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.ad_orders%rowtype;
  v_extra text;
  v_count integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'ad_order_fulfil: no campaigns to publish' using errcode = '22023';
  end if;

  select * into v_order
    from public.ad_orders o
   where o.order_id = p_order_id and o.status = 'created'
     for update;
  if not found then
    return jsonb_build_object('claimed', false, 'count', 0);
  end if;

  select k into v_extra
    from jsonb_array_elements(p_rows) e, jsonb_object_keys(e) k
   where k not in ('vendor_id', 'product_id', 'title', 'image_url', 'daily_budget', 'placement',
                   'status', 'starts_at', 'ends_at', 'target_categories', 'target_cities',
                   'target_states', 'target_countries', 'ad_order_id')
   limit 1;
  if v_extra is not null then
    raise exception 'ad_order_fulfil: unknown campaign field %', v_extra using errcode = '22023';
  end if;

  if exists (select 1 from jsonb_array_elements(p_rows) e
              where (e ->> 'vendor_id') is distinct from v_order.vendor_id::text) then
    raise exception 'ad_order_fulfil: a campaign is not for the order''s vendor' using errcode = '22023';
  end if;

  -- SH-095 (2026-11-17): a campaign promotes one of the order's vendor's own listings, or none (the seal and the
  -- certificate). A listing of someone else's is refused, so the paid order goes to refund review (adPublish.ts).
  if exists (select 1 from jsonb_array_elements(p_rows) e
              where nullif(e ->> 'product_id', '') is not null
                and not exists (select 1 from public.products p
                                 where p.id = (e ->> 'product_id')::uuid and p.vendor_id = v_order.vendor_id)) then
    raise exception 'ad_order_fulfil: a campaign promotes a listing that isn''t the vendor''s' using errcode = '22023';
  end if;

  update public.ad_orders
     set status = 'paid', paid_at = now()
   where order_id = p_order_id;

  insert into public.advertisements
         (vendor_id, product_id, title, image_url, daily_budget, placement, status,
          starts_at, ends_at, target_categories, target_cities, target_states,
          target_countries, ad_order_id)
  select v_order.vendor_id,
         nullif(e ->> 'product_id', '')::uuid,
         e ->> 'title',
         e ->> 'image_url',
         (e ->> 'daily_budget')::numeric,
         e ->> 'placement',
         coalesce(e ->> 'status', 'draft'),
         (e ->> 'starts_at')::timestamptz,
         (e ->> 'ends_at')::timestamptz,
         nullif(e -> 'target_categories', 'null'::jsonb),
         nullif(e -> 'target_cities', 'null'::jsonb),
         coalesce((select array_agg(x) from jsonb_array_elements_text(
                     case when jsonb_typeof(e -> 'target_states') = 'array' then e -> 'target_states' else '[]'::jsonb end) x),
                  '{}'::text[]),
         coalesce((select array_agg(x) from jsonb_array_elements_text(
                     case when jsonb_typeof(e -> 'target_countries') = 'array' then e -> 'target_countries' else '[]'::jsonb end) x),
                  '{}'::text[]),
         p_order_id
    from jsonb_array_elements(p_rows) e;
  get diagnostics v_count = row_count;

  return jsonb_build_object('claimed', true, 'count', v_count,
                            'discount_redemption_id', v_order.discount_redemption_id);
end
$function$;

CREATE OR REPLACE FUNCTION public.active_ads(max_count integer DEFAULT 12, filter_category uuid DEFAULT NULL::uuid, filter_placements text[] DEFAULT NULL::text[], filter_categories uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(ad_id uuid, product_id uuid, title text, placement text, product_name text, price_value numeric, currency text, image_url text, vendor_id uuid, vendor_name text, category_name text, is_bumped boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  order by public.ad_is_bumped(a) desc, a.created_at desc, a.id desc
  limit greatest(1, max_count);
$function$;

create index if not exists advertisements_running_idx
  on public.advertisements (created_at desc, id desc)
  where status = 'active';

create or replace function public.vendor_response_threads()
returns table (conversation_id uuid, buyer_id uuid, first_buyer_at timestamptz, first_reply_at timestamptz, awaiting boolean)
language sql
stable
security definer
set search_path = ''
as $function$
  with me as (select (select auth.uid()) as uid),
  c as (
    select cv.id, case when cv.user_a = me.uid then cv.user_b else cv.user_a end as other_id
      from public.conversations cv, me
     where me.uid is not null and me.uid in (cv.user_a, cv.user_b)
  ),
  firsts as (
    select c.id, c.other_id,
           (select min(m.created_at) from public.messages m
             where m.conversation_id = c.id and m.sender_id <> (select uid from me)) as first_buyer_at
      from c
  )
  select f.id,
         f.other_id,
         f.first_buyer_at,
         (select min(m.created_at) from public.messages m
           where m.conversation_id = f.id and m.sender_id = (select uid from me) and m.created_at > f.first_buyer_at),
         (select l.sender_id <> (select uid from me)
            from public.messages l where l.conversation_id = f.id
           order by l.created_at desc, l.id desc limit 1)
    from firsts f
   where f.first_buyer_at is not null
$function$;

revoke all on function public.vendor_response_threads() from public, anon;
grant execute on function public.vendor_response_threads() to authenticated;

-- Self-check: active_ads still answers, and the new pieces exist.
do $check$
begin
  perform * from public.active_ads(12, null, null, null);
  if not exists (select 1 from pg_indexes where indexname = 'advertisements_running_idx') then
    raise exception 'batch 2 self-check: advertisements_running_idx missing';
  end if;
  if position('promotes a listing that' in pg_get_functiondef('public.ad_order_fulfil(text,jsonb)'::regprocedure)) = 0 then
    raise exception 'batch 2 self-check: ad_order_fulfil has no listing-owner check';
  end if;
end
$check$;
