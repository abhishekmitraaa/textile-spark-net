-- Cosora-Admin review, Low batch 3 (AR-L41), 2026-11-23: staff see a seller's bulk imports and its contact reveals.
-- Read-only additions: two definer readers and one index. Nothing existing is changed.

-- "Who revealed this seller's number" reads by vendor; the table's keys lead with the caller.
create index if not exists vendor_contact_reveals_vendor_time_idx
  on admin.vendor_contact_reveals (vendor_id, revealed_at desc);

-- A seller's bulk imports (`import_products()` writes one row per file), newest first, at most 100.
create or replace function public.admin_vendor_import_batches(p_vendor uuid, p_limit integer default 20)
returns table (id uuid, file_name text, as_draft boolean, total integer, created integer, failed integer,
               errors jsonb, created_at timestamptz)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops', 'support'), false) then
    raise exception 'not authorized: bulk imports require the super_admin, vendor_ops or support role' using errcode = '42501';
  end if;
  return query
  select b.id, b.file_name, b.as_draft, b.total, b.created, b.failed,
         -- The first 20 row errors are enough to see what went wrong.
         case when jsonb_typeof(b.errors) = 'array'
              then (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(b.errors) e limit 20) x)
              else b.errors end,
         b.created_at
  from public.product_import_batches b
  where b.vendor_id = p_vendor
  order by b.created_at desc, b.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end $$;

revoke all on function public.admin_vendor_import_batches(uuid, integer) from public, anon;
grant execute on function public.admin_vendor_import_batches(uuid, integer) to authenticated;

-- Contact reveals around one account, newest first, at most 200:
--   'theirs_by'  someone revealed this account's number (a buyer revealing a seller's, a seller revealing a buyer's);
--   'by_them'    this account revealed someone else's.
-- vendor_contact_reveals keeps the latest reveal per (caller, seller); buyer_contact_reveals keeps every one.
-- The same roles as admin_vendor_private(), which serves the numbers themselves.
create or replace function public.admin_contact_reveals(p_profile uuid, p_limit integer default 50)
returns table (direction text, other_id uuid, other_name text, number_of text, revealed_at timestamptz)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops', 'support', 'finance_admin'), false) then
    raise exception 'not authorized: contact reveals require the super_admin, vendor_ops, support or finance_admin role' using errcode = '42501';
  end if;
  return query
  with r as (
    (select 'theirs_by'::text d, v.caller_id o, 'seller'::text n, v.revealed_at t
       from admin.vendor_contact_reveals v where v.vendor_id = p_profile order by v.revealed_at desc limit v_limit)
    union all
    (select 'theirs_by', b.caller_id, 'buyer', b.revealed_at
       from admin.buyer_contact_reveals b where b.buyer_id = p_profile order by b.revealed_at desc limit v_limit)
    union all
    (select 'by_them', v.vendor_id, 'seller', v.revealed_at
       from admin.vendor_contact_reveals v where v.caller_id = p_profile order by v.revealed_at desc limit v_limit)
    union all
    (select 'by_them', b.buyer_id, 'buyer', b.revealed_at
       from admin.buyer_contact_reveals b where b.caller_id = p_profile order by b.revealed_at desc limit v_limit)
  )
  select r.d, r.o, coalesce(nullif(btrim(vp.brand_name), ''), nullif(btrim(p.full_name), ''), 'Account ' || left(r.o::text, 8)),
         r.n, r.t
  from r
  left join public.vendor_profiles vp on vp.id = r.o
  left join public.profiles p on p.id = r.o
  order by r.t desc
  limit v_limit;
end $$;

revoke all on function public.admin_contact_reveals(uuid, integer) from public, anon;
grant execute on function public.admin_contact_reveals(uuid, integer) to authenticated;
