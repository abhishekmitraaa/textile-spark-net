-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN SCHEMA SEPARATION — PHASE 3a: RPCs OVER admin_flags / ad_review_log,
-- WHILE BOTH TABLES ARE STILL IN public. ADDITIVE; NO BEHAVIOUR CHANGE.
--
-- Spec: documentation/admin-separation-spec.md. Rolling context:
-- documentation/admin-separation-context.md.
--
-- Phase 3 moves public.admin_flags and public.ad_review_log behind the admin
-- wall, expand-then-contract:
--   3a (this file)  add SECURITY DEFINER RPCs over the tables where they are now
--   3b              switch the Cosora-Admin panel from direct queries to the RPCs
--   3c              ALTER TABLE … SET SCHEMA admin
-- The panel keeps working through its current direct queries until 3b.
--
-- The RPC set is exactly what the panel does today (Step 0, 2026-09-15):
--   FlagLog.tsx:47    admin_flags select by (entity_type, entity_id), newest first,
--                     with author:profiles!admin_flags_author_id_fkey(full_name, email)
--   Reports.tsx:201   admin_flags select newest 25, same author embed
--   FlagLog.tsx:61    admin_flags insert (entity_type, entity_id, note, author_id = self)
--   AdReviewQueue.tsx:488  ad_review_log select by ad_id, newest first
-- The panel never deletes a flag, so there is no delete RPC.
--
-- THE CORRECTNESS RULE: each RPC admits exactly the callers the table's RLS
-- admits today — no wider, no narrower. The gate is checked inside the function
-- (it runs as postgres, so RLS no longer filters for it) and raises 42501.
--
--   admin_flag_list          = admin_flags_select      USING  is_admin()
--   admin_flag_add           = admin_flags_insert      CHECK  is_admin() AND author_id = auth.uid()
--                              (author_id is not a parameter: it is always auth.uid(), so a
--                               forged author is impossible rather than refused)
--   admin_ad_review_log_list = ad_review_log_select    USING  EXISTS (advertisements a
--                              WHERE a.id = ad_review_log.ad_id AND a.vendor_id = auth.uid())
--                              OR is_admin()
--     NOTE: this policy is not admin-only — the campaign's OWNING VENDOR may read
--     its log today, so the RPC admits the owner too. Phase 0 (Q-4) proposed
--     dropping the owner branch on move; per the Phase 3 correctness rule it is
--     preserved here. Dropping it is a separate, explicit decision.
--
-- The one intended difference from a direct query: a caller the policy excludes
-- gets 42501 from the RPC, where a direct SELECT silently returned 0 rows (an
-- INSERT already raised 42501). Denied either way; no row is ever returned to a
-- caller the policy would hide, and every admitted caller gets the same rows.
--
-- The author name/email returned by admin_flag_list widens nothing:
-- profiles_select is USING (true), so the PostgREST embed exposes the same two
-- columns to the same callers.
--
-- Hardening, matching Phases 1–2: SECURITY DEFINER, owner postgres,
-- search_path = '' with every name schema-qualified, EXECUTE revoked from PUBLIC,
-- anon and service_role (Supabase's per-schema default ACL grants all three),
-- granted to authenticated only.
--
-- Additive: three new functions. No table, policy, trigger or existing function
-- is touched. Single transaction.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Read the flagged-items log. Both panel call sites: by entity (FlagLog), or
--    the newest N across all entities (Reports). NULL filter = no filter,
--    NULL limit = no limit.
create or replace function public.admin_flag_list(
  p_entity_type text    default null,
  p_entity_id   uuid    default null,
  p_limit       integer default null
)
returns table (
  id               uuid,
  entity_type      text,
  entity_id        uuid,
  note             text,
  author_id        uuid,
  created_at       timestamptz,
  author_full_name text,
  author_email     text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      from public.admin_flags f
      left join public.profiles pr on pr.id = f.author_id
     where (p_entity_type is null or f.entity_type = p_entity_type)
       and (p_entity_id   is null or f.entity_id   = p_entity_id)
     order by f.created_at desc, f.id desc
     limit p_limit;
end
$$;

comment on function public.admin_flag_list(text, uuid, integer) is
  'Admin-schema separation 3a. Flagged-items log read; gate = admin_flags_select (is_admin()). Raises 42501 otherwise.';

-- 2. Add a note to the flagged-items log, authored by the caller.
create or replace function public.admin_flag_add(
  p_entity_type text,
  p_entity_id   uuid,
  p_note        text
)
returns table (
  id          uuid,
  entity_type text,
  entity_id   uuid,
  note        text,
  author_id   uuid,
  created_at  timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
  insert into public.admin_flags as f (entity_type, entity_id, note, author_id)
  values (p_entity_type, p_entity_id, p_note, auth.uid())
  returning f.id into v_id;

  return query
    select f.id, f.entity_type, f.entity_id, f.note, f.author_id, f.created_at
      from public.admin_flags f
     where f.id = v_id;
end
$$;

comment on function public.admin_flag_add(text, uuid, text) is
  'Admin-schema separation 3a. Flagged-items log insert; gate = admin_flags_insert (is_admin() AND author_id = auth.uid()); author_id is always auth.uid(). Raises 42501 otherwise.';

-- 3. Read one campaign's append-only decision history.
create or replace function public.admin_ad_review_log_list(p_ad_id uuid)
returns table (
  id              uuid,
  ad_id           uuid,
  reviewer_id     uuid,
  decision        text,
  reason_code     text,
  note            text,
  previous_status text,
  new_status      text,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_ad_id is null then
    raise exception 'p_ad_id is required' using errcode = '22023';
  end if;

  -- Gate = ad_review_log_select:
  --   USING (EXISTS (SELECT 1 FROM advertisements a
  --                   WHERE a.id = ad_review_log.ad_id AND a.vendor_id = auth.uid())
  --          OR is_admin())
  -- Every returned row has ad_id = p_ad_id, so the per-row EXISTS is the same
  -- test for all of them and can be made once, up front.
  if not (coalesce(public.is_admin(), false)
          or exists (select 1 from public.advertisements a
                      where a.id = p_ad_id and a.vendor_id = auth.uid())) then
    raise exception 'Reading this campaign''s review history requires an admin account or ownership of the campaign'
      using errcode = '42501';
  end if;

  return query
    select l.id, l.ad_id, l.reviewer_id, l.decision, l.reason_code, l.note,
           l.previous_status, l.new_status, l.created_at
      from public.ad_review_log l
     where l.ad_id = p_ad_id
     order by l.created_at desc, l.id desc;
end
$$;

comment on function public.admin_ad_review_log_list(uuid) is
  'Admin-schema separation 3a. Campaign decision history; gate = ad_review_log_select (campaign owner OR is_admin()). Raises 42501 otherwise.';

-- Ownership and grants: authenticated only.
alter function public.admin_flag_list(text, uuid, integer) owner to postgres;
alter function public.admin_flag_add(text, uuid, text)     owner to postgres;
alter function public.admin_ad_review_log_list(uuid)       owner to postgres;

revoke all on function public.admin_flag_list(text, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_flag_add(text, uuid, text)     from public, anon, authenticated, service_role;
revoke all on function public.admin_ad_review_log_list(uuid)       from public, anon, authenticated, service_role;

grant execute on function public.admin_flag_list(text, uuid, integer) to authenticated;
grant execute on function public.admin_flag_add(text, uuid, text)     to authenticated;
grant execute on function public.admin_ad_review_log_list(uuid)       to authenticated;
