-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 15: least-privilege admin reads (Phase 11, 2026-10-02).
-- Each case runs in its own rolled-back subtransaction; fixtures exist only inside it.
--
--   read matrix   For each persona, the rows it sees in seven tables. An admin role
--                 named in a table's policy sees every row; any other role sees only
--                 rows it owns (none). The vendor sees its own; the buyer its own
--                 (none); anon none. A line says "ok" only when every count matches.
--                   docs, contracts   super_admin, vendor_ops, support
--                   inv, subs         super_admin, finance_admin, support
--                   ads               super_admin, ads_moderator, finance_admin, support
--                   cert              super_admin, finance_admin
--                   events            super_admin
--   cap triggers  a product moderator re-approves a paying vendor's rejected listing
--                 (ok) and a free vendor's over the cap (refused, "your free plan");
--                 the vendor resubmits its own (ok); a moderator approves a paying
--                 vendor's rejected catalogue (ok)
--   helper        vendor_cap_plan(): the vendor's own -> its plan; a buyer asking about
--                 another vendor -> 42501; anon -> 42501 (no EXECUTE)
--
-- Before the migration the matrix shows every admin role reading everything (the
-- lines fail) and the helper doesn't exist. HOW TO RUN: execute this whole file as
-- ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h15$
declare
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  buyer  uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  tabs   text[] := array['vendor_documents', 'vendor_contracts', 'subscription_invoices', 'vendor_subscriptions',
                         'ad_orders', 'certificate_orders', 'engagement_events'];
  short  text[] := array['docs', 'contracts', 'inv', 'subs', 'ads', 'cert', 'events'];
  readers text[] := array['super_admin,vendor_ops,support', 'super_admin,vendor_ops,support',
                          'super_admin,finance_admin,support', 'super_admin,finance_admin,support',
                          'super_admin,ads_moderator,finance_admin,support', 'super_admin,finance_admin', 'super_admin'];
  labels text[] := array['super_admin', 'finance_admin', 'support', 'product_moderator', 'vendor_ops', 'ads_moderator',
                         'manager', 'vendor', 'buyer', 'anon',
                         'moderator re-approves a paying vendor''s listing', 'moderator re-approves over the free cap',
                         'vendor resubmits its own listing', 'moderator approves a paying vendor''s catalogue',
                         'helper: vendor asks about itself', 'helper: buyer asks about a vendor', 'helper: anon'];
  total int[] := '{}'; own_pr int[] := '{}'; own_vendor int[] := '{}'; own_buyer int[] := '{}';
  i int; t int; n int; want int; bad int; uid uuid; is_reader boolean;
  line text; out text := ''; v_prod uuid; v_cat uuid; v_plan text;
begin
  for i in 1..array_length(labels, 1) loop
    begin
      -- Fixtures, as the table owner (the guard triggers skip anything but authenticated).
      insert into public.ad_orders (order_id, vendor_id, spec, amount, status, created_at, paid_at)
      values ('order_H15', vendor, '{"placementIds": ["openListing"], "days": 7, "items": []}', 15400, 'paid', now(), now());
      if i in (11, 13, 14) then
        update public.vendor_subscriptions
           set plan_id = 'gold', status = 'active', current_period_end = now() + interval '30 days'
         where vendor_id = vendor;
      end if;
      if i between 11 and 13 then
        select p.id into v_prod from public.products p where p.vendor_id = vendor and p.status = 'live' order by p.id limit 1;
        update public.products set status = 'rejected', rejection_reason = 'H15 fixture' where id = v_prod;
      end if;
      if i = 14 then
        insert into public.catalogues (vendor_id, title, status)
        values (vendor, 'H15 catalogue', 'rejected') returning id into v_cat;
      end if;

      if i <= 10 then
        -- Variables outlive a rolled-back case, so start each one empty.
        total := '{}'; own_pr := '{}'; own_vendor := '{}'; own_buyer := '{}';
        for t in 1..7 loop
          execute format('select count(*) from public.%I', tabs[t]) into n;
          total := total || n;
          execute format('select count(*) from public.%I where vendor_id = $1', tabs[t]) into n using pr;
          own_pr := own_pr || n;
          execute format('select count(*) from public.%I where vendor_id = $1', tabs[t]) into n using vendor;
          own_vendor := own_vendor || n;
          execute format('select count(*) from public.%I where vendor_id = $1', tabs[t]) into n using buyer;
          own_buyer := own_buyer || n;
        end loop;
      end if;

      -- The persona.
      if i <= 7 or i in (11, 12, 14) then
        insert into admin.admin_users (id, admin_role, is_active)
        values (pr, (case when i <= 7 then labels[i] else 'product_moderator' end)::public.admin_role_type, true)
        on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
      end if;
      uid := case when i in (8, 13, 15) then vendor when i in (9, 16) then buyer when i in (10, 17) then null else pr end;
      if uid is null then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', uid::text, true);
        set local role authenticated;
      end if;

      if i <= 10 then
        line := ''; bad := 0;
        for t in 1..7 loop
          begin
            execute format('select count(*) from public.%I', tabs[t]) into n;
          exception when insufficient_privilege then
            n := 0;
          end;
          is_reader := i <= 7 and labels[i] = any (string_to_array(readers[t], ','));
          want := case when is_reader then total[t]
                       when i <= 7 then own_pr[t]
                       when i = 8 then own_vendor[t]
                       when i = 9 then own_buyer[t]
                       else 0 end;
          if n = want then
            line := line || format(' %s %s', short[t], n);
          else
            bad := bad + 1;
            line := line || format(' %s %s (want %s)', short[t], n, want);
          end if;
        end loop;
        raise exception using errcode = 'P0099', message = (case when bad = 0 then 'ok' else 'MISMATCH' end) || line;
      elsif i = 13 then
        -- A vendor changes the status only; the moderator's note is the moderator's.
        update public.products set status = 'under_review' where id = v_prod;
        get diagnostics n = row_count;
        raise exception using errcode = 'P0099', message = format('updated %s row', n);
      elsif i between 11 and 12 then
        update public.products set status = 'live', rejection_reason = null where id = v_prod;
        get diagnostics n = row_count;
        raise exception using errcode = 'P0099', message = format('updated %s row', n);
      elsif i = 14 then
        update public.catalogues set status = 'live' where id = v_cat;
        get diagnostics n = row_count;
        raise exception using errcode = 'P0099', message = format('updated %s row', n);
      else
        v_plan := public.vendor_cap_plan(vendor);
        raise exception using errcode = 'P0099', message = format('plan %s', v_plan);
      end if;
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': -> ' || sqlstate || ' ' || left(sqlerrm, 110) || E'\n';
    end;
  end loop;
  raise exception 'H15 (rolled back)%', E'\n' || out;
end
$h15$;
