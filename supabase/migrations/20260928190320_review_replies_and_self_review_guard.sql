-- Reviews pipeline (2026-09-29): seller replies on product reviews, no self-reviews,
-- and reply columns only the seller can write.
--
-- 1. product_reviews gets reply_body / replied_at, like reviews already has.
-- 2. reply_to_product_review() is the one writer of those columns, as
--    reply_to_review() is for reviews. Both set a transaction-local flag that
--    the guard below reads, and both refuse a suspended account.
-- 3. guard_review_write() on reviews and product_reviews:
--    - INSERT: a seller can't review their own store or their own product (42501);
--    - UPDATE: the subject and the author are fixed (moving a review to another
--      vendor would leave the old vendor's aggregate stale);
--    - reply columns keep their stored value unless a reply RPC is writing.
--      Before this, reviews_update_own let a buyer write a "seller reply" onto
--      their own review from the browser.
--    anonymize_account() only changes reviewer_name, so it passes untouched.

alter table public.product_reviews
  add column if not exists reply_body text,
  add column if not exists replied_at timestamptz;

create or replace function public.guard_review_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  owner uuid;
  replying boolean := coalesce(current_setting('cosora.review_reply', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'reviews' then
      owner := new.vendor_id;
    else
      select p.vendor_id into owner from public.products p where p.id = new.product_id;
    end if;
    if owner is not null and owner = new.buyer_id then
      raise exception 'You can''t review your own business' using errcode = '42501';
    end if;
    if not replying then
      new.reply_body := null;
      new.replied_at := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.buyer_id is distinct from old.buyer_id then
    raise exception 'A review''s author can''t be changed' using errcode = '42501';
  end if;
  if tg_table_name = 'reviews' then
    if new.vendor_id is distinct from old.vendor_id then
      raise exception 'A review can''t be moved to another seller' using errcode = '42501';
    end if;
  elsif new.product_id is distinct from old.product_id then
    raise exception 'A review can''t be moved to another product' using errcode = '42501';
  end if;
  if not replying then
    new.reply_body := old.reply_body;
    new.replied_at := old.replied_at;
  end if;
  return new;
end $function$;

revoke all on function public.guard_review_write() from public, anon, authenticated;

drop trigger if exists trg_guard_review_write on public.reviews;
create trigger trg_guard_review_write
  before insert or update on public.reviews
  for each row execute function public.guard_review_write();

drop trigger if exists trg_guard_review_write on public.product_reviews;
create trigger trg_guard_review_write
  before insert or update on public.product_reviews
  for each row execute function public.guard_review_write();

-- Same signature as before, so this replaces rather than overloads.
create or replace function public.reply_to_review(review_id uuid, reply text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null or not public.account_is_active(auth.uid()) then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  if coalesce(btrim(reply), '') = '' then
    raise exception 'A reply can''t be empty' using errcode = '22023';
  end if;
  perform set_config('cosora.review_reply', 'on', true);
  update public.reviews
     set reply_body = btrim(reply), replied_at = now()
   where id = review_id and vendor_id = auth.uid();
  if not found then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  perform set_config('cosora.review_reply', '', true);
end $function$;

create or replace function public.reply_to_product_review(review_id uuid, reply text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null or not public.account_is_active(auth.uid()) then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  if coalesce(btrim(reply), '') = '' then
    raise exception 'A reply can''t be empty' using errcode = '22023';
  end if;
  perform set_config('cosora.review_reply', 'on', true);
  update public.product_reviews pr
     set reply_body = btrim(reply), replied_at = now()
    from public.products p
   where pr.id = review_id and p.id = pr.product_id and p.vendor_id = auth.uid();
  if not found then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  perform set_config('cosora.review_reply', '', true);
end $function$;

revoke all on function public.reply_to_review(uuid, text) from public, anon, authenticated;
revoke all on function public.reply_to_product_review(uuid, text) from public, anon, authenticated;
grant execute on function public.reply_to_review(uuid, text) to authenticated;
grant execute on function public.reply_to_product_review(uuid, text) to authenticated;

do $check$
declare f regprocedure;
begin
  foreach f in array array['public.reply_to_review(uuid, text)'::regprocedure,
                           'public.reply_to_product_review(uuid, text)'::regprocedure] loop
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception '% is still executable by anon', f;
    end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% is not executable by authenticated', f;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.guard_review_write()'::regprocedure, 'EXECUTE') then
    raise exception 'guard_review_write() is executable by authenticated';
  end if;
end $check$;
