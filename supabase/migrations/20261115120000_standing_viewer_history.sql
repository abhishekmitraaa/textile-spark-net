-- Standing's buyer interest reaches back 90 days (2026-11-15; ToDo "Give Standing 90 days of signed-in viewers, not
-- two"; Mitra: "fix"). documentation/ranking.md §5.3 and §10.
--
-- Standing (20261115110000) counted signed-in listing viewers from public.product_view_daily, but that is the view
-- counter's dedupe ledger: increment_product_view deletes days before yesterday as it goes. So the view part saw
-- about two days, and a "repeat viewer" could only be today-and-yesterday.
--
-- Now:
--   admin.seller_viewer_daily: one row per seller, signed-in viewer and day (IST), kept 90 days, not client-readable;
--   increment_product_view writes it whenever it counts a signed-in view (body is production's plus that block);
--   admin.vendor_standing_parts reads it (only the interest block changed);
--   admin.refresh_vendor_standing prunes it past 90 days, hourly;
--   anonymize_account deletes a deleted buyer's rows, with the rest of their activity (body is production's plus
--   that line);
--   the two days product_view_daily still holds are carried over.
-- Harness: scripts/ranking/standing.sql (21).

create table admin.seller_viewer_daily (
  vendor_id  uuid not null references public.vendor_profiles(id) on delete cascade,
  viewer_id  uuid not null,
  day        date not null,
  primary key (vendor_id, viewer_id, day)
);
create index seller_viewer_daily_day on admin.seller_viewer_daily (day);
revoke all on table admin.seller_viewer_daily from public, anon, authenticated;
comment on table admin.seller_viewer_daily is
  'Signed-in viewers of a seller''s listings per day (IST), 90 days, for Ranking Standing''s buyer interest (20261115120000).';

-- What the view counter's ledger still holds (today and yesterday).
insert into admin.seller_viewer_daily (vendor_id, viewer_id, day)
select distinct pr.vendor_id, substr(d.viewer_key, 3)::uuid, d.day
  from public.product_view_daily d
  join public.products pr on pr.id = d.product_id
 where d.viewer_key ~ '^u:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and substr(d.viewer_key, 3)::uuid <> pr.vendor_id
on conflict do nothing;

CREATE OR REPLACE FUNCTION public.increment_product_view(p uuid, p_viewer text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_key  text;
  v_day  date := (now() at time zone 'Asia/Kolkata')::date;
  v_rows integer;
begin
  if p is null then
    return;
  end if;
  if v_uid is not null then
    v_key := 'u:' || v_uid::text;
  elsif p_viewer ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_key := 'b:' || p_viewer;
  else
    v_key := 'unkeyed';
  end if;

  -- Already counted today: nothing to do, and no lock taken.
  if exists (select 1 from public.product_view_daily d where d.product_id = p and d.viewer_key = v_key and d.day = v_day) then
    return;
  end if;
  -- A live listing, not the caller's own.
  if not exists (select 1 from public.products x
                  where x.id = p and x.status = 'live' and (v_uid is null or x.vendor_id <> v_uid)) then
    return;
  end if;

  -- Old ledger days go now and then, before any lock is held.
  if random() < 0.002 then
    delete from public.product_view_daily d where d.day < v_day - 1;
  end if;

  -- Signed-out views: at most 100 per listing per day. A cheap look first; at the cap, no lock is taken. Below it,
  -- the per-listing lock makes the recount and the insert one caller at a time (parallel calls overshot it).
  if v_uid is null then
    if (select count(*) from public.product_view_daily d
         where d.product_id = p and d.day = v_day and d.viewer_key not like 'u:%') >= 100 then
      return;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('cosora.product_view_cap:' || p::text, 0));
    if (select count(*) from public.product_view_daily d
         where d.product_id = p and d.day = v_day and d.viewer_key not like 'u:%') >= 100 then
      return;
    end if;
  end if;

  insert into public.product_view_daily (product_id, viewer_key, day)
  values (p, v_key, v_day)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.products set views_count = views_count + 1 where id = p and status = 'live';
    perform public.add_listing_demand(p, public.listing_demand_weight(case when v_uid is null then 'view_signed_out' else 'view_signed_in' end));
    -- Standing's buyer interest reads 90 days of signed-in viewers per seller; product_view_daily keeps two
    -- (20261115120000). The seller's own views never reach here (the live-listing check above).
    if v_uid is not null then
      insert into admin.seller_viewer_daily (vendor_id, viewer_id, day)
      select x.vendor_id, v_uid, v_day from public.products x where x.id = p
      on conflict do nothing;
    end if;
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION admin.vendor_standing_parts(p_vendor uuid)
 RETURNS TABLE(i double precision, r double precision, a double precision, t double precision, p double precision, standing double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_onboarded boolean;
  v_verified  boolean;
  v_ad_seal   timestamptz;
  v_score     integer;
  v_people    integer;
  v_repeat    integer;
  v_mean      double precision;
  v_n         integer;
  v_sum       double precision;
  v_quotes    integer;
  v_hours     double precision;
  v_volume    double precision;
  v_speed     double precision;
  v_reg       boolean;
  v_doc       boolean;
  v_seal      boolean;
  v_fraud     boolean;
  v_first     timestamptz;
begin
  select vp.onboarding_complete, vp.is_verified, vp.ad_verified_until, vp.profile_score
    into v_onboarded, v_verified, v_ad_seal, v_score
    from public.vendor_profiles vp where vp.id = p_vendor;
  if not found then
    return;
  end if;

  -- Buyer interest: distinct signed-in people over 90 days (listing viewers, new followers, people who messaged
  -- the seller; each counts once across all three), plus viewers who came back on another day. A signed-out
  -- viewer's key is made by the browser, so anyone could mint them: those views don't count (security review,
  -- 2026-11-15). Viewers come from admin.seller_viewer_daily, which keeps 90 days (20261115120000); the view
  -- counter's own ledger keeps two.
  select count(*) into v_people from (
    select 'u:' || w.viewer_id as k
      from admin.seller_viewer_daily w
     where w.vendor_id = p_vendor and w.day >= (now() at time zone 'Asia/Kolkata')::date - 90
       and w.viewer_id <> p_vendor
    union
    select 'u:' || f.follower_id from public.follows f
     where f.vendor_id = p_vendor and f.created_at >= now() - interval '90 days'
    union
    select 'u:' || m.sender_id
      from public.messages m join public.conversations c on c.id = m.conversation_id
     where p_vendor in (c.user_a, c.user_b) and m.sender_id <> p_vendor and m.created_at >= now() - interval '90 days'
  ) people;
  select count(*) into v_repeat from (
    select w.viewer_id
      from admin.seller_viewer_daily w
     where w.vendor_id = p_vendor and w.day >= (now() at time zone 'Asia/Kolkata')::date - 90
       and w.viewer_id <> p_vendor
     group by w.viewer_id having count(distinct w.day) >= 2
  ) back;
  i := least(1, ln(1 + v_people + v_repeat) / ln(201));

  -- Reviews: the seller's and its listings', pulled towards Cosora's average by 5 imaginary reviews.
  select avg(x) into v_mean from (select rv.rating::double precision as x from public.reviews rv
                                  union all select pv.rating::double precision from public.product_reviews pv) allr;
  v_mean := coalesce(v_mean, 4);
  select count(*), coalesce(sum(x), 0) into v_n, v_sum from (
    select rv.rating::double precision as x from public.reviews rv where rv.vendor_id = p_vendor
    union all
    select pv.rating::double precision from public.product_reviews pv join public.products pr on pr.id = pv.product_id
     where pr.vendor_id = p_vendor
  ) mine;
  r := ((5 * v_mean + v_sum) / (5 + v_n) - 1) / 4;

  -- Activity: quotes over 90 days, and the median hours from a requirement going live to the quote.
  select count(*), percentile_cont(0.5) within group (order by extract(epoch from (q.created_at - rq.created_at)) / 3600)
    into v_quotes, v_hours
    from public.quotes q join public.rfqs rq on rq.id = q.rfq_id
   where q.vendor_id = p_vendor and q.created_at >= now() - interval '90 days';
  v_volume := least(1, ln(1 + v_quotes) / ln(31));
  v_speed := case when v_quotes = 0 or v_hours is null then 0 else greatest(0, least(1, (72 - v_hours) / 68)) end;
  a := (v_volume + v_speed) / 2;

  -- Trust: an approved registration (or, before registrations were reviewed, a completed onboarding with no
  -- registration on file), a verified document, the verified or bought seal. A finding of fraud zeroes it.
  v_reg := exists (select 1 from public.vendor_registrations g where g.vendor_id = p_vendor and g.status = 'registered')
           or (coalesce(v_onboarded, false)
               and not exists (select 1 from public.vendor_registrations g where g.vendor_id = p_vendor));
  v_doc := exists (select 1 from public.vendor_documents d where d.vendor_id = p_vendor and d.verified);
  v_seal := coalesce(v_verified, false) or coalesce(v_ad_seal > now(), false);
  v_fraud := exists (select 1 from admin.fraud_findings ff
                      where ff.subject_profile_id = p_vendor and ff.withdrawn_at is null);
  t := case when v_fraud then 0 else 0.5 * v_reg::int + 0.25 * v_doc::int + 0.25 * v_seal::int end;

  p := least(1, greatest(0, coalesce(v_score, 0) / 100.0));

  -- A new seller (an account under 30 days old) isn't buried for having no history. The account's age, not its
  -- listings': unlisting everything and listing afresh mustn't make an old seller new (security review, 2026-11-15).
  select vp.created_at into v_first from public.vendor_profiles vp where vp.id = p_vendor;
  if v_first is not null and v_first > now() - interval '30 days' then
    i := greatest(i, 0.5);
    a := greatest(a, 0.5);
  end if;

  standing := 0.30 * i + 0.25 * r + 0.15 * a + 0.15 * t + 0.15 * p;
  if v_fraud then
    standing := standing / 2;
  end if;
  return next;
end
$function$;

CREATE OR REPLACE FUNCTION admin.refresh_vendor_standing()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rows integer;
begin
  -- The viewer ledger keeps the 90 days interest reads (20261115120000).
  delete from admin.seller_viewer_daily w where w.day < (now() at time zone 'Asia/Kolkata')::date - 90;
  insert into admin.vendor_standing (vendor_id, standing, i, r, a, t, p, computed_at)
  select v.id, s.standing, s.i, s.r, s.a, s.t, s.p, now()
    from public.vendor_profiles v
    cross join lateral admin.vendor_standing_parts(v.id) s
  on conflict (vendor_id) do update
    set standing = excluded.standing, i = excluded.i, r = excluded.r, a = excluded.a, t = excluded.t,
        p = excluded.p, computed_at = excluded.computed_at;
  get diagnostics v_rows = row_count;
  return v_rows;
end
$function$;

CREATE OR REPLACE FUNCTION public.anonymize_account(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status public.account_status_type;
begin
  select account_status into v_status from public.profiles where id = p_user for update;
  if not found then
    raise exception 'profile % not found', p_user;
  end if;
  if v_status = 'deleted' then
    return;  -- already done; the sweep may retry a row
  end if;
  -- The same refusals as account_deletion_blocker(), re-checked here: any of them
  -- could have become true during the 14 days.
  if v_status <> 'active' then
    raise exception 'account % is %: deletion waits for support', p_user, v_status;
  end if;
  if exists (select 1 from admin.admin_users where id = p_user) then
    raise exception 'account % is an admin: not deleted', p_user;
  end if;
  if admin.is_real_seller(p_user) then
    raise exception 'account % is a seller: not deleted', p_user;
  end if;
  -- A bare row (Register's "Seller" tick, nothing behind it) holds a brand name: it goes with the identity.
  delete from public.vendor_profiles where id = p_user;

  -- The shared identity row. Counterparties see "Deleted user" on the RFQs, quotes,
  -- chats and reviews that stay.
  update public.profiles
     set full_name = 'Deleted user',
         email = null,
         phone = null,
         avatar_url = null,
         account_status = 'deleted'
   where id = p_user;

  update public.buyer_profiles
     set display_name = null, company = null, city = null, job_title = null,
         department = null, business_type = null, website = null, industry = null,
         street = null, business_city = null, state = null, postal_code = null,
         country = null, gstin = null, pan = null,
         social = '{}'::jsonb, preferred_categories = '{}',
         -- What sign-up and For You asked (2026-11-14): the typed "Others" words were never scrubbed.
         preferred_interest_other = null, buyer_role = null, preferred_locations = '{}'
   where id = p_user;

  -- Copies of the name on the review rows themselves.
  update public.reviews         set reviewer_name = 'Deleted user', reviewer_company = null where buyer_id = p_user;
  update public.product_reviews set reviewer_name = 'Deleted user' where buyer_id = p_user;
  update public.service_reviews set reviewer_name = 'Deleted user' where buyer_id = p_user;

  -- Private activity: this person's own rows, which are no one else's history
  -- (MPF-7). saved_folder_items go with their folders (ON DELETE CASCADE).
  delete from public.saved_items     where buyer_id    = p_user;
  delete from public.saved_folders   where buyer_id    = p_user;
  delete from public.saved_videos    where buyer_id    = p_user;
  delete from public.follows         where follower_id = p_user;
  delete from public.recently_viewed where buyer_id    = p_user;
  delete from admin.seller_viewer_daily where viewer_id = p_user;  -- the 90-day viewer ledger (20261115120000)
  delete from public.video_likes     where buyer_id    = p_user;
  delete from public.notifications   where profile_id  = p_user;
  -- Vendors' analytics keep the events; only the link to the person goes.
  update public.engagement_events set viewer_id = null where viewer_id = p_user;

  -- The login. Sessions alone are not enough: with the email and identities left,
  -- the user signs straight back in to this row. The four GoTrue string columns
  -- are left as '' (never NULL: GoTrue answers 500 on NULL there). The ban is a
  -- finite 100 years, GoTrue's own idiom for "permanent": an 'infinity'
  -- timestamp risks GoTrue (Go) failing to read the row, which would break the
  -- admin user listing too, not just this account.
  delete from auth.sessions        where user_id = p_user;
  delete from auth.refresh_tokens  where user_id = p_user::text;
  delete from auth.mfa_factors     where user_id = p_user;
  delete from auth.one_time_tokens where user_id = p_user;
  delete from auth.identities      where user_id = p_user;
  update auth.users
     set email = null,
         phone = null,
         encrypted_password = '',
         email_change = '',
         email_change_token_new = '',
         phone_change = '',
         raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '100 years'
   where id = p_user;
end;
$function$;

select admin.refresh_vendor_standing();

do $check$
begin
  if has_table_privilege('authenticated', 'admin.seller_viewer_daily', 'select')
     or has_table_privilege('anon', 'admin.seller_viewer_daily', 'select') then
    raise exception 'self-check: clients can read the seller viewer ledger';
  end if;
  if (select prosrc from pg_proc where oid = 'admin.vendor_standing_parts(uuid)'::regprocedure) ilike '%product\_view\_daily%'
     or (select prosrc from pg_proc where oid = 'public.increment_product_view(uuid,text)'::regprocedure) not ilike '%seller\_viewer\_daily%' then
    raise exception 'self-check: Standing does not read the 90-day viewer ledger';
  end if;
  if (select count(*) from admin.vendor_standing) <> (select count(*) from public.vendor_profiles) then
    raise exception 'self-check: a seller has no Standing';
  end if;
end
$check$;
