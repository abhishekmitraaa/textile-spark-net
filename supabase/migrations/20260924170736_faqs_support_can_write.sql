-- Support writes FAQs, not just reads them (Phase 22 of the My Profile brief,
-- 2026-09-24; Phase 9's open question 3, answered by Mitra).
--
-- 20260923144549 gated admin_faq_add / _update / _delete / _reorder to super_admin
-- and admin_faq_list to support + super_admin, and said widening the writes was
-- "a one-word change per function". This is that change. Each of the four gets
-- admin_faq_list's predicate, character for character:
--   public.admin_role() = any (array['support','super_admin']::public.admin_role_type[])
-- and its 42501 message now names both roles. Nothing else in the four bodies
-- changes: same arguments, return types, SECURITY DEFINER, `search_path = ''`,
-- `#variable_conflict use_column` and fail-closed `coalesce(..., false)`.
-- admin_faq_list is not touched.
--
-- Every other role stays refused (product_moderator, vendor_ops, ads_moderator,
-- finance_admin), as do inactive admins, non-admins and anon. The table's grants
-- and policy don't change: no client role writes public.faqs directly, and
-- clients still can't read created_by (20260923150408).
--
-- The UI half is Cosora-Admin's roles.ts, SECTION_WRITE.faqs = super_admin +
-- support, changed in the same phase. Either alone is wrong: the RPCs are the gate,
-- roles.ts only decides which buttons show.

-- ── admin_faq_add ────────────────────────────────────────────────────────────
create or replace function public.admin_faq_add(
  p_surface text, p_category_label text, p_question text, p_answer text, p_position integer default null
)
returns table(id uuid, surface text, category_label text, question text, answer text, "position" integer, active boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_id  uuid;
  v_pos integer;
begin
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Adding an FAQ requires the support or super_admin role'
      using errcode = '42501';
  end if;
  if p_surface is null or p_surface not in ('buyer_help', 'seller_registration', 'subscription') then
    raise exception 'Unknown FAQ surface %', p_surface using errcode = '22023';
  end if;

  -- One writer per surface at a time, so two adds can't take the same position.
  perform pg_advisory_xact_lock(hashtext('faqs:' || p_surface));

  -- No position given: after everything already on this surface.
  v_pos := coalesce(p_position,
                    (select coalesce(max(f.position), 0) + 10 from public.faqs f where f.surface = p_surface));

  insert into public.faqs as f (surface, category_label, question, answer, position, created_by)
  values (p_surface, nullif(trim(p_category_label), ''), trim(p_question), trim(p_answer), v_pos, auth.uid())
  returning f.id into v_id;

  return query
    select f.id, f.surface, f.category_label, f.question, f.answer, f.position, f.active
      from public.faqs f
     where f.id = v_id;
end
$function$;

-- ── admin_faq_update ─────────────────────────────────────────────────────────
-- NULL leaves a field unchanged. category_label '' (or blank) clears it. The
-- surface is fixed once added (moving one = delete + add). Position is changed
-- only through admin_faq_reorder().
create or replace function public.admin_faq_update(
  p_id uuid, p_category_label text default null, p_question text default null,
  p_answer text default null, p_active boolean default null
)
returns table(id uuid, surface text, category_label text, question text, answer text, "position" integer, active boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Changing an FAQ requires the support or super_admin role'
      using errcode = '42501';
  end if;

  return query
    update public.faqs f
       set category_label = case when p_category_label is null then f.category_label
                                 else nullif(trim(p_category_label), '') end,
           question   = coalesce(nullif(trim(p_question), ''), f.question),
           answer     = coalesce(nullif(trim(p_answer), ''), f.answer),
           active     = coalesce(p_active, f.active),
           updated_at = now()
     where f.id = p_id
    returning f.id, f.surface, f.category_label, f.question, f.answer, f.position, f.active;
end
$function$;

-- ── admin_faq_delete ─────────────────────────────────────────────────────────
-- Unlike block reasons, nothing references an FAQ, so a real delete is safe.
-- Deactivate is the reversible option, and both are offered.
create or replace function public.admin_faq_delete(p_id uuid)
returns table(id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Deleting an FAQ requires the support or super_admin role'
      using errcode = '42501';
  end if;

  return query
    delete from public.faqs f where f.id = p_id returning f.id;
end
$function$;

-- ── admin_faq_reorder ────────────────────────────────────────────────────────
-- Moves an FAQ to p_position. Any row on the same surface already there takes
-- the old position: a swap, so "move up / down" is one atomic call and positions
-- stay distinct.
create or replace function public.admin_faq_reorder(p_id uuid, p_position integer)
returns table(id uuid, "position" integer)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_old     integer;
  v_surface text;
begin
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Reordering FAQs requires the support or super_admin role'
      using errcode = '42501';
  end if;

  select f.position, f.surface into v_old, v_surface from public.faqs f where f.id = p_id;
  if not found then
    return;  -- no row: the caller's assertWrote reports "no rows matched"
  end if;
  perform pg_advisory_xact_lock(hashtext('faqs:' || v_surface));

  update public.faqs f
     set position = v_old, updated_at = now()
   where f.surface = v_surface and f.position = p_position and f.id <> p_id;

  return query
    update public.faqs f
       set position = p_position, updated_at = now()
     where f.id = p_id
    returning f.id, f.position;
end
$function$;

-- CREATE OR REPLACE keeps each function's ACL. Restated anyway, as in
-- 20260923144549, so this file doesn't depend on what was there before it.
revoke all on function public.admin_faq_add(text, text, text, text, integer)  from public, anon, authenticated, service_role;
revoke all on function public.admin_faq_update(uuid, text, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.admin_faq_delete(uuid)                          from public, anon, authenticated, service_role;
revoke all on function public.admin_faq_reorder(uuid, integer)                from public, anon, authenticated, service_role;
grant execute on function public.admin_faq_add(text, text, text, text, integer)  to authenticated;
grant execute on function public.admin_faq_update(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.admin_faq_delete(uuid)                          to authenticated;
grant execute on function public.admin_faq_reorder(uuid, integer)                to authenticated;

comment on table public.faqs is
  'Admin-editable FAQs for buyer_help / seller_registration / subscription. Clients read active rows; all writes go through admin_faq_* (support or super_admin).';

-- ── Self-checks (20260923144549's, against the new gate) ─────────────────────
do $check$
declare
  fn  text;
  src text;
  new_gate constant text := $g$public.admin_role() = any (array['support','super_admin']::public.admin_role_type[])$g$;
  old_gate constant text := $g$public.admin_role() = 'super_admin'::public.admin_role_type$g$;
begin
  -- The table: RLS on, clients read, nobody writes it directly, created_by hidden.
  if not (select relrowsecurity from pg_class where oid = 'public.faqs'::regclass) then
    raise exception 'RLS is off on faqs';
  end if;
  if has_table_privilege('anon', 'public.faqs', 'INSERT') or has_table_privilege('anon', 'public.faqs', 'UPDATE') or has_table_privilege('anon', 'public.faqs', 'DELETE')
     or has_table_privilege('authenticated', 'public.faqs', 'INSERT') or has_table_privilege('authenticated', 'public.faqs', 'UPDATE') or has_table_privilege('authenticated', 'public.faqs', 'DELETE')
     or has_table_privilege('service_role', 'public.faqs', 'INSERT') or has_table_privilege('service_role', 'public.faqs', 'UPDATE') or has_table_privilege('service_role', 'public.faqs', 'DELETE') then
    raise exception 'a client role can write faqs directly';
  end if;
  if has_column_privilege('anon', 'public.faqs', 'created_by', 'SELECT')
     or has_column_privilege('authenticated', 'public.faqs', 'created_by', 'SELECT') then
    raise exception 'a client role can read faqs.created_by';
  end if;

  -- All five: SECURITY DEFINER, search_path pinned to '', EXECUTE for authenticated only,
  -- and every one gated on exactly support + super_admin.
  foreach fn in array array[
    'public.admin_faq_list(text)', 'public.admin_faq_add(text,text,text,text,integer)',
    'public.admin_faq_update(uuid,text,text,text,boolean)', 'public.admin_faq_delete(uuid)',
    'public.admin_faq_reorder(uuid,integer)'] loop
    if not (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = fn::regprocedure) then
      raise exception '% is not SECURITY DEFINER with search_path pinned to ''''', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'EXECUTE')
       or has_function_privilege('anon', fn, 'EXECUTE')
       or has_function_privilege('service_role', fn, 'EXECUTE')
       or has_function_privilege('public', fn, 'EXECUTE') then
      raise exception '% grants are wrong (authenticated only)', fn;
    end if;
    select p.prosrc into src from pg_proc p where p.oid = fn::regprocedure;
    if position('if not coalesce(public.is_admin() and ' || new_gate || ', false) then' in src) = 0 then
      raise exception '% is not gated on support + super_admin', fn;
    end if;
    if position(old_gate in src) > 0 then
      raise exception '% still has the super_admin-only gate', fn;
    end if;
  end loop;
end
$check$;
