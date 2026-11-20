-- Low batch 2 (buyer review 2026-11-18): L-21 and L-18.
--
-- L-21 (Mitra, 2026-11-20, "Take them off live"): three seeded "[demo]" campaigns were still running on production:
-- "Women's Casual Kurta Set — Open Listing + Featured [demo]" (it showed a saree's picture) and two "Verification
-- Certificate [demo]" campaigns (Delhi Fashion Hub, Meridian Weaves Pvt Ltd). Each running campaign whose title ends
-- in "[demo]" goes to `archived`, its previous status recorded first in admin.demo_ads_offline. A demo certificate
-- also set its seller's `ad_verified_until` to the campaign's end (the Trusted Seal source "ad purchase"); that value
-- is recorded and cleared only where it still equals that campaign's end, so a seal bought since is untouched.
-- Nothing is deleted; the two demo certificate_orders rows stay as the delivery board's history.
--
-- To restore (as postgres, in one transaction):
--   update public.advertisements a set status = o.previous_status
--     from admin.demo_ads_offline o where o.ad_id = a.id and a.status = 'archived';
--   update public.vendor_profiles v set ad_verified_until = o.previous_verified_until
--     from admin.demo_ads_offline o where o.vendor_id = v.id and o.previous_verified_until is not null
--      and v.ad_verified_until is null;
--
-- L-18: cards printed "MOQ: 2" with no unit. Upload stores the MOQ as typed and the price unit apart. feed_products()
-- now returns a bare-number MOQ with the listing's unit ("2 pieces"); an MOQ that already says its unit, or a listing
-- without one, is returned as listed. Same rule as src/lib/moq.ts (moqWithUnit): change both together. Columns,
-- parameters and order are unchanged; only the three `p.moq` select items change.

begin;

-- ── L-21 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists admin.demo_ads_offline (
  ad_id                   uuid        primary key,
  vendor_id               uuid        not null,
  previous_status         text        not null,
  previous_verified_until timestamptz,
  taken_at                timestamptz not null default now()
);
revoke all on admin.demo_ads_offline from public, anon, authenticated;
comment on table admin.demo_ads_offline is
  'Seeded "[demo]" campaigns taken off live on 2026-11-20 (review L-21), with their previous status and the seal date '
  'they had set, for a restore.';

insert into admin.demo_ads_offline (ad_id, vendor_id, previous_status, previous_verified_until)
select a.id, a.vendor_id, a.status,
       case when 'verifiedCertificate' = any (string_to_array(a.placement, ','))
             and v.ad_verified_until is not distinct from a.ends_at
            then v.ad_verified_until end
  from public.advertisements a
  join public.vendor_profiles v on v.id = a.vendor_id
 where a.title like '%[demo]' and a.status not in ('archived', 'expired', 'ended', 'rejected')
on conflict (ad_id) do nothing;

update public.advertisements a
   set status = 'archived'
  from admin.demo_ads_offline o
 where o.ad_id = a.id and a.status = o.previous_status;

update public.vendor_profiles v
   set ad_verified_until = null
  from admin.demo_ads_offline o
 where o.vendor_id = v.id and o.previous_verified_until is not null
   and v.ad_verified_until = o.previous_verified_until;

-- ── L-18 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
do $patch$
declare
  v_def  text;
  v_old  constant text := 'p.compare_at_price, p.moq, p.fabric';
  v_new  constant text := 'p.compare_at_price, '
    || 'case when btrim(coalesce(p.moq, '''')) ~ ''^[0-9]+$'' and btrim(coalesce(p.unit, '''')) <> '''' '
    || 'then btrim(p.moq) || '' '' || btrim(p.unit) || case when btrim(p.moq) <> ''1'' and btrim(p.unit) in '
    || '(''yard'', ''meter'', ''piece'', ''dozen'', ''set'', ''project'', ''hour'', ''day'', ''month'') then ''s'' else '''' end '
    || 'else p.moq end, p.fabric';
  v_n    integer;
begin
  select replace(pg_get_functiondef(p.oid), E'\r\n', E'\n') into v_def
    from pg_proc p where p.proname = 'feed_products' and p.pronamespace = 'public'::regnamespace;
  if v_def is null then raise exception 'feed_products not found'; end if;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 3 then
    raise exception 'feed_products: expected 3 moq select items, found %', v_n;
  end if;
  execute replace(v_def, v_old, v_new);
end
$patch$;

-- Self-check: no running "[demo]" campaign, no seal left from one, and feed_products formats a bare MOQ.
do $$
declare
  v_running integer;
  v_seal    integer;
  v_def     text;
begin
  select count(*) into v_running from public.advertisements
   where title like '%[demo]' and status not in ('archived', 'expired', 'ended', 'rejected');
  select count(*) into v_seal from admin.demo_ads_offline o join public.vendor_profiles v on v.id = o.vendor_id
   where o.previous_verified_until is not null and v.ad_verified_until = o.previous_verified_until;
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.proname = 'feed_products' and p.pronamespace = 'public'::regnamespace;
  if v_running <> 0 or v_seal <> 0 then
    raise exception 'low batch 2 self-check: % demo campaigns running, % demo seals left', v_running, v_seal;
  end if;
  if position('p.compare_at_price, p.moq, p.fabric' in v_def) > 0 or position('btrim(p.unit)' in v_def) = 0 then
    raise exception 'low batch 2 self-check: feed_products moq not patched';
  end if;
end
$$;

commit;
