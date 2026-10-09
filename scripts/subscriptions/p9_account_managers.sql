-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P9: account managers and priority support (2026-10-09).
-- Migrations 20261009130000 (the role) and 20261009130100 (on top of P0-P8).
--   levels     Silver shared, Gold named, VIP vip; none without the switch or a plan
--   role       account_manager is a team role (a manager may give it)
--   vendor     who looks after them; messages, read marks, a callback, VIP notes; limits
--   staff      who serves whom (named, shared team, managers, others refused); replies are
--              signed by the named manager's first name or the team; the bell says who
--   assign     managers and super admins only; history and the Admin Log kept
--   concierge  VIP only: recent requirements in the vendor's categories; notes; the
--              month's success review once
--   priority   VIP then Gold first among requests waiting on staff; their targets; the count
-- HOW TO RUN (local stack with P0-P9 applied, or: begin; <P9 main>; <this>; rollback;). Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p9$
declare
  gold    uuid := '22222222-2222-2222-2222-222222222222';
  free    uuid := '02d5183b-f984-4ca9-a7cb-684564e37789';
  super   uuid := '33333333-3333-3333-3333-333333333333';
  basic   uuid;
  silver  uuid;
  vip     uuid;
  buyer   uuid;
  am1     uuid;   -- Asha, an account manager
  am2     uuid;   -- Ravi, another
  mgr     uuid;   -- a manager
  sup     uuid;   -- support
  c1      uuid;
  everyone uuid[];
  rfq     uuid := 'a9000000-0000-4000-8000-000000000001';
  t1      uuid := 'a9000000-0000-4000-8000-0000000000c1';
  t2      uuid := 'a9000000-0000-4000-8000-0000000000c2';
  t3      uuid := 'a9000000-0000-4000-8000-0000000000c3';
  t4      uuid := 'a9000000-0000-4000-8000-0000000000c4';
  x       uuid;
  labels text[] := array[
    'each plan''s level, on the switch; the grace days count',               -- 1
    'account_manager is a team role; a manager can give it',                 -- 2
    'what the vendor page says before and after a manager is named',         -- 3
    'Free can''t use it; a browser can''t write the tables',                 -- 4
    'messages: the vendor writes, the team replies, the bell, read marks',   -- 5
    'a named manager signs with their first name',                           -- 6
    'who serves whom: named, shared team, others refused',                   -- 7
    'the vendor''s messages are limited per hour',                            -- 8
    'a callback: one at a time, a day within 30, cancel, done, missed',      -- 9
    'assignments: managers only, history kept, in the Admin Log',            -- 10
    'the staff list: mine, shared, unassigned, all',                         -- 11
    'concierge: VIP only, recent requirements in their categories',          -- 12
    'notes: a picked requirement, the month''s review once',                 -- 13
    'a requirement the vendor can''t quote on can''t be picked',             -- 14
    'priority support: VIP then Gold first among those waiting',             -- 15
    'priority support: tiers, targets and the count',                        -- 16
    'priority support follows the switch',                                   -- 17
    'a vendor reads only their own thread',                                  -- 18
    'a deactivated named manager hands the vendor back to the team',         -- 19
    'the support role can''t open the workspace'];                           -- 20
  got text; want text; i int; n int; j jsonb;
  out text := '';
begin
  -- Fixtures (rolled back with everything else).
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (free, 'P9 free vendor', true)
    on conflict (id) do update set onboarding_complete = true;
  select array_agg(y.id order by y.id) into everyone
    from (select v.id from public.vendor_profiles v join public.profiles p on p.id = v.id
           where v.id not in (gold, free) order by v.id limit 3) y;
  basic := everyone[1]; silver := everyone[2]; vip := everyone[3];
  select b.id into buyer from public.buyer_profiles b where b.id not in (gold, free, basic, silver, vip) order by b.created_at limit 1;
  select array_agg(y.id order by y.id) into everyone
    from (select p.id from public.profiles p
           where p.id not in (gold, free, basic, silver, vip, buyer, super)
             and not exists (select 1 from admin.admin_users a where a.id = p.id)
             and not exists (select 1 from public.vendor_profiles v where v.id = p.id)
           order by p.id limit 4) y;
  am1 := everyone[1]; am2 := everyone[2]; mgr := everyone[3]; sup := everyone[4];
  select c.id into c1 from public.categories c where c.name = 'Activewear' limit 1;
  if vip is null or buyer is null or sup is null or c1 is null then
    raise exception 'the harness needs three more local vendors, a buyer, four more profiles and the Activewear category';
  end if;
  insert into admin.admin_users (id, admin_role, is_active) values (am1, 'account_manager', true), (am2, 'account_manager', true),
    (mgr, 'manager', true), (sup, 'support', true)
    on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
  update public.profiles set full_name = 'Asha Mehta', avatar_url = 'https://example.com/asha.jpg' where id = am1;
  update public.profiles set full_name = 'Ravi Shah' where id = am2;
  everyone := array[gold, free, basic, silver, vip];

  update public.feature_flags set enabled = false, allow_profile_ids = everyone where key in ('account_managers', 'subscription_lifecycle');
  update public.feature_flags set enabled = false, allow_profile_ids = '{}' where key in ('overseas_leads', 'lead_alerts', 'crm');
  update admin.billing_settings set grace_days = 7;
  update public.profiles set account_status = 'active' where id = any (everyone || buyer);
  update public.vendor_profiles set brand_name = 'P9 Silver Mills' where id = silver;
  update public.vendor_profiles set brand_name = 'P9 Gold Mills' where id = gold;
  delete from public.vendor_account_managers where vendor_id = any (everyone);
  delete from public.account_manager_messages where vendor_id = any (everyone);
  delete from public.account_manager_threads where vendor_id = any (everyone);
  delete from public.account_manager_callbacks where vendor_id = any (everyone);
  delete from public.account_manager_notes where vendor_id = any (everyone);
  delete from public.notifications where profile_id = any (everyone);
  delete from public.subscription_mandates where vendor_id = any (everyone);
  update public.products set status = 'draft' where (vendor_id = any (everyone) or category_id = c1) and status <> 'draft';
  insert into public.products (vendor_id, name, status, category_id) select v, 'P9 listing', 'live', c1 from unnest(everyone) v;
  delete from public.vendor_subscriptions where vendor_id = free;
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  select y.v, y.p, 'monthly', 'active', now() - interval '5 days', now() + interval '25 days'
    from (values (gold, 'gold'), (basic, 'basic'), (silver, 'silver'), (vip, 'vip')) as y(v, p)
  on conflict (vendor_id) do update set plan_id = excluded.plan_id, billing_cycle = 'monthly', status = 'active',
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null, auto_renew = false;

  for i in 1..array_length(labels, 1) loop
    begin
      perform set_config('request.jwt.claims', '', true);
      if i = 1 then
        got := admin.vendor_am_level(free) || '/' || admin.vendor_am_level(basic) || '/' || admin.vendor_am_level(silver)
               || '/' || admin.vendor_am_level(gold) || '/' || admin.vendor_am_level(vip);
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.vendor_entitlements() -> 'features';
        reset role;
        got := got || ' silver=' || (j ->> 'am_level') || '/' || (j ->> 'am_page') || '/' || (j ->> 'account_manager');
        update public.feature_flags set allow_profile_ids = array_remove(allow_profile_ids, gold) where key = 'account_managers';
        got := got || ' off=' || admin.vendor_am_level(gold);
        update public.feature_flags set allow_profile_ids = allow_profile_ids || gold where key = 'account_managers';
        update public.vendor_subscriptions set current_period_start = now() - interval '33 days', current_period_end = now() - interval '2 days' where vendor_id = gold;
        got := got || ' grace=' || admin.vendor_am_level(gold);
        want := 'none/none/shared/named/vip silver=shared/true/true off=none grace=named';
      elsif i = 2 then
        got := admin.is_team_role('account_manager')::text || '/' || admin.is_team_role('manager')::text;
        perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.admin_grant(buyer, 'account_manager');
        reset role;
        got := got || ' granted=' || coalesce((select a.admin_role::text from admin.admin_users a where a.id = buyer and a.is_active), 'none');
        want := 'true/false granted=account_manager';
      elsif i = 3 then
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_account_manager();
        got := (j ->> 'level') || ' manager=' || coalesce(j ->> 'manager', 'team');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.admin_am_assign(gold, am1);
        perform public.admin_am_assign(silver, am1);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_account_manager();
        got := got || ' then=' || (j -> 'manager' ->> 'name') || '/' || (j -> 'manager' ->> 'photo') || ' concierge=' || (j ->> 'concierge');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_account_manager();
        got := got || ' silver=' || (j ->> 'level') || '/' || coalesce(j ->> 'manager', 'team');
        reset role;
        want := 'named manager=team then=Asha/https://example.com/asha.jpg concierge=false silver=shared/team';
      elsif i = 4 then
        perform set_config('request.jwt.claims', json_build_object('sub', free, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := (public.my_account_manager() ->> 'available');
        begin perform public.am_send('hello'); got := got || ' sent';
        exception when insufficient_privilege then got := got || ' free: ' || sqlerrm; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin insert into public.account_manager_messages (vendor_id, author_kind, author_label, body) values (silver, 'staff', 'Fake', 'x'); got := got || ' inserted';
        exception when insufficient_privilege then got := got || ' insert refused'; end;
        begin perform count(*) from public.vendor_account_managers; got := got || ' assignments read';
        exception when insufficient_privilege then got := got || ' assignments refused'; end;
        reset role;
        want := 'false free: An account manager comes with the Silver, Gold and VIP plans. insert refused assignments refused';
      elsif i = 5 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.am_send('  Can you help with my catalogue?  ');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', am2, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.admin_am_vendors('shared');
        got := 'unread=' || (select e ->> 'unread' from jsonb_array_elements(j) e where (e ->> 'vendor_id')::uuid = silver);
        perform public.admin_am_send(silver, 'Of course. Send me the file.');
        j := public.admin_am_vendors('shared');
        got := got || '/' || (select e ->> 'unread' from jsonb_array_elements(j) e where (e ->> 'vendor_id')::uuid = silver);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' thread=' || (select string_agg(m.author_kind || ':' || m.author_label || ':' || m.body, ' | ' order by m.created_at)
                                       from public.account_manager_messages m where m.vendor_id = silver)
               || ' vendor unread=' || (public.my_account_manager() ->> 'unread');
        perform public.am_mark_read();
        got := got || '/' || (public.my_account_manager() ->> 'unread');
        reset role;
        got := got || ' bell=' || (select string_agg(title, '|') from public.notifications where profile_id = silver and kind = 'account_manager_message');
        want := 'unread=1/0 thread=vendor:P9 Silver Mills:Can you help with my catalogue? | staff:Cosora account team:Of course. Send me the file. vendor unread=1/0 bell=A message from your Cosora account team';
      elsif i = 6 then
        insert into public.vendor_account_managers (vendor_id, manager_id) values (gold, am1);
        perform set_config('request.jwt.claims', json_build_object('sub', am1, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.admin_am_send(gold, 'Hello from Asha.');
        got := (public.admin_am_vendor(gold) ->> 'you_sign_as');
        reset role;
        got := got || ' ' || (select author_label from public.account_manager_messages where vendor_id = gold)
               || ' bell=' || (select title from public.notifications where profile_id = gold and kind = 'account_manager_message');
        -- A manager writing to the same vendor signs as the team.
        perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.admin_am_send(gold, 'From the manager.');
        reset role;
        got := got || ' mgr=' || (select author_label from public.account_manager_messages where vendor_id = gold and author_id = mgr);
        want := 'Asha Asha bell=A message from Asha, your account manager mgr=Cosora account team';
      elsif i = 7 then
        insert into public.vendor_account_managers (vendor_id, manager_id) values (gold, am1);
        got := '';
        foreach x in array array[am1, am2, mgr, super] loop
          perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
          set local role authenticated;
          begin perform public.admin_am_vendor(gold); got := got || 'y';
          exception when insufficient_privilege then got := got || 'n'; end;
          begin perform public.admin_am_vendor(silver); got := got || 'y';
          exception when insufficient_privilege then got := got || 'n'; end;
          begin perform public.admin_am_vendor(basic); got := got || 'y ';
          exception when insufficient_privilege then got := got || 'n '; end;
          reset role;
        end loop;
        want := 'yyn nyn yyy yyy ';   -- am1: named gold + shared silver; am2: shared silver only; Basic has no level (managers still see it)
      elsif i = 8 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        for n in 1..30 loop perform public.am_send('message ' || n); end loop;
        begin perform public.am_send('one more'); got := 'sent';
        exception when sqlstate 'P0001' then got := 'refused'; end;
        begin perform public.am_send(repeat('x', 4001)); got := got || ' long sent';
        exception when sqlstate '22023' then got := got || ' long refused'; end;
        reset role;
        got := got || ' count=' || (select count(*) from public.account_manager_messages where vendor_id = silver);
        want := 'refused long refused count=30';
      elsif i = 9 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        x := public.am_request_callback((now() at time zone 'Asia/Kolkata')::date + 2, 'morning', 'About the plan');
        begin perform public.am_request_callback((now() at time zone 'Asia/Kolkata')::date + 3, 'evening'); got := 'second booked';
        exception when sqlstate 'P0001' then got := 'second refused'; end;
        perform public.am_cancel_callback(x);
        begin perform public.am_request_callback((now() at time zone 'Asia/Kolkata')::date + 40, 'evening'); got := got || ' far booked';
        exception when sqlstate '22023' then got := got || ' far refused'; end;
        begin perform public.am_request_callback((now() at time zone 'Asia/Kolkata')::date + 1, 'night'); got := got || ' night booked';
        exception when sqlstate '22023' then got := got || ' night refused'; end;
        x := public.am_request_callback((now() at time zone 'Asia/Kolkata')::date + 1, 'afternoon');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', am2, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' listed=' || (select e -> 'callback' ->> 'window' from jsonb_array_elements(public.admin_am_vendors('shared')) e where (e ->> 'vendor_id')::uuid = silver);
        perform public.admin_am_callback_set(x, 'missed');
        begin perform public.admin_am_callback_set(x, 'done'); got := got || ' closed twice';
        exception when sqlstate 'P0001' then got := got || ' closed once'; end;
        reset role;
        got := got || ' ' || (select string_agg(status, ',' order by status) from public.account_manager_callbacks where vendor_id = silver)
               || ' bell=' || (select title from public.notifications where profile_id = silver and kind = 'account_manager_message');
        want := 'second refused far refused night refused listed=afternoon closed once cancelled,missed bell=Your account team couldn''t reach you';
      elsif i = 10 then
        perform set_config('request.jwt.claims', json_build_object('sub', am1, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.admin_am_assign(vip, am1); got := 'am assigned';
        exception when insufficient_privilege then got := 'am refused'; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.admin_am_assign(vip, sup); got := got || ' support named';
        exception when sqlstate '22023' then got := got || ' support refused'; end;
        perform public.admin_am_assign(vip, am1);
        perform public.admin_am_assign(vip, am2);
        perform public.admin_am_assign(vip, am2);   -- no change
        got := got || ' history=' || jsonb_array_length(public.admin_am_vendor(vip) -> 'history');
        perform public.admin_am_assign(vip, null);
        reset role;
        got := got || ' current=' || (select count(*) from public.vendor_account_managers where vendor_id = vip and ended_at is null)
               || ' log=' || (select count(*) from admin.audit_log where target_table = 'public.vendor_account_managers' and actor_id = mgr and at >= now());
        want := 'am refused support refused history=2 current=0 log=4';
      elsif i = 11 then
        insert into public.vendor_account_managers (vendor_id, manager_id) values (gold, am1);
        perform set_config('request.jwt.claims', json_build_object('sub', am1, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := 'mine=' || (select string_agg(e ->> 'level', ',' order by e ->> 'level') from jsonb_array_elements(public.admin_am_vendors('mine')) e)
               || ' shared=' || (select string_agg(e ->> 'level', ',' order by e ->> 'level') from jsonb_array_elements(public.admin_am_vendors('shared')) e
                                 where (e ->> 'vendor_id')::uuid = any (everyone))
               || ' unassigned=' || (select string_agg(e ->> 'level', ',' order by e ->> 'level') from jsonb_array_elements(public.admin_am_vendors('unassigned')) e
                                     where (e ->> 'vendor_id')::uuid = any (everyone));
        begin perform public.admin_am_vendors('all'); got := got || ' all read';
        exception when insufficient_privilege then got := got || ' all refused'; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' mgr all=' || (select count(*) from jsonb_array_elements(public.admin_am_vendors('all')) e where (e ->> 'vendor_id')::uuid = any (everyone));
        reset role;
        want := 'mine=named shared=shared,vip unassigned=vip all refused mgr all=3';
      elsif i = 12 then
        insert into public.rfqs (id, buyer_id, title, category_id, quantity) values (rfq, buyer, 'P9 fresh joggers', c1, 700);
        insert into public.rfqs (buyer_id, title, category_id, created_at) values (buyer, 'P9 too old', c1, now() - interval '4 days');
        perform set_config('request.jwt.claims', json_build_object('sub', am1, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.admin_am_concierge(vip);
        got := (select string_agg(e ->> 'title', ',') from jsonb_array_elements(j) e where e ->> 'title' like 'P9 %')
               || ' quoted=' || (select e ->> 'quoted' from jsonb_array_elements(j) e where (e ->> 'rfq_id')::uuid = rfq);
        begin perform public.admin_am_concierge(gold); got := got || ' gold read';
        exception when insufficient_privilege then got := got || ' gold refused'; end;
        reset role;
        want := 'P9 fresh joggers quoted=false gold refused';
      elsif i = 13 then
        insert into public.rfqs (id, buyer_id, title, category_id, quantity) values (rfq, buyer, 'P9 picked', c1, 700);
        insert into public.vendor_account_managers (vendor_id, manager_id) values (vip, am1);
        perform set_config('request.jwt.claims', json_build_object('sub', am1, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.admin_am_note(vip, 'concierge', 'This buyer orders every quarter. Quote by Friday.', rfq);
        perform public.admin_am_note(vip, 'success_review', 'September: 4 quotes, 1 won. Next: faster replies.');
        begin perform public.admin_am_note(vip, 'success_review', 'Again'); got := 'second review written';
        exception when sqlstate 'P0001' then got := 'second review refused'; end;
        begin perform public.admin_am_note(gold, 'concierge', 'x'); got := got || ' gold noted';
        exception when insufficient_privilege then got := got || ' gold refused'; end;
        got := got || ' noted=' || (select e ->> 'noted' from jsonb_array_elements(public.admin_am_concierge(vip)) e where (e ->> 'rfq_id')::uuid = rfq);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vip, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' vip reads=' || (select string_agg(kind || ':' || author_label || ':' || (rfq_id is not null) || ':' || coalesce((period = date_trunc('month', now() at time zone 'Asia/Kolkata')::date)::text, '-'), ' ' order by kind)
                                         from public.account_manager_notes);
        reset role;
        got := got || ' bells=' || (select string_agg(title, '|' order by title) from public.notifications where profile_id = vip and kind = 'account_manager_note');
        want := 'second review refused gold refused noted=true vip reads=concierge:Asha:true:- success_review:Asha:false:true bells=Your account manager picked a requirement for you|Your monthly review is ready';
      elsif i = 14 then
        insert into public.rfqs (id, buyer_id, title, category_id, removed_at, removed_reason, status) values (rfq, buyer, 'P9 removed', c1, now(), 'Spam', 'closed');
        perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.admin_am_note(vip, 'concierge', 'Look at this', rfq); got := 'picked';
        exception when sqlstate '22023' then got := 'refused'; end;
        begin perform public.admin_am_note(vip, 'success_review', 'With a requirement', gen_random_uuid()); got := got || ' review with rfq';
        exception when sqlstate '22023' then got := got || ' review with rfq refused'; end;
        reset role;
        want := 'refused review with rfq refused';
      elsif i = 15 or i = 16 or i = 17 then
        delete from public.support_tickets where is_test and subject like 'P9 %';
        -- Only these four: the fixture accounts' other local requests are closed for the case.
        update public.support_tickets set status = 'closed' where requester_id = any (everyone || buyer);
        insert into public.support_tickets (id, requester_id, requester_side, channel, category, subject, status, is_test, created_at) values
          (t1, buyer, 'buyer', 'chat', 'other', 'P9 buyer', 'open', true, now() - interval '50 minutes'),
          (t2, silver, 'vendor', 'chat', 'other', 'P9 silver', 'open', true, now() - interval '40 minutes'),
          (t3, gold, 'vendor', 'chat', 'other', 'P9 gold', 'open', true, now() - interval '30 minutes'),
          (t4, vip, 'vendor', 'chat', 'other', 'P9 vip', 'open', true, now() - interval '20 minutes');
        insert into public.support_ticket_staff (ticket_id) values (t1), (t2), (t3), (t4);
        insert into public.support_messages (ticket_id, author_id, author_kind, body, created_at) values
          (t1, buyer, 'requester', 'help', now() - interval '50 minutes'), (t2, silver, 'requester', 'help', now() - interval '40 minutes'),
          (t3, gold, 'requester', 'help', now() - interval '30 minutes'), (t4, vip, 'requester', 'help', now() - interval '20 minutes');
        if i = 17 then
          update public.feature_flags set allow_profile_ids = array_remove(allow_profile_ids, vip) where key = 'account_managers';
        end if;
        perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := (select string_agg(l.subject, ',' order by l.ord) from (select r.subject, row_number() over () as ord
                  from public.admin_support_list('awaiting', null, null, null, null, 'P9 ', true, 0, 50) r) l);
        if i = 16 then
          j := public.admin_support_priorities(array[t1, t2, t3, t4]);
          got := got || ' tiers=' || coalesce((select string_agg(k || ':' || (j -> k ->> 'tier'), ',' order by k) from jsonb_object_keys(j) k), 'none')
                 || ' targets=' || coalesce((select string_agg(((j -> k ->> 'target_at')::timestamptz > now() - interval '1 day')::text, ',') from jsonb_object_keys(j) k), 'none')
                 || ' waiting=' || (public.admin_support_counts() ->> 'awaiting_priority');
        end if;
        reset role;
        want := case i when 15 then 'P9 vip,P9 gold,P9 buyer,P9 silver'
                       when 16 then 'P9 vip,P9 gold,P9 buyer,P9 silver tiers=' || least(t3, t4)::text || ':' || case when t3 < t4 then 'gold' else 'vip' end
                                    || ',' || greatest(t3, t4)::text || ':' || case when t3 < t4 then 'vip' else 'gold' end || ' targets=true,true waiting=2'
                       else 'P9 gold,P9 buyer,P9 silver,P9 vip tiers=' || t3::text || ':gold targets=true waiting=1' end;
        if i = 17 then
          want := 'P9 gold,P9 buyer,P9 silver,P9 vip';
          perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
          set local role authenticated;
          j := public.admin_support_priorities(array[t1, t2, t3, t4]);
          got := got || ' tiers=' || coalesce((select string_agg(j -> k ->> 'tier', ',') from jsonb_object_keys(j) k), 'none');
          reset role;
          want := want || ' tiers=gold';
        end if;
      elsif i = 18 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.am_send('silver private');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := 'gold sees=' || (select count(*) from public.account_manager_messages where vendor_id = silver)
               || '/' || (select count(*) from public.account_manager_threads where vendor_id = silver);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        set local role anon;
        begin perform public.my_account_manager(); got := got || ' anon called';
        exception when insufficient_privilege then got := got || ' anon refused'; end;
        reset role;
        want := 'gold sees=0/0 anon refused';
      elsif i = 19 then
        insert into public.vendor_account_managers (vendor_id, manager_id) values (gold, am1);
        update admin.admin_users set is_active = false where id = am1;
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := coalesce(public.my_account_manager() ->> 'manager', 'team');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', am2, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' am2 serves=' || (select count(*) from jsonb_array_elements(public.admin_am_vendors('unassigned')) e where (e ->> 'vendor_id')::uuid = gold);
        reset role;
        want := 'team am2 serves=1';
      elsif i = 20 then
        perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.admin_am_vendors('mine'); got := 'support read';
        exception when insufficient_privilege then got := 'support refused'; end;
        begin perform public.admin_am_send(silver, 'x'); got := got || ' support sent';
        exception when insufficient_privilege then got := got || ' send refused'; end;
        reset role;
        want := 'support refused send refused';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P9 (rolled back)%', E'\n' || out;
end
$p9$;
