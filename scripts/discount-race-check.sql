-- ─────────────────────────────────────────────────────────────────────────────
-- DISCOUNT RACE CHECK (admin completion Phase 10, 2026-09-29): real concurrency.
--
-- Harness 14 proves the reservation logic one call at a time inside one transaction. This
-- proves it across separate connections: the database fires simultaneous HTTP requests at
-- PostgREST's /rpc/discount_reserve (pg_net, with the service-role key from Vault, the way
-- the snapshot triggers call the edge functions). PostgREST runs each request as its own
-- transaction, so they contend for the code's row lock for real.
--
--   LAST  ten vendors, a code with one use left       exactly one reserves; nine "exhausted"
--   SAME  one vendor, ten checkouts on the same code  all ten succeed, and exactly one stays
--                                                     open: each replaced the one before
--
-- Evidence the requests overlapped: in SAME, a reservation released by a transaction that
-- began before the reservation itself was created. That transaction can only have been
-- waiting on the lock. (First run, 2026-09-29: LAST 1 reserved / 9 exhausted; SAME 1 open /
-- 9 released, starts spread over 64 ms, 3 released by an earlier-starting transaction.)
--
-- Run the four steps as separate statements, in order: pg_net sends a request only after
-- the transaction that queued it commits. Replace SUFFIX everywhere with fresh random text.
-- Nothing is left behind: step 4 deletes the codes and their redemptions.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. The test codes: 20 minutes long, ad lines, marked [TEST].
insert into admin.discount_codes (code, kind, value, applies_to, max_uses, per_vendor_limit, valid_to, note)
values ('TESTRACE-LAST-SUFFIX', 'flat', 100, 'ad_purchase', 1, 1, now() + interval '20 minutes',
        '[TEST] Phase 10 race check (ten vendors, one use), deleted after the run'),
       ('TESTRACE-SAME-SUFFIX', 'flat', 100, 'ad_purchase', null, 1, now() + interval '20 minutes',
        '[TEST] Phase 10 race check (one vendor, ten checkouts), deleted after the run');

-- 2. Fire the requests. Note the request ids it returns.
with k as (select s.decrypted_secret as key from vault.decrypted_secrets s where s.name = 'service_role_key'),
v as (select p.id, row_number() over (order by p.id) as n from public.vendor_profiles p limit 10),
reqs as (
  select 'LAST' as race, v.n, net.http_post(
           url := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/rest/v1/rpc/discount_reserve',
           headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', k.key, 'Authorization', 'Bearer ' || k.key),
           body := jsonb_build_object('p_code', 'TESTRACE-LAST-SUFFIX', 'p_vendor', v.id, 'p_order_kind', 'ad',
                                      'p_order_ref', 'testrace_last_' || v.n, 'p_ad_rupees', 1000),
           timeout_milliseconds := 20000) as req_id
    from v, k
  union all
  select 'SAME', g.n, net.http_post(
           url := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/rest/v1/rpc/discount_reserve',
           headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', k.key, 'Authorization', 'Bearer ' || k.key),
           body := jsonb_build_object('p_code', 'TESTRACE-SAME-SUFFIX', 'p_vendor', '22222222-2222-2222-2222-222222222222',
                                      'p_order_kind', 'ad', 'p_order_ref', 'testrace_same_' || g.n, 'p_ad_rupees', 1000),
           timeout_milliseconds := 20000)
    from generate_series(1, 10) as g(n), k
)
select race, count(*) as queued, min(req_id) as first_id, max(req_id) as last_id from reqs group by race order by race;

-- 3. A few seconds later: the answers, and what the table holds.
select c.code,
       count(*) filter (where r.status = 'reserved') as open_reservations,
       count(*) filter (where r.status = 'released') as released,
       round(extract(epoch from max(r.reserved_at) - min(r.reserved_at)) * 1000, 1) as tx_start_spread_ms,
       count(*) filter (where r.released_at < r.reserved_at) as released_by_a_tx_that_began_earlier
  from admin.discount_redemptions r join admin.discount_codes c on c.id = r.code_id
 where c.code like 'TESTRACE-%-SUFFIX'
 group by c.code order by c.code;
-- and, with the ids from step 2: the refusals
--   select r.id, r.status_code, r.content::jsonb ->> 'ok', r.content::jsonb ->> 'reason'
--     from net._http_response r where r.id between <first_id> and <last_id> order by r.id;

-- 4. Clean up.
with d1 as (delete from admin.discount_redemptions r using admin.discount_codes c
             where c.id = r.code_id and c.code like 'TESTRACE-%-SUFFIX' returning r.id)
select count(*) as redemptions_deleted from d1;
delete from admin.discount_codes c where c.code like 'TESTRACE-%-SUFFIX' and c.note like '[TEST]%';
