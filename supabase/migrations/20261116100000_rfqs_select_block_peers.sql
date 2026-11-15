-- Seller Home fixes, Task 1 (SH-006, documentation/seller-home-audit-2026-11-15.md).
--
-- rfqs_select called blocked_with_me(buyer_id) for every row. It is SECURITY DEFINER with a search_path, so Postgres
-- never inlines it: 120 open requirements cost 12 ms without the check and 22 ms with it, growing with every
-- requirement, and Seller Home read the table twice per load. The caller's blocks are now read once per query
-- (claude.md: "Read a per-user value once with (select fn())") and each row is compared with that list.
--
-- Who can read which requirement does not change: scripts/seller-home/rfqs_select_equivalence.sql compares the
-- live policy with the previous rule for six callers (Free, Gold, VIP, blocker, blocked, buyer).

-- Everyone the caller blocked, or was blocked by, while the block stands. Empty when signed out.
create or replace function public.my_block_peers()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.peer), '{}'::uuid[])
    from (
      select b.blocked_id as peer from public.chat_blocks b
       where b.blocker_id = (select auth.uid()) and b.unblocked_at is null
      union all
      select b.blocker_id from public.chat_blocks b
       where b.blocked_id = (select auth.uid()) and b.unblocked_at is null
    ) x;
$$;

revoke all on function public.my_block_peers() from public, anon;
grant execute on function public.my_block_peers() to authenticated;

comment on function public.my_block_peers() is
  'Profiles the caller blocked or was blocked by (open blocks). Read once per query in policies: (select public.my_block_peers()).';

alter policy rfqs_select on public.rfqs using (
  ((status = 'active'::public.rfq_status)
   and (((vendor_id is null)
         and ((not overseas)
              or ((select public.my_overseas_tier()) = 'vip'::text)
              or (((select public.my_overseas_tier()) = 'gold'::text)
                  and ((overseas_vip_until is null) or (now() >= overseas_vip_until)))
              or public.vendor_quoted_rfq(id)))
        or (vendor_id = (select auth.uid())))
   -- The cast makes the subquery one array value: `= any (subquery)` would read it as a set of rows.
   and (not coalesce(buyer_id = any (((select public.my_block_peers()))::uuid[]), false)))
  or (buyer_id = (select auth.uid()))
  or (select public.is_admin())
);

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'rfqs' and policyname = 'rfqs_select'
                    and qual like '%my_block_peers%' and qual not like '%blocked_with_me%') then
    raise exception 'rfqs_select self-check: the policy must read my_block_peers() and not blocked_with_me()';
  end if;
  if has_function_privilege('anon', 'public.my_block_peers()', 'execute') then
    raise exception 'my_block_peers self-check: anon must not execute it';
  end if;
end $$;
