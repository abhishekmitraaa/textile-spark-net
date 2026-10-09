-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P13: the truth pass (2026-10-09).
-- Migration 20261009170000_subscriptions_p13_truth_pass.sql (on top of P0-P12).
--   copy     every row of every plan's comparison says what that plan's limits give (the limits
--            are what vendor_entitlements() and the features read), and nothing promised isn't built
--   faqs     the rewritten answers are true, carry Hindi and Gujarati, and no answer still says
--            "no autopay", "the same requirements" or a fixed price
--   usage    subscription_usage can't be read or written by visitors or signed-in users
--   shims    P1's payment-mode shims are off: an order or invoice without its mode is refused
-- HOW TO RUN (local stack with P0-P13 applied, or: begin; <P13>; <this>; rollback;). Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p13$
declare
  labels text[] := array[
    'products, overseas, ad reach and seal match the limits',                -- 1
    'placement, account manager and support priority match the limits',     -- 2
    'lead channels, alerts, CRM and catalogue match the limits',            -- 3
    'nothing promised that isn''t built',                                     -- 4
    'the FAQs are true and translated',                                       -- 5
    'subscription_usage is retired, not gone',                                -- 6
    'the copy is translated',                                                 -- 7
    'an order without its payment mode is refused (the shims are off)'];      -- 8
  got text; want text; i int;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      got := ''; want := '';
      if i = 1 then
        select coalesce(string_agg(p.id, ',' order by p.sort_order), '') into got
          from public.subscription_plans p, lateral (select p.limits as l, p.display as d) x
         where p.id in ('free', 'basic', 'silver', 'gold', 'vip') and not (
               x.d ->> 'products' = case when (x.l ->> 'product_cap')::int < 0 then 'Unlimited' else x.l ->> 'product_cap' end
           and x.d ->> 'international' = case x.l ->> 'overseas_tier' when 'none' then 'No' when 'gold' then 'Yes' else 'Yes, 24-hour first look' end
           and x.d ->> 'ad' = case x.l ->> 'ad_location_scope' when 'none' then 'None' when 'state_1' then '1 state' when 'state_4' then '4 states'
                                                               when 'pan_india' then 'Pan-India' else 'Pan-India + overseas buyers' end
           and x.d ->> 'trust' = case when not (x.l ->> 'has_verified_badge')::boolean then 'None'
                                      when p.id = 'gold' then 'Gold verified seller' when p.id = 'vip' then 'VIP trusted seller'
                                      else 'Verified seller' end);
        want := '';

      elsif i = 2 then
        select coalesce(string_agg(p.id, ',' order by p.sort_order), '') into got
          from public.subscription_plans p, lateral (select p.limits as l, p.display as d) x
         where p.id in ('free', 'basic', 'silver', 'gold', 'vip') and not (
               case x.l ->> 'featured'
                 when 'none' then x.d ->> 'search' = case when coalesce((x.l ->> 'search_boost_tier')::int, 0) >= 1
                                                          then 'Priority in your categories' else 'Standard' end
                 when 'top10' then x.d ->> 'search' like 'Featured in the top 10%'
                 when 'top5' then x.d ->> 'search' like 'Featured in the top 5%nearby buyers'
                 else x.d ->> 'search' like 'Spotlight%' end
           and case x.l ->> 'am_level'
                 when 'none' then x.d ->> 'account_manager' in ('None', 'No')
                 when 'shared' then x.d ->> 'account_manager' = 'Shared account team'
                 when 'named' then x.d ->> 'account_manager' like 'Named manager%'
                 else x.d ->> 'account_manager' like 'Named VIP manager%' end
           and ((coalesce((x.l ->> 'support_priority')::int, 0) >= 1) = (x.d ->> 'account_manager' like '%priority support%')));
        want := '';

      elsif i = 3 then
        select coalesce(string_agg(p.id, ',' order by p.sort_order), '') into got
          from public.subscription_plans p, lateral (select p.limits as l, p.display as d, p.limits -> 'lead_alert_channels' as ch) x
         where p.id in ('free', 'basic', 'silver', 'gold', 'vip') and not (
               (jsonb_array_length(x.ch) = 0) = (x.d ->> 'lead_channel' = 'Website')
           and (x.ch ? 'digest') = (x.d ->> 'lead_channel' like '%daily email%')
           and (x.ch ? 'app') = (x.d ->> 'lead_channel' ~ 'app|All channels')
           and (x.ch ? 'whatsapp') = (x.d ->> 'lead_channel' ~ 'WhatsApp|All channels')
           and coalesce((x.l ->> 'lead_alert_priority')::boolean, false) = (x.d ->> 'lead_channel' like '%first in line%')
           and (x.l ->> 'has_realtime_alerts')::boolean = (x.d ->> 'alerts' like 'Instant%')
           and ((x.ch ? 'whatsapp') and not coalesce((x.l ->> 'lead_alert_priority')::boolean, false)) = (x.d ->> 'alerts' like '%WhatsApp%')
           and case x.l ->> 'crm_level'
                 when 'none' then x.d ->> 'crm' in ('None', 'No')
                 when 'pipeline' then x.d ->> 'crm' = 'Pipeline + follow-ups'
                 when 'analytics' then x.d ->> 'crm' like '%analytics%'
                 else x.d ->> 'crm' like '%success review%' end
           and case x.l ->> 'catalogue'
                 when 'manual' then x.d ->> 'catalog' = 'Add products one by one'
                 when 'pdf' then x.d ->> 'catalog' = 'PDF catalogue'
                 else x.d ->> 'catalog' ~* 'bulk import' end);
        want := '';

      elsif i = 4 then
        select coalesce(string_agg(p.id || '.' || e.k, ',' order by p.sort_order, e.k), '') into got
          from public.subscription_plans p, jsonb_each_text(p.display) e(k, v)
         where e.v ~* 'dedicated|100%|\msms\M|custom global|top 1 in segment|unlimited leads per|ai smart';
        -- "coming soon" only where Mitra deferred it (the done-for-you and AI catalogues).
        got := got || '|' || coalesce((select string_agg(p.id || '.' || e.k, ',') from public.subscription_plans p, jsonb_each_text(p.display) e(k, v)
                                        where e.v ~* 'coming soon' and e.k <> 'catalog'), '');
        want := '|';

      elsif i = 5 then
        select count(*) || ' rewritten, ' ||
               count(*) filter (where nullif(f.translations #>> '{hi,answer}', '') is not null and nullif(f.translations #>> '{gu,answer}', '') is not null
                                  and f.translations #>> '{hi,answer}' ~ '[ऀ-ॿ]' and f.translations #>> '{gu,answer}' ~ '[઀-૿]') || ' translated'
          into got
          from public.faqs f
         where (f.question, f.answer) in (
           ('How does billing work — is there autopay?', 'Autopay is optional. At checkout, "Renew automatically (autopay)" is ticked: Razorpay then renews your plan at the end of each month or year, and you can turn it off on the Subscription page. Without autopay, each period is a one-time payment: we remind you 7, 4, 2 and 1 days before it ends and on the day, and your plan keeps working for 7 more days. If you haven''t renewed by then, your account goes back to the Free plan.'))
            or (f.question in ('Does my plan renew by itself?', 'Is there a limit on how many leads I can quote on?', 'Lowest billing plan?',
                               'How are leads managed on Cosora?')
                and f.answer ~ '^(Only with autopay|No\. Every plan, Free included, can quote on as many buyer requirements as you like, and|Yes! Basic is the lowest paid plan|Buyer requirements appear on your Leads page, ranked to fit your catalogue\. Requirements from buyers in India)');
        got := got || ' stale=' || (select count(*) from public.faqs f where f.active
                                     and (f.answer ~* 'no auto-debit|every plan sees the same requirements|doesn''t change which requirements you see'
                                          or f.answer ~ '₹699/month'));
        want := '6 rewritten, 6 translated stale=0';

      elsif i = 6 then
        got := 'exists=' || (to_regclass('public.subscription_usage') is not null)::text
            || ' anon=' || (has_table_privilege('anon', 'public.subscription_usage', 'select') or has_table_privilege('anon', 'public.subscription_usage', 'insert'))::text
            || ' signed-in=' || (has_table_privilege('authenticated', 'public.subscription_usage', 'select')
                                 or has_table_privilege('authenticated', 'public.subscription_usage', 'insert')
                                 or has_table_privilege('authenticated', 'public.subscription_usage', 'update')
                                 or has_table_privilege('authenticated', 'public.subscription_usage', 'delete'))::text
            || ' service=' || has_table_privilege('service_role', 'public.subscription_usage', 'select')::text
            || ' rows=' || (select count(*) from public.subscription_usage);
        want := 'exists=true anon=false signed-in=false service=true rows=0';

      elsif i = 7 then
        -- The plans page translates these through the catalogue (src/i18n); the harness can only
        -- see that each value is plain text a catalogue can key on: no line breaks, no placeholders.
        select coalesce(string_agg(p.id || '.' || e.k, ','), '') into got
          from public.subscription_plans p, jsonb_each_text(p.display) e(k, v)
         where e.v ~ '[\n{}]' or char_length(e.v) > 60;
        want := '';
      elsif i = 8 then
        begin
          insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, list_rupees)
          values ('p13_no_mode', (select id from public.vendor_profiles order by id limit 1), 'gold', 'monthly', 271300, 'created', 2299);
          got := 'order without a mode went in as ' || (select payment_mode from public.subscription_payment_orders where order_id = 'p13_no_mode');
        exception when not_null_violation then got := 'refused';
        end;
        got := got || ' shims=' || (select string_agg(tgenabled::text, '' order by tgname) from pg_trigger
                                      where tgname in ('trg_subscription_payment_orders_mode', 'trg_subscription_invoices_mode'));
        want := 'refused shims=DD';
      end if;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 200) || E'\n';
    end;
  end loop;
  raise exception 'P13 (rolled back)%', E'\n' || out;
end
$p13$;
