-- Serious fixes from the 2026-10-20 admin audit (Mitra: "tackle all the serious issues").
--
-- 1. Requirement photos: the app lets a buyer attach 5 (RFQ_MAX_IMAGES), but rfqs refused more than 3
--    (rfqs_images_max_3_chk), so approving a reviewed requirement with 4 or 5 photos failed in
--    admin_rfq_review, and a direct request with 4 or 5 failed on insert. Both tables now allow 5, the
--    number the app promises (rfq_submissions allowed 6, which approval could never copy).
-- 2. Requirement photo addresses are buyer-written text that Cosora-Admin (Leads) and the seller's lead
--    screens put in an <a href>. A "javascript:" entry ran in the session of whoever clicked it. Only
--    http(s) addresses are stored now (http for the local stack; production uploads are https).
-- 3. admin_profile_search / admin_profile_emails checked is_admin() only: any staff role (delivery,
--    ads moderation, account managers) could list up to 500 accounts' emails a call, though Cosora-Admin
--    shows those pages to fewer roles. Each now admits the roles whose pages call it, and the search
--    term's % and _ match themselves instead of anything.
--
-- The pre-check stops the file if either function isn't the version this was written against.

do $pin$
begin
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.admin_profile_search(text,integer)'::regprocedure), chr(13), ''))
     <> '3d61a7dadacba8192b262a7421b4f2f8' then
    raise exception 'pre-check: public.admin_profile_search is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.admin_profile_emails(uuid[])'::regprocedure), chr(13), ''))
     <> 'f303f5e2c119f3d8604e06a515c69c30' then
    raise exception 'pre-check: public.admin_profile_emails is not the version this migration was written against';
  end if;
end
$pin$;

-- ── 1. Five photos ───────────────────────────────────────────────────────────
alter table public.rfqs drop constraint rfqs_images_max_3_chk;
alter table public.rfqs add constraint rfqs_images_max_5_chk
  check (images is null or cardinality(images) <= 5);

alter table public.rfq_submissions drop constraint rfq_submissions_images;
alter table public.rfq_submissions add constraint rfq_submissions_images
  check (images is null or cardinality(images) <= 5);

-- ── 2. Web addresses only ────────────────────────────────────────────────────
create or replace function public.web_urls_only(p_urls text[])
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce(bool_and(u ~* '^https?://[^[:space:]]+$'), true) from unnest(p_urls) as u
$$;

alter table public.rfqs add constraint rfqs_image_urls_web
  check (public.web_urls_only(images) and (image is null or image ~* '^https?://[^[:space:]]+$'));
alter table public.rfq_submissions add constraint rfq_submissions_image_urls_web
  check (public.web_urls_only(images) and (image is null or image ~* '^https?://[^[:space:]]+$'));

-- ── 3. Account lookups for the roles that use them ───────────────────────────
-- admin_profile_search: Accounts, Chats (super_admin, support), Feature switches and Support settings
-- (super_admin, manager, support).
CREATE OR REPLACE FUNCTION public.admin_profile_search(p_term text, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, full_name text, email text, account_status account_status_type, active_role text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_term text := btrim(coalesce(p_term, ''));
  v_like text;
begin
  if not coalesce(public.is_admin(), false)
     or public.admin_role() is null
     or public.admin_role() not in ('super_admin', 'support', 'manager') then
    raise exception 'Searching accounts requires the super admin, support or manager role' using errcode = '42501';
  end if;
  if length(v_term) < 2 then
    return;
  end if;
  -- % and _ in the term match themselves: "__" used to match every account.
  v_like := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, p.full_name, p.email, p.account_status, p.active_role, p.created_at
    from public.profiles p
    where p.full_name ilike v_like
       or p.email ilike v_like
       or p.id::text = lower(v_term)
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$function$;

-- admin_profile_emails: chat pages (super_admin, support) and the account-status panel on Accounts,
-- support requests and Vendors (super_admin, support, manager, vendor_ops).
CREATE OR REPLACE FUNCTION public.admin_profile_emails(p_ids uuid[])
 RETURNS TABLE(id uuid, full_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce(public.is_admin(), false)
     or public.admin_role() is null
     or public.admin_role() not in ('super_admin', 'support', 'manager', 'vendor_ops') then
    raise exception 'Reading account emails requires the super admin, support, manager or vendor operations role' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.email
    from public.profiles p
    where p.id = any (coalesce(p_ids, '{}'::uuid[]));
end;
$function$;
