-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCT MODERATION HARNESS PM1: remove and flag a listing with managed reasons (2026-10-07).
-- documentation/product-moderation-design-2026-10-07.md.
-- Each case gets a fresh live listing P (and, where needed, a queued listing Q) owned by
-- the demo vendor, then acts as one persona. Every line prints PASS or FAIL with what it saw.
-- HOW TO RUN: psql -At -f this file (the DO block never commits: each case rolls itself
-- back, and the block ends by raising its report).
--   docker exec -i supabase_db_localstack psql -U postgres -At < scripts/product-moderation/pm1_remove_flag.sql
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.pm_claims(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end
$f$;

do $pm1$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  admn   uuid := '33333333-3333-3333-3333-333333333333';
  -- label | who acts | setup | want
  cases text[][] := array[
    array['super_admin removes',                 'super_admin',       '',        'rejected|removed|1|1'],
    array['product_moderator removes',           'product_moderator', '',        'rejected|removed|1|1'],
    array['manager removes',                     'manager',           '',        'rejected|removed|1|1'],
    array['vendor_ops refused',                  'vendor_ops',        '',        '42501'],
    array['ads_moderator refused',               'ads_moderator',     '',        '42501'],
    array['finance_admin refused',               'finance_admin',     '',        '42501'],
    array['support refused',                     'support',           '',        '42501'],
    array['the vendor refused',                  'vendor',            '',        '42501'],
    array['a buyer refused',                     'buyer',             '',        '42501'],
    array['flag-only reason refused for remove', 'manager',           '',        '22023'],
    array['switched-off reason refused',         'manager',           'off',     '22023'],
    array['unknown listing',                     'manager',           '',        'P0002'],
    array['removed twice: one ledger row',       'manager',           'removed', '55000|1'],
    array['vendor cannot edit a removed listing','vendor',            'removed', '42501'],
    array['vendor cannot resubmit it',           'vendor',            'removed', '42501'],
    array['vendor cannot un-remove it',          'vendor',            'removed', '42501'],
    array['vendor cannot insert a removed row',  'vendor',            '',        '42501'],
    array['vendor deletes it; ledger survives',  'vendor',            'removed', 'deleted 1|kept'],
    array['manager cannot write a removed row',  'manager',           'removed', '42501'],
    array['vendor reads message + details',      'vendor',            'removed', 'ok'],
    array['Admin Log row with the reason',       'manager',           '',        '1|Removed: Prohibited item (bad photos)'],
    array['removal notification',                'manager',           '',        'product_removed|Cosora removed your listing'],
    array['manager flags a live listing',        'manager',           '',        'under_review|flagged|1|product_flagged'],
    array['flag refused when not live',          'manager',           'queued',  '55000'],
    array['remove-only reason refused for flag', 'manager',           '',        '22023'],
    array['support cannot flag',                 'support',           '',        '42501'],
    array['flag survives draft and resubmit',    'vendor',            'flagged', 'under_review|kept'],
    array['vendor cannot clear the flag',        'vendor',            'flagged', '42501'],
    array['moderator approve clears the flag',   'product_moderator', 'flagged', 'live|cleared'],
    array['moderator reject clears the flag',    'product_moderator', 'flagged', 'rejected|cleared'],
    array['removing a flagged listing',          'product_moderator', 'flagged', 'rejected|cleared'],
    array['manager reinstates to draft',         'manager',           'removed', 'draft|1|clean'],
    array['moderator cannot reinstate',          'product_moderator', 'removed', '42501'],
    array['reinstate needs a note',              'manager',           'removed', '22023'],
    array['reinstate needs a removed listing',   'manager',           '',        '55000'],
    array['resubmit after reinstate obeys cap',  'vendor',            'reinstated_at_cap', 'P0001'],
    array['vendor cannot read the ledger',       'vendor',            '',        '42501'],
    array['vendor cannot read the reasons',      'vendor',            '',        '42501'],
    array['product flag note: support refused',  'support',           '',        '42501'],
    array['product flag note: manager allowed',  'manager',           '',        'ok'],
    array['manager approves a queued listing',   'manager',           'queued',  'live'],
    array['manager saves a reason (logged)',     'manager',           '',        'ok|1'],
    array['moderator cannot save a reason',      'product_moderator', '',        '42501'],
    array['duplicate reason name',               'manager',           '',        '23505'],
    array['moderator sees switched-off: refused','product_moderator', '',        '42501'],
    array['history names the actor',            'manager',           'removed', 'remove|Prohibited item|named'],
    array['reject_vendor_content as manager',    'manager',           '',        'rejected'],
    array['reject_vendor_content skips removed', 'manager',           'removed', 'P0002'],
    array['manager cannot hard-delete a listing','manager',           '',        'deleted 0'],
    array['vendor_ops cannot read the reasons',  'vendor_ops',        '',        '42501'],
    array['support reads the history',           'support',           'removed', '1'],
    array['manager cannot insert a listing',     'manager',           '',        '42501'],
    -- Added at the 2026-11-18 release, against today's triggers.
    array['plan limit pauses and resumes a flagged listing', 'manager', 'flagged', 'paused|kept|under_review|kept'],
    array['approval tells the vendor',           'product_moderator', '',        'live|product_approved'],
    array['rejection tells the vendor',          'product_moderator', '',        'rejected|product_rejected']];
  r_remove uuid; r_flag uuid; r_both uuid;
  p uuid; q uuid; who text; setup text; got text; i int; n int; m int; s text;
  actor uuid; out text := ''; passed int := 0;
begin
  select id into r_remove from admin.product_moderation_reasons where label = 'Prohibited item';
  select id into r_flag   from admin.product_moderation_reasons where label = 'Wrong category';
  select id into r_both   from admin.product_moderation_reasons where label = 'Duplicate listing';

  for i in 1..array_length(cases, 1) loop
    begin
      who := cases[i][2]; setup := cases[i][3];
      -- No plan cap gets in the way, except where a case sets one.
      update public.subscription_plans set limits = jsonb_set(limits, '{product_cap}', '-1') where id = 'free';
      p := gen_random_uuid(); q := gen_random_uuid();
      insert into public.products (id, vendor_id, name, status) values (p, vendor, 'PM1 live listing', 'live');
      insert into public.products (id, vendor_id, name, status) values (q, vendor, 'PM1 queued listing', 'under_review');
      if who not in ('vendor', 'buyer') then
        insert into admin.admin_users (id, admin_role, is_active) values (admn, who::public.admin_role_type, true)
          on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
      end if;

      -- Setup that needs an admin act first, as super_admin.
      if setup in ('removed', 'flagged', 'reinstated_at_cap') then
        update admin.admin_users set admin_role = 'super_admin' where id = admn;
        perform pg_temp.pm_claims(admn);
        set local role authenticated;
        if setup = 'flagged' then
          perform public.admin_product_flag(p, r_flag, null);
        else
          perform public.admin_product_remove(p, r_remove, 'bad photos');
        end if;
        if setup = 'reinstated_at_cap' then
          perform public.admin_product_reinstate(p, 'Removed by mistake');
        end if;
        reset role;
        if who not in ('vendor', 'buyer') then
          update admin.admin_users set admin_role = who::public.admin_role_type where id = admn;
        end if;
      end if;
      if setup = 'off' then
        update admin.product_moderation_reasons set active = false where id = r_both;
      end if;
      if setup = 'reinstated_at_cap' then
        -- The free plan's cap equals the slots the vendor already uses (Q among them).
        select count(*) into n from public.products
         where vendor_id = vendor and status::text in ('under_review', 'live') and id <> p;
        update public.subscription_plans set limits = jsonb_set(limits, '{product_cap}', to_jsonb(n)) where id = 'free';
      end if;

      actor := case who when 'vendor' then vendor when 'buyer' then buyer else admn end;
      perform pg_temp.pm_claims(actor);
      set local role authenticated;

      begin
        case i
          when 1, 2, 3, 4, 5, 6, 7, 8, 9 then
            perform public.admin_product_remove(p, r_remove, null);
            reset role;
            select pr.status || '|' || case when pr.removed_at is not null and pr.removed_reason = pr.rejection_reason
                                            then 'removed' else 'not removed' end
                   || '|' || (select count(*) from admin.product_moderation_actions a where a.product_id = p and a.action = 'remove')
                   || '|' || (select count(*) from public.notifications nn where nn.profile_id = vendor and nn.kind = 'product_removed'
                                and nn.body like '"PM1 live listing"%' and nn.created_at = now())
              into got from public.products pr where pr.id = p;
          when 10 then perform public.admin_product_remove(p, r_flag, null); got := 'accepted';
          when 11 then perform public.admin_product_remove(p, r_both, null); got := 'accepted';
          when 12 then perform public.admin_product_remove(gen_random_uuid(), r_remove, null); got := 'accepted';
          when 13 then
            begin
              perform public.admin_product_remove(p, r_remove, null); s := 'accepted';
            exception when others then s := sqlstate;
            end;
            reset role;
            select s || '|' || count(*) into got from admin.product_moderation_actions where product_id = p;
          when 14 then update public.products set name = 'edited' where id = p; got := 'accepted';
          when 15 then update public.products set status = 'under_review' where id = p; got := 'accepted';
          when 16 then update public.products set removed_at = null, removed_reason = null where id = p; got := 'accepted';
          when 17 then
            insert into public.products (vendor_id, name, status, removed_at, removed_reason)
            values (vendor, 'PM1 sneaky', 'draft', now(), 'self');
            got := 'accepted';
          when 18 then
            delete from public.products where id = p;
            get diagnostics n = row_count;
            reset role;
            select count(*) into m from admin.product_moderation_actions
             where product_id is null and product_name = 'PM1 live listing' and vendor_id = vendor and created_at = now();
            got := 'deleted ' || n || '|' || case when m = 1 then 'kept' else 'lost ' || m end;
          when 19 then update public.products set status = 'live', rejection_reason = null where id = p; got := 'accepted';
          when 20 then
            select case when removed_reason like 'This product isn''t allowed%' || E'\nDetails: bad photos'
                         and status = 'rejected' then 'ok' else coalesce(removed_reason, 'null') end
              into got from public.products where id = p;
          when 21 then
            perform public.admin_product_remove(p, r_remove, 'bad photos');
            reset role;
            select count(*) || '|' || max(reason) into got from admin.audit_log
             where target_table = 'public.products' and target_id = p::text and action = 'update';
          when 22 then
            perform public.admin_product_remove(p, r_remove, null);
            reset role;
            select max(kind) || '|' || max(title) into got from public.notifications
             where profile_id = vendor and kind = 'product_removed' and created_at = now();
          when 23 then
            perform public.admin_product_flag(p, r_flag, 'see the photos');
            reset role;
            select pr.status || '|' || case when pr.flagged_at is not null and pr.flag_reason like 'This listing is in a category%'
                                            then 'flagged' else 'not flagged' end
                   || '|' || (select count(*) from admin.admin_flags f where f.entity_type = 'product' and f.entity_id = p)
                   || '|' || (select max(kind) from public.notifications nn where nn.profile_id = vendor
                                and nn.kind = 'product_flagged' and nn.created_at = now())
              into got from public.products pr where pr.id = p;
          when 24 then perform public.admin_product_flag(q, r_flag, null); got := 'accepted';
          when 25 then perform public.admin_product_flag(p, r_remove, null); got := 'accepted';
          when 26 then perform public.admin_product_flag(p, r_flag, null); got := 'accepted';
          when 27 then
            update public.products set status = 'draft' where id = p;
            update public.products set status = 'under_review' where id = p;
            reset role;
            select status || '|' || case when flagged_at is not null then 'kept' else 'lost' end
              into got from public.products where id = p;
          when 28 then update public.products set flagged_at = null, flag_reason = null where id = p; got := 'accepted';
          when 29 then
            update public.products set status = 'live', rejection_reason = null where id = p;
            reset role;
            select status || '|' || case when flagged_at is null and flag_reason is null then 'cleared' else 'kept' end
              into got from public.products where id = p;
          when 30 then
            update public.products set status = 'rejected', rejection_reason = 'Fix the category' where id = p;
            reset role;
            select status || '|' || case when flagged_at is null then 'cleared' else 'kept' end
              into got from public.products where id = p;
          when 31 then
            perform public.admin_product_remove(p, r_remove, null);
            reset role;
            select status || '|' || case when flagged_at is null and removed_at is not null then 'cleared' else 'kept' end
              into got from public.products where id = p;
          when 32 then
            perform public.admin_product_reinstate(p, 'Removed by mistake');
            reset role;
            select pr.status || '|'
                   || (select count(*) from public.notifications nn where nn.profile_id = vendor
                         and nn.kind = 'product_reinstated' and nn.created_at = now())
                   || '|' || case when pr.removed_at is null and pr.removed_reason is null and pr.rejection_reason is null
                                  then 'clean' else 'dirty' end
              into got from public.products pr where pr.id = p;
          when 33 then perform public.admin_product_reinstate(p, 'Removed by mistake'); got := 'accepted';
          when 34 then perform public.admin_product_reinstate(p, '   '); got := 'accepted';
          when 35 then perform public.admin_product_reinstate(p, 'Nothing to undo'); got := 'accepted';
          when 36 then update public.products set status = 'under_review' where id = p; got := 'accepted';
          when 37 then select count(*)::text into got from admin.product_moderation_actions;
          when 38 then select count(*)::text into got from public.admin_product_reasons(false);
          when 39, 40 then perform public.admin_flag_add('product', p, 'Check the photos'); got := 'ok';
          when 41 then
            update public.products set status = 'live', rejection_reason = null where id = q;
            reset role;
            select status::text into got from public.products where id = q;
          when 42 then
            perform public.admin_product_reason_save(null, 'PM1 test reason', 'A message for the vendor.', array['flag', 'remove', 'flag']);
            reset role;
            select case when r.applies_to = array['flag', 'remove'] then 'ok' else 'bad applies' end || '|'
                   || (select count(*) from admin.audit_log l where l.target_table = 'admin.product_moderation_reasons'
                         and l.target_id = r.id::text and l.action = 'insert')
              into got from admin.product_moderation_reasons r where r.label = 'PM1 test reason';
          when 43 then
            perform public.admin_product_reason_save(null, 'PM1 test reason', 'A message.', array['flag']); got := 'accepted';
          when 44 then
            perform public.admin_product_reason_save(null, '  prohibited ITEM ', 'A message.', array['remove']); got := 'accepted';
          when 45 then perform public.admin_product_reasons(true); got := 'accepted';
          when 46 then
            select h.action || '|' || h.reason_label || '|' || case when coalesce(h.actor_name, '') <> '' then 'named' else 'unnamed' end
              into got from public.admin_product_moderation_history(p) h limit 1;
          when 47 then
            perform public.reject_vendor_content('products', p, 'Blurry photos');
            reset role;
            select status::text into got from public.products where id = p;
          when 48 then perform public.reject_vendor_content('products', p, 'Again'); got := 'accepted';
          when 49 then
            delete from public.products where id = p;
            get diagnostics n = row_count;
            got := 'deleted ' || n;
          when 50 then perform public.admin_product_reasons(false); got := 'accepted';
          when 51 then select count(*)::text into got from public.admin_product_moderation_history(p);
          when 52 then
            insert into public.products (vendor_id, name, status) values (vendor, 'PM1 by manager', 'draft');
            got := 'accepted';
          when 53 then
            -- The plan's limit pauses in-review listings too, and a flagged one is in review.
            reset role;
            update public.feature_flags set enabled = true where key = 'subscription_lifecycle';
            select e.plan_id into s from admin.vendor_effective_plan(vendor, now()) e;
            update public.subscription_plans set limits = jsonb_set(limits, '{product_cap}', '0') where id = coalesce(s, 'free');
            perform admin.apply_product_cap(vendor);
            select pr.status || '|' || case when pr.flagged_at is not null then 'kept' else 'lost' end
              into got from public.products pr where pr.id = p;
            update public.subscription_plans set limits = jsonb_set(limits, '{product_cap}', '-1') where id = coalesce(s, 'free');
            perform admin.apply_product_cap(vendor);
            select got || '|' || pr.status || '|' || case when pr.flagged_at is not null then 'kept' else 'lost' end
              into got from public.products pr where pr.id = p;
          when 54 then
            perform public.approve_vendor_content('products', q);
            reset role;
            select pr.status || '|' || coalesce((select max(nn.kind) from public.notifications nn where nn.profile_id = vendor
                                                   and nn.kind = 'product_approved' and nn.created_at = now()), 'none')
              into got from public.products pr where pr.id = q;
          when 55 then
            perform public.reject_vendor_content('products', q, 'Blurry photos');
            reset role;
            select pr.status || '|' || coalesce((select max(nn.kind) from public.notifications nn where nn.profile_id = vendor
                                                   and nn.kind = 'product_rejected' and nn.created_at = now()), 'none')
              into got from public.products pr where pr.id = q;
        end case;
      exception when others then
        got := sqlstate;
      end;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = cases[i][4] then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || cases[i][4] || ')';
    exception
      when sqlstate 'P0099' then
        out := out || lpad(i::text, 2) || ' ' || cases[i][1] || ': ' || sqlerrm || E'\n';
        if sqlerrm like 'PASS%' then passed := passed + 1; end if;
      when others then
        out := out || lpad(i::text, 2) || ' ' || cases[i][1] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'PM1 % of % passed (rolled back)%', passed, array_length(cases, 1), E'\n' || out;
end
$pm1$;
