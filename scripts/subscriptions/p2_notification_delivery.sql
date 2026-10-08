-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P2: notification delivery (2026-10-08).
-- Migration 20261008130000_subscriptions_p2_notification_delivery.sql (on top of P0 and P1).
--   queue     notify_deliver: server only; the switch; template by language and version;
--             consent for WhatsApp and SMS; the email switches (not for transactional
--             messages); an address on file; once per dedupe key and channel
--   address   owner email, else a confirmed non-placeholder sign-in email; WhatsApp and SMS
--             numbers normalised to country code and digits
--   dispatch  claim (locks, skips what another run holds, reclaims an expired lock); mark sent,
--             retry with backoff then failed, not configured → skipped; only a claimed row
--   invoice   a plan invoice queues its email; a demo document doesn't; a failure to queue
--             never blocks the invoice
--   consent   only through set_contact_consent, by the person, in the Admin Log; read own
--   admin     System Health counts for super admins and vendor ops; a test send to oneself,
--             super admins only, 5 an hour
--   prune     the heartbeat records the run and prunes finished rows older than 90 days
-- HOW TO RUN (local stack with P0-P2 applied, or: begin; <P2>; <this>; rollback;). Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p2$
declare
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  admin_u uuid := '33333333-3333-3333-3333-333333333333';
  moder   uuid := '7b9fad26-da14-48b1-9717-a96f47a5946a';
  ops     uuid := 'bae52e9d-7390-4e58-a92c-5756553c2c8e';   -- local-manager, made vendor_ops below
  labels text[] := array[
    'notify_deliver refused to a browser',                          -- 1
    'switch off: nothing queued',                                   -- 2
    'switch on: email queued, WhatsApp and SMS need consent',       -- 3
    'consent given: WhatsApp queued to the normalised number',      -- 4
    'the same dedupe key queues nothing twice',                     -- 5
    'an email switch turned off skips; transactional ignores it',   -- 6
    'the account''s language, else English; the newest version',    -- 7
    'no usable address: a phone sign-in placeholder is skipped',    -- 8
    'claim: locks due rows, a second run gets none',                -- 9
    'mark sent once; a second mark changes nothing',                -- 10
    'retry backs off, then fails after 5 attempts',                 -- 11
    'not configured: skipped, never resent',                        -- 12
    'an expired lock is reclaimed',                                 -- 13
    'a plan invoice queues its email with the right payload',       -- 14
    'a demo document queues nothing',                               -- 15
    'a failure to queue never blocks the invoice',                  -- 16
    'consent: own row only, through the RPC, in the Admin Log',     -- 17
    'my_contact_channels: masked addresses and consent',            -- 18
    'health: vendor ops reads, a moderator is refused',             -- 19
    'test send: super admin to own address, 5 an hour',             -- 20
    'heartbeat: recorded; old finished rows pruned, new kept'];     -- 21
  got text; want text; i int; n int; j jsonb; r record; tpl uuid;
  out text := '';
begin
  -- Fixtures (rolled back with everything else).
  update admin.admin_users set admin_role = 'vendor_ops' where id = ops;
  update public.vendor_profiles set owner_email = 'Owner.P2@Example.com', phone = '98765 43210', whatsapp = null,
         regional = '{"language": "en"}', notifications = '{}' where id = vendor;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') - 'ui_language' where id = vendor;
  update public.feature_flags set enabled = false, allow_profile_ids = '{}' where key = 'notification_delivery';
  delete from public.contact_consent where profile_id in (vendor, admin_u);
  insert into admin.notification_templates (key, channel, locale, subject, body, email_switch)
  values ('p2_harness', 'email', 'en', 'Hello {{name}}', 'Body {{name}}', 'emailPlanExpiry');
  insert into admin.notification_templates (key, channel, locale, body, wa_template, wa_language, wa_params)
  values ('p2_harness', 'whatsapp', 'en', 'preview', 'p2_harness', 'en', array['name']);
  insert into admin.notification_templates (key, channel, locale, body) values ('p2_harness', 'sms', 'en', 'Hi {{name}}');

  for i in 1..array_length(labels, 1) loop
    begin
      if i >= 3 then
        update public.feature_flags set allow_profile_ids = array[vendor] where key = 'notification_delivery';
      end if;
      perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
      set local role service_role;

      if i = 1 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin
          perform public.notify_deliver(vendor, 'p2_harness', '{}', null, null);
          got := 'ran';
        exception when insufficient_privilege then got := 'refused';
        end;
        want := 'refused';
      elsif i = 2 then
        reset role;
        j := public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:2', null);
        got := (j ->> 'reason') || ' rows=' || (select count(*) from admin.notification_outbox where dedupe_key = 'p2:2');
        want := 'delivery_off rows=0';
      elsif i = 3 then
        reset role;
        j := public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:3', null);
        got := (j -> 'channels' ->> 'email') || ',' || (j -> 'channels' ->> 'whatsapp') || ',' || (j -> 'channels' ->> 'sms')
               || ' to=' || (select to_address from admin.notification_outbox where dedupe_key = 'p2:3' and channel = 'email');
        want := 'queued,no_consent,no_consent to=owner.p2@example.com';
      elsif i = 4 then
        reset role;
        insert into public.contact_consent (profile_id, channel, opted_in, source) values (vendor, 'whatsapp', true, 'vendor_settings');
        j := public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:4', array['whatsapp']);
        got := (j -> 'channels' ->> 'whatsapp') || ' to=' || (select to_address from admin.notification_outbox where dedupe_key = 'p2:4');
        want := 'queued to=919876543210';
      elsif i = 5 then
        reset role;
        perform public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:5', array['email']);
        j := public.notify_deliver(vendor, 'p2_harness', '{"name": "B"}', 'p2:5', array['email']);
        got := (j -> 'channels' ->> 'email') || ' rows=' || (select count(*) from admin.notification_outbox where dedupe_key = 'p2:5');
        want := 'duplicate rows=1';
      elsif i = 6 then
        reset role;
        update public.vendor_profiles set notifications = '{"emailPlanExpiry": false}' where id = vendor;
        j := public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:6', array['email']);
        got := j -> 'channels' ->> 'email';
        j := public.notify_deliver(vendor, 'delivery_test', '{}', 'p2:6t', array['email']);
        got := got || ',' || (j -> 'channels' ->> 'email');
        want := 'switched_off,queued';
      elsif i = 7 then
        reset role;
        update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || '{"ui_language": "hi"}' where id = vendor;
        insert into admin.notification_templates (key, channel, locale, version, subject, body)
        values ('p2_harness', 'email', 'hi', 1, 'नमस्ते {{name}}', 'hi v1'), ('p2_harness', 'email', 'hi', 2, 'नमस्ते {{name}}', 'hi v2');
        perform public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:7', array['email']);
        select t.locale || ' v' || t.version into got
          from admin.notification_outbox o join admin.notification_templates t on t.id = o.template_id where o.dedupe_key = 'p2:7';
        update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || '{"ui_language": "gu"}' where id = vendor;
        perform public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:7g', array['email']);
        select got || ', ' || t.locale || ' v' || t.version into got
          from admin.notification_outbox o join admin.notification_templates t on t.id = o.template_id where o.dedupe_key = 'p2:7g';
        want := 'hi v2, en v1';
      elsif i = 8 then
        reset role;
        update public.vendor_profiles set owner_email = null where id = vendor;
        update auth.users set email = 'p919876543210@phone.cosora.invalid' where id = vendor;
        j := public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:8', array['email']);
        got := j -> 'channels' ->> 'email';
        want := 'no_address';
      elsif i in (9, 10, 11, 12, 13) then
        reset role;
        delete from admin.notification_outbox;
        perform public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:d', array['email']);
        set local role service_role;
        select count(*) into n from public.notification_claim(10);
        if i = 9 then
          select subject || '|' || attempts into got from public.notification_claim(10);   -- nothing left to claim
          reset role;
          got := 'claimed ' || n || ', again ' || coalesce(got, 'none') || ', status '
                 || (select status || '/' || attempts from admin.notification_outbox where dedupe_key = 'p2:d');
          want := 'claimed 1, again none, status sending/1';
        elsif i = 10 then
          reset role;
          select id into r from admin.notification_outbox where dedupe_key = 'p2:d';
          set local role service_role;
          got := public.notification_mark(r.id, 'sent', 're_123', null);
          got := got || ',' || coalesce(public.notification_mark(r.id, 'retry', null, 'late'), 'unchanged');
          reset role;
          got := got || ' ' || (select status || '/' || provider_id || '/' || (sent_at is not null) from admin.notification_outbox where id = r.id);
          want := 'sent,unchanged sent/re_123/true';
        elsif i = 11 then
          reset role;
          select id into r from admin.notification_outbox where dedupe_key = 'p2:d';
          set local role service_role;
          got := public.notification_mark(r.id, 'retry', null, 'timeout');
          reset role;
          got := got || ' +' || (select round(extract(epoch from next_attempt_at - now()) / 60) from admin.notification_outbox where id = r.id) || 'm';
          update admin.notification_outbox set status = 'sending', attempts = 5 where id = r.id;
          set local role service_role;
          got := got || ', then ' || public.notification_mark(r.id, 'retry', null, 'timeout');
          want := 'queued +1m, then failed';
        elsif i = 12 then
          reset role;
          select id into r from admin.notification_outbox where dedupe_key = 'p2:d';
          set local role service_role;
          got := public.notification_mark(r.id, 'not_configured', null, null);
          select count(*) into n from public.notification_claim(10);
          got := got || ' reclaimed=' || n;
          want := 'skipped reclaimed=0';
        else
          reset role;
          update admin.notification_outbox set locked_until = now() - interval '1 second' where dedupe_key = 'p2:d';
          set local role service_role;
          select attempts into n from public.notification_claim(10);
          got := 'reclaimed attempt ' || n;
          want := 'reclaimed attempt 2';
        end if;
      elsif i in (14, 15, 16) then
        reset role;
        update public.vendor_profiles set brand_name = 'P2 Vendor' where id = vendor;
        if i = 16 then
          alter table admin.notification_outbox add constraint p2_harness_refuse check (false) not valid;
        end if;
        insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, payment_mode,
                                                        list_rupees, discount_rupees, change_kind, credit_rupees)
        values ('order_p2', vendor, 'gold', 'monthly', 271300, 'created',
                case i when 15 then 'demo' else 'test' end, 2299, 0, 'new', 0);
        update public.vendor_subscriptions set status = 'expired', scheduled_plan_id = null where vendor_id = vendor;
        set local role service_role;
        j := public.subscription_fulfil('order_p2', 'pay_p2', 'verify');
        reset role;
        if i = 14 then
          select o.template_key || ' ' || o.channel || ' ' || (o.payload ->> 'total') || ' | ' || (o.payload ->> 'document_label')
                 || ' | ' || (o.payload ->> 'invoice_number' = (j ->> 'invoice_number')) || ' ' || (o.dedupe_key = ('invoice_issued:' || (j ->> 'invoice_id')))
            into got from admin.notification_outbox o where o.template_key = 'invoice_issued' and o.profile_id = vendor;
          want := 'invoice_issued email ₹2,713.00 | test document | true true';
        elsif i = 15 then
          got := (j ->> 'document_type') || ' rows=' || (select count(*) from admin.notification_outbox where template_key = 'invoice_issued' and profile_id = vendor);
          want := 'demo rows=0';
        else
          got := coalesce(j ->> 'ok', 'null') || ' invoices=' || (select count(*) from public.subscription_invoices where razorpay_order_id = 'order_p2')
                 || ' rows=' || (select count(*) from admin.notification_outbox where template_key = 'invoice_issued' and profile_id = vendor);
          want := 'true invoices=1 rows=0';
        end if;
      elsif i = 17 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.set_contact_consent('whatsapp', true);
        perform public.set_contact_consent('whatsapp', true);   -- pressed twice: one opt-in
        perform public.set_contact_consent('whatsapp', false);
        begin
          insert into public.contact_consent (profile_id, channel, opted_in, source) values (vendor, 'sms', true, 'vendor_settings');
          got := 'direct insert allowed';
        exception when insufficient_privilege then got := 'direct insert refused';
        end;
        begin
          perform public.set_contact_consent('pigeon', true);
        exception when sqlstate '22023' then got := got || ', bad channel refused';
        end;
        select got || ', reads ' || count(*) into got from public.contact_consent;
        reset role;
        got := got || ', now ' || (select opted_in::text from public.contact_consent where profile_id = vendor and channel = 'whatsapp')
               || ', log ' || (select string_agg(opted_in::text, '>' order by id) from admin.contact_consent_log where profile_id = vendor);
        want := 'direct insert refused, bad channel refused, reads 1, now false, log true>false';
      elsif i = 18 then
        reset role;
        insert into public.contact_consent (profile_id, channel, opted_in, source) values (vendor, 'whatsapp', true, 'vendor_settings');
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_contact_channels();
        got := (j ->> 'delivery_on') || ' ' || (j ->> 'email') || ' ' || (j ->> 'whatsapp') || ' wa=' || (j -> 'consent' ->> 'whatsapp')
               || ' sms=' || (j -> 'consent' ->> 'sms');
        want := 'true o*******@example.com +91 *******210 wa=true sms=false';
      elsif i = 19 then
        reset role;
        perform public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:19', array['email']);
        select count(*) into n from admin.notification_outbox where channel = 'email' and status = 'queued' and next_attempt_at <= now();
        perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.admin_notification_health();
        got := 'ops due=' || (j -> 'channels' -> 'email' ->> 'due');
        perform set_config('request.jwt.claims', json_build_object('sub', moder, 'role', 'authenticated')::text, true);
        begin
          perform public.admin_notification_health();
          got := got || ', moderator read';
        exception when insufficient_privilege then got := got || ', moderator refused';
        end;
        want := 'ops due=' || n || ', moderator refused';
      elsif i = 20 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', ops, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin
          perform public.admin_notification_test('email');
          got := 'ops sent';
        exception when insufficient_privilege then got := 'ops refused';
        end;
        perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
        for n in 1..5 loop j := public.admin_notification_test('email'); end loop;
        got := got || ', ' || (j ->> 'to');
        j := public.admin_notification_test('email');
        got := got || ', sixth ' || (j ->> 'reason');
        j := public.admin_notification_test('whatsapp');
        got := got || ', whatsapp ' || coalesce(j ->> 'reason', 'queued');
        want := 'ops refused, l**********@cosora.test, sixth rate_limited, whatsapp rate_limited';
      elsif i = 21 then
        reset role;
        perform public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:old', array['email']);
        perform public.notify_deliver(vendor, 'p2_harness', '{"name": "A"}', 'p2:new', array['email']);
        update admin.notification_outbox set status = 'sent', created_at = now() - interval '91 days' where dedupe_key = 'p2:old';
        update admin.notification_outbox set status = 'sent' where dedupe_key = 'p2:new';
        set local role service_role;
        perform public.notification_dispatch_heartbeat('{"email": false}', 3, 2, 1);
        reset role;
        got := (select count(*) from admin.notification_outbox where dedupe_key = 'p2:old') || ','
               || (select count(*) from admin.notification_outbox where dedupe_key = 'p2:new') || ' '
               || (select (last_run_at > now() - interval '1 minute') || '/' || last_sent || '/' || (configured ->> 'email')
                     from admin.notification_dispatcher_state);
        want := '0,1 true/2/false';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P2 (rolled back)%', E'\n' || out;
end
$p2$;
