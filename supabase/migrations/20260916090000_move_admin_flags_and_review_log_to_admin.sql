-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN SCHEMA SEPARATION — PHASE 3c: admin_flags AND ad_review_log MOVE BEHIND
-- THE ADMIN WALL. Q-4 (decision history is admin-only). guard_ad_deletion fix.
--
-- Spec: documentation/admin-separation-spec.md. Rolling context:
-- documentation/admin-separation-context.md. Follows 20260915170000 (3a RPCs).
--
-- Preconditions verified at Step 0 (2026-09-16):
--   * the production panel (cosora-admin.vercel.app, bundle index-C7oovihn.js)
--     calls admin_flag_list / admin_flag_add / admin_ad_review_log_list and has
--     0 `.from("admin_flags"|"ad_review_log")` — Cosora-Admin 3b (c322055) is on
--     origin/main;
--   * textile-spark-net origin/main holds the Phase 1/2/3a migrations, and each
--     file equals the statements applied live (whitespace-insensitive md5).
--   * the buyer/vendor app reads neither table (src/, supabase/functions/, tests/).
--
-- WHAT THIS DOES, in one transaction:
--   1. ALTER TABLE … SET SCHEMA admin for both tables. A move, not a drop: rows,
--      indexes, constraints, RLS policies and grants travel with the table; FKs
--      bind by OID, so admin_flags.author_id -> profiles, ad_review_log.ad_id ->
--      advertisements (ON DELETE CASCADE) and reviewer_id -> profiles keep working
--      across schemas.
--   2. Repoints the seven functions that name the tables (verified live: the only
--      ones; no views): ad_apply_decision, log_ad_submission, ad_review_metrics,
--      admin_ad_review_log_list, guard_ad_deletion, admin_flag_add, admin_flag_list.
--      Each body is the live definition with `public.<table>` -> `admin.<table>`
--      and nothing else, except the two decided changes below.
--   3. Q-4: admin_ad_review_log_list drops the owning-vendor branch; the gate is
--      now admin-only. Intentional: a vendor calling it for their own campaign
--      now gets 42501 where it returned rows. No app code calls it as a vendor.
--   4. guard_ad_deletion: it reads the log, which authenticated can no longer
--      reach, so it becomes SECURITY DEFINER (search_path '', fully qualified).
--      Inside a definer function current_user is always postgres, which would
--      turn its `current_user <> 'authenticated'` bypass on for everyone and
--      silently disable the guard (proven in a rolled-back probe, 2026-09-15).
--      So that one line becomes `current_setting('role', true) is distinct from
--      'authenticated'`: the role PostgREST set for the request, which a definer
--      function does not change. Probed: owner refused, super_admin / service_role
--      / postgres allowed — identical to the invoker version. No other logic change.
--      EXECUTE is revoked from PUBLIC/anon/authenticated (a trigger function needs
--      no EXECUTE to fire; probed).
--   5. Revokes the residual table grants that travel with the tables:
--      anon/authenticated held admin_flags ALL and ad_review_log
--      SELECT/REFERENCES/TRIGGER/TRUNCATE. RLS stays on as defence in depth.
--   6. Asserts the end state and aborts the whole transaction if any of it is wrong.
--
-- ── ROLLBACK (manual, one transaction) ───────────────────────────────────────
-- Run the block below. It restores every object to its exact pre-3c definition.
--
--   begin;
--   alter table admin.admin_flags   set schema public;
--   alter table admin.ad_review_log set schema public;
--   grant all on public.admin_flags to anon, authenticated;
--   grant select, references, trigger, truncate on public.ad_review_log to anon, authenticated;
--   grant execute on function public.guard_ad_deletion() to public, anon, authenticated;
--
--   CREATE OR REPLACE FUNCTION public.guard_ad_deletion()
--    RETURNS trigger
--    LANGUAGE plpgsql
--    SECURITY INVOKER
--    SET search_path TO 'public'
--   AS $function$
--   begin
--     if current_user <> 'authenticated' then return old; end if;
--     if public.is_admin() then return old; end if;
--     if exists (select 1 from public.ad_review_log where ad_id = old.id) then
--       raise exception
--         'This campaign has already been reviewed, so its history cannot be deleted. Pause it instead, or ask Cosora to archive it.'
--         using errcode = '42501';
--     end if;
--     return old;
--   end $function$;
--
--   CREATE OR REPLACE FUNCTION public.admin_ad_review_log_list(p_ad_id uuid)
--    RETURNS TABLE(id uuid, ad_id uuid, reviewer_id uuid, decision text, reason_code text, note text, previous_status text, new_status text, created_at timestamp with time zone)
--    LANGUAGE plpgsql
--    STABLE SECURITY DEFINER
--    SET search_path TO ''
--   AS $function$
--   #variable_conflict use_column
--   begin
--     if p_ad_id is null then
--       raise exception 'p_ad_id is required' using errcode = '22023';
--     end if;
--     if not (coalesce(public.is_admin(), false)
--             or exists (select 1 from public.advertisements a
--                         where a.id = p_ad_id and a.vendor_id = auth.uid())) then
--       raise exception 'Reading this campaign''s review history requires an admin account or ownership of the campaign'
--         using errcode = '42501';
--     end if;
--     return query
--       select l.id, l.ad_id, l.reviewer_id, l.decision, l.reason_code, l.note,
--              l.previous_status, l.new_status, l.created_at
--         from public.ad_review_log l
--        where l.ad_id = p_ad_id
--        order by l.created_at desc, l.id desc;
--   end
--   $function$;
--   comment on function public.admin_ad_review_log_list(uuid) is
--     'Admin-schema separation 3a. Campaign decision history; gate = ad_review_log_select (campaign owner OR is_admin()). Raises 42501 otherwise.';
--
--   -- The other five: re-run their bodies exactly as below in this file, with
--   -- every `admin.admin_flags` / `admin.ad_review_log` changed back to
--   -- `public.admin_flags` / `public.ad_review_log`. No other difference exists
--   -- (asserted at the end of this migration: each new body minus that
--   -- substitution equals its pre-3c md5 — ad_apply_decision 23547d58…,
--   -- log_ad_submission 1f04e4e1…, ad_review_metrics a3746716…,
--   -- admin_flag_add 172495f5…, admin_flag_list c39368b3…).
--   commit;
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Move the tables.
alter table public.admin_flags   set schema admin;
alter table public.ad_review_log set schema admin;

-- 2. Repoint the writers and readers.
CREATE OR REPLACE FUNCTION public.ad_apply_decision(p_ad_id uuid, p_new_status text, p_decision text, p_reason_code text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_reviewer uuid DEFAULT NULL::uuid, p_notify_title text DEFAULT NULL::text, p_notify_body text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prev   text;
  v_vendor uuid;
  affected int;
begin
  select status, vendor_id into v_prev, v_vendor
    from public.advertisements where id = p_ad_id;
  if v_prev is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;

  perform set_config('cosora.ad_review', 'on', true);

  update public.advertisements
     set status            = p_new_status,
         moderation_reason = case
                               when p_reason_code is null and p_note is null then moderation_reason
                               else nullif(trim(both ' ' from
                                      coalesce(p_reason_code, '') || ' ' || coalesce(p_note, '')), '')
                             end,
         moderated_at      = case when p_reviewer is null then moderated_at else now() end,
         moderated_by      = coalesce(p_reviewer, moderated_by)
   where id = p_ad_id;

  get diagnostics affected = row_count;
  perform set_config('cosora.ad_review', '', true);

  if affected = 0 then
    raise exception 'campaign % could not be moved to %', p_ad_id, p_new_status
      using errcode = 'P0002';
  end if;

  insert into admin.ad_review_log
    (ad_id, reviewer_id, decision, reason_code, note, previous_status, new_status)
  values
    (p_ad_id, p_reviewer, p_decision, p_reason_code, p_note, v_prev, p_new_status);

  if p_notify_title is not null then
    perform public.notify(v_vendor, 'ad_' || p_decision, p_notify_title, p_notify_body);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_ad_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'pending_review' then
    insert into admin.ad_review_log (ad_id, reviewer_id, decision, previous_status, new_status)
    values (new.id, null, 'submitted', null, 'pending_review');
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.ad_review_metrics(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: ad review metrics require the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  return (
    with decided as (
      select l.ad_id, l.created_at as decided_at, l.decision,
             (select max(p.created_at) from admin.ad_review_log p
               where p.ad_id = l.ad_id
                 and p.new_status = 'pending_review'
                 and p.created_at <= l.created_at) as queued_at
        from admin.ad_review_log l
       where l.decision in ('approved', 'rejected', 'changes_requested')
         and l.created_at >= now() - make_interval(days => greatest(1, p_days))
    )
    select jsonb_build_object(
      'window_days', greatest(1, p_days),
      'queue_depth', jsonb_build_object(
        'pending_review',    (select count(*) from public.advertisements where status = 'pending_review'),
        'changes_requested', (select count(*) from public.advertisements where status = 'changes_requested'),
        'scheduled',         (select count(*) from public.advertisements where status = 'scheduled'),
        'active',            (select count(*) from public.advertisements where status = 'active'),
        'suspended',         (select count(*) from public.advertisements where status = 'suspended')
      ),
      'oldest_waiting_hours', (
        select round(extract(epoch from (now() - min(created_at))) / 3600.0, 1)
          from public.advertisements where status = 'pending_review'
      ),
      'decisions', (select count(*) from decided),
      'avg_hours_to_decision', (
        select round(avg(extract(epoch from (decided_at - queued_at))) / 3600.0, 1)
          from decided where queued_at is not null
      ),
      'decision_breakdown', coalesce((
        select jsonb_object_agg(decision, n)
          from (select decision, count(*) as n from decided group by decision) d
      ), '{}'::jsonb),
      'rejection_reasons', coalesce((
        select jsonb_object_agg(reason, n) from (
          select coalesce(reason_code, 'unspecified') as reason, count(*) as n
            from admin.ad_review_log
           where decision = 'rejected'
             and created_at >= now() - make_interval(days => greatest(1, p_days))
           group by 1
        ) r
      ), '{}'::jsonb),
      'fraud_flagged', (select count(*) from public.ad_fraud_signals(greatest(1, p_days)))
    )
  );
end $function$;

CREATE OR REPLACE FUNCTION public.admin_flag_list(p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, entity_type text, entity_id uuid, note text, author_id uuid, created_at timestamp with time zone, author_full_name text, author_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  -- Gate = admin_flags_select: USING (is_admin())
  if not coalesce(public.is_admin(), false) then
    raise exception 'Reading the flagged-items log requires an admin account'
      using errcode = '42501';
  end if;

  if p_limit is not null and p_limit < 1 then
    raise exception 'p_limit must be at least 1' using errcode = '22023';
  end if;

  return query
    select f.id, f.entity_type, f.entity_id, f.note, f.author_id, f.created_at,
           pr.full_name, pr.email
      from admin.admin_flags f
      left join public.profiles pr on pr.id = f.author_id
     where (p_entity_type is null or f.entity_type = p_entity_type)
       and (p_entity_id   is null or f.entity_id   = p_entity_id)
     order by f.created_at desc, f.id desc
     limit p_limit;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_flag_add(p_entity_type text, p_entity_id uuid, p_note text)
 RETURNS TABLE(id uuid, entity_type text, entity_id uuid, note text, author_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_id uuid;
begin
  -- Gate = admin_flags_insert: WITH CHECK (is_admin() AND author_id = auth.uid())
  if not coalesce(public.is_admin(), false) then
    raise exception 'Adding to the flagged-items log requires an admin account'
      using errcode = '42501';
  end if;

  -- The table's CHECK constraints (entity_type, non-blank note) still apply and
  -- raise 23514 exactly as they do for a direct insert.
  insert into admin.admin_flags as f (entity_type, entity_id, note, author_id)
  values (p_entity_type, p_entity_id, p_note, auth.uid())
  returning f.id into v_id;

  return query
    select f.id, f.entity_type, f.entity_id, f.note, f.author_id, f.created_at
      from admin.admin_flags f
     where f.id = v_id;
end
$function$;

-- 3. Q-4: campaign decision history is admin-only.
CREATE OR REPLACE FUNCTION public.admin_ad_review_log_list(p_ad_id uuid)
 RETURNS TABLE(id uuid, ad_id uuid, reviewer_id uuid, decision text, reason_code text, note text, previous_status text, new_status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  if p_ad_id is null then
    raise exception 'p_ad_id is required' using errcode = '22023';
  end if;

  -- Gate: admin only (Q-4, decided in Phase 3c). The campaign's owning vendor,
  -- admitted until 3c because ad_review_log_select admitted it, is no longer.
  if not coalesce(public.is_admin(), false) then
    raise exception 'Reading a campaign''s review history requires an admin account'
      using errcode = '42501';
  end if;

  return query
    select l.id, l.ad_id, l.reviewer_id, l.decision, l.reason_code, l.note,
           l.previous_status, l.new_status, l.created_at
      from admin.ad_review_log l
     where l.ad_id = p_ad_id
     order by l.created_at desc, l.id desc;
end
$function$;

comment on function public.admin_ad_review_log_list(uuid) is
  'Admin-schema separation 3a/3c. Campaign decision history from admin.ad_review_log; admin-only (Q-4). Raises 42501 otherwise.';

-- 4. guard_ad_deletion: definer rights to read the walled log; caller bypass keyed
--    to the request role, because current_user is always postgres in here.
CREATE OR REPLACE FUNCTION public.guard_ad_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('role', true) is distinct from 'authenticated' then return old; end if;
  if public.is_admin() then return old; end if;
  if exists (select 1 from admin.ad_review_log where ad_id = old.id) then
    raise exception
      'This campaign has already been reviewed, so its history cannot be deleted. Pause it instead, or ask Cosora to archive it.'
      using errcode = '42501';
  end if;
  return old;
end $function$;

alter function public.guard_ad_deletion() owner to postgres;
revoke execute on function public.guard_ad_deletion() from public, anon, authenticated;

-- 5. Residual table grants that travelled with the tables.
revoke all on admin.admin_flags   from anon, authenticated;
revoke all on admin.ad_review_log from anon, authenticated;

-- 6. Assert the end state; any failure aborts the whole migration.
do $$
declare
  v_bad text;
begin
  if to_regclass('public.admin_flags') is not null or to_regclass('public.ad_review_log') is not null then
    raise exception 'Phase 3c aborted: a table is still in public';
  end if;
  if to_regclass('admin.admin_flags') is null or to_regclass('admin.ad_review_log') is null then
    raise exception 'Phase 3c aborted: a table is missing from admin';
  end if;
  if has_table_privilege('anon', 'admin.admin_flags', 'select,insert,update,delete,truncate,references,trigger')
     or has_table_privilege('authenticated', 'admin.admin_flags', 'select,insert,update,delete,truncate,references,trigger')
     or has_table_privilege('anon', 'admin.ad_review_log', 'select,insert,update,delete,truncate,references,trigger')
     or has_table_privilege('authenticated', 'admin.ad_review_log', 'select,insert,update,delete,truncate,references,trigger') then
    raise exception 'Phase 3c aborted: a client role still holds a table privilege';
  end if;
  if has_schema_privilege('anon', 'admin', 'usage') or has_schema_privilege('authenticated', 'admin', 'usage') then
    raise exception 'Phase 3c aborted: client USAGE on schema admin';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and p.prosrc ~ 'public\.(admin_flags|ad_review_log)\M';
  if v_bad is not null then
    raise exception 'Phase 3c aborted: still referencing public.admin_flags/ad_review_log: %', v_bad;
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.guard_ad_deletion()'::regprocedure)
     or has_function_privilege('authenticated', 'public.guard_ad_deletion()', 'execute') then
    raise exception 'Phase 3c aborted: guard_ad_deletion is not SECURITY DEFINER or is still client-executable';
  end if;
  -- Pure repoints: each body minus the schema substitution equals its pre-3c definition.
  select string_agg(fn, ', ') into v_bad from (values
      ('public.ad_apply_decision(uuid,text,text,text,text,uuid,text,text)', '23547d586b71af60be4fda5ff8560d91'),
      ('public.log_ad_submission()',                                        '1f04e4e18aeb6530bf278bac1443d4e7'),
      ('public.ad_review_metrics(integer)',                                 'a37467163f2b4d99c822f3ba2f4b9827'),
      ('public.admin_flag_add(text,uuid,text)',                             '172495f5287d8279655242bed63709d1'),
      ('public.admin_flag_list(text,uuid,integer)',                         'c39368b33a062d1121459f7d79981337')
    ) v(fn, pre_md5)
   where md5(replace(replace(pg_get_functiondef(fn::regprocedure), 'admin.ad_review_log', 'public.ad_review_log'),
                     'admin.admin_flags', 'public.admin_flags')) <> pre_md5;
  if v_bad is not null then
    raise exception 'Phase 3c aborted: body differs from pre-3c beyond the schema repoint: %', v_bad;
  end if;
end
$$;

notify pgrst, 'reload schema';
