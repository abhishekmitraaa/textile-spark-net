-- The rest of the 2026-10-18 buyer audit, database half (Mitra, 2026-10-19: "plan and fix the bugs listed above").
--
--   1. Search cost limits. image_search_rate_check() and embed_query_rate_check() counted every call against the
--      platform-wide budget BEFORE the per-IP (and per-account) check, so one caller hammering the endpoint used up
--      image search (300 an hour) and semantic search for every buyer. Now a caller's own limit is checked first,
--      and only a call that passes it counts against the shared budget.
--   2. search_products() is open to signed-out callers and passed match_count straight through: at most 200 now.
--   3. match_rfq_vendors() was callable by any signed-in account, for any requirement, returning the matched sellers
--      and their scores. Neither app calls it; only admin.lead_alert_fanout() does (as its owner). Browsers lose it.
--   4. log_engagement_event() (vendor analytics) took unlimited signed-out calls with no length limits. Now: the
--      text fields are cut to size, and each caller gets 300 events per 10 minutes (signed in: per account; signed
--      out: per network address, Cloudflare's first, else per browser session). Signed-out events WITHOUT Cloudflare's
--      address (whose keys can be rotated) share a ceiling of 2,000 per 10 minutes per seller; each drop is recorded in
--      admin.engagement_event_failures (System Health) so a suppressed seller can be seen. Over a limit the event is dropped silently, as
--      a failed event always was.
--   5. Requirements never expired, though Post Your Requirement promises "an automatic 7-day deadline. Once it's
--      reached, you'll get an option to extend it." rfqs.expires_at is set by the database when an open requirement
--      is approved (7 days); a browser can't set or change it. extend_rfq_deadline() gives the buyer 7 more days
--      once the deadline is near (a day or less) or past. Past it, sellers don't see the requirement in their leads
--      (match_vendor_rfqs, and the app's lead query) and a new quote is refused (enforce_quote_rfq_open). Quotes
--      already sent stay, and can still be accepted. Direct requests to one seller have no deadline (unchanged).
--      Open requirements already live get 7 days from today, so none closes the moment this ships.
--   6. top_vendors(): New Arrivals' "Recommended Premium Brands" (4 tiles) downloaded every seller and every live
--      listing to pick them in the browser. The database picks them now, by the same rule (paid plan first, then
--      rating, then review count; only sellers with a live listing; the first listing's first picture as cover).
--
-- Each replaced function is its current body plus the change; the pre-check stops the whole file if production's
-- body isn't the one this was written against. No DROP of a table or function, no new DELETE (log_engagement_event
-- keeps its existing prune of old failure rows).

-- ── 0. Pre-check ────────────────────────────────────────────────────────────
do $pin$
begin
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.image_search_rate_check(text,text,integer,integer,integer,integer)'::regprocedure), chr(13), '')) <> 'ff13e517bf6e34c8b7e61a65cac4ed18' then
    raise exception 'pre-check: public.image_search_rate_check(text,text,integer,integer,integer,integer) is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.embed_query_rate_check(text,integer,integer,integer,integer)'::regprocedure), chr(13), '')) <> '418aa0d40fec60638ad921bd22c964f4' then
    raise exception 'pre-check: public.embed_query_rate_check(text,integer,integer,integer,integer) is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.search_products(text,integer)'::regprocedure), chr(13), '')) <> '43e9937efe5a35d3823550c381c75521' then
    raise exception 'pre-check: public.search_products(text,integer) is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.log_engagement_event(text,uuid,uuid,uuid,text,text,text,text)'::regprocedure), chr(13), '')) <> 'f7e1166a3894cdfd839199f4a0f164ce' then
    raise exception 'pre-check: public.log_engagement_event(text,uuid,uuid,uuid,text,text,text,text) is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.enforce_quote_rfq_open()'::regprocedure), chr(13), '')) <> '4675b90b04bc63bfcc34ee0297f22192' then
    raise exception 'pre-check: public.enforce_quote_rfq_open() is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.match_vendor_rfqs(uuid,integer)'::regprocedure), chr(13), '')) <> '6ddfe679867d3008f8eb34c66ac81eba' then
    raise exception 'pre-check: public.match_vendor_rfqs(uuid,integer) is not the version this migration was written against';
  end if;
end
$pin$;

-- ── 1. Search cost limits: the caller's own limit first ─────────────────────
create or replace function public.image_search_rate_check(
  p_ip                 text,
  p_user_id            text    default null,
  p_ip_limit           integer default 10,
  p_ip_window_secs     integer default 600,
  p_global_limit       integer default 300,
  p_global_window_secs integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_count integer;
begin
  -- Per-IP scope first (2026-10-19). It used to come after the global count, so a caller already over their own
  -- limit still spent the shared budget on every refused call, and one caller could empty it for everyone. An
  -- absent address collapses to one shared 'img:ip:unknown' bucket.
  insert into public.embed_query_rate_limit (caller, window_start, count)
  values ('img:ip:' || coalesce(nullif(trim(p_ip), ''), 'unknown'), now(), 1)
  on conflict (caller) do update
    set window_start = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 600), 1))
          then now() else public.embed_query_rate_limit.window_start end,
        count = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 600), 1))
          then 1 else public.embed_query_rate_limit.count + 1 end
  returning count into v_count;

  if v_count > greatest(coalesce(p_ip_limit, 10), 1) then
    return false;
  end if;

  -- Per-user scope, only when the caller has a user id. Same limit and window as per-IP. x-forwarded-for is
  -- client-supplied; a JWT `sub` is signed, so a signed-in caller rotating claimed IPs is still bounded here.
  if nullif(trim(p_user_id), '') is not null then
    insert into public.embed_query_rate_limit (caller, window_start, count)
    values ('img:user:' || trim(p_user_id), now(), 1)
    on conflict (caller) do update
      set window_start = case
            when public.embed_query_rate_limit.window_start
                 < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 600), 1))
            then now() else public.embed_query_rate_limit.window_start end,
          count = case
            when public.embed_query_rate_limit.window_start
                 < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 600), 1))
            then 1 else public.embed_query_rate_limit.count + 1 end
    returning count into v_count;

    if v_count > greatest(coalesce(p_ip_limit, 10), 1) then
      return false;
    end if;
  end if;

  -- Global scope last: the ceiling that bounds total spend however many IPs or accounts the calls come from. Only
  -- calls within their own limits reach it.
  insert into public.embed_query_rate_limit (caller, window_start, count)
  values ('img:global', now(), 1)
  on conflict (caller) do update
    set window_start = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_global_window_secs, 3600), 1))
          then now() else public.embed_query_rate_limit.window_start end,
        count = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_global_window_secs, 3600), 1))
          then 1 else public.embed_query_rate_limit.count + 1 end
  returning count into v_count;

  return v_count <= greatest(coalesce(p_global_limit, 300), 1);
end
$function$;
revoke execute on function public.image_search_rate_check(text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.image_search_rate_check(text, text, integer, integer, integer, integer) to service_role;

create or replace function public.embed_query_rate_check(
  p_ip             text,
  p_ip_limit       integer default 30,
  p_ip_window_secs integer default 300,
  p_global_limit   integer default 10000,
  p_global_window_secs integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_count integer;
begin
  -- Per-IP scope first (2026-10-19): a caller over their own limit no longer spends the platform-wide budget. An
  -- absent/unparseable address collapses to a single shared 'ip:unknown' bucket.
  insert into public.embed_query_rate_limit (caller, window_start, count)
  values ('ip:' || coalesce(nullif(trim(p_ip), ''), 'unknown'), now(), 1)
  on conflict (caller) do update
    set window_start = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 300), 1))
          then now() else public.embed_query_rate_limit.window_start end,
        count = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 300), 1))
          then 1 else public.embed_query_rate_limit.count + 1 end
  returning count into v_count;

  if v_count > greatest(coalesce(p_ip_limit, 30), 1) then
    return false;
  end if;

  -- Global scope: the platform-wide ceiling, counted only for calls within their own limit.
  insert into public.embed_query_rate_limit (caller, window_start, count)
  values ('global', now(), 1)
  on conflict (caller) do update
    set window_start = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_global_window_secs, 3600), 1))
          then now() else public.embed_query_rate_limit.window_start end,
        count = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_global_window_secs, 3600), 1))
          then 1 else public.embed_query_rate_limit.count + 1 end
  returning count into v_count;

  return v_count <= greatest(coalesce(p_global_limit, 10000), 1);
end
$function$;
revoke execute on function public.embed_query_rate_check(text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.embed_query_rate_check(text, integer, integer, integer, integer) to service_role;

-- ── 2. search_products: at most 200 rows ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_products(query text, match_count integer DEFAULT 60)
 RETURNS TABLE(id uuid, score double precision, fts_rank integer, vec_rank integer, boost_tier integer, embedding_used boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with cached as (
    select e.embedding
    from public.search_query_embeddings e
    where e.query_norm = public.normalise_search_query(query)
  )
  select m.id, m.score, m.fts_rank, m.vec_rank, m.boost_tier,
         (select count(*) from cached) > 0 as embedding_used
  from public.match_products(
         query,
         (select embedding from cached),
         -- At most 200 (2026-10-19): this is open to signed-out callers, and the app asks for 60.
         least(greatest(coalesce(match_count, 60), 1), 200)
       ) m;
$function$;

-- ── 3. match_rfq_vendors: not for browsers ──────────────────────────────────
revoke execute on function public.match_rfq_vendors(uuid, integer) from public, anon, authenticated;
grant execute on function public.match_rfq_vendors(uuid, integer) to service_role;

-- ── 4. Vendor analytics: sized fields and a per-caller limit ────────────────
-- One fixed-window counter per caller, in the table the search limits use (its nightly prune clears old rows).
create or replace function admin.engagement_rate_ok(p_key text, p_limit integer, p_window_secs integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  insert into public.embed_query_rate_limit (caller, window_start, count)
  values (p_key, now(), 1)
  on conflict (caller) do update
    set window_start = case
          when public.embed_query_rate_limit.window_start < now() - make_interval(secs => p_window_secs)
          then now() else public.embed_query_rate_limit.window_start end,
        count = case
          when public.embed_query_rate_limit.window_start < now() - make_interval(secs => p_window_secs)
          then 1 else public.embed_query_rate_limit.count + 1 end
  returning count into v_count;
  return v_count <= p_limit;
end
$function$;
revoke all on function admin.engagement_rate_ok(text, integer, integer) from public, anon, authenticated;

create or replace function public.log_engagement_event(p_event_type text, p_vendor_id uuid DEFAULT NULL::uuid, p_product_id uuid DEFAULT NULL::uuid, p_ad_id uuid DEFAULT NULL::uuid, p_session_id text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_query_text text DEFAULT NULL::text, p_cta_name text DEFAULT NULL::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_vendor     uuid;
  v_state      text;
  v_constraint text;
  v_msg        text;
  v_ip         text;
  v_key        text;
  v_trusted    boolean := false;
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
    v_key := case when v_ip is not null then 'eng:ip:' || left(v_ip, 64)
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

  -- A ceiling per seller for signed-out events whose caller can't be told apart: 2,000 per 10 minutes. Only events
  -- without Cloudflare's address count toward it (a forwarded-for address or a session id can be rotated); a
  -- visitor with a Cloudflare address is bounded by their own limit above and never crowded out by a flood of
  -- rotating keys. Each time the ceiling drops an event it is recorded where staff look (System Health), per seller
  -- and hour, so a suppressed seller can be seen. Signed-in events are bounded per account above.
  if auth.uid() is null and not v_trusted
     and not admin.engagement_rate_ok('eng:vendor:' || v_vendor::text, 2000, 600) then
    begin
      insert into admin.engagement_event_failures as f
        (hour, error_code, constraint_name, message, last_event_type, last_source)
      values
        (date_trunc('hour', now()), 'ceiling', 'seller:' || v_vendor::text,
         'Signed-out events for this seller passed 2,000 in 10 minutes without a Cloudflare address; the extra were not counted.',
         left(p_event_type, 60), left(p_source, 60))
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

-- ── 5. Requirement deadline ─────────────────────────────────────────────────
alter table public.rfqs add column if not exists expires_at timestamptz;
comment on column public.rfqs.expires_at is
  'When an open requirement stops taking quotes (7 days from approval; the buyer extends it with extend_rfq_deadline). Null on a direct request to one seller. Set by trg_rfqs_deadline; browsers can''t write it.';

-- Open requirements already there: 7 days from today, or from posting if that is later. Direct requests stay null.
update public.rfqs
   set expires_at = greatest(created_at + interval '7 days', now() + interval '7 days')
 where vendor_id is null and expires_at is null;

create or replace function public.rfqs_deadline_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    -- An open requirement gets 7 days; a direct request to one seller has no deadline.
    new.expires_at := case when new.vendor_id is null then now() + interval '7 days' else null end;
    return new;
  end if;
  -- Only extend_rfq_deadline() moves it (and Cosora's own jobs and staff, who aren't `authenticated` or are admins).
  if new.expires_at is distinct from old.expires_at
     and current_user = 'authenticated'
     and coalesce(current_setting('cosora.rfq_extend', true), '') <> 'on'
     and not coalesce(public.is_admin(), false) then
    new.expires_at := old.expires_at;
  end if;
  return new;
end
$function$;
revoke all on function public.rfqs_deadline_guard() from public, anon, authenticated;
drop trigger if exists trg_rfqs_deadline on public.rfqs;
create trigger trg_rfqs_deadline before insert or update of expires_at on public.rfqs
  for each row execute function public.rfqs_deadline_guard();

-- The buyer's "Extend 7 days": once the deadline is a day away or has passed.
create or replace function public.extend_rfq_deadline(p_rfq_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_rfq public.rfqs%rowtype;
  v_new timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.account_is_active(v_uid) then
    raise exception 'This account can''t make changes right now.' using errcode = '42501';
  end if;
  select * into v_rfq from public.rfqs r where r.id = p_rfq_id for update;
  if not found or v_rfq.buyer_id <> v_uid then
    raise exception 'That requirement wasn''t found.' using errcode = 'P0002';
  end if;
  if v_rfq.removed_at is not null then
    raise exception 'Cosora removed this requirement, so it can''t be extended.' using errcode = '42501';
  end if;
  if v_rfq.status <> 'active' or v_rfq.vendor_id is not null or v_rfq.expires_at is null then
    raise exception 'Only an open requirement has a deadline to extend.' using errcode = '22023';
  end if;
  if v_rfq.expires_at > now() + interval '1 day' then
    raise exception 'You can extend it once the deadline is a day away.' using errcode = '22023', hint = 'too_early';
  end if;
  v_new := now() + interval '7 days';
  perform set_config('cosora.rfq_extend', 'on', true);
  update public.rfqs set expires_at = v_new where id = p_rfq_id;
  perform set_config('cosora.rfq_extend', '', true);
  return v_new;
end
$function$;
revoke all on function public.extend_rfq_deadline(uuid) from public, anon, authenticated;
grant execute on function public.extend_rfq_deadline(uuid) to authenticated;

-- No new quote past the deadline.
CREATE OR REPLACE FUNCTION public.enforce_quote_rfq_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r_status   public.rfq_status;
  r_target   uuid;
  r_overseas boolean;
  r_until    timestamptz;
  r_expires  timestamptz;
  v_tier     text;
begin
  if tg_op = 'UPDATE'
     and new.rfq_id = old.rfq_id and new.vendor_id = old.vendor_id then
    return new;
  end if;

  select r.status, r.vendor_id, r.overseas, r.overseas_vip_until, r.expires_at
    into r_status, r_target, r_overseas, r_until, r_expires
    from public.rfqs r
   where r.id = new.rfq_id;

  if not found then
    return new;  -- the rfq_id foreign key refuses it, with its own error
  end if;

  if r_status <> 'active' then
    raise exception 'This request is closed and is no longer accepting quotes.'
      using errcode = 'P0001';
  end if;

  -- The 7-day deadline (2026-10-19). The buyer can extend it; until then no new quote.
  if r_expires is not null and r_expires <= now() then
    raise exception 'This request''s deadline has passed and it is no longer accepting quotes.'
      using errcode = 'P0001';
  end if;

  if r_target is not null and r_target <> new.vendor_id then
    raise exception 'This request was sent to a different vendor and cannot be quoted.'
      using errcode = '42501';
  end if;

  -- Overseas requirements (P7): Gold and VIP only, VIP first. One sent to this vendor, or
  -- one they have already quoted on, is theirs to quote.
  if r_overseas and r_target is null
     and not exists (select 1 from public.quotes q where q.rfq_id = new.rfq_id and q.vendor_id = new.vendor_id) then
    v_tier := admin.vendor_overseas_tier(new.vendor_id);
    if not public.overseas_rfq_visible(true, r_until, v_tier) then
      if v_tier = 'gold' then
        raise exception 'This overseas requirement is with VIP sellers first. It opens to Gold on %.',
          to_char(r_until at time zone 'Asia/Kolkata', 'FMDD Mon, HH12:MI AM')
          using errcode = '42501';
      end if;
      raise exception 'Overseas requirements are part of the Gold and VIP plans.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- A seller's ranked leads leave out requirements past their deadline.
CREATE OR REPLACE FUNCTION public.match_vendor_rfqs(p_vendor_id uuid, match_count integer DEFAULT 200)
 RETURNS TABLE(rfq_id uuid, similarity double precision, category_match boolean, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_tier text := admin.vendor_overseas_tier(p_vendor_id);
begin
  if auth.uid() is not null and p_vendor_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with v as materialized (
    select vp.catalog_embedding as emb,
           (select array_agg(distinct p.category_id)
              from public.products p
             where p.vendor_id = vp.id
               and p.status = 'live'
               and p.category_id is not null) as cat_ids
    from public.vendor_profiles vp
    where vp.id = p_vendor_id
  ),
  pool as (
    select r.id, r.embedding, r.category_id
    from public.rfqs r
    where r.status = 'active'
      and r.vendor_id is null
      -- Not past its deadline (2026-10-19).
      and (r.expires_at is null or r.expires_at > now())
      -- Not a buyer who blocked this seller, or whom the seller blocked (20261018160200).
      and not public.chat_blocked_between(r.buyer_id, p_vendor_id)
      -- Overseas requirements are Gold's and VIP's (P7), or a vendor's who already quoted.
      -- overseas_rfq_visible's rule, inline (it is tested on every row).
      and (not r.overseas
           or v_tier = 'vip'
           or (v_tier = 'gold' and (r.overseas_vip_until is null or now() >= r.overseas_vip_until))
           or exists (select 1 from public.quotes q where q.rfq_id = r.id and q.vendor_id = p_vendor_id))
  ),
  scored as (
    select
      pool.id as rfq_id,
      case when v.emb is not null and pool.embedding is not null
           then (1 - (pool.embedding <=> v.emb))::double precision
      end as similarity,
      coalesce(pool.category_id is not null
                 and (pool.category_id = any(v.cat_ids)
                      -- 2026-10-17: "Others (custom)" is every seller's category (one with a live listing).
                      or (public.rfq_category_is_open(pool.category_id) and v.cat_ids is not null)), false) as category_match
    from pool cross join v
  )
  select
    s.rfq_id,
    s.similarity,
    s.category_match,
    (0.7 * coalesce(s.similarity, 0)
       + 0.3 * s.category_match::int)::double precision as score
  from scored s
  order by score desc, s.similarity desc nulls last, s.rfq_id
  limit coalesce(match_count, 200);
end
$function$;

-- The app's lead query filters on it.
create index if not exists rfqs_open_expires_idx on public.rfqs (expires_at) where status = 'active' and vendor_id is null;

-- ── 6. New Arrivals' brand tiles, picked by the database ────────────────────
-- Security invoker: the caller's own row policies and column grants apply, exactly as the app's old reads did.
create or replace function public.top_vendors(p_limit integer default 4)
returns table (
  id uuid, brand_name text, city text, rating_avg numeric, reviews_count integer,
  is_verified boolean, plan_expires_at timestamptz, ad_verified_until timestamptz,
  image_url text, live_products integer
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with live as (
    select p.vendor_id, count(*)::integer as n,
           (array_agg(p.id order by p.created_at, p.id))[1] as first_id
      from public.products p
     where p.status = 'live'
     group by p.vendor_id
  )
  select v.id, v.brand_name, v.city, v.rating_avg::numeric, v.reviews_count::integer,
         v.is_verified, v.plan_expires_at, v.ad_verified_until,
         (select i.url from public.product_images i where i.product_id = live.first_id order by i.position limit 1),
         live.n
    from public.vendor_profiles v
    join live on live.vendor_id = v.id
   where v.brand_name is not null
   order by (v.plan_expires_at is not null and v.plan_expires_at > now()) desc,
            coalesce(v.rating_avg, 0) desc, coalesce(v.reviews_count, 0) desc, v.id
   limit least(greatest(coalesce(p_limit, 4), 1), 12);
$function$;
revoke all on function public.top_vendors(integer) from public;
grant execute on function public.top_vendors(integer) to anon, authenticated;

-- ── Self-checks ─────────────────────────────────────────────────────────────
do $check$
begin
  if has_function_privilege('authenticated', 'public.match_rfq_vendors(uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.match_rfq_vendors(uuid,integer)', 'EXECUTE') then
    raise exception 'self-check: match_rfq_vendors is still callable from a browser';
  end if;
  if has_function_privilege('anon', 'admin.engagement_rate_ok(text,integer,integer)', 'EXECUTE') then
    raise exception 'self-check: engagement_rate_ok is callable from a browser';
  end if;
  if exists (select 1 from public.rfqs where vendor_id is null and expires_at is null) then
    raise exception 'self-check: an open requirement has no deadline';
  end if;
end
$check$;
