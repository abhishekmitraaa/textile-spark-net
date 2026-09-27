-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 07: the vendor's private fields and who reaches them
-- (Phase 4a, 2026-09-28). Each case runs in its own rolled-back subtransaction.
--
--   my_vendor_private()           vendor -> own row; buyer -> no row; anon -> 42501
--   call_vendor_contact(vendor)   anon -> 42501; buyer -> the number, one ledger row;
--                                 again -> served, ledger unchanged; the vendor itself ->
--                                 served, no ledger row; not a vendor -> not_a_vendor;
--                                 caller suspended, vendor suspended, chat under review ->
--                                 their reason codes; 30 others this hour -> rate_limited;
--                                 100 others today -> rate_limited; an already-revealed
--                                 vendor at the limit -> served; rows older than a day ->
--                                 pruned by the next call
--   admin_vendor_private(ids)     super_admin, vendor_ops, support, finance_admin -> rows;
--                                 product_moderator, ads_moderator, manager, a buyer -> 42501;
--                                 201 ids -> 22023
--   has_phone / has_whatsapp      readable signed out
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h07$
declare
  buyer  uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  labels text[] := array[
    'my_vendor_private: vendor', 'my_vendor_private: buyer', 'my_vendor_private: anon',
    'call_vendor_contact: anon', 'call_vendor_contact: buyer', 'call_vendor_contact: again',
    'call_vendor_contact: vendor itself', 'call_vendor_contact: not a vendor',
    'call_vendor_contact: caller suspended', 'call_vendor_contact: vendor suspended',
    'call_vendor_contact: chat under review', 'call_vendor_contact: 30 this hour',
    'call_vendor_contact: 100 today', 'call_vendor_contact: revealed vendor at the limit',
    'call_vendor_contact: prune', 'admin_vendor_private: super_admin', 'admin_vendor_private: vendor_ops',
    'admin_vendor_private: support', 'admin_vendor_private: finance_admin',
    'admin_vendor_private: product_moderator', 'admin_vendor_private: ads_moderator',
    'admin_vendor_private: manager', 'admin_vendor_private: buyer', 'admin_vendor_private: 201 ids',
    'has_phone: anon'];
  roles text[] := array['super_admin', 'vendor_ops', 'support', 'finance_admin', 'product_moderator', 'ads_moderator', 'manager'];
  i int; n int; n2 int; t text; ts1 timestamptz; ts2 timestamptz; out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      -- Start every case from an empty ledger for these two accounts.
      delete from admin.vendor_contact_reveals where caller_id in (buyer, vendor);
      -- Who is calling. Cases 16-22 promote the persona to one admin role each, 24 to super_admin.
      if i between 16 and 22 or i = 24 then
        insert into admin.admin_users (id, admin_role, is_active)
        values (pr, (case when i = 24 then 'super_admin' else roles[i - 15] end)::public.admin_role_type, true)
        on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
      end if;

      if i = 9 then
        update public.profiles set account_status = 'suspended' where id = buyer;
      elsif i = 10 then
        update public.profiles set account_status = 'suspended' where id = vendor;
      elsif i = 11 then
        insert into public.conversations (user_a, user_b, status)
        values (least(buyer, vendor), greatest(buyer, vendor), 'under_review')
        on conflict do nothing;
        update public.conversations set status = 'under_review'
         where user_a = least(buyer, vendor) and user_b = greatest(buyer, vendor);
      elsif i = 12 then
        insert into admin.vendor_contact_reveals (caller_id, vendor_id, revealed_at)
        select buyer, gen_random_uuid(), now() - (g || ' minutes')::interval from generate_series(1, 30) g;
      elsif i = 13 then
        insert into admin.vendor_contact_reveals (caller_id, vendor_id, revealed_at)
        select buyer, gen_random_uuid(), now() - interval '2 hours' - (g || ' minutes')::interval from generate_series(1, 100) g;
      elsif i = 14 then
        insert into admin.vendor_contact_reveals (caller_id, vendor_id, revealed_at)
        select buyer, gen_random_uuid(), now() - (g || ' minutes')::interval from generate_series(1, 29) g;
        insert into admin.vendor_contact_reveals (caller_id, vendor_id, revealed_at) values (buyer, vendor, now() - interval '3 hours');
      elsif i = 15 then
        insert into admin.vendor_contact_reveals (caller_id, vendor_id, revealed_at)
        select buyer, gen_random_uuid(), now() - interval '1 day' - (g || ' minutes')::interval from generate_series(1, 5) g;
      end if;

      if i in (3, 4, 25) then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object(
          'sub', case when i in (1, 7) then vendor when i between 16 and 22 or i = 24 then pr else buyer end,
          'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub',
          (case when i in (1, 7) then vendor when i between 16 and 22 or i = 24 then pr else buyer end)::text, true);
        set local role authenticated;
      end if;

      if i in (1, 2, 3) then
        select count(*), count(*) filter (where x.phone is not null) into n, n2 from public.my_vendor_private() x;
        raise exception using errcode = 'P0099', message = format('rows %s, with a phone %s', n, n2);
      elsif i in (4, 5, 9, 10, 11, 12, 13, 14) then
        select count(*), count(*) filter (where x.phone is not null) into n, n2 from public.call_vendor_contact(vendor) x;
        reset role;
        select count(*) into n from admin.vendor_contact_reveals r where r.caller_id = buyer and r.vendor_id = vendor;
        select max(r.revealed_at) into ts1 from admin.vendor_contact_reveals r where r.caller_id = buyer and r.vendor_id = vendor;
        raise exception using errcode = 'P0099', message = format('served (phone %s); ledger rows for this vendor %s, revealed %s ago',
          n2, n, coalesce(date_trunc('minute', now() - ts1)::text, '-'));
      elsif i = 6 then
        perform public.call_vendor_contact(vendor);
        reset role;
        update admin.vendor_contact_reveals set revealed_at = revealed_at - interval '2 hours'
         where caller_id = buyer and vendor_id = vendor;
        select r.revealed_at into ts1 from admin.vendor_contact_reveals r where r.caller_id = buyer and r.vendor_id = vendor;
        set local role authenticated;
        perform public.call_vendor_contact(vendor);
        reset role;
        select r.revealed_at, count(*) over () into ts2, n from admin.vendor_contact_reveals r where r.caller_id = buyer;
        raise exception using errcode = 'P0099', message = format('ledger rows %s, revealed_at moved: %s', n, ts2 is distinct from ts1);
      elsif i = 7 then
        select count(*) into n from public.call_vendor_contact(vendor);
        reset role;
        select count(*) into n2 from admin.vendor_contact_reveals r where r.caller_id = vendor;
        raise exception using errcode = 'P0099', message = format('served %s row, own ledger rows %s', n, n2);
      elsif i = 8 then
        perform public.call_vendor_contact(buyer);
      elsif i = 15 then
        perform public.call_vendor_contact(vendor);
        reset role;
        select count(*) filter (where r.revealed_at <= now() - interval '1 day'), count(*) into n, n2
          from admin.vendor_contact_reveals r where r.caller_id = buyer;
        raise exception using errcode = 'P0099', message = format('rows older than a day %s, rows kept %s', n, n2);
      elsif i between 16 and 23 then
        select count(*), count(*) filter (where x.phone is not null) into n, n2 from public.admin_vendor_private(array[vendor, buyer]) x;
        raise exception using errcode = 'P0099', message = format('rows %s, with a phone %s', n, n2);
      elsif i = 24 then
        perform public.admin_vendor_private(array(select gen_random_uuid() from generate_series(1, 201)));
      elsif i = 25 then
        select count(*) filter (where v.has_phone), count(*) filter (where v.has_whatsapp) into n, n2 from public.vendor_profiles v;
        raise exception using errcode = 'P0099', message = format('vendors with a phone %s, with WhatsApp %s', n, n2);
      end if;
      raise exception using errcode = 'P0099', message = 'no error';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ok ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': -> ' || sqlstate || ' ' || left(sqlerrm, 90) || E'\n';
    end;
  end loop;
  raise exception 'H07 (rolled back)%', E'\n' || out;
end
$h07$;
