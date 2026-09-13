-- Removes everything scripts/ad-demo-campaigns.sql created.
--
-- Run this before any real advertising launch: the seeded campaigns promote
-- real vendors' real products without anyone having paid for them, which is
-- fine for a staging walkthrough and not fine in front of paying customers.
--
-- ad_review_log has ON DELETE CASCADE from advertisements, so deleting the
-- campaigns takes their decision history with them. The trust seals granted at
-- approval do NOT cascade (they live on vendor_ad_verifications and are keyed
-- by vendor, not by campaign), so they are removed explicitly below — otherwise
-- a vendor would keep a verified badge bought by a campaign that no longer
-- exists.

begin;

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
    select 1 from public.ad_review_log l
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

select count(*) as demo_campaigns_left from public.advertisements where title like '%[demo]';
