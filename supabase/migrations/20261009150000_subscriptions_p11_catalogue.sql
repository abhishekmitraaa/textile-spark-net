-- Subscriptions P11: bulk catalogue import (plan "build every vendor subscription feature",
-- 2026-10-09). Silver, Gold and VIP sellers add many products at once from a spreadsheet
-- (CSV; Excel saves to it). Each row becomes a product that goes to review, or a draft.
--
-- HOW: public.import_products(rows) runs with the SELLER's own rights (security invoker), so
-- every existing rule on products applies to each row exactly as on the Upload page: the
-- insert policy, the listing limit and its lock (enforce_product_cap), moderation (anything
-- not a draft goes to review), the embedding queue. Each row is its own sub-transaction: a bad
-- row is reported and the rest go in.
--
-- LIMITS: 500 rows a call, 20 imports a day; images are https links, up to 6 a row.
--
-- CATALOGUE WORDING (subscription_plans.display.catalog), made true: Free adds products one by
-- one; Basic the PDF catalogue; Silver and up bulk import; Gold's done-for-you and VIP's AI
-- catalogue say "coming soon" (deferred to ToDo by Mitra).
--
-- The `bulk_import` switch (off) lists the sellers who see the page and may import.
-- Harness: scripts/subscriptions/p11_catalogue.sql.

-- ── 0. Guard ───────────────────────────────────────────────────────────────────────
do $guard$
begin
  if md5((select prosrc from pg_proc where oid = 'public.vendor_entitlements(uuid)'::regprocedure))
     <> '52f044b2f93dda4886900b3a19fab3ea' then
    raise exception 'vendor_entitlements changed since it was read; re-read it before patching';
  end if;
end
$guard$;

-- ── 1. The switch, each plan's catalogue, the wording ──────────────────────────────
insert into public.feature_flags (key, description, enabled)
values ('bulk_import',
        'Bulk catalogue import (subscriptions P11): Silver, Gold and VIP sellers this lists add products from a spreadsheet at /catalogue/bulk-import. Off: the page is hidden and import_products refuses.',
        false)
on conflict (key) do nothing;

update public.subscription_plans set limits = limits || '{"catalogue": "manual"}'::jsonb where id = 'free';
update public.subscription_plans set limits = limits || '{"catalogue": "pdf"}'::jsonb where id = 'basic';
update public.subscription_plans set limits = limits || '{"catalogue": "bulk"}'::jsonb where id in ('silver', 'gold', 'vip');
update public.subscription_plans set limits = limits || '{"catalogue": "manual"}'::jsonb where not (limits ? 'catalogue');

update public.subscription_plans set display = display || jsonb_build_object('catalog', case id
    when 'free'   then 'Add products one by one'
    when 'basic'  then 'PDF catalogue'
    when 'silver' then 'PDF + bulk import (Excel/CSV)'
    when 'gold'   then 'Bulk import; done-for-you catalogue coming soon'
    when 'vip'    then 'Bulk import; AI catalogue coming soon'
    else display ->> 'catalog' end)
 where id in ('free', 'basic', 'silver', 'gold', 'vip');

-- ── 2. Import history ──────────────────────────────────────────────────────────────
create table public.product_import_batches (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references public.vendor_profiles (id) on delete cascade,
  file_name  text check (file_name is null or char_length(file_name) <= 200),
  as_draft   boolean not null default false,
  total      integer not null check (total between 0 and 500),
  created    integer not null default 0,
  failed     integer not null default 0,
  errors     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index product_import_batches_vendor on public.product_import_batches (vendor_id, created_at desc);
alter table public.product_import_batches enable row level security;
create policy product_import_batches_select on public.product_import_batches for select using (vendor_id = (select auth.uid()));
create policy product_import_batches_insert on public.product_import_batches for insert with check (vendor_id = (select auth.uid()));
revoke all on public.product_import_batches from anon, authenticated;
grant select, insert on public.product_import_batches to authenticated;
comment on table public.product_import_batches is
  'Each bulk catalogue import (subscriptions P11): how many rows, how many became products, and why the rest did not. Written by import_products() with the seller''s own rights.';

-- ── 3. A category from a name ──────────────────────────────────────────────────────
-- "Activewear", or "Apparel & Home Categories > T-shirts/Tops" to be exact. Names repeat
-- across the old and new trees, so a sub-category (one with a parent) wins.
create or replace function public.category_for_import(p_name text)
returns uuid
language plpgsql stable set search_path = '' as $function$
declare
  v_parent text;
  v_child  text;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    return null;
  end if;
  if position('>' in p_name) > 0 then
    v_parent := btrim(split_part(p_name, '>', 1));
    v_child := btrim(split_part(p_name, '>', 2));
    return (select c.id from public.categories c join public.categories pc on pc.id = c.parent_id
             where lower(c.name) = lower(v_child) and lower(pc.name) = lower(v_parent) limit 1);
  end if;
  return (select c.id from public.categories c where lower(c.name) = lower(btrim(p_name))
           order by (c.parent_id is not null) desc, c.created_at limit 1);
end
$function$;

-- ── 4. The import ──────────────────────────────────────────────────────────────────
-- p_rows: an array of objects, one per spreadsheet row, keys as the template's columns
-- (name, category, price, compare_at_price, moq, unit, description, fabric, gsm, fit_type,
-- gender, colour, sizes, pattern, occasion, country_of_origin, image_urls). Lists are comma
-- separated. Returns the batch: {batch_id, total, created, failed, results: [{row, product_id
-- | error}]}.
create or replace function public.import_products(p_rows jsonb, p_file_name text default null, p_as_draft boolean default false)
returns jsonb
language plpgsql security invoker set search_path = '' as $function$
declare
  v_me      uuid := auth.uid();
  v_total   integer;
  v_created integer := 0;
  v_errors  jsonb := '[]'::jsonb;
  v_results jsonb := '[]'::jsonb;
  v_batch   uuid;
  v_i       integer := 0;
  r         jsonb;
  v_cat     uuid;
  v_price   numeric;
  v_compare numeric;
  v_imgs    text[];
  v_id      uuid;
  v_err     text;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not coalesce((public.vendor_entitlements(v_me) -> 'features' ->> 'bulk_import')::boolean, false) then
    raise exception 'Bulk import comes with the Silver, Gold and VIP plans.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows are a list.' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total = 0 or v_total > 500 then
    raise exception 'An import is 1 to 500 rows. Split a bigger sheet.' using errcode = '22023';
  end if;
  -- One import per seller at a time, and 20 a day.
  perform pg_advisory_xact_lock(hashtextextended('cosora.import:' || v_me::text, 0));
  if (select count(*) from public.product_import_batches b where b.vendor_id = v_me and b.created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s 20 imports today. Try again tomorrow, or put more rows in one sheet.' using errcode = 'P0001';
  end if;

  for r in select e from jsonb_array_elements(p_rows) e loop
    v_i := v_i + 1;
    begin
      if jsonb_typeof(r) <> 'object' then
        raise exception 'not a row';
      end if;
      if nullif(btrim(coalesce(r ->> 'name', '')), '') is null or char_length(r ->> 'name') > 200 then
        raise exception 'name is required (up to 200 characters)';
      end if;
      v_cat := public.category_for_import(r ->> 'category');
      if v_cat is null then
        raise exception 'category "%" isn''t one of Cosora''s categories', coalesce(r ->> 'category', '');
      end if;
      begin
        v_price := nullif(btrim(replace(replace(coalesce(r ->> 'price', ''), ',', ''), '₹', '')), '')::numeric;
        v_compare := nullif(btrim(replace(replace(coalesce(r ->> 'compare_at_price', ''), ',', ''), '₹', '')), '')::numeric;
      exception when others then
        raise exception 'price must be a number';
      end;
      if (v_price is not null and (v_price <= 0 or v_price > 10000000)) or (v_compare is not null and (v_compare <= 0 or v_compare > 10000000)) then
        raise exception 'price must be above 0';
      end if;
      if coalesce(r ->> 'gender', '') <> '' and r ->> 'gender' not in ('Men', 'Women', 'Unisex', 'Boys', 'Girls', 'Kids') then
        raise exception 'gender is one of Men, Women, Unisex, Boys, Girls, Kids';
      end if;
      v_imgs := array(select btrim(u) from unnest(string_to_array(coalesce(r ->> 'image_urls', ''), ',')) u where btrim(u) <> '');
      if cardinality(v_imgs) > 6 or exists (select 1 from unnest(v_imgs) u where (u !~ '^https://[^[:space:]"<>]{4,}$' or char_length(u) > 500)) then
        raise exception 'image_urls: up to 6 https links, separated by commas';
      end if;
      if char_length(coalesce(r ->> 'description', '')) > 4000 then
        raise exception 'description is up to 4,000 characters';
      end if;

      insert into public.products (vendor_id, name, description, price_value, compare_at_price, currency, category_id, moq, unit,
                                   fabric, gsm, fit_type, gender, colour, sizes, pattern, occasion, country_of_origin, status)
      values (v_me, btrim(r ->> 'name'), nullif(btrim(coalesce(r ->> 'description', '')), ''), v_price, v_compare, '₹', v_cat,
              left(nullif(btrim(coalesce(r ->> 'moq', '')), ''), 40), left(nullif(btrim(coalesce(r ->> 'unit', '')), ''), 20),
              left(nullif(btrim(coalesce(r ->> 'fabric', '')), ''), 80), left(nullif(btrim(coalesce(r ->> 'gsm', '')), ''), 20),
              left(nullif(btrim(coalesce(r ->> 'fit_type', '')), ''), 40), nullif(btrim(coalesce(r ->> 'gender', '')), ''),
              left(nullif(btrim(coalesce(r ->> 'colour', '')), ''), 80),
              nullif(array(select left(btrim(x), 20) from unnest(string_to_array(coalesce(r ->> 'sizes', ''), ',')) x where btrim(x) <> '' limit 30), '{}'),
              nullif(array(select left(btrim(x), 40) from unnest(string_to_array(coalesce(r ->> 'pattern', ''), ',')) x where btrim(x) <> '' limit 10), '{}'),
              nullif(array(select left(btrim(x), 40) from unnest(string_to_array(coalesce(r ->> 'occasion', ''), ',')) x where btrim(x) <> '' limit 10), '{}'),
              left(nullif(btrim(coalesce(r ->> 'country_of_origin', '')), ''), 60),
              (case when p_as_draft then 'draft' else 'under_review' end)::public.product_status)
      returning id into v_id;
      if cardinality(v_imgs) > 0 then
        insert into public.product_images (product_id, url, position)
        select v_id, u, o - 1 from unnest(v_imgs) with ordinality as t(u, o);
      end if;
      v_created := v_created + 1;
      v_results := v_results || jsonb_build_object('row', v_i, 'product_id', v_id);
    exception when others then
      get stacked diagnostics v_err = message_text;
      v_errors := v_errors || jsonb_build_object('row', v_i, 'error', left(v_err, 300));
      v_results := v_results || jsonb_build_object('row', v_i, 'error', left(v_err, 300));
    end;
  end loop;

  insert into public.product_import_batches (vendor_id, file_name, as_draft, total, created, failed, errors)
  values (v_me, left(nullif(btrim(coalesce(p_file_name, '')), ''), 200), coalesce(p_as_draft, false), v_total, v_created,
          v_total - v_created, v_errors)
  returning id into v_batch;
  return jsonb_build_object('batch_id', v_batch, 'total', v_total, 'created', v_created, 'failed', v_total - v_created,
                            'results', v_results);
end
$function$;

-- ── 5. Entitlements carry it ───────────────────────────────────────────────────────
do $patch$
declare
  v_def text := pg_get_functiondef('public.vendor_entitlements(uuid)'::regprocedure);
  v_old text := $q$      'visibility_page',    paid and admin.feature_on_for('featured_listings', p_vendor) and coalesce((lim->>'search_boost_tier')::int, 0) >= 1$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'vendor_entitlements no longer has the line this patch extends';
  end if;
  execute replace(v_def, v_old, v_old || E',\n'
    || $q$      -- Catalogue (P11): bulk import for Silver and up, where the switch lists the vendor.$q$ || E'\n'
    || $q$      'catalogue',          case when paid then coalesce(lim->>'catalogue', 'manual') else 'manual' end,$q$ || E'\n'
    || $q$      'bulk_import',        paid and admin.feature_on_for('bulk_import', p_vendor) and coalesce(lim->>'catalogue', 'manual') = 'bulk'$q$);
end
$patch$;

-- ── 6. Grants ──────────────────────────────────────────────────────────────────────
revoke all on function public.import_products(jsonb, text, boolean) from public, anon;
grant execute on function public.import_products(jsonb, text, boolean) to authenticated;
revoke all on function public.category_for_import(text) from public;
grant execute on function public.category_for_import(text) to anon, authenticated, service_role;

-- ── 7. Self-check ──────────────────────────────────────────────────────────────────
do $check$
begin
  if (select prosecdef from pg_proc where oid = 'public.import_products(jsonb,text,boolean)'::regprocedure) then
    raise exception 'import_products must run with the seller''s rights, so the product rules apply';
  end if;
  if (select count(*) from public.subscription_plans where limits ? 'catalogue') <> (select count(*) from public.subscription_plans) then
    raise exception 'every plan says its catalogue';
  end if;
  if (select enabled from public.feature_flags where key = 'bulk_import') then
    raise exception 'bulk_import must start switched off';
  end if;
  if position('bulk_import' in (select prosrc from pg_proc where oid = 'public.vendor_entitlements(uuid)'::regprocedure)) = 0 then
    raise exception 'the entitlements patch did not apply';
  end if;
  if public.category_for_import('activewear') is null then
    raise exception 'category names must resolve';
  end if;
end
$check$;
