-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/leads R1: no RFQ data for signed-out visitors (Mitra, 2026-10-02).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R1".
--
-- rfqs_select applied TO public, and its open-marketplace branch
-- (status = 'active' and vendor_id is null) never looked at the caller, so the anon
-- key read every active open RFQ (3 of 3, measured 2026-10-02). The policy now applies
-- to `authenticated` only: anon matches no SELECT policy and reads nothing. The
-- predicate is unchanged, so every signed-in user keeps exactly today's access,
-- including a signed-in non-vendor reading the open board (claude.md, "Any signed-in
-- user may read any ACTIVE open-marketplace RFQ").
--
-- quotes_select needs nothing: vendor_id and owns_rfq() compare with auth.uid(), which
-- is null for anon (0 rows, measured). scripts/rfq-leads/r1_anon_lockdown.sql pins both.
-- ─────────────────────────────────────────────────────────────────────────────
alter policy rfqs_select on public.rfqs
  to authenticated
  using (
    ((status = 'active'::public.rfq_status) and ((vendor_id is null) or (vendor_id = (select auth.uid()))))
    or (buyer_id = (select auth.uid()))
    or (select public.is_admin())
  );

-- ── Self-check ──────────────────────────────────────────────────────────────
do $check$
declare
  v_roles text;
  v_n     int;
begin
  select roles::text into v_roles from pg_policies
   where schemaname = 'public' and tablename = 'rfqs' and policyname = 'rfqs_select';
  if v_roles is distinct from '{authenticated}' then
    raise exception 'R1 self-check: rfqs_select applies to %, expected {authenticated}', v_roles;
  end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'rfqs' and cmd in ('SELECT', 'ALL')
     and roles && array['public', 'anon']::name[];
  if v_n <> 0 then
    raise exception 'R1 self-check: % rfqs policies still let anon read', v_n;
  end if;
end
$check$;
