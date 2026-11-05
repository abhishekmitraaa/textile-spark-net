-- A requirement past its deadline is neither counted, announced nor alerted (2026-11-05).
-- ToDo "Apply the requirement deadline everywhere leads are counted or announced" (2026-11-01; Mitra 2026-11-05:
-- "complete them fully"). The 7-day deadline (20261019100000, rfqs.expires_at) was enforced in enforce_quote_rfq_open,
-- match_vendor_rfqs and the app's lead list, but not here, so a count or an alert could include a requirement a
-- seller can no longer quote on. Bodies are production's (md5 pinned in the release notes) with only these lines
-- changed:
--   overseas_lead_count(): "open" leaves out requirements past their deadline ("this_month" still counts what was posted);
--   my_lead_alerts(): an alert's "open" is false once its requirement's deadline has passed;
--   lead_digest_run(): the catch-up skips them, and the digest doesn't count them;
--   Cosora-Admin's Leads (admin.lead_rows): a new stage "expired" ("Deadline passed": still active, past its
--   deadline, no quote accepted), checked after removed/won/closed; such a requirement is no longer "overdue";
--   admin_leads_list() accepts it, admin_leads_summary() counts it in the window, admin_lead_detail() returns
--   expires_at. The view gains expires_at as its last column (create or replace keeps its grants).
-- Harness: scripts/todo-open/deadline.sql.

CREATE OR REPLACE FUNCTION public.overseas_lead_count()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me   uuid := auth.uid();
  v_tier text;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_tier := admin.vendor_overseas_tier(v_me);
  return jsonb_build_object(
    'available', admin.feature_on_for('overseas_leads', v_me),
    'tier', v_tier,
    'this_month', (select count(*) from public.rfqs r
                    where r.overseas and r.vendor_id is null and r.removed_at is null
                      and r.created_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
    'open', (select count(*) from public.rfqs r
              where r.overseas and r.vendor_id is null and r.status::text = 'active' and r.removed_at is null
                and (r.expires_at is null or r.expires_at > now())));
end
$function$;

CREATE OR REPLACE FUNCTION public.my_lead_alerts(p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me    uuid := auth.uid();
  e       record;
  v_lim   jsonb;
  v_name  text;
  s       public.lead_alert_settings;
  v_on    boolean;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_on := admin.feature_on_for('lead_alerts', v_me);
  select * into e from admin.vendor_effective_plan(v_me, now());
  select p.name, coalesce(p.limits -> 'lead_alert_channels', '[]'::jsonb) into v_name, v_lim
    from public.subscription_plans p where p.id = e.plan_id;
  select * into s from public.lead_alert_settings ls where ls.vendor_id = v_me;

  return jsonb_build_object(
    'available', v_on and jsonb_array_length(coalesce(v_lim, '[]'::jsonb)) > 0,
    'switch_on', v_on,
    'plan_id', e.plan_id, 'plan_name', v_name,
    'channels', coalesce(v_lim, '[]'::jsonb),
    'live_channels', to_jsonb(array(
      select c from unnest(array['app', 'email', 'whatsapp', 'sms', 'digest']) c
       where case c
               when 'app' then true
               when 'digest' then exists (select 1 from cron.job j where j.jobname = 'lead-alert-digest' and j.active)
                                  and exists (select 1 from admin.notification_templates t where t.key = 'lead_digest' and t.channel = 'email' and t.active)
               else exists (select 1 from admin.notification_templates t where t.key = 'lead_alert' and t.channel = c and t.active)
             end)),
    'settings', jsonb_build_object(
      'instant', coalesce(s.instant, true), 'digest', coalesce(s.digest, true),
      'category_ids', coalesce(to_jsonb(s.category_ids), 'null'::jsonb),
      'quiet_start', to_char(s.quiet_start, 'HH24:MI'), 'quiet_end', to_char(s.quiet_end, 'HH24:MI')),
    'whatsapp_consent', exists (select 1 from public.contact_consent c where c.profile_id = v_me and c.channel = 'whatsapp' and c.opted_in),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
        from public.categories c
       where c.id in (select p.category_id from public.products p where p.vendor_id = v_me and p.status::text = 'live' and p.category_id is not null)), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(x.row order by x.created_at desc)
        from (select la.created_at,
                     jsonb_build_object(
                       'id', la.id, 'rfq_id', la.rfq_id, 'at', la.created_at,
                       'title', case when q.removed_at is not null then 'A requirement Cosora removed'
                                     else admin.alert_text(coalesce(nullif(btrim(q.title), ''), q.product_name), 120) end,
                       'category', case when q.removed_at is null then c.name end,
                       'quantity', case when q.removed_at is null then q.quantity end,
                       'open', q.status::text = 'active' and q.removed_at is null and (q.expires_at is null or q.expires_at > now()),
                       'channels', to_jsonb(la.channels), 'held', la.held, 'in_digest', la.digest_at is not null) as row
                from admin.lead_alerts la
                join public.rfqs q on q.id = la.rfq_id
                left join public.categories c on c.id = q.category_id
               where la.vendor_id = v_me
               order by la.created_at desc
               limit least(greatest(coalesce(p_limit, 30), 1), 100)) x), '[]'::jsonb));
end
$function$;

CREATE OR REPLACE FUNCTION public.lead_digest_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg      admin.lead_alert_config;
  r        record;
  v_caught integer := 0;
  v_sent   integer := 0;
  v_lines  text;
  v_count  integer;
begin
  -- The scheduled job (no role claim) and the service role. The grant already says so.
  if not admin.trusted_caller() then
    raise exception 'lead_digest_run is for the scheduled job only' using errcode = '42501';
  end if;
  select * into cfg from admin.lead_alert_config;

  -- Requirements the trigger never matched (it failed, or the switch was turned on since).
  for r in
    select q.id
      from public.rfqs q
      left join admin.lead_alert_runs x on x.rfq_id = q.id
     where q.status::text = 'active' and q.vendor_id is null and q.removed_at is null
       and (q.expires_at is null or q.expires_at > now())   -- still taking quotes (deadline, 20261019100000)
       and q.created_at > now() - make_interval(hours => cfg.max_age_hours)
       and q.created_at < now() - interval '10 minutes'
       and (x.rfq_id is null or x.error is not null or (q.overseas and q.overseas_vip_until is not null and q.overseas_vip_until <= now() and x.ran_at < q.overseas_vip_until))   -- not one skipped for its buyer's cap
     order by q.created_at
     limit 500
  loop
    begin
      perform admin.lead_alert_fanout(r.id);
      v_caught := v_caught + 1;
    exception when others then
      insert into admin.lead_alert_runs (rfq_id, error) values (r.id, left(sqlstate || ' ' || sqlerrm, 500))
      on conflict (rfq_id) do update set ran_at = now(), error = excluded.error;
    end;
  end loop;

  -- One email per vendor: everything since the last digest on a plan with a digest, or
  -- only what was held (the hourly cap, quiet hours, instant alerts turned off) on a plan
  -- told as it happens.
  for r in
    select a.vendor_id, e.plan_id,
           coalesce(p.limits -> 'lead_alert_channels', '[]'::jsonb) ? 'digest' as has_digest,
           coalesce(ls.digest, true) as wants
      from (select distinct vendor_id from admin.lead_alerts where digest_at is null) a
      cross join lateral admin.vendor_effective_plan(a.vendor_id, now()) e
      join public.subscription_plans p on p.id = e.plan_id
      left join public.lead_alert_settings ls on ls.vendor_id = a.vendor_id
  loop
    if r.wants and admin.feature_on_for('lead_alerts', r.vendor_id) then
      -- Counted by category: Cosora's own list, and nothing the buyers wrote.
      select coalesce(sum(g.n), 0)::integer,
             string_agg('- ' || g.n || ' in ' || g.category, E'\n' order by g.n desc, g.category) filter (where g.rn <= 6)
        into v_count, v_lines
        from (select coalesce(c.name, 'Uncategorised') as category, count(*) as n,
                     row_number() over (order by count(*) desc, coalesce(c.name, 'Uncategorised')) as rn
                from admin.lead_alerts la
                join public.rfqs q on q.id = la.rfq_id
                left join public.categories c on c.id = q.category_id
               where la.vendor_id = r.vendor_id and la.digest_at is null
                 and la.created_at > now() - interval '3 days'
                 and q.status::text = 'active' and q.removed_at is null
                 and (q.expires_at is null or q.expires_at > now())
                 and (r.has_digest or la.held is not null)
               group by 1) g;
      if v_count > 0 then
        perform public.notify_deliver(r.vendor_id, 'lead_digest',
          jsonb_build_object(
            'name', (select coalesce(nullif(btrim(v.brand_name), ''), 'there') from public.vendor_profiles v where v.id = r.vendor_id),
            'count', case when v_count = 1 then '1 new buyer requirement' else v_count || ' new buyer requirements' end,
            'lines', v_lines),
          'lead_digest:' || r.vendor_id || ':' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
          array['email']);
        v_sent := v_sent + 1;
      end if;
    end if;
    update admin.lead_alerts set digest_at = now() where vendor_id = r.vendor_id and digest_at is null;
  end loop;

  return jsonb_build_object('caught_up', v_caught, 'digests', v_sent);
end
$function$;

create or replace view admin.lead_rows as
 SELECT r.id,
    r.created_at,
    r.status::text AS rfq_status,
    r.buyer_id,
    r.vendor_id AS target_vendor_id,
    r.vendor_id IS NOT NULL AS direct,
    COALESCE(NULLIF(btrim(r.title), ''::text), NULLIF(btrim(r.product_name), ''::text), 'Untitled request'::text) AS title,
    r.product_name,
    r.category_id,
    cat.name AS category,
    r.quantity,
    r.budget_min,
    r.budget_max,
    COALESCE(q.quotes, 0::bigint)::integer AS quotes,
    q.first_quote_at,
    q.accepted_vendor_id,
        CASE
            WHEN r.removed_at IS NOT NULL THEN 'removed'::text
            WHEN q.accepted_vendor_id IS NOT NULL THEN 'won'::text
            WHEN r.status::text <> 'active'::text THEN 'closed'::text
            WHEN r.expires_at IS NOT NULL AND r.expires_at <= now() THEN 'expired'::text
            WHEN COALESCE(q.quotes, 0::bigint) > 0 THEN 'quoted'::text
            WHEN r.created_at > (now() - '24:00:00'::interval) THEN 'new'::text
            ELSE 'unanswered'::text
        END AS stage,
    r.status::text = 'active'::text AND COALESCE(q.quotes, 0::bigint) = 0 AND r.created_at <= (now() - '48:00:00'::interval) AND (r.expires_at IS NULL OR r.expires_at > now()) AS overdue,
    r.removed_at,
    r.removed_by,
    r.removed_reason,
    r.expires_at
   FROM rfqs r
     LEFT JOIN categories cat ON cat.id = r.category_id
     LEFT JOIN LATERAL ( SELECT count(*) AS quotes,
            min(x.created_at) AS first_quote_at,
            (array_agg(x.vendor_id ORDER BY x.created_at) FILTER (WHERE x.status::text = 'accepted'::text))[1] AS accepted_vendor_id
           FROM quotes x
          WHERE x.rfq_id = r.id) q ON true;

CREATE OR REPLACE FUNCTION public.admin_leads_list(p_stage text DEFAULT NULL::text, p_min_age_hours integer DEFAULT NULL::integer, p_category uuid DEFAULT NULL::uuid, p_direct boolean DEFAULT NULL::boolean, p_search text DEFAULT NULL::text, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, title text, category text, quantity integer, budget_min numeric, budget_max numeric, buyer_id uuid, buyer_name text, direct boolean, target_vendor_id uuid, target_vendor_name text, rfq_status text, stage text, overdue boolean, quotes integer, first_quote_at timestamp with time zone, accepted_vendor_id uuid, accepted_vendor_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_limit  int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_search text := nullif(btrim(p_search), '');
  v_like   text;
begin
  if not admin.leads_can_read() then
    raise exception 'not authorized: leads are for super admins, vendor ops, product moderators and support' using errcode = '42501';
  end if;
  if p_stage is not null and p_stage not in ('new', 'unanswered', 'overdue', 'quoted', 'won', 'closed', 'removed', 'expired') then
    raise exception 'unknown stage %', p_stage using errcode = '22023';
  end if;
  if (p_cursor_at is null) <> (p_cursor_id is null) then
    raise exception 'a cursor needs both created_at and id' using errcode = '22023';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    select l.id, l.created_at, l.title, l.category, l.quantity, l.budget_min, l.budget_max,
           l.buyer_id,
           coalesce(nullif(btrim(bp.company), ''), nullif(btrim(p.full_name), ''), 'Unnamed buyer'),
           l.direct, l.target_vendor_id, tv.brand_name, l.rfq_status, l.stage, l.overdue, l.quotes,
           l.first_quote_at, l.accepted_vendor_id, av.brand_name
      from admin.lead_rows l
      left join public.profiles p on p.id = l.buyer_id
      left join public.buyer_profiles bp on bp.id = l.buyer_id
      left join public.vendor_profiles tv on tv.id = l.target_vendor_id
      left join public.vendor_profiles av on av.id = l.accepted_vendor_id
     where (p_stage is null or (case when p_stage = 'overdue' then l.overdue else l.stage = p_stage end))
       and (p_min_age_hours is null or l.created_at <= now() - make_interval(hours => p_min_age_hours))
       and (p_category is null or l.category_id = p_category)
       and (p_direct is null or l.direct = p_direct)
       and (v_search is null
            or l.title ilike v_like
            or l.product_name ilike v_like
            or p.full_name ilike v_like
            or bp.company ilike v_like)
       and (p_cursor_at is null or (l.created_at, l.id) < (p_cursor_at, p_cursor_id))
     order by l.created_at desc, l.id desc
     limit v_limit;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_leads_summary(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from   timestamptz;
  v_result jsonb;
begin
  if not admin.leads_can_read() then
    raise exception 'not authorized: leads are for super admins, vendor ops, product moderators and support' using errcode = '42501';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then
    raise exception 'days must be between 1 and 3650' using errcode = '22023';
  end if;
  v_from := case when p_days is null then null else now() - make_interval(days => p_days) end;

  select jsonb_build_object(
    'generated_at', now(),
    'days', p_days,
    -- The open pipeline as it stands, whatever an RFQ's age.
    'open', (select jsonb_build_object(
               'new',        count(*) filter (where l.stage = 'new'),
               'unanswered', count(*) filter (where l.stage = 'unanswered'),
               'overdue',    count(*) filter (where l.overdue),
               'quoted',     count(*) filter (where l.stage = 'quoted'))
               from admin.lead_rows l where l.rfq_status = 'active'),
    -- RFQs created in the window: how they ended up, and how fast vendors answered.
    -- A removed RFQ counts as removed, never as closed (RFQ/leads R3).
    'window', (select jsonb_build_object(
               'rfqs',        count(*),
               'direct',      count(*) filter (where l.direct),
               'won',         count(*) filter (where l.stage = 'won'),
               'closed',      count(*) filter (where l.stage = 'closed'),
               'removed',     count(*) filter (where l.stage = 'removed'),
               'expired',     count(*) filter (where l.stage = 'expired'),
               'answered',    count(*) filter (where l.first_quote_at is not null),
               'median_first_quote_hours',
                 round((percentile_cont(0.5) within group (
                   order by extract(epoch from (l.first_quote_at - l.created_at)) / 3600)
                   filter (where l.first_quote_at is not null))::numeric, 1),
               -- Only RFQs at least 24 hours old had a full day to be answered.
               'eligible_24h', count(*) filter (where l.created_at <= now() - interval '24 hours'),
               'answered_24h', count(*) filter (where l.created_at <= now() - interval '24 hours'
                                                  and l.first_quote_at <= l.created_at + interval '24 hours'))
               from admin.lead_rows l where v_from is null or l.created_at >= v_from)
  ) into v_result;
  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_lead_detail(p_rfq_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if not admin.leads_can_read() then
    raise exception 'not authorized: leads are for super admins, vendor ops, product moderators and support' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'id', l.id, 'created_at', l.created_at, 'title', l.title, 'product_name', l.product_name,
           'category', l.category, 'quantity', l.quantity, 'budget_min', l.budget_min, 'budget_max', l.budget_max,
           'description', r.description, 'images', to_jsonb(coalesce(r.images, array[]::text[])),
           'rfq_status', l.rfq_status, 'expires_at', l.expires_at, 'stage', l.stage, 'overdue', l.overdue, 'direct', l.direct,
           'attributes', r.attributes,
           'overseas', case when r.overseas then jsonb_build_object('country_code', r.buyer_country_code,
                         'country', (select c.name from public.countries c where c.code = r.buyer_country_code),
                         'vip_until', r.overseas_vip_until) end,
           'buyer', jsonb_build_object('id', l.buyer_id,
                      'name', coalesce(nullif(btrim(bp.company), ''), nullif(btrim(p.full_name), ''), 'Unnamed buyer')),
           'target_vendor', case when l.target_vendor_id is null then null
                                 else jsonb_build_object('id', l.target_vendor_id, 'name', tv.brand_name) end,
           'removal', case when l.removed_at is null then null
                           else jsonb_build_object('at', l.removed_at, 'reason', l.removed_reason,
                                  'by', case when l.removed_by is null then null else admin.audit_actor_name(l.removed_by) end) end,
           'quotes', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', q.id, 'vendor_id', q.vendor_id, 'vendor_name', v.brand_name,
                         'currency', q.currency, 'price_per_unit', q.price_per_unit, 'price_inr', q.price_inr,
                         'moq', q.moq, 'lead_time', q.lead_time, 'status', q.status::text, 'created_at', q.created_at)
                         order by q.created_at)
                         from public.quotes q
                         left join public.vendor_profiles v on v.id = q.vendor_id
                        where q.rfq_id = l.id), '[]'::jsonb))
    into v_result
    from admin.lead_rows l
    join public.rfqs r on r.id = l.id
    left join public.profiles p on p.id = l.buyer_id
    left join public.buyer_profiles bp on bp.id = l.buyer_id
    left join public.vendor_profiles tv on tv.id = l.target_vendor_id
   where l.id = p_rfq_id;
  if v_result is null then
    raise exception 'no RFQ %', p_rfq_id using errcode = 'P0002';
  end if;
  return v_result;
end
$function$;
