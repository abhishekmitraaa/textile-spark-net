-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/LEADS HARNESS R1: signed-out visitors read no RFQ (2026-10-03).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R1".
-- Each case plants its fixtures in its own rolled-back subtransaction:
--   A open marketplace, active   B the buyer's, closed   C direct to the vendor, active
--   plus one quote on A by the vendor.
-- Every line prints PASS or FAIL with what it saw.
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
--   local:  docker exec -i supabase_db_localstack psql -U postgres -At < scripts/rfq-leads/r1_anon_lockdown.sql
-- ─────────────────────────────────────────────────────────────────────────────
do $r1$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  admn   uuid := '33333333-3333-3333-3333-333333333333';
  a uuid; b uuid; c uuid;
  labels text[] := array[
    'anon reads no RFQ', 'anon reads no quote', 'a signed-in stranger reads the open board only',
    'the buyer reads all three', 'the target vendor reads open + direct', 'an admin reads all three'];
  wants text[] := array['0', '0', 'A', 'A,B,C', 'A,C', 'A,B,C'];
  who uuid; got text; i int;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      a := gen_random_uuid(); b := gen_random_uuid(); c := gen_random_uuid();
      insert into public.rfqs (id, buyer_id, title, status) values
        (a, buyer, 'R1 open', 'active'), (b, buyer, 'R1 closed', 'closed');
      insert into public.rfqs (id, buyer_id, title, status, vendor_id) values (c, buyer, 'R1 direct', 'active', vendor);
      insert into public.quotes (rfq_id, vendor_id) values (a, vendor);
      insert into admin.admin_users (id, admin_role, is_active) values (admn, 'super_admin', true)
        on conflict (id) do update set admin_role = 'super_admin', is_active = true;

      if i <= 2 then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        who := case i when 3 then gen_random_uuid() when 4 then buyer when 5 then vendor else admn end;
        perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', who::text, true);
        set local role authenticated;
      end if;

      if i = 1 then
        select count(*)::text into got from public.rfqs;
      elsif i = 2 then
        select count(*)::text into got from public.quotes;
      else
        select coalesce(string_agg(case r.id when a then 'A' when b then 'B' else 'C' end, ',' order by 1), '')
          into got from public.rfqs r where r.id in (a, b, c);
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = wants[i] then 'PASS ' else 'FAIL ' end) || got || ' (want ' || wants[i] || ')';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 110) || E'\n';
    end;
  end loop;
  raise exception 'R1 (rolled back)%', E'\n' || out;
end
$r1$;
