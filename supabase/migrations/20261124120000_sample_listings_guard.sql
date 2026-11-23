-- Sample listings (Mitra, 2026-11-24, "option 1": labelled samples on the live site; documentation/sample-listings-2026-11-24.md).
--
-- 28 sample sellers, one per main category, each with 10 listings. They show how Cosora looks; they are not for sale.
-- This migration is the guard; the rows are added by scripts/samples/seed-sample-listings.sql and removed, all of
-- them, by scripts/samples/remove-sample-listings.sql.
--
-- 1. admin.sample_vendors lists every sample seller. public.is_sample_vendor(id) answers anyone (the product and store
--    pages show a "Sample listing" notice with it).
-- 2. Nobody can reach a sample seller: a chat, a requirement sent to it, or a review of it or its listings is refused
--    in the database. Sample sellers have no phone or WhatsApp, so there is no number to reveal, and their accounts
--    are banned in auth, so nobody signs in as one.

begin;

create table admin.sample_vendors (
  vendor_id  uuid primary key references public.profiles (id) on delete cascade,
  note       text not null default 'Sample seller (2026-11-24)',
  created_at timestamptz not null default now()
);
alter table admin.sample_vendors enable row level security;
comment on table admin.sample_vendors is
  'Sample sellers whose listings show how Cosora looks (2026-11-24). They take no messages, requirements or reviews (admin.refuse_sample_contact). Remove them all with scripts/samples/remove-sample-listings.sql.';

create or replace function public.is_sample_vendor(p_vendor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from admin.sample_vendors s where s.vendor_id = p_vendor)
$function$;
revoke all on function public.is_sample_vendor(uuid) from public;
grant execute on function public.is_sample_vendor(uuid) to anon, authenticated;

-- The whole list, for the app's cards and pages: 28 ids, read once per visit (src/lib/samples.ts).
create or replace function public.sample_vendor_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(array_agg(s.vendor_id order by s.vendor_id), '{}'::uuid[]) from admin.sample_vendors s
$function$;
revoke all on function public.sample_vendor_ids() from public;
grant execute on function public.sample_vendor_ids() to anon, authenticated;

-- One guard for every way of reaching a seller. tg_argv[0] names the column that holds the seller (or the product).
create or replace function admin.refuse_sample_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target uuid;
begin
  case tg_argv[0]
    when 'conversation' then
      if exists (select 1 from admin.sample_vendors s where s.vendor_id in (new.user_a, new.user_b)) then
        raise exception 'This is a sample seller, shown to illustrate Cosora. It can''t be contacted.' using errcode = '42501', hint = 'sample_seller';
      end if;
      return new;
    when 'vendor' then v_target := new.vendor_id;
    when 'product' then select p.vendor_id into v_target from public.products p where p.id = new.product_id;
  end case;
  if v_target is not null and exists (select 1 from admin.sample_vendors s where s.vendor_id = v_target) then
    raise exception 'This is a sample listing, shown to illustrate Cosora. Its seller can''t be contacted or reviewed.' using errcode = '42501', hint = 'sample_seller';
  end if;
  return new;
end
$function$;
revoke all on function admin.refuse_sample_contact() from public, anon, authenticated;

drop trigger if exists trg_conversations_no_sample on public.conversations;
create trigger trg_conversations_no_sample before insert on public.conversations
  for each row execute function admin.refuse_sample_contact('conversation');

drop trigger if exists trg_rfqs_no_sample on public.rfqs;
create trigger trg_rfqs_no_sample before insert or update of vendor_id on public.rfqs
  for each row when (new.vendor_id is not null) execute function admin.refuse_sample_contact('vendor');

drop trigger if exists trg_reviews_no_sample on public.reviews;
create trigger trg_reviews_no_sample before insert on public.reviews
  for each row execute function admin.refuse_sample_contact('vendor');

drop trigger if exists trg_product_reviews_no_sample on public.product_reviews;
create trigger trg_product_reviews_no_sample before insert on public.product_reviews
  for each row execute function admin.refuse_sample_contact('product');

-- Self-check.
do $check$
begin
  if public.is_sample_vendor(gen_random_uuid()) then
    raise exception 'sample_listings_guard: is_sample_vendor true for a stranger';
  end if;
  if not has_function_privilege('anon', 'public.is_sample_vendor(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.sample_vendor_ids()', 'execute') then
    raise exception 'sample_listings_guard: visitors must be able to ask';
  end if;
  if (select count(*) from pg_trigger where tgname in
        ('trg_conversations_no_sample', 'trg_rfqs_no_sample', 'trg_reviews_no_sample', 'trg_product_reviews_no_sample')) <> 4 then
    raise exception 'sample_listings_guard: a guard trigger is missing';
  end if;
end
$check$;

commit;
