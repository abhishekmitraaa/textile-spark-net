-- Seller Home audit SH-056 and SH-057 (2026-11-17): a listing's photos and PDFs follow the listing's review.
--
-- SH-056: product_documents had only its 3-PDF cap. A PDF added to (or removed from) a live listing left it live with
--   no edit record, and buyers downloaded it from the product page. Now it goes back to review exactly as a photo
--   change does (admin.product_images_rereview, 20261021…): live -> under_review, paused-from-live -> paused-from-review,
--   and the change is noted on the listing's edit record for the moderator.
-- SH-057: the photo and PDF write policies admitted any staff role (bare is_admin()); a support account added a photo
--   to a live listing and it stayed live. The admin arm now names its roles (claude.md: "A write policy's admin arm
--   names its roles"): super admins and product moderators, who are the listing's reviewers, so their own change is
--   not sent back to them; it is written to the Admin Log (trg_admin_audit) instead.

-- ── SH-056 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function admin.product_documents_rereview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pid    uuid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  v_p      record;
  v_change jsonb;
begin
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return null;
  end if;
  select p.id, p.vendor_id, p.status::text as status, p.paused_from into v_p from public.products p where p.id = v_pid;
  -- No listing: it is being deleted, and its files with it. Not the seller: staff, recorded by trg_admin_audit.
  if v_p.id is null or auth.uid() is distinct from v_p.vendor_id then
    return null;
  end if;

  v_change := case
    when tg_op = 'INSERT' then '{"documents": {"added": 1}}'::jsonb
    when tg_op = 'DELETE' then '{"documents": {"removed": 1}}'::jsonb
    when new.path is distinct from old.path then '{"documents": {"added": 1, "removed": 1}}'::jsonb
  end;
  if v_change is null then
    return null;
  end if;

  if v_p.status = 'live' then
    -- trg_products_rereview records the resubmission; the document change is added to it below.
    update public.products set status = 'under_review' where id = v_p.id;
  elsif v_p.status = 'paused' and v_p.paused_from = 'live' then
    update public.products set paused_from = 'under_review' where id = v_p.id;
  end if;

  if v_p.status in ('live', 'rejected') or (v_p.status = 'paused' and v_p.paused_from = 'live')
     or exists (select 1 from admin.listing_edits e where e.entity = 'product' and e.entity_id = v_p.id and e.resolved_at is null) then
    perform admin.listing_edit_note('product', v_p.id, v_p.vendor_id, v_p.status, v_change);
  end if;
  return null;
end
$function$;

revoke all on function admin.product_documents_rereview() from public, anon, authenticated;

drop trigger if exists trg_product_documents_rereview on public.product_documents;
create trigger trg_product_documents_rereview
  after insert or delete or update of path on public.product_documents
  for each row execute function admin.product_documents_rereview();

-- ── SH-057 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists pimages_insert on public.product_images;
create policy pimages_insert on public.product_images for insert
  with check (owns_product(product_id)
              or ((select public.is_admin())
                  and (select public.admin_role()) = any (array['super_admin', 'product_moderator']::public.admin_role_type[])));

drop policy if exists pimages_update on public.product_images;
create policy pimages_update on public.product_images for update
  using (owns_product(product_id)
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'product_moderator']::public.admin_role_type[])))
  with check (owns_product(product_id)
              or ((select public.is_admin())
                  and (select public.admin_role()) = any (array['super_admin', 'product_moderator']::public.admin_role_type[])));

drop policy if exists pimages_delete on public.product_images;
create policy pimages_delete on public.product_images for delete
  using (owns_product(product_id)
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'product_moderator']::public.admin_role_type[])));

drop policy if exists pdocs_insert on public.product_documents;
create policy pdocs_insert on public.product_documents for insert to authenticated
  with check ((owns_product(product_id) and split_part(path, '/', 1) = ((select auth.uid()))::text)
              or ((select public.is_admin())
                  and (select public.admin_role()) = any (array['super_admin', 'product_moderator']::public.admin_role_type[])));

drop policy if exists pdocs_delete on public.product_documents;
create policy pdocs_delete on public.product_documents for delete to authenticated
  using (owns_product(product_id)
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'product_moderator']::public.admin_role_type[])));

-- Staff changes to a listing's files reach the Admin Log (sellers' own changes are not admin actions and aren't logged).
drop trigger if exists trg_admin_audit on public.product_images;
create trigger trg_admin_audit after insert or update or delete on public.product_images
  for each row execute function admin.audit_row_change('');
drop trigger if exists trg_admin_audit on public.product_documents;
create trigger trg_admin_audit after insert or update or delete on public.product_documents
  for each row execute function admin.audit_row_change('');

-- ── Self-check ─────────────────────────────────────────────────────────────────────────────────────────────────────
do $check$
declare
  v_bare int;
begin
  select count(*) into v_bare
    from pg_policy
   where polrelid in ('public.product_images'::regclass, 'public.product_documents'::regclass)
     and polcmd in ('a', 'w', 'd')
     and coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '') like '%is_admin%'
     and coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '') not like '%admin_role%';
  if v_bare > 0 then
    raise exception 'listing files self-check: % write policies still admit every staff role', v_bare;
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_product_documents_rereview') then
    raise exception 'listing files self-check: trg_product_documents_rereview missing';
  end if;
end
$check$;
