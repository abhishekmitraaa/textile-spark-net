-- Durable video saves.
--
-- The bookmark in VideoCloseUpsViewer was a `useState<Set<string>>` and nothing
-- else: a refresh lost it, a second device never had it, and it did not match
-- how a saved PRODUCT already behaves (saved_items, backed by the DB and
-- hydrated on sign-in). Same RLS shape as saved_items — `for all` on
-- `buyer_id = auth.uid()`, both USING and WITH CHECK, so a buyer reads and
-- writes only their own saves — and the same composite primary key, which is
-- what makes the client-side upsert idempotent without a select first.
--
-- No folders here, unlike saved_items. Saved products live in the
-- saved_folders / saved_folder_items model; a video closeup has no folder
-- concept in the UI and inventing one to match would be a bigger surface than
-- the feature needs. That asymmetry is the reason the client helpers live in
-- lib/queries/videoEngagement.ts rather than being bolted onto savedStore.ts,
-- whose entire state shape is folders-of-ListingProducts.
--
-- The in-session `bookmarkedVideoIds` set that VideoCloseUpsPage/NewArrivals
-- pass down is NOT replaced by this table — it stays, because it answers a
-- different question. That set is "what caught this buyer's eye in the last
-- five minutes", which is what rankVideoCloseUps wants. This table is "what
-- did they deliberately keep." A save now feeds both.

create table if not exists public.saved_videos (
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.product_videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (buyer_id, video_id)
);

alter table public.saved_videos enable row level security;

drop policy if exists saved_videos_owner on public.saved_videos;
create policy saved_videos_owner on public.saved_videos for all
  using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());
