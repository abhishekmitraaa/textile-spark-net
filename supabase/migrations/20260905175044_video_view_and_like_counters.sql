-- Real engagement counters for product_videos.
--
-- VIEWS — exactly the increment_product_view shape. A buyer does not own the
-- video row and RLS gives them no UPDATE on product_videos, so the +1 has to
-- come from a SECURITY DEFINER function that scopes itself to status='live'
-- server-side. `language sql` and the `p uuid` parameter name are copied from
-- increment_product_view verbatim so the two read as one pattern; the only
-- deliberate difference is the ACL, which revokes PUBLIC and grants the two
-- roles that actually call it (increment_product_view still carries a stray
-- PUBLIC grant from before that convention existed — not touched here, that is
-- a products change, not a videos one).
--
-- This is what makes fetchVideoCloseUps's existing `.order("views_count")` a
-- real sort key. Until now every live row sat at 0 and the ordering was an
-- arbitrary tiebreak.
--
-- Note the moderation trigger does not interfere: enforce_product_videos_
-- moderation short-circuits on `current_user <> 'authenticated'`, and a
-- SECURITY DEFINER function owned by postgres runs as postgres. It would not
-- have fired anyway — it only guards status and rejection_reason — but the
-- short-circuit means the counter path never even evaluates is_admin().
--
-- LIKES — deliberately NOT a bare increment_video_like() twin.
--
-- A view is monotonic: it happened, it cannot un-happen, and +1 forever is the
-- correct semantic. A like is a TOGGLE. Modelling it as a counter-only RPC
-- gives no way to undo one, no way to answer "did I already like this?" when
-- the buyer comes back tomorrow, and no source of truth to rebuild the count
-- from if it ever drifts — the viewer's heart would be a per-session lie on
-- top of a number that only ever grows.
--
-- So likes get a per-buyer join table with the same RLS shape as saved_items
-- (`for all using/with check buyer_id = auth.uid()`), and product_videos.
-- likes_count stays as the denormalised counter the feed reads and sorts on,
-- maintained by an AFTER trigger. The buyer writes only their own row; nothing
-- lets them write the counter directly. Same reason saved_videos in the next
-- migration is a table and not a column.

-- ── Views ────────────────────────────────────────────────────────────────────
create or replace function public.increment_video_view(p uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.product_videos set views_count = views_count + 1 where id = p and status = 'live';
$function$;

revoke all on function public.increment_video_view(uuid) from public;
grant execute on function public.increment_video_view(uuid) to authenticated, anon;

-- ── Likes ────────────────────────────────────────────────────────────────────
create table if not exists public.video_likes (
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.product_videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (buyer_id, video_id)
);

alter table public.video_likes enable row level security;

-- Identical to saved_items.sitems_all. A buyer sees and writes only their own
-- likes; the public aggregate lives in product_videos.likes_count, which is
-- world-readable exactly as it already was.
drop policy if exists video_likes_owner on public.video_likes;
create policy video_likes_owner on public.video_likes for all
  using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());

-- Counter maintenance. SECURITY DEFINER because the whole point is that the
-- liking buyer has no UPDATE on product_videos — the same reason
-- increment_video_view above is definer.
--
-- greatest(...,0) guards against drift below zero: likes_count predates this
-- table and is not derived from it, so an unlike of a like that was never
-- counted must not push a legitimately-zero row negative.
create or replace function public.sync_video_likes_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    update public.product_videos
       set likes_count = likes_count + 1
     where id = new.video_id;
    return new;
  end if;
  -- DELETE. When the parent video row is what is being deleted, the FK cascade
  -- removes these children and this update matches zero rows — harmless.
  update public.product_videos
     set likes_count = greatest(likes_count - 1, 0)
   where id = old.video_id;
  return old;
end;
$function$;

drop trigger if exists trg_video_likes_count on public.video_likes;
create trigger trg_video_likes_count
after insert or delete on public.video_likes
for each row execute function public.sync_video_likes_count();

-- Applied separately as `revoke_public_execute_on_sync_video_likes_count`
-- (ledger 20260905182854), folded in here so the file is self-contained.
--
-- A SECURITY DEFINER function with PUBLIC EXECUTE is the shape a reviewer
-- flags, even though calling this one directly raises 'can only be called as a
-- trigger'. Postgres checks EXECUTE at CREATE TRIGGER time rather than on each
-- fire, so revoking does not stop the trigger — re-verified live after the
-- revoke: a like still sets likes_count to 1 and an unlike still returns it
-- to 0. Matches the convention the moderation RPCs already follow.
revoke all on function public.sync_video_likes_count() from public;
