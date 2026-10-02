-- Help & Support P5 (documentation/help-feature-plan.md), 2026-10-01.
--
-- 1. A fourth FAQ surface, `seller_help`: the Help page for sellers, grouped by
--    category like Buyer Help. The other places that list surfaces change with it:
--    supabase/functions/faqs-snapshot (redeploy), src/lib/queries/faqs.ts,
--    Cosora-Admin src/pages/Faqs.tsx, scripts/faq-snapshot-check.mjs,
--    scripts/faq-cdn-propagation.mjs, scripts/load/faq-read.k6.js and the FAQ specs.
-- 2. FAQ translations stored with the FAQ (ToDo.md, 2026-09-26): `faqs.translations`,
--    {"hi": {"question", "answer"}, "gu": {...}}, readable wherever the row is.
--    * admin_faq_set_translations(id, translations) writes them (support, super_admin);
--    * admin_faq_translations() reads them for the admin page (admin_faq_list is unchanged);
--    * admin_faq_update() clears them when the English question or answer changes, so
--      a translation never outlives the text it translated;
--    * the rows the app translates today get their Hindi and Gujarati copied from the
--      catalogues (src/i18n/hi.json, gu.json), matched on the exact English text.
--    The app shows a stored translation when there is one, and otherwise falls back
--    to the catalogue as before.
-- The content (seller FAQs, the MPF-14 drafts, Quick Guides, the translation backfill) is the
-- next migration, 20261001130100_help_content_p5.sql.

-- ── 1. The seller_help surface ───────────────────────────────────────────────
alter table public.faqs drop constraint faqs_surface_check;
alter table public.faqs add constraint faqs_surface_check
  check (surface = any (array['buyer_help', 'seller_help', 'seller_registration', 'subscription']::text[]));

-- ── 2. Translations ──────────────────────────────────────────────────────────
-- An object keyed by language (hi, gu), each holding a non-empty question and answer
-- and nothing else.
create or replace function public.faq_translations_valid(p jsonb)
returns boolean language sql immutable set search_path = '' as $function$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
        where e.key not in ('hi', 'gu')
           or jsonb_typeof(e.value) <> 'object'
           or coalesce(btrim(e.value ->> 'question'), '') = ''
           or coalesce(btrim(e.value ->> 'answer'), '') = ''
           or exists (select 1 from jsonb_object_keys(e.value) k where k not in ('question', 'answer'))
           or char_length(e.value ->> 'question') > 500
           or char_length(e.value ->> 'answer') > 4000);
$function$;

alter table public.faqs add column if not exists translations jsonb not null default '{}'::jsonb;
alter table public.faqs add constraint faqs_translations_check check (public.faq_translations_valid(translations));
-- Clients read faqs through column grants (20260923150408): a new column needs its own.
grant select (translations) on public.faqs to anon, authenticated;

comment on column public.faqs.translations is
  'Hindi and Gujarati text for this FAQ: {"hi": {"question", "answer"}, "gu": {...}}. Written by admin_faq_set_translations(); cleared by admin_faq_update() when the English changes. The app falls back to its catalogues when a language is missing.';

-- ── 3. The admin functions ───────────────────────────────────────────────────
do $guard$
begin
  -- The bodies read on 2026-10-01; only the lines named below change.
  if md5((select prosrc from pg_proc where oid = 'public.admin_faq_add(text,text,text,text,integer)'::regprocedure))
     <> '8781316321c04748e047cf6ba1e392d2' then
    raise exception 'admin_faq_add changed since it was read';
  end if;
  if md5((select prosrc from pg_proc where oid = 'public.admin_faq_update(uuid,text,text,text,boolean)'::regprocedure))
     <> '09c47aa52914db08d9469182f22d52ce' then
    raise exception 'admin_faq_update changed since it was read';
  end if;
end
$guard$;

-- admin_faq_add: the surface list gains seller_help. Nothing else changes.
create or replace function public.admin_faq_add(
  p_surface text, p_category_label text, p_question text, p_answer text, p_position integer default null)
returns table (id uuid, surface text, category_label text, question text, answer text, "position" integer, active boolean)
language plpgsql security definer set search_path = '' as $function$
#variable_conflict use_column
declare
  v_id  uuid;
  v_pos integer;
begin
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Adding an FAQ requires the support or super_admin role'
      using errcode = '42501';
  end if;
  if p_surface is null or p_surface not in ('buyer_help', 'seller_help', 'seller_registration', 'subscription') then
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

-- admin_faq_update: when the English question or answer actually changes, the stored
-- translations are cleared in the same statement (they translated the old text).
create or replace function public.admin_faq_update(
  p_id uuid, p_category_label text default null, p_question text default null, p_answer text default null,
  p_active boolean default null)
returns table (id uuid, surface text, category_label text, question text, answer text, "position" integer, active boolean)
language plpgsql security definer set search_path = '' as $function$
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
           translations = case
                            when coalesce(nullif(trim(p_question), ''), f.question) is distinct from f.question
                              or coalesce(nullif(trim(p_answer), ''), f.answer) is distinct from f.answer
                            then '{}'::jsonb
                            else f.translations end,
           updated_at = now()
     where f.id = p_id
    returning f.id, f.surface, f.category_label, f.question, f.answer, f.position, f.active;
end
$function$;

-- admin_faq_translations: the stored translations by row, for Cosora-Admin's FAQs page,
-- which merges them with admin_faq_list() by id. A separate reader, so admin_faq_list keeps
-- its result type and isn't dropped. Same gate.
create function public.admin_faq_translations(p_surface text default null)
returns table (id uuid, translations jsonb)
language plpgsql stable security definer set search_path = '' as $function$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Reading the FAQs requires the support or super_admin role'
      using errcode = '42501';
  end if;
  return query
    select f.id, f.translations from public.faqs f
     where p_surface is null or f.surface = p_surface;
end
$function$;
revoke all on function public.admin_faq_translations(text) from public, anon;
grant execute on function public.admin_faq_translations(text) to authenticated;

-- admin_faq_set_translations: replaces the row's translations. {} clears them. Same gate
-- as the other writers. Text is trimmed; a language with an empty field is refused.
create function public.admin_faq_set_translations(p_id uuid, p_translations jsonb)
returns table (id uuid, translations jsonb)
language plpgsql security definer set search_path = '' as $function$
#variable_conflict use_column
declare
  v jsonb := '{}'::jsonb;
  e record;
begin
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Translating an FAQ requires the support or super_admin role'
      using errcode = '42501';
  end if;
  if p_translations is null or jsonb_typeof(p_translations) <> 'object' then
    raise exception 'p_translations must be an object keyed by language' using errcode = '22023';
  end if;
  for e in select * from jsonb_each(p_translations) loop
    if jsonb_typeof(e.value) <> 'object' then
      raise exception 'translation % must be an object', e.key using errcode = '22023';
    end if;
    v := v || jsonb_build_object(e.key, jsonb_build_object(
      'question', btrim(coalesce(e.value ->> 'question', '')),
      'answer',   btrim(coalesce(e.value ->> 'answer', ''))));
  end loop;
  if not public.faq_translations_valid(v) then
    raise exception 'Each language needs a question and an answer, and only hi and gu are kept' using errcode = '22023';
  end if;

  return query
    update public.faqs f set translations = v, updated_at = now()
     where f.id = p_id
    returning f.id, f.translations;
end
$function$;
revoke all on function public.admin_faq_set_translations(uuid, jsonb) from public, anon;
grant execute on function public.admin_faq_set_translations(uuid, jsonb) to authenticated;
revoke all on function public.faq_translations_valid(jsonb) from public, anon, authenticated;

-- ── 4. Self-check ────────────────────────────────────────────────────────────
do $check$
begin
  if not has_column_privilege('anon', 'public.faqs', 'translations', 'SELECT')
     or not has_column_privilege('authenticated', 'public.faqs', 'translations', 'SELECT') then
    raise exception 'faqs.translations must be readable by anon and authenticated';
  end if;
  if has_column_privilege('anon', 'public.faqs', 'created_by', 'SELECT') then
    raise exception 'faqs.created_by must stay unreadable';
  end if;
  if has_function_privilege('anon', 'public.admin_faq_translations(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_faq_translations(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_faq_set_translations(uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_faq_set_translations(uuid,jsonb)', 'EXECUTE') then
    raise exception 'admin_faq_translations and admin_faq_set_translations must be for authenticated only';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'admin\_faq\_%') <> 7 then
    raise exception 'expected seven admin_faq_* functions, one overload each';
  end if;
end
$check$;
