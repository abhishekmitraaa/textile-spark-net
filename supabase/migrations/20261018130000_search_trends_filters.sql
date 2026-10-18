-- Trending searches: tighter word filters (2026-10-18, after the push security review of
-- 20261018120000_search_trends.sql).
--
-- The first filters let a phone number through when it was split into groups of 4 or fewer ("9876 5432 10")
-- or written in Devanagari, Gujarati or full-width digits, and a link through when it had no "www" or
-- "http" and a domain other than .com/.in/.net/.org ("shop.example"). Now a term is published only with
-- at most 4 digits in all (any of those scripts), and never with anything shaped like a host name. The rest
-- of admin.search_trend_terms() is unchanged; the guard below refuses to replace any other body.
--
-- Recomputes the list in force afterwards, so a term these rules now refuse leaves the page at once.

do $guard$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'admin.search_trend_terms(date,date)'::regprocedure)
     <> '54ac367294f8a95630146b5133cf1790' then
    raise exception 'guard: admin.search_trend_terms is not the body 20261018120000 created';
  end if;
end
$guard$;

create or replace function admin.search_trend_terms(p_from date, p_to date)
returns table (rank integer, label text, visitors integer, searches integer)
language sql stable security definer set search_path = '' as $function$
  with ev as (
    -- Same as admin.search_term_norm(): lower case, trimmed, one space between words.
    select regexp_replace(lower(btrim(e.query_text)), '\s+', ' ', 'g') as q,
           coalesce(e.viewer_id::text, 's:' || e.session_id) as visitor,
           (e.created_at at time zone 'Asia/Kolkata')::date as d
      from public.engagement_events e
     where e.event_type = 'search_impression'
       and e.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and e.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
       and e.query_text is not null
       and coalesce(e.viewer_id::text, e.session_id) is not null
       and coalesce(e.viewer_id <> all (array(select a.id from admin.admin_users a where a.is_active)), true)
  ), qvd as (
    select ev.q, ev.visitor, ev.d from ev group by ev.q, ev.visitor, ev.d
  ), qv as (
    select qvd.q, qvd.visitor, count(*) as days from qvd group by qvd.q, qvd.visitor
  ), counted as (
    select qv.q, count(qv.visitor)::integer as visitors, sum(qv.days)::integer as searches
      from qv
     group by qv.q
    having count(qv.visitor) >= 3
  )
  select (row_number() over (order by c.visitors desc, c.searches desc, c.q))::integer, c.q, c.visitors, c.searches
    from counted c
   where char_length(c.q) between 2 and 40
     -- At most 4 digits in the whole term, counting Devanagari, Gujarati and full-width digits as digits:
     -- a phone number split into small groups or written in another script is still a phone number.
     and char_length(regexp_replace(translate(c.q, '०१२३४५६७८९૦૧૨૩૪૫૬૭૮૯０１２３４５６７８９', '012345678901234567890123456789'),
                                    '[^0-9]', '', 'g')) <= 4
     -- No email, no link and no bare host name ("shop.example", "x.co").
     and c.q !~ '@|https?:|www\.|\m[a-z0-9-]+\.[a-z]{2,}\M'
     and not exists (select 1 from admin.search_trend_hidden h where h.term_norm = c.q and h.hidden)
$function$;

revoke all on function admin.search_trend_terms(date, date) from public, anon, authenticated;

select admin.search_trends_refresh('manual');

do $check$
declare
  src text := (select p.prosrc from pg_proc p where p.oid = 'admin.search_trend_terms(date,date)'::regprocedure);
begin
  if src !~ 'having count\(qv\.visitor\) >= 3' then
    raise exception 'self-check: the 3-visitor floor on trending terms is missing';
  end if;
  if src !~ '<= 4' or src !~ '\[a-z\]\{2,\}' then
    raise exception 'self-check: the digit or host-name filter is missing';
  end if;
  if has_function_privilege('anon', 'admin.search_trend_terms(date,date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'admin.search_trend_terms(date,date)', 'EXECUTE') then
    raise exception 'self-check: admin.search_trend_terms is callable by a client';
  end if;
end
$check$;
