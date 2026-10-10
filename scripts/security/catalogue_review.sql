-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY HARNESS: catalogue review (2026-10-10).
-- Migration 20261010133347_catalogue_review.sql (applied 2026-10-10; written as 20261010160000).
--   moderator   approves (the reason clears), rejects only with a reason, changes nothing else
--   seller      can't approve, can't write a reason, resubmits a rejected catalogue (recorded as an edit)
--   others      support and vendor_ops read the queue but can't decide; a buyer sees live catalogues only
-- Every write is made as the browser would make it (role authenticated, the account's token), the way
-- Cosora-Admin › Catalogues writes it: one status update. Never commits: each case's report rolls it back.
-- ─────────────────────────────────────────────────────────────────────────────
do $cr$
declare
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  buyer   uuid;
  modr    uuid;
  ops     uuid;
  supp    uuid;
  c_new   uuid := 'a5f00000-0000-4000-8000-0000000000d1';   -- under review
  c_rej   uuid := 'a5f00000-0000-4000-8000-0000000000d2';   -- rejected, with a reason
  c_live  uuid := 'a5f00000-0000-4000-8000-0000000000d3';   -- live
  n int; x uuid;
  labels text[] := array[
    'a moderator approves: live, no reason',                                -- 1
    'a moderator rejects: refused without a reason, kept with one',         -- 2
    'a moderator changes the status and reason only',                       -- 3
    'the seller can''t approve or write a reason; a new one carries none',  -- 4
    'the seller resubmits a rejected catalogue: in review, recorded',       -- 5
    'approving the resubmission clears the reason and closes the record',   -- 6
    'support and vendor ops see the queue but can''t decide',               -- 7
    'a buyer sees live catalogues only',                                    -- 8
    'file and cover addresses are web addresses only'];                     -- 9
  got text; want text; i int;
  out text := '';
begin
  select b.id into buyer from public.buyer_profiles b
   where public.account_is_active(b.id) and b.id <> vendor
     and not exists (select 1 from public.vendor_profiles v where v.id = b.id)
     and not exists (select 1 from admin.admin_users a where a.id = b.id)
   order by b.created_at limit 1;
  select p.id into modr from public.profiles p
   where p.id not in (vendor, buyer) and public.account_is_active(p.id)
     and not exists (select 1 from admin.admin_users a where a.id = p.id)
     and not exists (select 1 from public.vendor_profiles v where v.id = p.id)
   order by p.created_at limit 1;
  select p.id into ops from public.profiles p
   where p.id not in (vendor, buyer, modr) and public.account_is_active(p.id)
     and not exists (select 1 from admin.admin_users a where a.id = p.id)
     and not exists (select 1 from public.vendor_profiles v where v.id = p.id)
   order by p.created_at limit 1;
  select p.id into supp from public.profiles p
   where p.id not in (vendor, buyer, modr, ops) and public.account_is_active(p.id)
     and not exists (select 1 from admin.admin_users a where a.id = p.id)
     and not exists (select 1 from public.vendor_profiles v where v.id = p.id)
   order by p.created_at limit 1;
  if buyer is null or modr is null or ops is null or supp is null then raise exception 'the harness needs a buyer and three spare profiles'; end if;
  insert into admin.admin_users (id, admin_role, is_active) values (modr, 'product_moderator', true), (ops, 'vendor_ops', true), (supp, 'support', true);
  update public.profiles set account_status = 'active' where id = vendor;
  -- Catalogue uploads are a paid feature (enforce_catalogue_plan): the seller is on Basic.
  delete from public.subscription_mandates where vendor_id = vendor;
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  values (vendor, 'basic', 'monthly', 'active', now() - interval '1 day', now() + interval '29 days')
  on conflict (vendor_id) do update set plan_id = 'basic', billing_cycle = 'monthly', status = 'active',
    current_period_start = now() - interval '1 day', current_period_end = now() + interval '29 days',
    scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null, auto_renew = false;
  set local session_replication_role = replica;
  insert into public.catalogues (id, vendor_id, title, status, rejection_reason, file_url) values
    (c_new,  vendor, 'CR new',      'under_review', null,                     'https://example.com/new.pdf'),
    (c_rej,  vendor, 'CR rejected', 'rejected',     'The PDF has no prices',  'https://example.com/rej.pdf'),
    (c_live, vendor, 'CR live',     'live',         null,                     'https://example.com/live.pdf');
  set local session_replication_role = origin;

  for i in 1..array_length(labels, 1) loop
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
      set local role authenticated;
      if i = 1 then
        update public.catalogues set status = 'live', rejection_reason = null where id = c_new;
        reset role;
        got := (select status::text || ' ' || coalesce(rejection_reason, 'no reason') from public.catalogues where id = c_new);
        want := 'live no reason';
      elsif i = 2 then
        begin
          update public.catalogues set status = 'rejected' where id = c_new;
          got := 'without a reason: kept';
        exception when sqlstate '22023' then got := 'without a reason: refused';
        end;
        update public.catalogues set status = 'rejected', rejection_reason = 'Prices are missing' where id = c_new;
        reset role;
        got := got || ', ' || (select status::text || ' ' || rejection_reason from public.catalogues where id = c_new);
        want := 'without a reason: refused, rejected Prices are missing';
      elsif i = 3 then
        begin
          update public.catalogues set title = 'CR new, renamed by staff' where id = c_new;
          got := 'title changed';
        exception when insufficient_privilege then got := 'title refused';
        end;
        reset role;
        want := 'title refused';
      elsif i = 4 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        n := 0;
        begin update public.catalogues set status = 'live' where id = c_new; exception when insufficient_privilege then n := n + 1; end;
        begin update public.catalogues set rejection_reason = 'all fine' where id = c_rej; exception when insufficient_privilege then n := n + 1; end;
        insert into public.catalogues (vendor_id, title, status, rejection_reason) values (vendor, 'CR fresh', 'live', 'pre-written') returning id into x;
        reset role;
        got := n || ' refused, new ' || (select status::text || ' ' || coalesce(rejection_reason, 'no reason') from public.catalogues where id = x);
        want := '2 refused, new under_review no reason';
      elsif i = 5 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.catalogues set title = 'CR rejected, with prices', status = 'under_review' where id = c_rej;
        reset role;
        got := (select status::text || ' ' || rejection_reason from public.catalogues where id = c_rej) || ', record '
               || coalesce((select was_status || ' ' || (changes -> 'title' ->> 'to') from admin.listing_edits where entity = 'catalogue' and entity_id = c_rej and resolved_at is null), 'none');
        want := 'under_review The PDF has no prices, record rejected CR rejected, with prices';
      elsif i = 6 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.catalogues set title = 'CR rejected, with prices', status = 'under_review' where id = c_rej;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.catalogues set status = 'live' where id = c_rej;
        reset role;
        got := (select status::text || ' ' || coalesce(rejection_reason, 'no reason') from public.catalogues where id = c_rej) || ', record '
               || coalesce((select outcome || ' by staff ' || (resolved_by = modr) from admin.listing_edits where entity = 'catalogue' and entity_id = c_rej), 'none');
        want := 'live no reason, record live by staff true';
      elsif i = 7 then
        reset role;
        got := '';
        foreach x in array array[supp, ops] loop
          perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
          set local role authenticated;
          got := got || (select count(*) from public.catalogues where id in (c_new, c_rej, c_live)) || ' seen, ';
          begin
            update public.catalogues set status = 'live' where id = c_new;
            get diagnostics n = row_count;
            got := got || n || ' approved; ';
          exception when insufficient_privilege then got := got || 'refused; ';
          end;
          reset role;
        end loop;
        got := got || (select status::text from public.catalogues where id = c_new);
        want := '3 seen, 0 approved; 3 seen, 0 approved; under_review';
      elsif i = 8 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := (select string_agg(title, ',' order by title) from public.catalogues where id in (c_new, c_rej, c_live));
        reset role;
        want := 'CR live';
      elsif i = 9 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := '';
        begin update public.catalogues set file_url = 'javascript:alert(document.cookie)' where id = c_new; got := got || 'script link kept';
        exception when check_violation then got := got || 'script link refused'; end;
        begin update public.catalogues set cover_url = 'data:image/svg+xml,<svg/onload=alert(1)>' where id = c_new; got := got || ', data cover kept';
        exception when check_violation then got := got || ', data cover refused'; end;
        update public.catalogues set file_url = 'https://example.com/new-2.pdf' where id = c_new;
        reset role;
        got := got || ', https ' || (select file_url from public.catalogues where id = c_new);
        want := 'script link refused, data cover refused, https https://example.com/new-2.pdf';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'CATALOGUE REVIEW (rolled back)%', E'\n' || out;
end
$cr$;
