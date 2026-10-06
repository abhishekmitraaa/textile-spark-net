-- ─────────────────────────────────────────────────────────────────────────────
-- Ranking Part 1, F1: keep what the forms already collect (Mitra, 2026-10-07).
-- documentation/ranking-foundations-design-2026-10-07.md, "F1".
--
-- The product form asks each category's questions (src/data/sellerCategories.ts) but
-- kept only the 13 that have a products column; the requirement form asks one of 12
-- question sets but kept only a guessed title, quantity and budget. Everything else
-- was discarded. Both now store the rest in `attributes`:
--   * products.attributes, rfqs.attributes: jsonb objects, default {}, at most 8 KB;
--   * attribute values join search_text (and products.fts) through
--     attributes_search_text(), so keyword search and the embeddings use them. Rows with
--     no attributes keep exactly today's text: the helper returns '' for them;
--   * both embedding triggers also fire when attributes change;
--   * admin_lead_detail() returns a requirement's attributes.
-- No DROP: generated columns change with SET EXPRESSION (Postgres 17), triggers with
-- CREATE OR REPLACE TRIGGER.
-- Harness: scripts/ranking/f1_attributes.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Attribute values as search text ──────────────────────────────────────
-- '' when there is nothing; otherwise a leading space and the string, number and
-- array-element values, ordered by key. Booleans say nothing a search can use.
create or replace function public.attributes_search_text(p jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(' ' || string_agg(x.v, ' ' order by e.key, x.ord), '')
    from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e
    cross join lateral (
      select e.value #>> '{}' as v, 0::bigint as ord
       where jsonb_typeof(e.value) in ('string', 'number')
      union all
      select a.value #>> '{}', a.ord
        from jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end)
             with ordinality as a(value, ord)
       where jsonb_typeof(a.value) in ('string', 'number')
    ) x
   where btrim(x.v) <> '';
$$;
comment on function public.attributes_search_text(jsonb) is
  'Attribute values as search text: '''' for none, else a leading space and the values ordered by key. Feeds the generated search_text and fts columns.';

-- ── 2. The columns ──────────────────────────────────────────────────────────
alter table public.products add column attributes jsonb not null default '{}'::jsonb;
alter table public.products add constraint products_attributes_shape
  check (jsonb_typeof(attributes) = 'object' and pg_column_size(attributes) <= 8192);
comment on column public.products.attributes is
  'The product form''s category answers that have no column of their own, keyed by the field id in src/data/sellerCategories.ts.';

alter table public.rfqs add column attributes jsonb not null default '{}'::jsonb;
alter table public.rfqs add constraint rfqs_attributes_shape
  check (jsonb_typeof(attributes) = 'object' and pg_column_size(attributes) <= 8192);
comment on column public.rfqs.attributes is
  'The requirement form''s category answers, keyed by its question keys (PostRequirement.tsx).';

-- ── 3. Search text includes them ────────────────────────────────────────────
alter table public.products alter column search_text set expression as (
    coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(fabric, '') || ' ' ||
    coalesce(gsm, '') || ' ' || coalesce(fit_type, '') || ' ' || coalesce(colour, '') || ' ' ||
    coalesce(public.immutable_array_to_string(pattern, ' '), '') || ' ' ||
    coalesce(public.immutable_array_to_string(occasion, ' '), '') || ' ' || coalesce(neck_type, '') || ' ' ||
    coalesce(sleeve_type, '') || ' ' || coalesce(collar_type, '') || ' ' || coalesce(category_name, '') ||
    public.attributes_search_text(attributes)
);
alter table public.products alter column fts set expression as (to_tsvector('english'::regconfig,
    coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(fabric, '') || ' ' ||
    coalesce(gsm, '') || ' ' || coalesce(fit_type, '') || ' ' || coalesce(colour, '') || ' ' ||
    coalesce(public.immutable_array_to_string(pattern, ' '), '') || ' ' ||
    coalesce(public.immutable_array_to_string(occasion, ' '), '') || ' ' || coalesce(neck_type, '') || ' ' ||
    coalesce(sleeve_type, '') || ' ' || coalesce(collar_type, '') || ' ' || coalesce(category_name, '') ||
    public.attributes_search_text(attributes)
));
alter table public.rfqs alter column search_text set expression as (
    coalesce(title, '') || ' ' || coalesce(product_name, '') || ' ' || coalesce(description, '') || ' ' ||
    coalesce(public.immutable_array_to_string(colors, ' '), '') || ' ' || coalesce(customization_notes, '') ||
    public.attributes_search_text(attributes)
);

-- ── 4. Embeddings follow attribute changes ──────────────────────────────────
create or replace trigger trg_products_enqueue_embedding
  after insert or update of name, description, fabric, gsm, fit_type, colour, pattern, occasion, neck_type,
                            sleeve_type, collar_type, category_id, attributes
  on public.products
  for each row execute function public.enqueue_product_embedding();

create or replace trigger trg_rfqs_enqueue_embedding
  after insert or update of title, product_name, description, colors, customization_notes, attributes
  on public.rfqs
  for each row execute function public.enqueue_rfq_embedding();

-- ── 5. The admin lead detail shows them ─────────────────────────────────────
create or replace function public.admin_lead_detail(p_rfq_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if not admin.leads_can_read() then
    raise exception 'not authorized: leads are for super admins, vendor ops, product moderators and support' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'id', l.id, 'created_at', l.created_at, 'title', l.title, 'product_name', l.product_name,
           'category', l.category, 'quantity', l.quantity, 'budget_min', l.budget_min, 'budget_max', l.budget_max,
           'description', r.description, 'images', to_jsonb(coalesce(r.images, array[]::text[])),
           'rfq_status', l.rfq_status, 'stage', l.stage, 'overdue', l.overdue, 'direct', l.direct,
           'attributes', r.attributes,
           'buyer', jsonb_build_object('id', l.buyer_id,
                      'name', coalesce(nullif(btrim(bp.company), ''), nullif(btrim(p.full_name), ''), 'Unnamed buyer')),
           'target_vendor', case when l.target_vendor_id is null then null
                                 else jsonb_build_object('id', l.target_vendor_id, 'name', tv.brand_name) end,
           'removal', case when l.removed_at is null then null
                           else jsonb_build_object('at', l.removed_at, 'reason', l.removed_reason,
                                  'by', case when l.removed_by is null then null else admin.audit_actor_name(l.removed_by) end) end,
           'quotes', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', q.id, 'vendor_id', q.vendor_id, 'vendor_name', v.brand_name,
                         'currency', q.currency, 'price_per_unit', q.price_per_unit, 'price_inr', q.price_inr,
                         'moq', q.moq, 'lead_time', q.lead_time, 'status', q.status::text, 'created_at', q.created_at)
                         order by q.created_at)
                         from public.quotes q
                         left join public.vendor_profiles v on v.id = q.vendor_id
                        where q.rfq_id = l.id), '[]'::jsonb))
    into v_result
    from admin.lead_rows l
    join public.rfqs r on r.id = l.id
    left join public.profiles p on p.id = l.buyer_id
    left join public.buyer_profiles bp on bp.id = l.buyer_id
    left join public.vendor_profiles tv on tv.id = l.target_vendor_id
   where l.id = p_rfq_id;
  if v_result is null then
    raise exception 'no RFQ %', p_rfq_id using errcode = 'P0002';
  end if;
  return v_result;
end
$function$;

-- ── Self-check ──────────────────────────────────────────────────────────────
do $check$
begin
  if public.attributes_search_text('{}'::jsonb) <> ''
     or public.attributes_search_text('{"b": ["x", ""], "a": "y", "c": true}'::jsonb) <> ' y x' then
    raise exception 'F1 self-check: attributes_search_text is wrong';
  end if;
  if position('attributes_search_text' in pg_get_expr(
       (select d.adbin from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
         where d.adrelid = 'public.rfqs'::regclass and a.attname = 'search_text'), 'public.rfqs'::regclass)) = 0 then
    raise exception 'F1 self-check: rfqs.search_text does not include attributes';
  end if;
  if not exists (select 1 from pg_trigger t join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = any (t.tgattr)
                  where t.tgname = 'trg_products_enqueue_embedding' and a.attname = 'attributes')
     or not exists (select 1 from pg_trigger t join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = any (t.tgattr)
                     where t.tgname = 'trg_rfqs_enqueue_embedding' and a.attname = 'attributes') then
    raise exception 'F1 self-check: an embedding trigger ignores attributes';
  end if;
end
$check$;
