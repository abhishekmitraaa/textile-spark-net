-- Account deletion counts someone as a seller only when they really are one (buyer sign-up audit 2026-11-13,
-- item 11c; plan task A3; D5).
--
-- Ticking "Seller" on Register leaves a bare vendor_profiles row and nothing else, and every such buyer was told
-- "Seller accounts can't be deleted here", and their deletion would have failed in the sweep anyway.
--   admin.is_real_seller(p)       registered (onboarding_complete, or one of Cosora's exempt demo sellers), or holding
--                                 seller content or records: listings, videos, catalogues, ads, quotes, plans, orders,
--                                 a signed contract, store reviews, or requests addressed to the store.
--                                 Not seller_registered(): that answers true for everyone while its switch is off.
--   account_deletion_blocker()    its 'vendor' arm uses it.
--   anonymize_account()           refuses a real seller as before; a bare row is removed before the identity is
--                                 scrubbed (it holds a brand name); the scrub also clears the sign-up answers
--                                 (buyer_role, preferred_interest_other, preferred_locations: 20261114100150 adds the last).
-- Support's "has a store" label moves to the same rule in 20261114100300.

create or replace function admin.is_real_seller(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from public.vendor_profiles v where v.id = p and v.onboarding_complete)
      or exists (select 1 from admin.registration_exempt e where e.vendor_id = p)
      or exists (select 1 from public.products x where x.vendor_id = p)
      or exists (select 1 from public.product_videos x where x.vendor_id = p)
      or exists (select 1 from public.catalogues x where x.vendor_id = p)
      or exists (select 1 from public.advertisements x where x.vendor_id = p)
      or exists (select 1 from public.quotes x where x.vendor_id = p)
      or exists (select 1 from public.vendor_subscriptions x where x.vendor_id = p)
      or exists (select 1 from public.subscription_payment_orders x where x.vendor_id = p)
      or exists (select 1 from public.vendor_contracts x where x.vendor_id = p)
      or exists (select 1 from public.reviews x where x.vendor_id = p)
      or exists (select 1 from public.rfqs x where x.vendor_id = p)
$function$;

revoke all on function admin.is_real_seller(uuid) from public, anon, authenticated;

do $guard$
begin
  -- The bodies 20260923213225 (account_deletion_blocker) and 20260923200739 (anonymize_account) create (LF).
  if (select md5(prosrc) from pg_proc where oid = 'public.account_deletion_blocker'::regproc)
     <> '770a3a154eba086e9c6d26fa52f5b504' then
    raise exception 'guard: account_deletion_blocker() is not the body 20260923213225 created';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.anonymize_account'::regproc)
     <> 'd01b9e5c8b9cfd1a3a88ae4620be3629' then
    raise exception 'guard: anonymize_account() is not the body 20260923200739 created';
  end if;
end
$guard$;

create or replace function public.account_deletion_blocker(p_user uuid)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case
    when p.id is null                                                         then 'not_found'
    when p.account_status = 'deleted'                                         then 'deleted'
    when exists (select 1 from admin.admin_users a where a.id = x.uid)        then 'admin'
    when admin.is_real_seller(x.uid)                                          then 'vendor'
    when p.account_status <> 'active'                                         then 'suspended'
    when cardinality(public.account_deletion_channels(x.uid)) = 0             then 'no_contact'
    else null
  end
  from (select p_user as uid) x
  left join public.profiles p on p.id = x.uid;
$function$;

CREATE OR REPLACE FUNCTION public.anonymize_account(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status public.account_status_type;
begin
  select account_status into v_status from public.profiles where id = p_user for update;
  if not found then
    raise exception 'profile % not found', p_user;
  end if;
  if v_status = 'deleted' then
    return;  -- already done; the sweep may retry a row
  end if;
  -- The same refusals as account_deletion_blocker(), re-checked here: any of them
  -- could have become true during the 14 days.
  if v_status <> 'active' then
    raise exception 'account % is %: deletion waits for support', p_user, v_status;
  end if;
  if exists (select 1 from admin.admin_users where id = p_user) then
    raise exception 'account % is an admin: not deleted', p_user;
  end if;
  if admin.is_real_seller(p_user) then
    raise exception 'account % is a seller: not deleted', p_user;
  end if;
  -- A bare row (Register's "Seller" tick, nothing behind it) holds a brand name: it goes with the identity.
  delete from public.vendor_profiles where id = p_user;

  -- The shared identity row. Counterparties see "Deleted user" on the RFQs, quotes,
  -- chats and reviews that stay.
  update public.profiles
     set full_name = 'Deleted user',
         email = null,
         phone = null,
         avatar_url = null,
         account_status = 'deleted'
   where id = p_user;

  update public.buyer_profiles
     set display_name = null, company = null, city = null, job_title = null,
         department = null, business_type = null, website = null, industry = null,
         street = null, business_city = null, state = null, postal_code = null,
         country = null, gstin = null, pan = null,
         social = '{}'::jsonb, preferred_categories = '{}',
         -- What sign-up and For You asked (2026-11-14): the typed "Others" words were never scrubbed.
         preferred_interest_other = null, buyer_role = null, preferred_locations = '{}'
   where id = p_user;

  -- Copies of the name on the review rows themselves.
  update public.reviews         set reviewer_name = 'Deleted user', reviewer_company = null where buyer_id = p_user;
  update public.product_reviews set reviewer_name = 'Deleted user' where buyer_id = p_user;
  update public.service_reviews set reviewer_name = 'Deleted user' where buyer_id = p_user;

  -- Private activity: this person's own rows, which are no one else's history
  -- (MPF-7). saved_folder_items go with their folders (ON DELETE CASCADE).
  delete from public.saved_items     where buyer_id    = p_user;
  delete from public.saved_folders   where buyer_id    = p_user;
  delete from public.saved_videos    where buyer_id    = p_user;
  delete from public.follows         where follower_id = p_user;
  delete from public.recently_viewed where buyer_id    = p_user;
  delete from public.video_likes     where buyer_id    = p_user;
  delete from public.notifications   where profile_id  = p_user;
  -- Vendors' analytics keep the events; only the link to the person goes.
  update public.engagement_events set viewer_id = null where viewer_id = p_user;

  -- The login. Sessions alone are not enough: with the email and identities left,
  -- the user signs straight back in to this row. The four GoTrue string columns
  -- are left as '' (never NULL: GoTrue answers 500 on NULL there). The ban is a
  -- finite 100 years, GoTrue's own idiom for "permanent": an 'infinity'
  -- timestamp risks GoTrue (Go) failing to read the row, which would break the
  -- admin user listing too, not just this account.
  delete from auth.sessions        where user_id = p_user;
  delete from auth.refresh_tokens  where user_id = p_user::text;
  delete from auth.mfa_factors     where user_id = p_user;
  delete from auth.one_time_tokens where user_id = p_user;
  delete from auth.identities      where user_id = p_user;
  update auth.users
     set email = null,
         phone = null,
         encrypted_password = '',
         email_change = '',
         email_change_token_new = '',
         phone_change = '',
         raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '100 years'
   where id = p_user;
end;
$function$;

revoke all on function public.account_deletion_blocker(uuid) from public, anon, authenticated, service_role;
revoke all on function public.anonymize_account(uuid) from public, anon, authenticated, service_role;
