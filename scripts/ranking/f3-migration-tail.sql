
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
end
$check$;
