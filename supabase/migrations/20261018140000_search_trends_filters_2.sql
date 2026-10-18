-- Trending searches: word filters, second pass (2026-10-18, after the security review of
-- 20261018130000_search_trends_filters.sql).
--
-- 130000 counted only ASCII, Devanagari, Gujarati and full-width digits (Bengali, Tamil, Arabic… slipped
-- through), and its host-name pattern needed a word boundary and no space ("shop .com" passed, and the
-- first version's ".com" check had been dropped). Now the term is NFKC-normalised, every Unicode digit
-- counts ([[:digit:]] under en_US.UTF-8 matches all of them; checked on production), and any dot, "@",
-- "http" or "www" keeps a term off the page. The rest of admin.search_trend_terms() is unchanged; the guard
-- refuses any body but 130000's. Recomputes the list in force afterwards.

do $guard$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'admin.search_trend_terms(date,date)'::regprocedure)
     <> 'fa6c0265943e93b1dea5755fa9604fde' then
    raise exception 'guard: admin.search_trend_terms is not the body 20261018130000 created';
  end if;
  -- The digit rule depends on the locale's classes: refuse to rely on it where they are ASCII only.
  if char_length(regexp_replace('٩৯௯९૯', '[^[:digit:]]', '', 'g')) <> 5 then
    raise exception 'guard: [[:digit:]] does not match Unicode digits in this database';
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
     -- After NFKC (full-width letters, digits and punctuation become plain ones): at most 4 digits of any
     -- script in the whole term (a phone number split into groups, or written in Devanagari, Gujarati,
     -- Bengali, Tamil, Arabic… digits, is still one), and no "@", no dot of any kind, no "http" or "www", so
     -- no email, link or host name however it is spaced. A filter can always be written round (claude.md);
     -- this keeps the obvious out, and staff take down the rest.
     and char_length(regexp_replace(normalize(c.q, NFKC), '[^[:digit:]]', '', 'g')) <= 4
     and normalize(c.q, NFKC) !~ '[@.。｡]|https?|www'
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
  if position('normalize(c.q, NFKC)' in src) = 0 or position('[^[:digit:]]' in src) = 0 then
    raise exception 'self-check: the digit or punctuation filter is missing';
  end if;
  if has_function_privilege('anon', 'admin.search_trend_terms(date,date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'admin.search_trend_terms(date,date)', 'EXECUTE') then
    raise exception 'self-check: admin.search_trend_terms is callable by a client';
  end if;
end
$check$;
