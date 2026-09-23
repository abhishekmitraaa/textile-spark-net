-- =============================================================================
-- Synthetic load-test population: cleanup (Master Prompt 12, Part G)
--
-- WRITTEN, NOT RUN. Run it only when asked, once testing is finished.
-- NOT a migration: keep it out of supabase/migrations/, or `supabase db push`
-- would run it against production.
--
-- WHAT IT REMOVES
--   The 370 auth users matching ^loadtest-(buyer|vendor)-[0-9]+@cosora\.test$
--   (250 buyers, 120 vendors) and everything hanging off them: profiles and
--   vendor profiles, products (and images and saves), RFQs, quotes,
--   conversations and messages, ads (and their review log), subscriptions,
--   engagement events, notifications, sessions and identities. Every such row
--   is tagged "[LOADTEST]" (products, RFQs, quotes, vendors, ads) or lives in a
--   conversation between two synthetic accounts.
--
-- HOW TO RUN (as postgres: the Supabase SQL editor, psql, or MCP execute_sql)
--   1. Run the file as it is. Mode 'dry-run' does every delete and every check
--      inside one transaction, then ROLLS IT ALL BACK and ends with an error
--      whose message lists exactly what it would have deleted. Nothing changes.
--   2. Read that list. To delete for real, change 'dry-run' to 'commit' in
--      step 0 and run it again. The final SELECT must then return all zeros.
--   Either way it aborts, with nothing deleted, if any precondition below
--   fails.
--
-- WHY IT IS NOT JUST `delete from auth.users where email like ...`
-- The cascade was checked in the catalog, not assumed (2026-09-23). Most of
-- the graph does cascade from auth.users -> profiles -> vendor_profiles, but a
-- one-statement delete fails or misbehaves in four places:
--   * products carry AFTER DELETE trigger trg_products_sync_vendor_catalog,
--     which INSERTs into vendor_catalog_recompute_queue (FK -> vendor_profiles).
--     Inside one cascade, if vendor_profiles goes before products, that insert
--     violates its FK and the whole delete aborts (the order depends on
--     internal trigger order). So products are deleted first, while their
--     vendor rows still exist.
--   * messages.quote_id -> quotes and messages.rfq_id -> rfqs are NO ACTION, and
--     rfqs.product_id -> products is NO ACTION: a message still pointing at an
--     RFQ or quote, or an RFQ still pointing at a product, blocks the parent
--     delete. So: conversations (and their messages), then RFQs (and their
--     quotes), then products.
--   * engagement_events.viewer_id -> profiles is SET NULL, so events a
--     synthetic viewer produced on a REAL vendor's listing would survive,
--     anonymised and indistinguishable from real traffic. They are deleted
--     explicitly (0 today).
--   * vendor_contracts.vendor_id -> vendor_profiles is RESTRICT (a signed
--     contract is append-only on purpose). No synthetic vendor has one; the
--     preflight refuses if that changes.
-- Also checked: guard_ad_deletion only guards requests running as
-- 'authenticated', so postgres deletes reviewed campaigns (their
-- admin.ad_review_log rows cascade). No synthetic user owns a Storage object
-- (SQL cannot delete the files), has a Bunny video, is an admin, or shares a
-- conversation with a real user. Embedding jobs still queued for deleted rows
-- need nothing: generate-embedding archives a job whose row is gone.
--
-- Counts at the time of writing (the dry run prints the live ones): 370 users,
-- 120 vendor profiles, 577 products, 572 RFQs, 1,082 quotes, 221
-- conversations, 1,321 messages sent, 24 ads, 24 subscriptions, 184
-- engagement events, 370 identities, 170 sessions.
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- 0. Mode, and the population size this was written against.
select set_config('cosora.loadtest_cleanup_mode', 'dry-run', true);   -- 'dry-run' | 'commit'
select set_config('cosora.loadtest_expected_users', '370', true);

-- 1. The target set: an exact pattern, not a LIKE that could match more.
create temp table lt_users on commit drop as
  select id, email from auth.users
   where email ~ '^loadtest-(buyer|vendor)-[0-9]+@cosora\.test$';
create temp table lt_report (step int, what text, n bigint) on commit drop;

-- What real (non-synthetic) data looks like now; compared again at the end.
create temp view lt_real_now as
          select 'auth.users'         as t, count(*) as n from auth.users        where id          not in (select id from lt_users)
union all select 'profiles',                count(*)      from public.profiles    where id          not in (select id from lt_users)
union all select 'vendor_profiles',         count(*)      from public.vendor_profiles where id      not in (select id from lt_users)
union all select 'products',                count(*)      from public.products    where vendor_id   not in (select id from lt_users)
union all select 'rfqs',                    count(*)      from public.rfqs        where buyer_id    not in (select id from lt_users)
union all select 'quotes',                  count(*)      from public.quotes      where vendor_id   not in (select id from lt_users)
union all select 'conversations',           count(*)      from public.conversations where user_a    not in (select id from lt_users)
                                                                                  and user_b      not in (select id from lt_users)
union all select 'messages',                count(*)      from public.messages    where sender_id   not in (select id from lt_users)
union all select 'advertisements',          count(*)      from public.advertisements where vendor_id not in (select id from lt_users)
union all select 'reviews',                 count(*)      from public.reviews
union all select 'product_reviews',         count(*)      from public.product_reviews
union all select 'follows',                 count(*)      from public.follows
union all select 'engagement_events',       count(*)      from public.engagement_events
                                                          where coalesce(vendor_id::text, '') not in (select id::text from lt_users)
                                                            and coalesce(viewer_id::text, '') not in (select id::text from lt_users)
union all select 'notifications',           count(*)      from public.notifications where profile_id not in (select id from lt_users)
union all select 'vendor_subscriptions',    count(*)      from public.vendor_subscriptions where vendor_id not in (select id from lt_users);
create temp table lt_real_before on commit drop as select * from lt_real_now;

-- 2. Preflight. Any failure aborts before a single row is touched.
do $pre$
declare
  n int;
  bad text;
begin
  if current_setting('role', true) = 'authenticated' then
    raise exception 'run this as postgres, not as a signed-in role';
  end if;

  select count(*) into n from lt_users;
  if n <> current_setting('cosora.loadtest_expected_users')::int then
    raise exception 'target set has % users, expected %. Change cosora.loadtest_expected_users only if the population changed on purpose.',
      n, current_setting('cosora.loadtest_expected_users');
  end if;
  if (select count(*) from auth.users where email like 'loadtest-%@cosora.test') <> n then
    raise exception 'an email matches loadtest-%%@cosora.test but not the exact pattern; inspect it by hand';
  end if;

  bad := concat_ws('; ',
    case when exists (select 1 from admin.admin_users where id in (select id from lt_users))
      then 'an admin is in the target set' end,
    case when exists (select 1 from storage.objects
                       where owner in (select id from lt_users) or owner_id in (select id::text from lt_users))
      then 'target users own Storage objects: remove the files through the Storage API first' end,
    case when exists (select 1 from public.product_videos where vendor_id in (select id from lt_users) and provider = 'bunny')
      then 'a synthetic vendor has a Bunny video: delete the paid asset with bunny-delete-video first' end,
    case when exists (select 1 from public.vendor_contracts where vendor_id in (select id from lt_users))
      then 'a synthetic vendor has a signed contract (ON DELETE RESTRICT)' end,
    -- Real users' own content that the cascade would destroy, or that would block it:
    case when exists (select 1 from public.quotes q join public.rfqs r on r.id = q.rfq_id
                       where r.buyer_id in (select id from lt_users) and q.vendor_id not in (select id from lt_users))
      then 'a real vendor quoted a synthetic RFQ (deleting the RFQ would delete their quote)' end,
    case when exists (select 1 from public.rfqs r
                       where r.buyer_id not in (select id from lt_users)
                         and (r.vendor_id in (select id from lt_users)
                              or r.product_id in (select p.id from public.products p where p.vendor_id in (select id from lt_users))))
      then 'a real buyer addressed a request to a synthetic vendor or product' end,
    case when exists (select 1 from public.conversations c
                       where (c.user_a in (select id from lt_users)) <> (c.user_b in (select id from lt_users)))
      then 'a conversation mixes a real user with a synthetic one' end,
    case when exists (select 1 from public.reviews r
                       where r.vendor_id in (select id from lt_users) and r.buyer_id not in (select id from lt_users))
      then 'a real buyer reviewed a synthetic vendor' end,
    case when exists (select 1 from public.product_reviews pr join public.products p on p.id = pr.product_id
                       where p.vendor_id in (select id from lt_users) and pr.buyer_id not in (select id from lt_users))
      then 'a real buyer reviewed a synthetic product' end,
    case when exists (select 1 from public.vendor_profiles v
                       where v.id not in (select id from lt_users)
                         and v.recommended_product_ids && array(select p.id from public.products p where p.vendor_id in (select id from lt_users)))
      then 'a real vendor recommends a synthetic product' end
  );
  if bad <> '' then
    raise exception 'refusing to run: %', bad;
  end if;
end
$pre$;

-- 3. Conversations between synthetic users. Messages and any moderation
--    reviews cascade; notifications.conversation_id is SET NULL. First, because
--    messages reference RFQs and quotes with NO ACTION.
insert into lt_report select 1, 'messages in those conversations (cascade)', count(*)
  from public.messages where conversation_id in (select id from public.conversations
   where user_a in (select id from lt_users) or user_b in (select id from lt_users));
with d as (delete from public.conversations
            where user_a in (select id from lt_users) or user_b in (select id from lt_users) returning 1)
insert into lt_report select 1, 'conversations', count(*) from d;

-- 4. RFQs posted by synthetic buyers; every quote on them cascades.
insert into lt_report select 2, 'quotes on those RFQs (cascade)', count(*)
  from public.quotes where rfq_id in (select id from public.rfqs where buyer_id in (select id from lt_users));
with d as (delete from public.rfqs where buyer_id in (select id from lt_users) returning 1)
insert into lt_report select 2, 'rfqs', count(*) from d;

-- 5. Any quote a synthetic vendor left anywhere else (none expected).
with d as (delete from public.quotes where vendor_id in (select id from lt_users) returning 1)
insert into lt_report select 3, 'other quotes by synthetic vendors', count(*) from d;

-- 6. Ads. guard_ad_deletion lets postgres through; admin.ad_review_log cascades.
insert into lt_report select 4, 'ad review-log rows (cascade)', count(*)
  from admin.ad_review_log where ad_id in (select id from public.advertisements where vendor_id in (select id from lt_users));
with d as (delete from public.advertisements where vendor_id in (select id from lt_users) returning 1)
insert into lt_report select 4, 'advertisements', count(*) from d;

-- 7. Products, while their vendor rows still exist (see the header). Images,
--    product reviews, saves and recently-viewed cascade.
with d as (delete from public.products where vendor_id in (select id from lt_users) returning 1)
insert into lt_report select 5, 'products', count(*) from d;

-- 8. Events a synthetic viewer produced on someone else's listing. SET NULL
--    would keep them, anonymised, in a real vendor's analytics.
with d as (delete from public.engagement_events where viewer_id in (select id from lt_users) returning 1)
insert into lt_report select 6, 'engagement events by synthetic viewers', count(*) from d;

-- 9. The accounts themselves. Everything left cascades from here:
--    profiles -> vendor_profiles -> subscriptions / usage / invoices /
--    recompute queue / engagement events on their listings; notifications;
--    auth identities, sessions and one-time tokens.
insert into lt_report select 7, 'profiles (cascade)', count(*) from public.profiles where id in (select id from lt_users);
insert into lt_report select 7, 'vendor_profiles (cascade)', count(*) from public.vendor_profiles where id in (select id from lt_users);
insert into lt_report select 7, 'vendor_subscriptions (cascade)', count(*) from public.vendor_subscriptions where vendor_id in (select id from lt_users);
insert into lt_report select 7, 'engagement events on synthetic vendors (cascade)', count(*) from public.engagement_events where vendor_id in (select id from lt_users);
insert into lt_report select 7, 'notifications (cascade)', count(*) from public.notifications where profile_id in (select id from lt_users);
insert into lt_report select 7, 'auth.identities (cascade)', count(*) from auth.identities where user_id in (select id from lt_users);
insert into lt_report select 7, 'auth.sessions (cascade)', count(*) from auth.sessions where user_id in (select id from lt_users);
with d as (delete from auth.users where id in (select id from lt_users) returning 1)
insert into lt_report select 7, 'auth.users', count(*) from d;

-- 10. Verify: nothing synthetic is left, and no real row moved.
do $post$
declare
  left_over text;
  drift text;
begin
  select string_agg(what || ' ' || n, ', ') into left_over from (
              select 'auth.users' as what, count(*) as n from auth.users where email like 'loadtest-%@cosora.test'
    union all select 'auth.identities',  count(*) from auth.identities   where user_id   in (select id from lt_users)
    union all select 'auth.sessions',    count(*) from auth.sessions     where user_id   in (select id from lt_users)
    union all select 'profiles',         count(*) from public.profiles   where id        in (select id from lt_users)
    union all select 'vendor_profiles',  count(*) from public.vendor_profiles where id    in (select id from lt_users)
    union all select 'products',         count(*) from public.products   where vendor_id in (select id from lt_users)
    union all select 'rfqs',             count(*) from public.rfqs       where buyer_id  in (select id from lt_users)
    union all select 'quotes',           count(*) from public.quotes     where vendor_id in (select id from lt_users)
    union all select 'conversations',    count(*) from public.conversations where user_a in (select id from lt_users) or user_b in (select id from lt_users)
    union all select 'messages',         count(*) from public.messages   where sender_id in (select id from lt_users)
    union all select 'advertisements',   count(*) from public.advertisements where vendor_id in (select id from lt_users)
    union all select 'vendor_subscriptions', count(*) from public.vendor_subscriptions where vendor_id in (select id from lt_users)
    union all select 'engagement_events', count(*) from public.engagement_events where vendor_id in (select id from lt_users) or viewer_id in (select id from lt_users)
    union all select 'notifications',    count(*) from public.notifications where profile_id in (select id from lt_users)
    union all select 'recompute queue',  count(*) from public.vendor_catalog_recompute_queue where vendor_id in (select id from lt_users)
    union all select '[LOADTEST] products',   count(*) from public.products where name like '[LOADTEST]%'
    union all select '[LOADTEST] rfqs',       count(*) from public.rfqs where title like '[LOADTEST]%'
    union all select '[LOADTEST] quotes',     count(*) from public.quotes where comment like '[LOADTEST]%'
    union all select '[LOADTEST] vendors',    count(*) from public.vendor_profiles where brand_name like '[LOADTEST]%'
    union all select '[LOADTEST] ads',        count(*) from public.advertisements where title like '[LOADTEST]%'
    union all select 'Loadtest chat messages', count(*) from public.messages where body like 'Loadtest message%'
  ) s where n > 0;
  if left_over is not null then
    raise exception 'cleanup incomplete, rolled back: %', left_over;
  end if;

  select string_agg(format('%s %s -> %s', b.t, b.n, a.n), ', ') into drift
    from lt_real_before b join lt_real_now a using (t) where a.n <> b.n;
  if drift is not null then
    raise exception 'real data changed, rolled back: %', drift;
  end if;
end
$post$;

-- 11. The mode gate. A dry run stops here, and the error rolls everything back.
do $gate$
declare r text;
begin
  select string_agg(format('%s. %s: %s', step, what, n), E'\n' order by step, what) into r from lt_report;
  if current_setting('cosora.loadtest_cleanup_mode') <> 'commit' then
    raise exception using errcode = 'P0001',
      message = E'DRY RUN - every check passed, everything rolled back, nothing deleted. A commit run would delete:\n' || r;
  end if;
end
$gate$;

commit;

-- After a 'commit' run this must return all zeros.
select (select count(*) from auth.users where email like 'loadtest-%@cosora.test') as loadtest_users,
       (select count(*) from public.products where name like '[LOADTEST]%')      as loadtest_products,
       (select count(*) from public.rfqs where title like '[LOADTEST]%')         as loadtest_rfqs,
       (select count(*) from public.vendor_profiles where brand_name like '[LOADTEST]%') as loadtest_vendors,
       (select count(*) from public.messages where body like 'Loadtest message%') as loadtest_messages;
