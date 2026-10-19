-- Vendor analytics: the 10-minute rule, without the Cloudflare cap (Mitra, 2026-10-19: "remove the 10000 cap and
-- implement the 10 min rule").
--
-- Signed-out events WITHOUT a Cloudflare address share a ceiling of 2,000 per seller per 10 minutes (unchanged; each
-- drop recorded in System Health). The 10,000 per-seller ceiling for events WITH a Cloudflare address
-- (20261019110000) is removed: those visitors are limited only one by one (300 per 10 minutes per address, an IPv6
-- /64 counting as one), so a flood can't stop their visits being counted. The trade-off Mitra accepted: many real
-- addresses together can add views to a seller without a ceiling.
--
-- Same function, new body; the pre-check stops the file if production's body isn't 20261019120000's. No new DELETE.

do $pin$
begin
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.log_engagement_event(text,uuid,uuid,uuid,text,text,text,text)'::regprocedure), chr(13), ''))
     <> 'b8fb0218488f5eb86b0db058fead6ef1' then
    raise exception 'pre-check: public.log_engagement_event is not the version this migration was written against';
  end if;
end
$pin$;

CREATE OR REPLACE FUNCTION public.log_engagement_event(p_event_type text, p_vendor_id uuid DEFAULT NULL::uuid, p_product_id uuid DEFAULT NULL::uuid, p_ad_id uuid DEFAULT NULL::uuid, p_session_id text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_query_text text DEFAULT NULL::text, p_cta_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vendor     uuid;
  v_state      text;
  v_constraint text;
  v_msg        text;
  v_ip         text;
  v_key        text;
  v_trusted    boolean := false;
  v_net        inet;
begin
  -- Sized (2026-10-19): the app sends short values; nothing longer is kept.
  p_session_id := nullif(left(btrim(coalesce(p_session_id, '')), 64), '');
  p_query_text := nullif(left(btrim(coalesce(p_query_text, '')), 200), '');
  p_cta_name   := nullif(left(btrim(coalesce(p_cta_name, '')), 60), '');

  -- 300 events per 10 minutes per caller (2026-10-19): per account when signed in; signed out, per network address,
  -- else per browser session. Over it, dropped silently. The address is cf-connecting-ip, which Cloudflare sets at
  -- the edge (a client can't choose it); only without it the leftmost x-forwarded-for, which a client CAN prefix.
  -- That is why signed-out events without it also have a per-seller ceiling below, which no rotation gets past.
  if auth.uid() is not null then
    v_key := 'eng:user:' || auth.uid()::text;
  else
    begin
      v_ip := nullif(btrim(current_setting('request.headers', true)::json ->> 'cf-connecting-ip'), '');
      v_trusted := v_ip is not null;
      v_ip := coalesce(v_ip, nullif(btrim(split_part(
        coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), ''));
    exception when others then
      v_ip := null;
      v_trusted := false;
    end;
    -- An IPv6 caller holds a whole /64; keying on the exact address gave one allocation endless keys.
    begin
      v_net := v_ip::inet;
      -- An IPv4 address written as IPv6 (::ffff:a.b.c.d) is that IPv4 address; masking it to /64 put every one of
      -- them in a single bucket (2026-10-19, push review).
      if family(v_net) = 6 and v_net << '::ffff:0:0/96'::inet then
        v_ip := split_part(host(v_net), ':', 4);
      elsif family(v_net) = 6 then
        v_ip := host(network(set_masklen(v_net, 64))) || '/64';
      end if;
    exception when others then
      null;  -- not an address (a forged forwarded-for, say): keyed as given
    end;
    -- Cloudflare's address and a forwarded-for value have separate keys: a forged forwarded-for equal to someone's
    -- real address can no longer use up that person's limit (2026-10-19, push review).
    v_key := case when v_ip is not null and v_trusted then 'eng:ip:' || left(v_ip, 64)
                  when v_ip is not null then 'eng:xff:' || left(v_ip, 64)
                  when p_session_id is not null then 'eng:sess:' || p_session_id
                  else 'eng:anon' end;
  end if;
  if not admin.engagement_rate_ok(v_key, case when v_key = 'eng:anon' then 3000 else 300 end, 600) then
    return;
  end if;

  if p_event_type = 'product_view' and p_product_id is not null
     and not exists (select 1 from public.products
                     where id = p_product_id and status = 'live') then
    return;
  end if;

  if p_event_type in ('ad_impression', 'ad_click') and p_ad_id is not null
     and not exists (select 1 from public.advertisements
                     where id = p_ad_id and status = 'active') then
    return;
  end if;

  if p_product_id is not null then
    select vendor_id into v_vendor from public.products where id = p_product_id;
  elsif p_ad_id is not null then
    select vendor_id into v_vendor from public.advertisements where id = p_ad_id;
  end if;

  if v_vendor is null then
    v_vendor := p_vendor_id;
  end if;

  if v_vendor is null then
    return;
  end if;

  -- Only a real seller is counted, limited or recorded (a made-up id never reaches the limiter or System Health).
  if not exists (select 1 from public.vendor_profiles vp where vp.id = v_vendor) then
    return;
  end if;

  -- The 10-minute rule (Mitra, 2026-10-19): signed-out events whose caller can't be told apart (no Cloudflare
  -- address: a forwarded-for value or a session id can be rotated) share a ceiling of 2,000 per seller per 10
  -- minutes. A visitor with a Cloudflare address has no per-seller ceiling (the 10,000 cap is gone): only their own
  -- limit above, so a flood never stops their visits being counted. Each event the ceiling drops is recorded where
  -- staff look (System Health), per seller and hour. Signed-in events are bounded per account above.
  if auth.uid() is null and not v_trusted
     and not admin.engagement_rate_ok('eng:vendor:' || v_vendor::text, 2000, 600) then
    begin
      insert into admin.engagement_event_failures as f
        (hour, error_code, constraint_name, message, last_event_type, last_source)
      values
        (date_trunc('hour', now()), 'ceiling', 'seller:' || v_vendor::text,
         'Signed-out events without a Cloudflare address passed 2,000 in 10 minutes for this seller; the extra were not counted.',
         case when p_event_type in ('product_view', 'profile_view', 'search_impression', 'search_click', 'ad_impression', 'ad_click', 'cta_click')
              then p_event_type end,
         case when p_source in ('organic_search', 'category_browse', 'recommendation', 'ad', 'external', 'direct')
              then p_source end)
      on conflict (hour, error_code, constraint_name) do update
        set count = f.count + 1, last_at = now(),
            last_event_type = excluded.last_event_type, last_source = excluded.last_source;
    exception when others then
      null;
    end;
    return;
  end if;

  insert into public.engagement_events (
    event_type, vendor_id, product_id, ad_id, viewer_id, session_id,
    source, query_text, cta_name
  ) values (
    p_event_type, v_vendor, p_product_id, p_ad_id, auth.uid(),
    case when auth.uid() is null then p_session_id else null end,
    p_source, p_query_text, p_cta_name
  );
exception
  when foreign_key_violation then
    return;
  when others then
    get stacked diagnostics v_state = returned_sqlstate,
                            v_constraint = constraint_name,
                            v_msg = message_text;
    begin
      insert into admin.engagement_event_failures as f
        (hour, error_code, constraint_name, message, last_event_type, last_source)
      values
        (date_trunc('hour', now()), v_state, coalesce(v_constraint, ''), left(v_msg, 300),
         left(p_event_type, 60), left(p_source, 60))
      on conflict (hour, error_code, constraint_name) do update
        set count = f.count + 1,
            last_at = now(),
            message = excluded.message,
            last_event_type = excluded.last_event_type,
            last_source = excluded.last_source;
      delete from admin.engagement_event_failures where hour < now() - interval '30 days';
    exception when others then
      null;  -- recording the failure must not fail the page either
    end;
    return;
end;
$function$;

do $check$
declare
  v_src text := (select p.prosrc from pg_proc p where p.oid = 'public.log_engagement_event(text,uuid,uuid,uuid,text,text,text,text)'::regprocedure);
begin
  if position('eng:vendor-cf:' in v_src) > 0 or position('10000' in v_src) > 0 then
    raise exception 'self-check: the Cloudflare cap is still there';
  end if;
  if position('''eng:vendor:'' || v_vendor::text, 2000, 600' in v_src) = 0 or position('not v_trusted' in v_src) = 0 then
    raise exception 'self-check: the 10-minute rule is missing';
  end if;
end
$check$;
