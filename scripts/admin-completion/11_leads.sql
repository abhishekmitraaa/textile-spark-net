-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 11: Leads, the RFQ pipeline (Phase 7, 2026-09-28).
-- Each case runs in its own rolled-back subtransaction. The six fixture RFQs
-- (and their quotes) exist only inside the cases that plant them.
--
--   who may read      super_admin, vendor_ops, product_moderator, support -> ok;
--                     finance_admin, ads_moderator, manager, a buyer -> 42501;
--                     anon -> 42501 (no EXECUTE)
--   production        one row per RFQ, newest first; the direct one is marked
--   stages            fixtures land as new / unanswered / unanswered+overdue /
--                     quoted (first quote after 12 h) / won / closed
--   filters           overdue, won, a minimum age and a literal search find the
--                     right fixtures
--   summary           planting the fixtures moves the window counts by exactly
--                     their share (+6 RFQs, +1 won, +1 closed, +2 answered, +5 at
--                     least a day old, +1 answered within 24 h)
--   paging and detail limit 2 walks every row once; the quoted fixture's detail
--                     carries its quote; an unknown id -> P0002
--   bad inputs        an unknown stage, half a cursor, days 0 -> 22023
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h11$
declare
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  buyer  uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid;
  labels text[] := array[
    'super_admin', 'vendor_ops', 'product_moderator', 'support', 'finance_admin', 'ads_moderator', 'manager',
    'buyer', 'anon', 'production rows', 'stages', 'filters', 'summary moves by the fixtures', 'paging',
    'detail', 'bad inputs'];
  roles text[] := array['super_admin', 'vendor_ops', 'product_moderator', 'support', 'finance_admin', 'ads_moderator', 'manager'];
  i int; n int; n2 int; t text; j0 jsonb; j1 jsonb; ids uuid[] := '{}'; page uuid[];
  cur_at timestamptz; cur_id uuid;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      insert into admin.admin_users (id, admin_role, is_active)
      values (pr, (case when i between 1 and 7 then roles[i] else 'super_admin' end)::public.admin_role_type, true)
      on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;

      if i = 13 then
        -- The summary before the fixtures exist, as the admin.
        perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', pr::text, true);
        set local role authenticated;
        j0 := public.admin_leads_summary(30);
        reset role;
      end if;

      if i between 11 and 15 then
        a := gen_random_uuid(); b := gen_random_uuid(); c := gen_random_uuid();
        d := gen_random_uuid(); e := gen_random_uuid(); f := gen_random_uuid();
        insert into public.rfqs (id, buyer_id, title, created_at, status) values
          (a, buyer, 'H11 new', now() - interval '2 hours', 'active'),
          (b, buyer, 'H11 unanswered', now() - interval '30 hours', 'active'),
          (c, buyer, 'H11 overdue', now() - interval '50 hours', 'active'),
          (d, buyer, 'H11 quoted', now() - interval '72 hours', 'active'),
          (e, buyer, 'H11 won', now() - interval '10 days', 'active'),
          (f, buyer, 'H11 closed', now() - interval '5 days', 'closed');
        insert into public.quotes (rfq_id, vendor_id, created_at) values
          (d, vendor, now() - interval '60 hours'),
          (e, vendor, now() - interval '10 days' + interval '30 hours');
        update public.quotes set status = 'accepted' where rfq_id = e;
      end if;

      if i = 9 then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object('sub', case when i = 8 then buyer else pr end, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', (case when i = 8 then buyer else pr end)::text, true);
        set local role authenticated;
      end if;

      if i <= 9 then
        select count(*) into n from public.admin_leads_list(p_limit => 200);
        raise exception using errcode = 'P0099', message = format('%s rows', n);
      elsif i = 10 then
        select count(*), count(*) filter (where x.direct), string_agg(x.stage, ',' order by x.created_at desc)
          into n, n2, t from public.admin_leads_list(p_limit => 200) x;
        raise exception using errcode = 'P0099', message = format('%s rows (rfqs %s), %s direct, stages newest first: %s',
          n, (select count(*) from public.admin_leads_list(p_limit => 200)), n2, t);
      elsif i = 11 then
        select string_agg(format('%s=%s%s%s', x.title, x.stage, case when x.overdue then '+overdue' else '' end,
                                 case when x.first_quote_at is not null
                                      then ' ' || round(extract(epoch from (x.first_quote_at - x.created_at)) / 3600) || 'h'
                                      else '' end
                                 || case when x.accepted_vendor_name is not null then ' by ' || x.accepted_vendor_name else '' end),
                          '; ' order by x.created_at desc)
          into t from public.admin_leads_list(p_search => 'H11', p_limit => 200) x;
        raise exception using errcode = 'P0099', message = t;
      elsif i = 12 then
        select string_agg(x.title, ',') into t from public.admin_leads_list(p_stage => 'overdue', p_search => 'H11') x;
        t := 'overdue=' || coalesce(t, '-');
        t := t || '; won=' || coalesce((select string_agg(x.title, ',') from public.admin_leads_list(p_stage => 'won', p_search => 'H11') x), '-');
        t := t || '; 48h+=' || (select count(*) from public.admin_leads_list(p_min_age_hours => 48, p_search => 'H11'));
        t := t || '; "H11 won"=' || (select count(*) from public.admin_leads_list(p_search => 'H11 won'));
        t := t || '; literal %=' || (select count(*) from public.admin_leads_list(p_search => '%'));
        raise exception using errcode = 'P0099', message = t;
      elsif i = 13 then
        j1 := public.admin_leads_summary(30);
        raise exception using errcode = 'P0099', message = format(
          'window rfqs +%s, won +%s, closed +%s, answered +%s, eligible_24h +%s, answered_24h +%s; open now %s; median first quote %s h',
          (j1 -> 'window' ->> 'rfqs')::int - (j0 -> 'window' ->> 'rfqs')::int,
          (j1 -> 'window' ->> 'won')::int - (j0 -> 'window' ->> 'won')::int,
          (j1 -> 'window' ->> 'closed')::int - (j0 -> 'window' ->> 'closed')::int,
          (j1 -> 'window' ->> 'answered')::int - (j0 -> 'window' ->> 'answered')::int,
          (j1 -> 'window' ->> 'eligible_24h')::int - (j0 -> 'window' ->> 'eligible_24h')::int,
          (j1 -> 'window' ->> 'answered_24h')::int - (j0 -> 'window' ->> 'answered_24h')::int,
          j1 -> 'open', j1 -> 'window' ->> 'median_first_quote_hours');
      elsif i = 14 then
        cur_at := null; cur_id := null;
        loop
          select array_agg(x.id order by x.created_at desc, x.id desc) into page
            from public.admin_leads_list(p_cursor_at => cur_at, p_cursor_id => cur_id, p_limit => 2) x;
          exit when page is null;
          ids := ids || page;
          select x.created_at, x.id into cur_at, cur_id
            from public.admin_leads_list(p_cursor_at => cur_at, p_cursor_id => cur_id, p_limit => 2) x
           order by x.created_at, x.id limit 1;
        end loop;
        select count(*), count(distinct u) into n, n2 from unnest(ids) u;
        raise exception using errcode = 'P0099', message = format('%s rows walked, %s distinct, %s in the list',
          n, n2, (select count(*) from public.admin_leads_list(p_limit => 200)));
      elsif i = 15 then
        j1 := public.admin_lead_detail(d);
        t := format('stage %s, quotes %s, buyer named %s, first quote by %s',
                    j1 ->> 'stage', jsonb_array_length(j1 -> 'quotes'), (j1 -> 'buyer' ->> 'name') is not null,
                    j1 -> 'quotes' -> 0 ->> 'vendor_name');
        begin
          perform public.admin_lead_detail(gen_random_uuid());
        exception when others then t := t || '; unknown id -> ' || sqlstate;
        end;
        raise exception using errcode = 'P0099', message = t;
      elsif i = 16 then
        t := '';
        begin perform public.admin_leads_list(p_stage => 'bogus'); exception when others then t := t || sqlstate || ' '; end;
        begin perform public.admin_leads_list(p_cursor_at => now()); exception when others then t := t || sqlstate || ' '; end;
        begin perform public.admin_leads_summary(0); exception when others then t := t || sqlstate; end;
        raise exception using errcode = 'P0099', message = format('stage/cursor/days -> %s', t);
      end if;
      raise exception using errcode = 'P0099', message = 'no error';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ok ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': -> ' || sqlstate || ' ' || left(sqlerrm, 110) || E'\n';
    end;
  end loop;
  raise exception 'H11 (rolled back)%', E'\n' || out;
end
$h11$;
