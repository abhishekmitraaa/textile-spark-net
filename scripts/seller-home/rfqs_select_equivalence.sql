-- Seller Home fixes, Task 1 (SH-006): rfqs_select reads the caller's block list once per query.
--
-- Proves the live policy shows every caller exactly the rows the previous rule showed:
--   (status = 'active' and ((vendor_id is null and (overseas rule)) or vendor_id = me) and not blocked_with_me(buyer_id))
--   or buyer_id = me or is_admin()
-- for a Free, a Gold and a VIP seller, a seller who blocked a buyer, a seller a buyer blocked, and a plain buyer,
-- with two requirements marked overseas (one inside VIP's head start, one past it). Also checks the policy now
-- reads my_block_peers(). Everything runs in one transaction and is rolled back.
--
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < scripts/seller-home/rfqs_select_equivalence.sql

begin;

-- Two overseas requirements (no overseas rows exist locally). The stamp trigger would undo the flags, so it is
-- switched off for these two updates only.
alter table public.rfqs disable trigger user;
update public.rfqs set overseas = true, overseas_vip_until = now() + interval '1 day'
 where id = (select id from public.rfqs where status = 'active' and vendor_id is null and expires_at > now()
              order by created_at desc limit 1);
update public.rfqs set overseas = true, overseas_vip_until = now() - interval '1 day'
 where id = (select id from public.rfqs where status = 'active' and vendor_id is null and expires_at > now()
               and not overseas order by created_at desc limit 1);
alter table public.rfqs enable trigger user;

create temp table eq_callers (label text, id uuid) on commit drop;

-- Buyers of the two newest open requirements: one is blocked BY a seller, the other BLOCKS a seller.
create temp table eq_buyers on commit drop as
  select buyer_id, row_number() over (order by max(created_at) desc) as n
    from public.rfqs where status = 'active' and vendor_id is null and expires_at > now()
   group by buyer_id;

insert into eq_callers
select 'free seller', v.id from public.vendor_profiles v
 where v.onboarding_complete and not exists (select 1 from public.vendor_subscriptions s where s.vendor_id = v.id)
   and v.id not in (select buyer_id from eq_buyers)
 order by v.id limit 1;
insert into eq_callers select 'gold seller', vendor_id from public.vendor_subscriptions where plan_id = 'gold' and status = 'active' order by vendor_id limit 1;
insert into eq_callers select 'vip seller', vendor_id from public.vendor_subscriptions where plan_id = 'vip' and status = 'active' order by vendor_id limit 1;
insert into eq_callers
select 'seller who blocked a buyer', v.id from public.vendor_profiles v
 where v.onboarding_complete and v.id not in (select id from eq_callers) and v.id not in (select buyer_id from eq_buyers)
 order by v.id offset 1 limit 1;
insert into eq_callers
select 'seller a buyer blocked', v.id from public.vendor_profiles v
 where v.onboarding_complete and v.id not in (select id from eq_callers) and v.id not in (select buyer_id from eq_buyers)
 order by v.id offset 2 limit 1;
insert into eq_callers select 'plain buyer', buyer_id from eq_buyers where n = 3;

insert into public.chat_blocks (blocker_id, blocked_id, created_at)
select (select id from eq_callers where label = 'seller who blocked a buyer'), (select buyer_id from eq_buyers where n = 3), now();
insert into public.chat_blocks (blocker_id, blocked_id, created_at)
select (select buyer_id from eq_buyers where n = 4), (select id from eq_callers where label = 'seller a buyer blocked'), now();

do $$
declare
  c record;
  live text;
  ref text;
begin
  if (select count(*) from eq_callers where id is not null) <> 6 then
    raise exception 'harness setup: expected 6 callers, found %', (select count(*) from eq_callers where id is not null);
  end if;

  for c in select * from eq_callers loop
    perform set_config('request.jwt.claims', json_build_object('sub', c.id, 'role', 'authenticated')::text, true);

    execute 'set local role authenticated';
    select string_agg(r.id::text, ',' order by r.id) into live from public.rfqs r;
    execute 'set local role postgres';

    -- The rule as it stood before this change, evaluated with the same claims.
    select string_agg(r.id::text, ',' order by r.id) into ref
      from public.rfqs r
     where ((r.status = 'active'
             and ((r.vendor_id is null
                   and (not r.overseas
                        or (select public.my_overseas_tier()) = 'vip'
                        or ((select public.my_overseas_tier()) = 'gold'
                            and (r.overseas_vip_until is null or now() >= r.overseas_vip_until))
                        or public.vendor_quoted_rfq(r.id)))
                  or r.vendor_id = auth.uid())
             and not public.blocked_with_me(r.buyer_id))
            or r.buyer_id = auth.uid()
            or (select public.is_admin()));

    if live is distinct from ref then
      raise exception 'rfqs_select changed for %', c.label;
    end if;
    raise notice 'same rows for % (%)', c.label, coalesce(array_length(string_to_array(live, ','), 1), 0);
  end loop;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'rfqs' and policyname = 'rfqs_select'
                    and qual like '%my_block_peers%' and qual not like '%blocked_with_me%') then
    raise exception 'rfqs_select does not read my_block_peers() yet';
  end if;
  raise notice 'rfqs_select unchanged for 6 callers';
end $$;

rollback;
