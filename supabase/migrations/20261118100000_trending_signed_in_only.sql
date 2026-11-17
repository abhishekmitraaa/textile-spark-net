-- Trending search terms count signed-in visitors only (Mitra, 2026-11-18: "Signed-in only").
--
-- A typed term is published once 3 different visitors searched it. A guest was counted by the session id its browser
-- sends, and log_engagement_event is open by design, so a script could pose as 3 visitors (ToDo.md, "Let typed search
-- terms into Trending once they can't be faked"). Now only signed-in accounts count, never Cosora staff or a
-- registered seller. Guests' searches still work; they just don't make a term trend. While the dummy sign-in code is
-- on, accounts are cheap, so staff take-down (admin_search_trend_hide) stays the backstop.
--
-- admin.search_trend_terms is 20261018150000's body with the visitor key and the filters changed; categories are
-- Cosora's own names and keep counting every visitor.

create or replace function admin.search_trend_terms(p_from date, p_to date)
 RETURNS TABLE(rank integer, label text, visitors integer, searches integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with ev as (
    -- Same as admin.search_term_norm(): lower case, trimmed, one space between words.
    select regexp_replace(lower(btrim(e.query_text)), '\s+', ' ', 'g') as q,
           e.viewer_id::text as visitor,
           (e.created_at at time zone 'Asia/Kolkata')::date as d
      from public.engagement_events e
     where e.event_type = 'search_impression'
       and e.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and e.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
       and e.query_text is not null
       -- Signed-in visitors only (Mitra, 2026-11-18, "Signed-in only"): a guest is a session id a script can invent,
       -- so 3 "different" guests could publish any term. Not Cosora staff, and not a registered seller (searching
       -- the marketplace they sell in), as Seller Analytics' term floor (20261117110100).
       and e.viewer_id is not null
       and e.viewer_id <> all (array(select a.id from admin.admin_users a where a.is_active))
       and not exists (select 1 from public.vendor_profiles v where v.id = e.viewer_id and v.onboarding_complete)
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
     -- Bengali, Tamil, Arabic… digits, is still one), and no "@", no dot of any kind, no "http" or "www" in any case, so
     -- no email, link or host name however it is spaced. A filter can always be written round (claude.md);
     -- this keeps the obvious out, and staff take down the rest.
     and char_length(regexp_replace(normalize(c.q, NFKC), '[^[:digit:]]', '', 'g')) <= 4
     and normalize(c.q, NFKC) !~* '[@.。｡]|https?|www'
     and not exists (select 1 from admin.search_trend_hidden h where h.term_norm = c.q and h.hidden)
$function$;

revoke all on function admin.search_trend_terms(date, date) from public, anon, authenticated;

-- Today's list, recomputed under the new rule.
select admin.search_trends_refresh('manual');

do $check$
declare
  v_src text := (select p.prosrc from pg_proc p where p.oid = 'admin.search_trend_terms(date,date)'::regprocedure);
begin
  if v_src !~ 'having count\(qv\.visitor\) >= 3' then
    raise exception 'self-check: the 3-visitor floor on trending terms is missing';
  end if;
  if position('e.viewer_id is not null' in v_src) = 0 or position('session_id' in v_src) > 0 then
    raise exception 'self-check: trending terms still count guests';
  end if;
end
$check$;
