-- Removes everything scripts/ad-demo-campaigns.sql and
-- scripts/ad-demo-search-and-certificates.sql created.
--
-- Run this before any real advertising launch: the seeded campaigns promote
-- real vendors' real products without anyone having paid for them, which is
-- fine for a staging walkthrough and not fine in front of paying customers.
--
-- Run as postgres / service role (SQL editor). Since admin-schema separation
-- Phase 3c (2026-09-16) the review log is admin.ad_review_log, a schema no client
-- role can reach; the reference below is schema-qualified accordingly.
--
-- ad_review_log has ON DELETE CASCADE from advertisements, so deleting the
-- campaigns takes their decision history with them. Two things do NOT cascade
-- and are removed explicitly below:
--
--   * Trust seals granted at approval. They live on vendor_ad_verifications
--     keyed by vendor, not by campaign, so a vendor would otherwise keep a
--     verified badge bought by a campaign that no longer exists.
--   * Certificate orders. certificate_orders.ad_id is ON DELETE SET NULL by
--     design — deleting a campaign must never erase the record of a parcel that
--     was printed and posted — so deleting the demo campaigns would leave
--     orphaned demo certificates sitting in the admin fulfilment queue forever.
--     They have to be matched and removed BEFORE the campaigns go, while ad_id
--     still points at them.

begin;

-- Demo certificate orders. Matched through ad_id while it is still set, so a
-- certificate from a genuine purchase is never touched. Deleted first: after
-- the campaigns go, ad_id is NULL and there is nothing left to match on.
delete from public.notifications n
where n.kind like 'certificate_%'
  and exists (
    select 1 from public.certificate_orders co
     join public.advertisements a on a.id = co.ad_id
    where a.title like '%[demo]' and co.vendor_id = n.profile_id
  );

delete from public.certificate_orders co
where exists (
  select 1 from public.advertisements a
   where a.id = co.ad_id and a.title like '%[demo]'
);

-- Trust seals whose granting campaign is one of the demo rows. Matched on the
-- expiry the campaign set, so a seal from a genuine purchase is never touched.
delete from public.vendor_ad_verifications v
where exists (
  select 1 from public.advertisements a
   where a.title like '%[demo]'
     and a.vendor_id = v.vendor_id
     and a.ends_at = v.expires_at
     and public.ad_seal_sources(a.placement) @> array[v.source]
);

-- In-app notifications the review RPCs sent to the vendors.
delete from public.notifications n
where n.kind like 'ad_%'
  and exists (
    select 1 from admin.ad_review_log l
     join public.advertisements a on a.id = l.ad_id
    where a.title like '%[demo]'
      and a.vendor_id = n.profile_id
      and abs(extract(epoch from (n.created_at - l.created_at))) < 5
  );

-- Impression/click events logged against the demo campaigns while browsing.
delete from public.engagement_events e
where e.ad_id in (select id from public.advertisements where title like '%[demo]');

delete from public.advertisements where title like '%[demo]';

-- Re-derive each affected vendor's badge expiry from whatever seals remain.
update public.vendor_profiles vp
   set ad_verified_until = (
     select max(expires_at) from public.vendor_ad_verifications v
      where v.vendor_id = vp.id and v.expires_at > now()
   )
 where vp.ad_verified_until is not null;

commit;

select (select count(*) from public.advertisements where title like '%[demo]') as demo_campaigns_left,
       (select count(*) from public.certificate_orders where reference like 'CERT-%'
         and ad_id is null and vendor_name is not null) as certificate_orders_left_unlinked,
       (select count(*) from public.certificate_orders) as certificate_orders_total;
