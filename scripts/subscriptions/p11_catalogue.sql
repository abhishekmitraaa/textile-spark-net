-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P11: bulk catalogue import (2026-10-09).
-- Migration 20261009150000_subscriptions_p11_catalogue.sql (on top of P0-P10).
--   who       Silver, Gold and VIP on the switch; not Free, Basic, or off the switch
--   rows      good rows become products in review with their fields and images; bad rows are
--             reported one by one and the rest go in
--   rules     the product rules apply as on the Upload page: the listing limit, moderation
--             (never live), the seller's own products only
--   limits    500 rows, 20 imports a day; drafts don't use the limit
--   history   the batch; another seller can't read it; categories by name; the plan wording
-- HOW TO RUN (local stack with P0-P11 applied, or: begin; <P11>; <this>; rollback;). Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p11$
declare
  gold   uuid := '22222222-2222-2222-2222-222222222222';
  free   uuid := '02d5183b-f984-4ca9-a7cb-684564e37789';
  basic  uuid;
  silver uuid;
  vip    uuid;
  everyone uuid[];
  child  uuid;
  labels text[] := array[
    'who may import',                                                         -- 1
    'good rows become products in review, with their fields and images',     -- 2
    'bad rows are reported one by one; the good ones still go in',           -- 3
    'drafts, and the listing limit for the rest',                            -- 4
    'never live, never another seller''s',                                   -- 5
    'limits: 500 rows, 20 imports a day',                                    -- 6
    'categories by name, exact with Parent > Child',                         -- 7
    'the history is the seller''s own',                                      -- 8
    'the plans say what they give'];                                          -- 9
  got text; want text; i int; n int; j jsonb; rows jsonb;
  out text := '';
begin
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (free, 'P11 free vendor', true)
    on conflict (id) do update set onboarding_complete = true;
  select array_agg(x.id order by x.id) into everyone
    from (select v.id from public.vendor_profiles v join public.profiles p on p.id = v.id
           where v.id not in (gold, free) order by v.id limit 3) x;
  basic := everyone[1]; silver := everyone[2]; vip := everyone[3];
  select c.id into child from public.categories c join public.categories pc on pc.id = c.parent_id
   where c.name = 'Activewear' and pc.name = 'Apparel & Home Categories';
  if vip is null or child is null then
    raise exception 'the harness needs three more local vendors and Apparel & Home Categories > Activewear';
  end if;
  everyone := array[gold, free, basic, silver, vip];
  update public.feature_flags set enabled = false, allow_profile_ids = everyone where key = 'bulk_import';
  update public.profiles set account_status = 'active' where id = any (everyone);
  delete from public.product_import_batches where vendor_id = any (everyone);
  update public.products set status = 'draft' where vendor_id = any (everyone) and status <> 'draft';
  delete from public.vendor_subscriptions where vendor_id = free;
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  select x.v, x.p, 'monthly', 'active', now() - interval '5 days', now() + interval '25 days'
    from (values (gold, 'gold'), (basic, 'basic'), (silver, 'silver'), (vip, 'vip')) as x(v, p)
  on conflict (vendor_id) do update set plan_id = excluded.plan_id, billing_cycle = 'monthly', status = 'active',
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null;
  rows := jsonb_build_array(jsonb_build_object('name', 'P11 polo', 'category', 'Activewear', 'price', '240'));

  for i in 1..array_length(labels, 1) loop
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
      if i = 1 then
        got := '';
        foreach n in array array[1, 2, 3, 4, 5] loop
          perform set_config('request.jwt.claims', json_build_object('sub', everyone[n], 'role', 'authenticated')::text, true);
          set local role authenticated;
          begin perform public.import_products(rows, 'a.csv', true); got := got || 'y';
          exception when insufficient_privilege then got := got || 'n'; end;
          reset role;
        end loop;
        update public.feature_flags set allow_profile_ids = array_remove(allow_profile_ids, silver) where key = 'bulk_import';
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.import_products(rows, 'a.csv', true); got := got || ' off=y';
        exception when insufficient_privilege then got := got || ' off=n'; end;
        reset role;
        want := 'ynnyy off=n';   -- gold, free, basic, silver, vip
      elsif i = 2 then
        set local role authenticated;
        j := public.import_products(jsonb_build_array(
          jsonb_build_object('name', 'P11 track pant', 'category', 'Activewear', 'price', '₹1,250', 'compare_at_price', '1500',
                             'moq', '300 pcs', 'fabric', 'Polyester', 'gsm', '180', 'gender', 'Men', 'colour', 'Navy',
                             'sizes', 'S, M, L, XL', 'pattern', 'Solid', 'occasion', 'Sports, Casual', 'country_of_origin', 'India',
                             'description', 'Breathable track pant',
                             'image_urls', 'https://example.com/a.jpg, https://example.com/b.jpg'),
          jsonb_build_object('name', 'P11 tee', 'category', 'Activewear'),
          jsonb_build_object('name', 'P11 hoodie', 'category', 'activewear', 'price', '899')), 'catalogue.csv', false);
        reset role;
        got := (j ->> 'created') || '/' || (j ->> 'failed')
               || ' ' || (select p.status || '|' || p.price_value || '|' || p.compare_at_price || '|' || p.moq || '|' || array_to_string(p.sizes, '+')
                                 || '|' || array_to_string(p.occasion, '+') || '|' || (p.category_id = child) || '|'
                                 || (select string_agg(pi.url, ',' order by pi.position) from public.product_images pi where pi.product_id = p.id)
                            from public.products p where p.vendor_id = silver and p.name = 'P11 track pant')
               || ' batch=' || (select b.file_name || '|' || b.total || '|' || b.created from public.product_import_batches b where b.id = (j ->> 'batch_id')::uuid);
        want := '3/0 under_review|1250.00|1500|300 pcs|S+M+L+XL|Sports+Casual|true|https://example.com/a.jpg,https://example.com/b.jpg batch=catalogue.csv|3|3';
      elsif i = 3 then
        set local role authenticated;
        j := public.import_products(jsonb_build_array(
          jsonb_build_object('category', 'Activewear'),
          jsonb_build_object('name', 'P11 x', 'category', 'Spaceships'),
          jsonb_build_object('name', 'P11 x', 'category', 'Activewear', 'price', 'cheap'),
          jsonb_build_object('name', 'P11 good', 'category', 'Activewear', 'price', '10'),
          jsonb_build_object('name', 'P11 x', 'category', 'Activewear', 'image_urls', 'http://example.com/a.jpg'),
          jsonb_build_object('name', 'P11 x', 'category', 'Activewear', 'gender', 'Robots'),
          jsonb_build_object('name', 'P11 x', 'category', 'Activewear', 'price', '-5'),
          '"not a row"'::jsonb), null, true);
        reset role;
        got := (j ->> 'created') || '/' || (j ->> 'failed') || ' '
               || (select string_agg((e ->> 'row') || ':' || split_part(coalesce(e ->> 'error', 'ok'), ' ', 1), ',' order by (e ->> 'row')::int)
                     from jsonb_array_elements(j -> 'results') e);
        want := '1/7 1:name,2:category,3:price,4:ok,5:image_urls:,6:gender,7:price,8:not';
      elsif i = 4 then
        -- Silver lists 19. With 18 in review or live, three more in review: one fits.
        insert into public.products (vendor_id, name, status, category_id) select silver, 'P11 existing ' || g, 'live', child from generate_series(1, 18) g;
        set local role authenticated;
        j := public.import_products(jsonb_build_array(
          jsonb_build_object('name', 'P11 a', 'category', 'Activewear'), jsonb_build_object('name', 'P11 b', 'category', 'Activewear'),
          jsonb_build_object('name', 'P11 c', 'category', 'Activewear')), 'over.csv', false);
        got := (j ->> 'created') || '/' || (j ->> 'failed') || ' ' || split_part(j -> 'results' -> 1 ->> 'error', ':', 1);
        j := public.import_products(jsonb_build_array(
          jsonb_build_object('name', 'P11 d', 'category', 'Activewear'), jsonb_build_object('name', 'P11 e', 'category', 'Activewear')), 'drafts.csv', true);
        reset role;
        got := got || ' drafts=' || (j ->> 'created');
        want := '1/2 Product limit reached drafts=2';
      elsif i = 5 then
        set local role authenticated;
        j := public.import_products(jsonb_build_array(
          jsonb_build_object('name', 'P11 sneaky', 'category', 'Activewear', 'status', 'live', 'vendor_id', gold)), null, false);
        reset role;
        got := (select p.status || '/' || (p.vendor_id = silver) from public.products p where p.id = (j -> 'results' -> 0 ->> 'product_id')::uuid);
        want := 'under_review/true';
      elsif i = 6 then
        set local role authenticated;
        begin perform public.import_products((select jsonb_agg(jsonb_build_object('name', 'r' || g, 'category', 'Activewear')) from generate_series(1, 501) g), null, true);
          got := '501 taken';
        exception when sqlstate '22023' then got := '501 refused'; end;
        begin perform public.import_products('[]'::jsonb, null, true); got := got || ' empty taken';
        exception when sqlstate '22023' then got := got || ' empty refused'; end;
        reset role;
        insert into public.product_import_batches (vendor_id, total, created) select silver, 1, 1 from generate_series(1, 20);
        set local role authenticated;
        begin perform public.import_products(rows, null, true); got := got || ' 21st taken';
        exception when sqlstate 'P0001' then got := got || ' 21st refused'; end;
        reset role;
        want := '501 refused empty refused 21st refused';
      elsif i = 7 then
        got := (public.category_for_import('Apparel & Home Categories > Activewear') = child)::text
               || '/' || (public.category_for_import('  ACTIVEWEAR ') = child)::text
               || '/' || coalesce(public.category_for_import('Nowhere > Activewear')::text, 'null')
               || '/' || coalesce(public.category_for_import('')::text, 'null');
        want := 'true/true/null/null';
      elsif i = 8 then
        set local role authenticated;
        perform public.import_products(rows, 'mine.csv', true);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vip, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := 'vip sees=' || (select count(*) from public.product_import_batches where vendor_id = silver);
        begin insert into public.product_import_batches (vendor_id, total) values (silver, 1); got := got || ' forged';
        exception when insufficient_privilege then got := got || ' forge refused'; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' own=' || (select count(*) from public.product_import_batches);
        reset role;
        want := 'vip sees=0 forge refused own=1';
      elsif i = 9 then
        got := (select string_agg(id || ':' || (display ->> 'catalog'), ' | ' order by sort_order) from public.subscription_plans where id in ('free', 'basic', 'silver', 'gold', 'vip'));
        perform set_config('request.jwt.claims', json_build_object('sub', vip, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.vendor_entitlements() -> 'features';
        reset role;
        got := got || ' vip=' || (j ->> 'catalogue') || '/' || (j ->> 'bulk_import');
        want := 'free:Add products one by one | basic:PDF catalogue | silver:PDF + bulk import (Excel/CSV) | gold:Bulk import; done-for-you catalogue coming soon | vip:Bulk import; AI catalogue coming soon vip=bulk/true';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P11 (rolled back)%', E'\n' || out;
end
$p11$;
