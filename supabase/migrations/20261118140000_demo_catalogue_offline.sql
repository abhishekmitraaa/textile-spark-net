-- Take the demo catalogue off live (Mitra, 2026-11-18: "Yes, take all 26 off live"; buyer review H-04).
--
-- On 2026-11-18, 26 of the 27 live listings on www.cosora.in belonged to unregistered seed sellers created on
-- 2026-07-04 ("Tirupur Textiles", "Delhi Fashion Hub", "Jaipur Weaves", "Mumbai Linen House", "Lucknow Chikankari
-- Co." — ids a0000001…a0000005 — and "Demo Textiles Co.", 22222222-…), with hotlinked Unsplash photos and seeded
-- ratings; the only Video Close-Up was a test clip ("Buttons") whose listing isn't live. Mitra chose to take them all
-- off live knowing only one real listing stays.
--
-- What it does: every live listing of those six sellers, and that one video, goes to `draft` (buyers see only `live`;
-- `paused` is the plan-limit state, which a seller or a plan purchase can resume). Each row's previous status is
-- recorded first in admin.demo_catalogue_offline, so this is reversible. Nothing is deleted. No notice is sent:
-- admin.notify_moderation_outcome() acts only for an admin's change to live or rejected.
--
-- To restore (as postgres, in one transaction):
--   update public.products p set status = o.previous_status::public.product_status
--     from admin.demo_catalogue_offline o where o.kind = 'product' and o.id = p.id and p.status = 'draft';
--   update public.product_videos v set status = o.previous_status::public.product_status
--     from admin.demo_catalogue_offline o where o.kind = 'video' and o.id = v.id and v.status = 'draft';

begin;

create table if not exists admin.demo_catalogue_offline (
  kind            text        not null check (kind in ('product', 'video')),
  id              uuid        not null,
  previous_status text        not null,
  taken_at        timestamptz not null default now(),
  primary key (kind, id)
);
revoke all on admin.demo_catalogue_offline from public, anon, authenticated;
comment on table admin.demo_catalogue_offline is
  'Seed listings and the test video taken off live on 2026-11-18 (review H-04), with their previous status, for a restore.';

-- The six seed sellers: unregistered, and created with these fixed ids.
create temporary table _seed_sellers on commit drop as
select v.id
  from public.vendor_profiles v
 where not coalesce(v.onboarding_complete, false)
   and (v.id in ('a0000001-0000-0000-0000-000000000001', 'a0000002-0000-0000-0000-000000000002',
                 'a0000003-0000-0000-0000-000000000003', 'a0000004-0000-0000-0000-000000000004',
                 'a0000005-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222'));

insert into admin.demo_catalogue_offline (kind, id, previous_status)
select 'product', p.id, p.status::text
  from public.products p
 where p.status = 'live' and p.vendor_id in (select id from _seed_sellers)
on conflict (kind, id) do nothing;

insert into admin.demo_catalogue_offline (kind, id, previous_status)
select 'video', v.id, v.status::text
  from public.product_videos v
 where v.status = 'live'
   and (v.id = '35783726-439f-4e02-b2fe-3cd2eda8f707' or v.vendor_id in (select id from _seed_sellers))
on conflict (kind, id) do nothing;

update public.products p
   set status = 'draft'
  from admin.demo_catalogue_offline o
 where o.kind = 'product' and o.id = p.id and p.status = 'live';

update public.product_videos v
   set status = 'draft'
  from admin.demo_catalogue_offline o
 where o.kind = 'video' and o.id = v.id and v.status = 'live';

-- Self-check: nothing of the seed sellers is live, and every recorded row is now a draft.
do $$
declare
  v_live_left integer;
  v_recorded  integer;
  v_not_draft integer;
begin
  select count(*) into v_live_left
    from public.products p where p.status = 'live' and p.vendor_id in (select id from _seed_sellers);
  select count(*) into v_recorded from admin.demo_catalogue_offline;
  select count(*) into v_not_draft
    from admin.demo_catalogue_offline o
   where (o.kind = 'product' and not exists (select 1 from public.products p where p.id = o.id and p.status = 'draft'))
      or (o.kind = 'video' and not exists (select 1 from public.product_videos v where v.id = o.id and v.status = 'draft'));
  if v_live_left <> 0 or v_not_draft <> 0 then
    raise exception 'demo_catalogue_offline self-check failed: % live seed listings left, % recorded rows not draft',
      v_live_left, v_not_draft;
  end if;
  raise notice 'demo_catalogue_offline: % rows taken off live and recorded', v_recorded;
end $$;

commit;
