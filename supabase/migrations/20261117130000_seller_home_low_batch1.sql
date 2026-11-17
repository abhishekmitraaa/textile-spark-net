-- Seller Home audit, Low items batch 1 (2026-11-17): the database part.
-- Plan and record: documentation/seller-home-low-fixes-plan-2026-11-17.md.
--
--   SH-040  the notifications column guard, live in the database and in no migration file, is recorded here
--   SH-047  a listing's status change rescores its seller whatever the UPDATE named
--   SH-067  the 3-PDF limit is counted under a lock per listing
--   SH-081  a quote's price, and its MOQ when given, are above 0
--   SH-051  my_profile_score(): the caller's own score, before 20261117130100 revokes the column from browsers
--
-- SH-051 (the profile score stops being readable by browsers) is its own migration, 20261117130100, applied only after
-- the app that no longer selects the column is live.

-- ── SH-040 ──
-- What was live: a browser may change only `read` on its own notifications (the update policy scopes the row). It
-- named the other columns one by one; it now compares the whole row less `read`, so a column added later is covered too.
create or replace function public.enforce_notification_update_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (to_jsonb(new) - 'read') is distinct from (to_jsonb(old) - 'read') then
    raise exception 'Only the read column may be changed on a notification'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notifications_update_columns on public.notifications;
create trigger trg_notifications_update_columns
  before update on public.notifications
  for each row execute function public.enforce_notification_update_columns();

-- ── SH-047 ──
-- `AFTER UPDATE OF status, vendor_id` fires only when the UPDATE names those columns. listing_edit_rereview sets
-- status in a BEFORE trigger, so an API edit that didn't name it moved the listing to review and left the score stale.
-- The update trigger now fires on any update and checks the values.
drop trigger if exists trg_products_vendor_score on public.products;
drop trigger if exists trg_products_vendor_score_update on public.products;
create trigger trg_products_vendor_score
  after insert or delete on public.products
  for each row execute function admin.vendor_score_refresh();
create trigger trg_products_vendor_score_update
  after update on public.products
  for each row
  when (old.status is distinct from new.status or old.vendor_id is distinct from new.vendor_id)
  execute function admin.vendor_score_refresh();

-- ── SH-067 ──
-- Two uploads at once each counted 2 and both went in. Counted under a lock per listing (claude.md: "A limit that
-- counts rows must be checked under a lock").
create or replace function public.product_documents_cap()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended('cosora.product_documents:' || new.product_id::text, 0));
  if (select count(*) from public.product_documents d where d.product_id = new.product_id) >= 3 then
    raise exception 'A listing can have at most 3 PDFs.' using errcode = '23514';
  end if;
  return new;
end
$function$;

-- ── SH-081 ──
-- The forms tested only `if (!price)`, so -5 went in. Not valid: rows written before are left as they are.
alter table public.quotes drop constraint if exists quotes_price_positive;
alter table public.quotes add constraint quotes_price_positive
  check (price_per_unit is null or price_per_unit > 0) not valid;
alter table public.quotes drop constraint if exists quotes_moq_positive;
alter table public.quotes add constraint quotes_moq_positive
  check (moq is null or moq > 0) not valid;

-- ── SH-051, first half ──
-- The caller's own stored score: what the seller's export and the specs that compare the page with the database read
-- once 20261117130100 takes the column away from browsers. Nobody else's.
create or replace function public.my_profile_score()
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select v.profile_score from public.vendor_profiles v where v.id = (select auth.uid())
$function$;
revoke all on function public.my_profile_score() from public, anon;
grant execute on function public.my_profile_score() to authenticated;

-- Self-check.
do $check$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_notifications_update_columns' and not tgisinternal) then
    raise exception 'SH-040 self-check: the notifications guard is missing';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.products'::regclass
        and tgname in ('trg_products_vendor_score', 'trg_products_vendor_score_update')) <> 2 then
    raise exception 'SH-047 self-check: the score triggers are missing';
  end if;
  if position('pg_advisory_xact_lock' in pg_get_functiondef('public.product_documents_cap'::regproc)) = 0 then
    raise exception 'SH-067 self-check: the PDF limit takes no lock';
  end if;
end
$check$;
