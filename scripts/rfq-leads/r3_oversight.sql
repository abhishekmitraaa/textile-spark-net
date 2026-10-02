-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/LEADS HARNESS R3: admins remove or flag a lead; nobody hard-deletes (2026-10-03).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R3".
-- Fixtures per case: O open-marketplace RFQ with the vendor's quote, D direct RFQ to
-- the vendor. Every line prints PASS or FAIL with what it saw.
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $r3$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  admn   uuid := '33333333-3333-3333-3333-333333333333';
  o uuid; d uuid;
  labels text[] := array[
    'super_admin removes', 'product_moderator removes', 'vendor_ops refused', 'support refused',
    'finance_admin refused', 'a buyer refused', 'anon refused', 'blank reason', 'unknown RFQ', 'removed twice',
    'buyer cannot reopen', 'buyer cannot edit', 'buyer cannot un-remove', 'buyer cannot insert removed',
    'admin cannot reopen either', 'target vendor no longer sees it', 'quote refused after removal',
    'buyer reads the reason', 'Admin Log row with the reason', 'stage and filter', 'summary counts it apart',
    'detail carries the removal', 'flag rfq as product_moderator', 'flag rfq as support refused',
    'support still flags a product', 'buyer DELETE refused', 'admin DELETE refused'];
  wants text[] := array[
    'closed|removed', 'closed|removed', '42501', '42501',
    '42501', '42501', '42501', '22023', 'P0002', '55000',
    '42501', '42501', '42501', '42501',
    '42501', '0', 'P0001',
    'Spam', '1|Spam', 'removed|1', '1|0', 'Spam|named', 'ok', '42501',
    'ok', '42501', '42501'];
  roles text[] := array['super_admin', 'product_moderator', 'vendor_ops', 'support', 'finance_admin'];
  got text; i int; n int; j jsonb; s0 jsonb; s1 jsonb;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      o := gen_random_uuid(); d := gen_random_uuid();
      insert into public.rfqs (id, buyer_id, title, status) values (o, buyer, 'R3 open', 'active');
      insert into public.rfqs (id, buyer_id, title, status, vendor_id) values (d, buyer, 'R3 direct', 'active', vendor);
      insert into public.quotes (rfq_id, vendor_id, price_per_unit, price_inr) values (o, vendor, 100, 100);
      insert into admin.admin_users (id, admin_role, is_active)
        values (admn, (case when i between 1 and 5 then roles[i] when i in (23) then 'product_moderator'
                            when i in (24, 25) then 'support' else 'super_admin' end)::public.admin_role_type, true)
        on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;

      -- Cases that need a removed RFQ first: remove D (direct) or O as super_admin.
      if i in (10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22) then
        perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', admn::text, true);
        set local role authenticated;
        if i = 21 then s0 := public.admin_leads_summary(null); end if;
        perform public.admin_lead_remove(case when i = 16 then d else o end, 'Spam');
        reset role;
      end if;

      -- Who acts in the case.
      if i = 7 then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object('sub',
          case when i in (6, 11, 12, 13, 14, 18, 26) then buyer when i in (16, 17) then vendor else admn end,
          'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub',
          (case when i in (6, 11, 12, 13, 14, 18, 26) then buyer when i in (16, 17) then vendor else admn end)::text, true);
        set local role authenticated;
      end if;

      begin
        if i between 1 and 7 then
          perform public.admin_lead_remove(o, 'Spam');
          reset role;
          select r.status || '|' || case when r.removed_at is not null and r.removed_reason = 'Spam' and r.removed_by = admn
                                        then 'removed' else 'not removed' end
            into got from public.rfqs r where r.id = o;
        elsif i = 8 then
          perform public.admin_lead_remove(o, '   ');
          got := 'accepted';
        elsif i = 9 then
          perform public.admin_lead_remove(gen_random_uuid(), 'Spam');
          got := 'accepted';
        elsif i = 10 then
          perform public.admin_lead_remove(o, 'Again');
          got := 'accepted';
        elsif i = 11 or i = 15 then
          update public.rfqs set status = 'active' where id = o;
          got := 'accepted';
        elsif i = 12 then
          update public.rfqs set title = 'edited' where id = o;
          got := 'accepted';
        elsif i = 13 then
          update public.rfqs set removed_at = null, removed_reason = null where id = o;
          got := 'accepted';
        elsif i = 14 then
          insert into public.rfqs (buyer_id, title, status, removed_at, removed_reason)
          values (buyer, 'R3 sneaky', 'closed', now(), 'self');
          got := 'accepted';
        elsif i = 16 then
          select count(*)::text into got from public.rfqs where id = d;
        elsif i = 17 then
          insert into public.quotes (rfq_id, vendor_id, price_per_unit, price_inr, status)
          values (o, vendor, 90, 90, 'pending')
          on conflict (rfq_id, vendor_id) do update set price_per_unit = excluded.price_per_unit, status = 'pending';
          got := 'accepted';
        elsif i = 18 then
          select removed_reason into got from public.rfqs where id = o;
        elsif i = 19 then
          reset role;
          select count(*) || '|' || max(reason) into got from admin.audit_log
           where target_table = 'public.rfqs' and target_id = o::text and action = 'update';
        elsif i = 20 then
          select count(*) into n from public.admin_leads_list(p_stage => 'removed', p_limit => 200) l where l.id = o;
          select l.stage || '|' || n into got from public.admin_leads_list(p_limit => 200) l where l.id = o;
        elsif i = 21 then
          s1 := public.admin_leads_summary(null);
          got := ((s1 -> 'window' ->> 'removed')::int - coalesce((s0 -> 'window' ->> 'removed')::int, 0)) || '|'
              || ((s1 -> 'window' ->> 'closed')::int - (s0 -> 'window' ->> 'closed')::int);
        elsif i = 22 then
          j := public.admin_lead_detail(o);
          got := (j -> 'removal' ->> 'reason') || '|' || case when coalesce(j -> 'removal' ->> 'by', '') <> '' then 'named' else 'unnamed' end;
        elsif i = 23 or i = 24 then
          perform public.admin_flag_add('rfq', o, 'Looks like a duplicate');
          got := 'ok';
        elsif i = 25 then
          perform public.admin_flag_add('product', gen_random_uuid(), 'Check the photos');
          got := 'ok';
        elsif i = 26 or i = 27 then
          delete from public.rfqs where id = o;
          get diagnostics n = row_count;
          got := 'deleted ' || n;
        end if;
      exception when others then
        got := sqlstate;
      end;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = wants[i] then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || wants[i] || ')';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 140) || E'\n';
    end;
  end loop;
  raise exception 'R3 (rolled back)%', E'\n' || out;
end
$r3$;
