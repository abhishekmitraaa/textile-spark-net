-- A seller's follower count is the number of buyers following them (Mitra, 2026-10-10: "fix the follower count
-- issue").
--
-- vendor_profiles.followers_count was never moved by anything: a follow or an unfollow left the number where it
-- was, and production showed placeholder numbers (4,210; 8,760) for sellers with one or two followers. Since
-- 20261010060959_server_owned_columns a browser can't set it either, so only the database can keep it right.
--
-- 1. A seller can't follow their own business. NOT VALID: the one self-follow already in production stays (it is
--    not counted); every new or changed follow is checked.
-- 2. public.follows_count_sync(): AFTER INSERT, DELETE, or UPDATE OF follower_id, vendor_id on follows. One +1 or
--    -1 on the followed seller's row per follow (no count of the whole table each time), never below zero. A row in
--    follows for an account that isn't a seller changes nothing.
-- 3. Every seller's count is set to the real number, once, in this transaction. CREATE TRIGGER holds a lock on
--    follows until it commits, so no follow can land between the count and the trigger.
--
-- Harness: scripts/security/follower_count.sql; in the browser: tests/local/following.spec.ts.

-- ── 0. Guard ───────────────────────────────────────────────────────────────────────
do $guard$
begin
  if exists (select 1 from pg_trigger where tgname = 'trg_follows_count')
     or exists (select 1 from pg_constraint where conname = 'follows_not_self') then
    raise exception 'the follower count objects already exist; read them before applying this again';
  end if;
end
$guard$;

-- ── 1. No following yourself ───────────────────────────────────────────────────────
alter table public.follows add constraint follows_not_self check (follower_id <> vendor_id) not valid;

-- ── 2. Kept as follows change ──────────────────────────────────────────────────────
create or replace function public.follows_count_sync()
returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.follower_id <> old.vendor_id then
    update public.vendor_profiles set followers_count = greatest(followers_count - 1, 0) where id = old.vendor_id;
  end if;
  if tg_op in ('UPDATE', 'INSERT') and new.follower_id <> new.vendor_id then
    update public.vendor_profiles set followers_count = followers_count + 1 where id = new.vendor_id;
  end if;
  return null;
end
$function$;

create trigger trg_follows_count after insert or delete or update of follower_id, vendor_id on public.follows
  for each row execute function public.follows_count_sync();

revoke all on function public.follows_count_sync() from public, anon, authenticated;

-- ── 3. The real numbers, once ──────────────────────────────────────────────────────
update public.vendor_profiles v
   set followers_count = c.n
  from (select vp.id, count(f.vendor_id)::integer as n
          from public.vendor_profiles vp
          left join public.follows f on f.vendor_id = vp.id and f.follower_id <> f.vendor_id
         group by vp.id) c
 where c.id = v.id
   and v.followers_count is distinct from c.n;
