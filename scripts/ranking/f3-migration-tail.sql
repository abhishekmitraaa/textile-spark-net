
-- ── Answers written by a browser are checked against the questions ────────────────────────────────────────
-- A listing's or a requirement's `attributes` (Ranking F1) may hold only answers to questions of its form —
-- active or turned off, so editing an older listing keeps its answers — plus the keys the forms write
-- themselves (listings: sku, subType, colours; requirements: the price boxes budgetMin, budgetMax). A value is
-- what lib/formAttributes.ts clean() writes: a string (at most 1,000 characters) or true for a one-answer
-- question, a list of strings (at most 100) — or one string — for a several-answer question. Staff, the
-- service role and the database itself are not checked.
create index attribute_definitions_form_key on public.attribute_definitions (form, key);

create function public.attributes_problem(p_form text, p_attrs jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  e        record;
  v_kinds  text[];
  v_one    boolean;
  v_list   boolean;
begin
  if p_attrs is null or p_attrs = '{}'::jsonb then
    return null;
  end if;
  if jsonb_typeof(p_attrs) <> 'object' then
    return 'The details aren''t in the right shape.';
  end if;
  for e in select j.key, j.value from jsonb_each(p_attrs) j loop
    v_one  := (jsonb_typeof(e.value) = 'string' and char_length(e.value #>> '{}') <= 1000) or e.value = 'true'::jsonb;
    v_list := jsonb_typeof(e.value) = 'array' and jsonb_array_length(e.value) <= 100
              and not exists (select 1 from jsonb_array_elements(e.value) x
                               where jsonb_typeof(x) <> 'string' or char_length(x #>> '{}') > 1000);
    if (p_form = 'product' and e.key in ('sku', 'subType')) or (p_form = 'requirement' and e.key in ('budgetMin', 'budgetMax')) then
      if not v_one then
        return format('"%s" has the wrong kind of answer.', e.key);
      end if;
      continue;
    end if;
    if p_form = 'product' and e.key = 'colours' then
      if not v_list then
        return format('"%s" has the wrong kind of answer.', e.key);
      end if;
      continue;
    end if;
    select array_agg(distinct d.kind) into v_kinds
      from public.attribute_definitions d where d.form = p_form and d.key = e.key;
    if v_kinds is null then
      return format('"%s" isn''t one of the form''s questions.', e.key);
    end if;
    if not ((v_one and v_kinds && array['text', 'number', 'select', 'textarea', 'description', 'radio', 'priceRange', 'files', 'checkbox'])
            or ((v_list or v_one) and v_kinds && array['multiselect', 'chips', 'size-selector', 'color-picker'])) then
      return format('"%s" has the wrong kind of answer.', e.key);
    end if;
  end loop;
  return null;
end
$function$;
revoke all on function public.attributes_problem(text, jsonb) from public, anon;
grant execute on function public.attributes_problem(text, jsonb) to authenticated, service_role;

create function admin.attributes_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_problem text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or coalesce(public.is_admin(), false) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.attributes is not distinct from old.attributes then
    return new;
  end if;
  v_problem := public.attributes_problem(tg_argv[0], new.attributes);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;
  return new;
end
$function$;
revoke all on function admin.attributes_guard() from public, anon, authenticated;

create trigger trg_products_attributes_valid
  before insert or update of attributes on public.products
  for each row execute function admin.attributes_guard('product');
create trigger trg_rfqs_attributes_valid
  before insert or update of attributes on public.rfqs
  for each row execute function admin.attributes_guard('requirement');
create trigger trg_rfq_submissions_attributes_valid
  before insert or update of attributes on public.rfq_submissions
  for each row execute function admin.attributes_guard('requirement');

-- ── Self-checks ────────────────────────────────────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from public.attribute_definitions where form = 'product') <> 773
     or (select count(*) from public.attribute_definitions where form = 'requirement') <> 188 then
    raise exception 'self-check: the seed is not the 773 listing and 188 requirement questions';
  end if;
  if exists (select 1 from public.attribute_definitions
              where kind in ('select', 'multiselect', 'chips', 'radio') and coalesce(cardinality(options), 0) = 0) then
    raise exception 'self-check: a choice question has no options';
  end if;
  if has_table_privilege('authenticated', 'public.attribute_definitions', 'insert')
     or has_table_privilege('authenticated', 'public.attribute_definitions', 'update')
     or has_table_privilege('anon', 'public.attribute_definitions', 'delete') then
    raise exception 'self-check: clients can write attribute_definitions';
  end if;
  if has_function_privilege('anon', 'public.admin_attribute_save(uuid,jsonb)', 'execute') then
    raise exception 'self-check: anon can call admin_attribute_save';
  end if;
  if (select count(*) from pg_trigger where tgname in ('trg_products_attributes_valid', 'trg_rfqs_attributes_valid',
        'trg_rfq_submissions_attributes_valid')) <> 3 then
    raise exception 'self-check: the attribute checks are not on all three tables';
  end if;
  -- Every answer already stored passes (the check only runs on new writes, but a stored answer that fails would
  -- make its listing or requirement impossible to edit).
  if exists (select 1 from public.products where public.attributes_problem('product', attributes) is not null)
     or exists (select 1 from public.rfqs where public.attributes_problem('requirement', attributes) is not null)
     or exists (select 1 from public.rfq_submissions where public.attributes_problem('requirement', attributes) is not null) then
    raise exception 'self-check: a stored answer fails the attribute check';
  end if;
end
$check$;
