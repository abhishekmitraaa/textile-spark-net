-- A paid ad order could end up with no campaigns (code review 2026-10-13; Seller Home audit SH-090, 2026-11-15).
-- Written on 2026-10-13 as 20261013100400 on branch fix/review-2026-10-13, which was never released; brought into the
-- Seller Home fixes on 2026-11-16 (Mitra: only this fix from that branch). The functions that call it,
-- razorpay-verify-payment and razorpay-webhook (supabase/functions/_shared/adPublish.ts), are deployed AFTER this.
--
-- razorpay-verify-payment and razorpay-webhook published an order in two separate REST
-- calls: first mark the order 'created' -> 'paid', then insert its campaigns. If the
-- second call failed (a timeout, a constraint, a guard trigger refusing a row, the function
-- dying in between) the order stayed 'paid' with nothing published. Both paths then saw
-- "already paid" and did nothing, the webhook still answered 200 so Razorpay never
-- retried, and no refund flag was set. The vendor had paid for nothing, silently.
--
-- ad_order_fulfil() does both in one transaction. Either the order is marked paid AND
-- every campaign is in, or nothing changed and the order is still 'created', so the other
-- path, or Razorpay's retry of the webhook, can publish it.
--
-- Called by the two functions with the service key only. p_rows is what buildAdRows()
-- (supabase/functions/_shared/adPricing.ts) returns. The column list below is that
-- function's, spelled out; a row carrying any other key is refused, so a column added
-- there and forgotten here fails loudly and is never dropped silently.
--
-- Answers { claimed, count, discount_redemption_id }. claimed = false means the order was
-- not waiting (already paid, flagged, or unknown): nothing was done.

create or replace function public.ad_order_fulfil(p_order_id text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
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
$fn$;

revoke execute on function public.ad_order_fulfil(text, jsonb) from public, anon, authenticated;
grant execute on function public.ad_order_fulfil(text, jsonb) to service_role;

-- Self-check: definer, with no search path to borrow, and only the service role may call it.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'ad_order_fulfil' and p.prosecdef
                    and p.proconfig @> array['search_path=""']) then
    raise exception 'ad_order_fulfil must be SECURITY DEFINER with an empty search_path';
  end if;
  if has_function_privilege('authenticated', 'public.ad_order_fulfil(text, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.ad_order_fulfil(text, jsonb)', 'execute') then
    raise exception 'ad_order_fulfil must not be callable from a browser';
  end if;
  if not has_function_privilege('service_role', 'public.ad_order_fulfil(text, jsonb)', 'execute') then
    raise exception 'the payment functions (service role) must be able to call ad_order_fulfil';
  end if;
end $$;
