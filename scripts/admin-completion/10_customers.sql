-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 10: Customers (Phase 6, 2026-09-28). Each case runs in
-- its own rolled-back subtransaction; fixtures exist only inside their case.
--
--   who may read        super_admin, support, finance_admin -> ok; product_moderator,
--                       vendor_ops, ads_moderator, manager, a buyer -> 42501; anon -> 42501
--   the population      one row per account that isn't deleted and isn't active staff;
--                       vendors + buyers = customers; no active admin listed
--   spend               each paying customer's spend equals the payments ledger's paid
--                       total less refunds for that vendor
--   order and paging    spend first; limit 5 walks every row once
--   search and inputs   a literal '%' -> 0 rows; a name fragment -> found; an unknown
--                       segment, sort or kind -> 22023
--   tags                support creates (a second spelling returns the same tag),
--                       applies, filters, searches, removes and deletes, and the Admin
--                       Log records it; finance_admin -> 42501; a bad label -> 22023
--   refresh             fresh data isn't refreshed again; data over 10 minutes old is,
--                       concurrently
--   segments            an RFQ 90 days old makes a quiet buyer "at risk"; one 5 days
--                       old makes another "active"
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h10$
declare
  sa      uuid := '33333333-3333-3333-3333-333333333333';
  pr      uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  buyer   uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  quiet1  uuid := '948b930b-eae6-47eb-bcf6-06e1870f58dd';
  quiet2  uuid := 'bfbaf9d0-346b-4202-a88f-7c76e90eedbf';
  labels text[] := array[
    'super_admin', 'support', 'finance_admin', 'product_moderator', 'vendor_ops', 'ads_moderator', 'manager',
    'buyer', 'anon', 'the population', 'no active staff listed', 'spend equals the ledger', 'order: spend first',
    'paging', 'search', 'bad inputs', 'tags: the whole cycle', 'tags: finance_admin writes', 'tags: bad label',
    'refresh', 'segments: at risk and active'];
  roles text[] := array['super_admin', 'support', 'finance_admin', 'product_moderator', 'vendor_ops', 'ads_moderator', 'manager'];
  i int; n int; n2 int; n3 int; audits int; t text; t2 text; j jsonb; k uuid; tag1 uuid; tag2 uuid; ts1 timestamptz;
  keys uuid[] := '{}'; page uuid[];
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      if i = 21 then
        insert into public.rfqs (buyer_id, title, created_at) values
          (quiet1, 'H10 at-risk fixture', now() - interval '90 days'),
          (quiet2, 'H10 active fixture', now() - interval '5 days');
        refresh materialized view admin.customer_summary;
      end if;
      if i = 20 then
        update admin.customer_summary_meta set refreshed_at = now() where singleton;
      end if;

      if i between 1 and 7 or i >= 10 then
        insert into admin.admin_users (id, admin_role, is_active)
        values (pr, (case when i between 1 and 7 then roles[i]
                          when i = 18 then 'finance_admin'
                          when i in (17, 19) then 'support'
                          else 'super_admin' end)::public.admin_role_type, true)
        on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
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
        select count(*) into n from public.admin_customer_list(p_limit => 200);
        raise exception using errcode = 'P0099', message = format('%s rows', n);
      elsif i = 10 then
        j := public.admin_customer_segment_counts();
        reset role;
        select count(*) into n from public.profiles p
         where p.account_status::text <> 'deleted'
           and not exists (select 1 from admin.admin_users a where a.id = p.id and a.is_active and a.id <> pr);
        raise exception using errcode = 'P0099', message = format('customers %s (expected %s), vendors %s + buyers %s, spend %s paise',
          j ->> 'customers', n, j ->> 'vendors', j ->> 'buyers', j ->> 'spend_paise');
      elsif i = 11 then
        -- Collect as the admin, check as the owner: clients can't read admin.admin_users.
        select array_agg(x.id) into keys from public.admin_customer_list(p_limit => 200) x;
        reset role;
        select count(*) into n from admin.admin_users a where a.id = any (keys) and a.is_active and a.id <> pr;
        raise exception using errcode = 'P0099', message = format('%s active staff listed', n);
      elsif i = 12 then
        n := 0; n2 := 0;
        for k in select x.id from public.admin_customer_list(p_limit => 200) x where x.payments > 0 loop
          j := public.admin_payments_summary(p_vendor => k);
          n := n + 1;
          if (select x.spend_paise from public.admin_customer_list(p_limit => 200) x where x.id = k)
             = (j ->> 'paid_paise')::bigint - (j ->> 'refunded_paise')::bigint then
            n2 := n2 + 1;
          end if;
        end loop;
        raise exception using errcode = 'P0099', message = format('%s of %s paying customers match the ledger', n2, n);
      elsif i = 13 then
        select x.spend_paise, max(x.spend_paise) over () into n, n2
          from public.admin_customer_list(p_limit => 200) x limit 1;
        raise exception using errcode = 'P0099', message = format('first row spend %s, the most %s', n, n2);
      elsif i = 14 then
        n := 0;
        keys := '{}';
        loop
          select array_agg(x.id) into page from public.admin_customer_list(p_offset => n, p_limit => 5) x;
          exit when page is null;
          keys := keys || page;
          n := n + 5;
        end loop;
        select count(*), count(distinct u) into n2, n3 from unnest(keys) u;
        select x.total_count into n from public.admin_customer_list(p_limit => 1) x;
        raise exception using errcode = 'P0099', message = format('%s rows paged, %s distinct, total_count %s', n2, n3, n);
      elsif i = 15 then
        select count(*) into n from public.admin_customer_list(p_search => '%');
        select left(x.name, 4) into t from public.admin_customer_list(p_limit => 1) x;
        select count(*) into n2 from public.admin_customer_list(p_search => t);
        raise exception using errcode = 'P0099', message = format('literal %% %s rows; "%s" %s rows', n, t, n2);
      elsif i = 16 then
        t := '';
        begin perform public.admin_customer_list(p_segment => 'bogus'); exception when others then t := t || sqlstate || ' '; end;
        begin perform public.admin_customer_list(p_sort => 'bogus'); exception when others then t := t || sqlstate || ' '; end;
        begin perform public.admin_customer_list(p_kind => 'staff'); exception when others then t := t || sqlstate; end;
        raise exception using errcode = 'P0099', message = format('segment/sort/kind -> %s', t);
      elsif i = 17 then
        tag1 := public.admin_customer_tag_create('h10-test');
        tag2 := public.admin_customer_tag_create('  H10-Test ');
        perform public.admin_customer_tag_apply(quiet1, tag1);
        perform public.admin_customer_tag_apply(quiet1, tag1);
        select count(*) into n from public.admin_customer_list(p_tag => tag1);
        select count(*) into n2 from public.admin_customer_list(p_search => 'h10-test');
        select x.uses into n3 from public.admin_customer_tags() x where x.id = tag1;
        t := (select x.tags::text from public.admin_customer_list(p_tag => tag1) x limit 1);
        perform public.admin_customer_tag_remove(quiet1, tag1);
        t2 := (select count(*)::text from public.admin_customer_list(p_tag => tag1));
        perform public.admin_customer_tag_delete(tag1);
        reset role;
        select count(*) into audits from admin.audit_log l where l.actor_id = pr and l.target_table in ('admin.customer_tags', 'admin.profile_tags');
        raise exception using errcode = 'P0099', message = format(
          'same tag for both spellings: %s; tagged rows %s, found by tag search %s, uses %s, tags %s; after remove %s rows; audit rows %s',
          tag1 = tag2, n, n2, n3, t, t2, audits);
      elsif i = 18 then
        perform public.admin_customer_tag_create('h10-finance');
      elsif i = 19 then
        perform public.admin_customer_tag_create('Bad Label!');
      elsif i = 20 then
        j := public.admin_customer_refresh();
        reset role;
        update admin.customer_summary_meta set refreshed_at = now() - interval '11 minutes' where singleton;
        set local role authenticated;
        t := public.admin_customer_refresh()::text;
        raise exception using errcode = 'P0099', message = format('fresh: %s; stale: %s', j ->> 'reason', t);
      elsif i = 21 then
        select string_agg(x.id::text || '=' || array_to_string(x.segments, '+'), '; ') into t
          from public.admin_customer_list(p_limit => 200) x where x.id in (quiet1, quiet2);
        select count(*) into n from public.admin_customer_list(p_segment => 'at_risk') x where x.id = quiet1;
        select count(*) into n2 from public.admin_customer_list(p_segment => 'active') x where x.id = quiet2;
        raise exception using errcode = 'P0099', message = format('at_risk has quiet1: %s; active has quiet2: %s; %s', n = 1, n2 = 1, t);
      end if;
      raise exception using errcode = 'P0099', message = 'no error';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ok ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': -> ' || sqlstate || ' ' || left(sqlerrm, 110) || E'\n';
    end;
  end loop;
  raise exception 'H10 (rolled back)%', E'\n' || out;
end
$h10$;
