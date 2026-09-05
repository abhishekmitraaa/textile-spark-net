-- approve_vendor_content() and approve_vendor_content_bulk() flip status to
-- 'live' but never touch rejection_reason. A row that was rejected, then
-- edited by its vendor back to under_review, then re-approved, goes live
-- still carrying the old moderator note — a live row displaying as rejected
-- wherever UI renders "if rejection_reason then show the rejected banner"
-- without also checking status. Reproduced against the live DB: reject a
-- video (rejection_reason set), resubmit to under_review (rejection_reason
-- survives — nothing clears it on that transition either), approve via
-- approve_vendor_content_bulk, and the resulting live row still had the
-- stale reason. reject_vendor_content already writes both columns together
-- (status='rejected', rejection_reason=reason); approve is the one verb that
-- was setting status alone. Fixing that asymmetry, not touching reject.
--
-- Only the SET clauses change: same signatures, same authz gate, same
-- 22023/P0002 semantics, same ACL. CREATE OR REPLACE preserves the OID for
-- approve_vendor_content_bulk (renamed from approve_vendor_content(uuid) in
-- 20260801102505) — replacing a function's body does not change its OID or
-- grants, only DROP+CREATE would.
--
-- catalogues has no rejection_reason column (confirmed live: SELECT
-- rejection_reason FROM catalogues -> 42703 undefined_column) and
-- reject_vendor_content's own catalogues branch already carries the same
-- exclusion with the same rationale: "the note is dropped here rather than
-- silently pretending it was stored." Adding the clause there would not fix
-- a display bug, it would 42703 on every call for any vendor with a pending
-- catalogue, and because a PL/pgSQL function has no implicit per-statement
-- savepoint, that error would abort the whole call and roll back the
-- products/product_videos updates that came before it in the same
-- transaction — turning a display glitch into "moderators can no longer
-- approve anything for a vendor who also has a pending catalogue." Left
-- exactly as it already stands: status = 'live' only.

create or replace function public.approve_vendor_content(
  target_table text,
  target_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  affected int;
begin
  if not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
    raise exception 'not authorized: product moderation requires the product_moderator role';
  end if;

  if target_table = 'products' then
    update public.products
       set status = 'live', rejection_reason = null
     where id = target_id and status = 'under_review';
  elsif target_table = 'product_videos' then
    update public.product_videos
       set status = 'live', rejection_reason = null
     where id = target_id and status = 'under_review';
  elsif target_table = 'catalogues' then
    -- No rejection_reason column here — see header comment.
    update public.catalogues
       set status = 'live'
     where id = target_id and status = 'under_review';
  else
    raise exception 'unknown moderation target: %', target_table
      using errcode = '22023';
  end if;

  get diagnostics affected = row_count;
  if affected = 0 then
    -- Covers both "no such row" and "row exists but is not under_review".
    raise exception 'no under_review % row with id %', target_table, target_id
      using errcode = 'P0002';
  end if;
end;
$function$;

create or replace function public.approve_vendor_content_bulk(target uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
    raise exception 'not authorized: product moderation requires the product_moderator role';
  end if;
  update public.products       set status = 'live', rejection_reason = null where vendor_id = target and status = 'under_review';
  update public.product_videos set status = 'live', rejection_reason = null where vendor_id = target and status = 'under_review';
  -- No rejection_reason column on catalogues — see header comment.
  update public.catalogues     set status = 'live'                          where vendor_id = target and status = 'under_review';
end;
$function$;
