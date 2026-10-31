-- Ranking F3: one vocabulary, editable by admins (2026-10-31; Mitra: "fix on your own").
-- Design: documentation/ranking-foundations-design-2026-10-07.md "F3"; plan: documentation/ranking-f3-plan-2026-10-31.md.
--
-- public.attribute_definitions holds every category question of both forms:
--   form = 'product'      the listing form (Upload.tsx), in its three layers: 'base' per seller type (product,
--                         service, freelancer), 'sub' per subcategory, 'common' per category with the subcategories
--                         it applies to — so the form rebuilt from the rows asks exactly what it asks today;
--   form = 'requirement'  the requirement form (PostRequirement.tsx), per question set (schema_key) and section.
-- Requirement questions carry match_key (the listing question they mean) and match_weight, which Fit (Part 3)
-- reads. Seeded by scripts/ranking/f3-seed.mjs from src/data/sellerCategories.ts and src/data/requirementSchemas.ts.
-- Super admins edit it in Cosora-Admin › Attributes through admin_attribute_save / admin_attribute_set_active:
-- labels and their Hindi/Gujarati, options, unit, placeholder, required, layout, match key and weight, order;
-- new questions; deactivate (never delete). Key, kind, form and place never change after a question exists, so
-- stored answers keep their meaning. Core requirement questions (quantity, budget, description, files, product
-- type and name) can be relabelled, not turned off. Every change is in the Admin Log.

do $pin$
begin
  if to_regclass('public.attribute_definitions') is not null then
    raise exception 'pre-check: public.attribute_definitions already exists';
  end if;
  if to_regprocedure('public.admin_role()') is null or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('admin.audit_row_change()') is null then
    raise exception 'pre-check: is_admin(), admin_role() or admin.audit_row_change() is missing';
  end if;
end
$pin$;

create table public.attribute_definitions (
  id                       uuid primary key default gen_random_uuid(),
  form                     text not null check (form in ('product', 'requirement')),
  -- product rows
  category_id              text,
  subcategory_id           text,
  layer                    text check (layer in ('base', 'sub', 'common')),
  seller_type              text check (seller_type in ('product', 'service', 'freelancer')),
  applies_to_subcategories text[],
  -- requirement rows
  schema_key               text,
  section_title            text,
  section_position         int,
  -- the question
  key                      text not null check (key ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'),
  label                    text not null check (length(label) <= 200),
  label_hi                 text check (length(label_hi) <= 200),
  label_gu                 text check (length(label_gu) <= 200),
  kind                     text not null,
  options                  text[] check (coalesce(cardinality(options), 0) <= 200),
  unit                     text check (length(unit) <= 40),
  placeholder              text check (length(placeholder) <= 200),
  required                 boolean not null default false,
  full_width               boolean not null default false,
  half                     boolean not null default false,
  core                     boolean not null default false,
  match_key                text check (match_key ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'),
  match_weight             numeric not null default 0 check (match_weight between 0 and 10),
  position                 int not null default 0,
  active                   boolean not null default true,
  updated_at               timestamptz not null default now(),
  constraint attribute_definitions_kind check (
    (form = 'product' and kind in ('text', 'number', 'select', 'multiselect', 'textarea', 'checkbox', 'size-selector', 'color-picker'))
    or (form = 'requirement' and kind in ('text', 'textarea', 'description', 'select', 'chips', 'radio', 'priceRange', 'files'))),
  constraint attribute_definitions_place check (
    (form = 'product' and schema_key is null and (
        (layer = 'base' and seller_type is not null and category_id is null and subcategory_id is null)
     or (layer = 'sub' and category_id is not null and subcategory_id is not null)
     or (layer = 'common' and category_id is not null and subcategory_id is null)))
    or (form = 'requirement' and schema_key is not null and section_title is not null and layer is null
        and category_id is null and subcategory_id is null)),
  constraint attribute_definitions_core check (not core or form = 'requirement')
);

-- One question per key in each place.
create unique index attribute_definitions_unique on public.attribute_definitions
  (form, coalesce(seller_type, ''), coalesce(category_id, ''), coalesce(subcategory_id, ''), coalesce(layer, ''),
   coalesce(schema_key, ''), key);
create index attribute_definitions_form_active on public.attribute_definitions (form, active);

alter table public.attribute_definitions enable row level security;
-- Everyone reads the questions in use; staff also read the ones turned off. Writes go through the RPCs only.
create policy attribute_definitions_read on public.attribute_definitions for select to anon, authenticated
  using (active or (select public.is_admin()));
-- New tables in public come with every privilege for the client roles (Supabase's default privileges).
revoke all on public.attribute_definitions from anon, authenticated;
grant select on public.attribute_definitions to anon, authenticated;

create trigger trg_admin_audit
  after insert or update or delete on public.attribute_definitions
  for each row execute function admin.audit_row_change('');

-- ── Admin writes ───────────────────────────────────────────────────────────────────────────────────────────
create function public.admin_attribute_save(p_id uuid, p_row jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id      uuid;
  v_form    text;
  v_kind    text;
  v_options text[];
begin
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type, false) then
    raise exception 'Editing the form questions requires the super admin role' using errcode = '42501';
  end if;
  if p_row ? 'options' then
    select array_agg(btrim(o)) filter (where btrim(o) <> '') into v_options
      from jsonb_array_elements_text(coalesce(p_row -> 'options', '[]'::jsonb)) o;
  end if;

  if p_id is null then
    v_form := p_row ->> 'form';
    v_kind := p_row ->> 'kind';
    -- New questions take the ordinary kinds; the special ones (size, colour, price, files) stay with the seeds.
    if not ((v_form = 'product' and v_kind in ('text', 'number', 'select', 'multiselect', 'textarea', 'checkbox'))
            or (v_form = 'requirement' and v_kind in ('text', 'textarea', 'select', 'chips', 'radio'))) then
      raise exception 'A new question is text, a number, a choice, several choices, a long answer or yes/no.' using errcode = '22023';
    end if;
    if v_kind in ('select', 'multiselect', 'chips', 'radio') and coalesce(cardinality(v_options), 0) = 0 then
      raise exception 'A choice question needs its options.' using errcode = '22023';
    end if;
    insert into public.attribute_definitions (form, category_id, subcategory_id, layer, seller_type,
        applies_to_subcategories, schema_key, section_title, section_position, key, label, label_hi, label_gu, kind,
        options, unit, placeholder, required, full_width, half, core, match_key, match_weight, position)
    values (v_form, nullif(p_row ->> 'category_id', ''), nullif(p_row ->> 'subcategory_id', ''),
        nullif(p_row ->> 'layer', ''), nullif(p_row ->> 'seller_type', ''),
        (select array_agg(s) from jsonb_array_elements_text(p_row -> 'applies_to_subcategories') s),
        nullif(p_row ->> 'schema_key', ''), nullif(btrim(p_row ->> 'section_title'), ''),
        (p_row ->> 'section_position')::int, btrim(p_row ->> 'key'), btrim(p_row ->> 'label'),
        nullif(btrim(p_row ->> 'label_hi'), ''), nullif(btrim(p_row ->> 'label_gu'), ''), v_kind, v_options,
        nullif(btrim(p_row ->> 'unit'), ''), nullif(btrim(p_row ->> 'placeholder'), ''),
        coalesce((p_row ->> 'required')::boolean, false), coalesce((p_row ->> 'full_width')::boolean, false),
        coalesce((p_row ->> 'half')::boolean, false), false, nullif(btrim(p_row ->> 'match_key'), ''),
        coalesce((p_row ->> 'match_weight')::numeric, 0),
        coalesce((p_row ->> 'position')::int, 1000))
    returning id into v_id;
    return v_id;
  end if;

  -- An existing question: its key, kind, form and place stay; only these change.
  update public.attribute_definitions d set
      label            = coalesce(nullif(btrim(p_row ->> 'label'), ''), d.label),
      label_hi         = case when p_row ? 'label_hi' then nullif(btrim(p_row ->> 'label_hi'), '') else d.label_hi end,
      label_gu         = case when p_row ? 'label_gu' then nullif(btrim(p_row ->> 'label_gu'), '') else d.label_gu end,
      options          = case when p_row ? 'options' then v_options else d.options end,
      unit             = case when p_row ? 'unit' then nullif(btrim(p_row ->> 'unit'), '') else d.unit end,
      placeholder      = case when p_row ? 'placeholder' then nullif(btrim(p_row ->> 'placeholder'), '') else d.placeholder end,
      required         = coalesce((p_row ->> 'required')::boolean, d.required),
      full_width       = coalesce((p_row ->> 'full_width')::boolean, d.full_width),
      half             = coalesce((p_row ->> 'half')::boolean, d.half),
      match_key        = case when p_row ? 'match_key' then nullif(btrim(p_row ->> 'match_key'), '') else d.match_key end,
      match_weight     = coalesce((p_row ->> 'match_weight')::numeric, d.match_weight),
      position         = coalesce((p_row ->> 'position')::int, d.position),
      applies_to_subcategories = case when p_row ? 'applies_to_subcategories' and d.layer = 'common'
                                      then (select array_agg(s) from jsonb_array_elements_text(p_row -> 'applies_to_subcategories') s)
                                      else d.applies_to_subcategories end,
      updated_at       = now()
   where d.id = p_id
  returning d.id into v_id;
  if v_id is null then
    raise exception 'No such question.' using errcode = 'P0002';
  end if;
  if (select kind in ('select', 'multiselect', 'chips', 'radio') and coalesce(cardinality(options), 0) = 0
        from public.attribute_definitions where id = v_id) then
    raise exception 'A choice question needs its options.' using errcode = '22023';
  end if;
  return v_id;
end
$function$;

create function public.admin_attribute_set_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type, false) then
    raise exception 'Editing the form questions requires the super admin role' using errcode = '42501';
  end if;
  if not p_active and exists (select 1 from public.attribute_definitions where id = p_id and core) then
    raise exception 'This question is part of every requirement; it can be renamed, not turned off.' using errcode = '22023';
  end if;
  update public.attribute_definitions set active = p_active, updated_at = now() where id = p_id;
  if not found then
    raise exception 'No such question.' using errcode = 'P0002';
  end if;
end
$function$;

revoke all on function public.admin_attribute_save(uuid, jsonb) from public, anon;
revoke all on function public.admin_attribute_set_active(uuid, boolean) from public, anon;
grant execute on function public.admin_attribute_save(uuid, jsonb) to authenticated, service_role;
grant execute on function public.admin_attribute_set_active(uuid, boolean) to authenticated, service_role;

-- ── The seed: today's questions of both forms ───────────────────────────────────────────────────────────────
