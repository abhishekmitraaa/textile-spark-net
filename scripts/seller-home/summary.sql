-- Seller Home fixes, Task 2 (SH-006, SH-014, SH-016, SH-026, SH-027): seller_home_summary().
--
-- Checks, each raising on failure:
--   summary_anon_refused     anon can't run it
--   summary_other_seller     a seller's summary holds only their own products and chats
--   summary_shapes           arrays are always arrays of at most 3; a seller with no products or chats gets []
--   summary_counts_match     every count equals the same question asked directly as that seller
--   summary_overseas_counts  open_leads equals what the seller can read, for Free, Gold and VIP sellers
-- Seeds inside one transaction and rolls back.
--
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < scripts/seller-home/summary.sql

begin;

-- One overseas requirement inside VIP's head start, so Free/Gold/VIP counts differ.
alter table public.rfqs disable trigger user;
update public.rfqs set overseas = true, overseas_vip_until = now() + interval '1 day'
 where id = (select id from public.rfqs where status = 'active' and vendor_id is null and expires_at > now()
              order by created_at desc limit 1);
alter table public.rfqs enable trigger user;

create temp table sm_sellers (label text, id uuid) on commit drop;
-- A seller with no products, quotes or chats at all.
insert into sm_sellers
select 'empty', v.id from public.vendor_profiles v
 where v.onboarding_complete
   and not exists (select 1 from public.products p where p.vendor_id = v.id)
   and not exists (select 1 from public.quotes q where q.vendor_id = v.id)
   and not exists (select 1 from public.conversations c where c.user_a = v.id or c.user_b = v.id)
   and not exists (select 1 from public.vendor_subscriptions s where s.vendor_id = v.id)
 order by v.id limit 1;
-- A seller who will get 5 live products and 5 chats.
insert into sm_sellers
select 'busy', v.id from public.vendor_profiles v
 where v.onboarding_complete and v.id not in (select id from sm_sellers)
   and not exists (select 1 from public.products p where p.vendor_id = v.id)
   and not exists (select 1 from public.conversations c where c.user_a = v.id or c.user_b = v.id)
 order by v.id offset 1 limit 1;
insert into sm_sellers select 'gold', vendor_id from public.vendor_subscriptions where plan_id = 'gold' and status = 'active' order by vendor_id limit 1;
insert into sm_sellers select 'vip', vendor_id from public.vendor_subscriptions where plan_id = 'vip' and status = 'active' order by vendor_id limit 1;

insert into public.products (vendor_id, name, price_value, status, views_count, enquiries_count)
select (select id from sm_sellers where label = 'busy'), 'Summary product ' || g, 100 + g + 0.5, 'live', g * 10, g
  from generate_series(1, 5) g;
alter table public.product_images disable trigger user;
insert into public.product_images (product_id, url, position)
select p.id, 'http://127.0.0.1:54321/storage/v1/object/public/product-images/x/' || p.id || '.jpg', 0
  from public.products p where p.vendor_id = (select id from sm_sellers where label = 'busy');
alter table public.product_images enable trigger user;
insert into public.conversations (user_a, user_b)
select least(s.id, o.id), greatest(s.id, o.id)
  from (select id from sm_sellers where label = 'busy') s,
       (select p.id from public.profiles p where p.id not in (select id from sm_sellers) order by p.id limit 5) o;
insert into public.messages (conversation_id, sender_id, kind, body)
select c.id, case when c.user_a = (select id from sm_sellers where label = 'busy') then c.user_b else c.user_a end, 'text', 'hello'
  from public.conversations c
 where (select id from sm_sellers where label = 'busy') in (c.user_a, c.user_b);

do $$
declare
  s record;
  j jsonb;
  n bigint;
  key text;
begin
  if (select count(*) from sm_sellers where id is not null) <> 4 then
    raise exception 'harness setup: expected 4 sellers, found %', (select count(*) from sm_sellers where id is not null);
  end if;

  -- summary_anon_refused
  begin
    execute 'set local role anon';
    perform public.seller_home_summary();
    raise exception 'summary_anon_refused: anon ran seller_home_summary()';
  exception when insufficient_privilege then
    null;
  end;
  execute 'set local role postgres';

  for s in select * from sm_sellers loop
    perform set_config('request.jwt.claims', json_build_object('sub', s.id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    j := public.seller_home_summary();
    execute 'set local role postgres';

    -- summary_shapes
    foreach key in array array['top_products', 'recent_leads', 'recent_chats'] loop
      if jsonb_typeof(j -> key) <> 'array' or jsonb_array_length(j -> key) > 3 then
        raise exception 'summary_shapes: % for % is %', key, s.label, j -> key;
      end if;
    end loop;
    if s.label = 'empty' and (jsonb_array_length(j -> 'top_products') <> 0 or jsonb_array_length(j -> 'recent_chats') <> 0) then
      raise exception 'summary_shapes: empty seller got products or chats';
    end if;
    if s.label = 'busy' and (jsonb_array_length(j -> 'top_products') <> 3 or jsonb_array_length(j -> 'recent_chats') <> 3) then
      raise exception 'summary_shapes: busy seller should get 3 products and 3 chats, got % and %',
        jsonb_array_length(j -> 'top_products'), jsonb_array_length(j -> 'recent_chats');
    end if;

    -- summary_other_seller
    if exists (select 1 from jsonb_array_elements(j -> 'top_products') e
                where not exists (select 1 from public.products p where p.id = (e ->> 'id')::uuid and p.vendor_id = s.id)) then
      raise exception 'summary_other_seller: % sees another seller''s product', s.label;
    end if;

    -- summary_counts_match (asked directly as the seller)
    perform set_config('request.jwt.claims', json_build_object('sub', s.id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.products where vendor_id = s.id;
    if n is distinct from (j #>> '{counts,total}')::bigint then raise exception 'summary_counts_match: total % vs %', j #>> '{counts,total}', n; end if;
    select count(*) into n from public.products where vendor_id = s.id and status = 'live';
    if n is distinct from (j #>> '{counts,live}')::bigint then raise exception 'summary_counts_match: live % vs %', j #>> '{counts,live}', n; end if;
    select count(*) into n from public.products where vendor_id = s.id and status = 'under_review';
    if n is distinct from (j #>> '{counts,under_review}')::bigint then raise exception 'summary_counts_match: under_review'; end if;
    select count(*) into n from public.quotes where vendor_id = s.id;
    if n is distinct from (j #>> '{counts,quotes_sent}')::bigint then raise exception 'summary_counts_match: quotes_sent'; end if;
    select count(*) into n from public.quotes where vendor_id = s.id and status = 'accepted';
    if n is distinct from (j #>> '{counts,quotes_accepted}')::bigint then raise exception 'summary_counts_match: quotes_accepted'; end if;
    select coalesce(sum(enquiries_count), 0) into n from public.products where vendor_id = s.id;
    if n is distinct from (j #>> '{counts,enquiries}')::bigint then raise exception 'summary_counts_match: enquiries'; end if;
    select count(*) into n from public.rfqs where status = 'active' and vendor_id = s.id;
    if n is distinct from (j #>> '{counts,direct_requests}')::bigint then raise exception 'summary_counts_match: direct_requests'; end if;
    -- summary_overseas_counts
    select count(*) into n from public.rfqs
     where status = 'active' and vendor_id is null and expires_at > now() and buyer_id <> s.id;
    if n is distinct from (j #>> '{counts,open_leads}')::bigint then
      raise exception 'summary_overseas_counts: % open_leads % vs readable %', s.label, j #>> '{counts,open_leads}', n;
    end if;
    execute 'set local role postgres';

    raise notice 'summary ok for % (open_leads %, products %, chats %)', s.label, j #>> '{counts,open_leads}',
      jsonb_array_length(j -> 'top_products'), jsonb_array_length(j -> 'recent_chats');
  end loop;
end $$;

rollback;
