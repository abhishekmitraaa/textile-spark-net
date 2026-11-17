-- Seller Home audit SH-077 (2026-11-17), part 2 of 2. APPLY ONLY AFTER the app that reads
-- public.vendor_engagement_events() (20261117100200) is live and its bundle checked: the old app selects these columns
-- from the table, and revoking first would break seller Analytics (claude.md: "Revoking a column that clients read is
-- ordered", MPF-19).
--
-- Browser roles keep no write on engagement_events (written only by log_engagement_event(), a definer function) and
-- read only the columns that name nobody. viewer_id, session_id and query_text are read by definer functions alone
-- (vendor_engagement_events, vendor_buyer_geography, admin_live_activity, the trends refresh).

revoke all on table public.engagement_events from anon, authenticated;
grant select (id, event_type, vendor_id, product_id, ad_id, source, cta_name, created_at)
  on table public.engagement_events to authenticated;

do $check$
begin
  if has_column_privilege('authenticated', 'public.engagement_events', 'viewer_id', 'select')
     or has_column_privilege('authenticated', 'public.engagement_events', 'session_id', 'select')
     or has_column_privilege('authenticated', 'public.engagement_events', 'query_text', 'select')
     or has_table_privilege('anon', 'public.engagement_events', 'select') then
    raise exception 'engagement_events private columns self-check: a browser role can still read them';
  end if;
end
$check$;
