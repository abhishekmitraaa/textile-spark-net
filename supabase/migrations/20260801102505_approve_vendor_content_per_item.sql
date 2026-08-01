-- Make approve per-item, mirroring reject_vendor_content.
--
-- Before this, reject was per-row but approve was per-VENDOR: a moderator
-- could reject one bad clip, but could not approve one good clip without also
-- publishing everything else that vendor had pending — across products,
-- videos AND catalogues in a single call. Asymmetric and easy to fire by
-- accident.
--
-- The old vendor-wide behaviour is still wanted for "clear this vendor's whole
-- queue", so it is kept verbatim under a new name.

-- ── 1. Preserve the existing function exactly ──────────────────────────────
-- RENAME, not drop-and-recreate: this keeps the same OID, body and ACL, so
-- there is no window where the behaviour differs and nothing to get subtly
-- wrong in a retype. Its logic is deliberately untouched.
alter function public.approve_vendor_content(uuid) rename to approve_vendor_content_bulk;

comment on function public.approve_vendor_content_bulk(uuid) is
  'Vendor-wide approve: flips every under_review product, product_video and catalogue owned by `target` to live. Was approve_vendor_content(uuid) before the per-item split.';

-- ── 2. Per-item approve ────────────────────────────────────────────────────
-- Structure mirrors reject_vendor_content(): same authz gate, static branch
-- per table, no dynamic SQL (a text table name in EXECUTE inside a SECURITY
-- DEFINER function is an injection vector), 22023 on an unknown table and
-- P0002 when nothing matched.
--
-- One deliberate asymmetry with reject: the UPDATE is gated on
-- status = 'under_review', matching what the bulk version has always done.
-- Rejecting is a takedown and may act on anything, including something
-- already live. Approving is a decision on a PENDING item — "approving" a
-- draft or an already-live row is not a meaningful action, so it raises P0002
-- rather than reporting success while doing nothing.
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
       set status = 'live'
     where id = target_id and status = 'under_review';
  elsif target_table = 'product_videos' then
    update public.product_videos
       set status = 'live'
     where id = target_id and status = 'under_review';
  elsif target_table = 'catalogues' then
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

-- ── 3. Same ACL shape across all three moderation verbs ────────────────────
-- approve_vendor_content_bulk carries the original ACL through the rename
-- (PUBLIC was already revoked there). A freshly created function gets
-- EXECUTE to PUBLIC by default, so the new one needs it taken away to match.
revoke execute on function public.approve_vendor_content(text, uuid) from public;
revoke execute on function public.approve_vendor_content_bulk(uuid) from public;
