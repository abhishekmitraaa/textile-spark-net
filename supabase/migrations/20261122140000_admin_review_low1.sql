-- Cosora-Admin review 2026-11-22, Low batch 1 (AR-L01 to AR-L20). Patches by anchored text normalise CRLF first.

-- One helper: replace `old` with `new` in a function's definition, exactly once, or fail.
create or replace function pg_temp.patch_fn(p_fn regprocedure, p_old text, p_new text, p_tag text)
returns void language plpgsql as $$
declare d text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
begin
  if position(p_new in d) > 0 then return; end if;  -- already applied
  if (length(d) - length(replace(d, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: anchor not found exactly once in %', p_tag, p_fn;
  end if;
  execute replace(d, p_old, p_new);
end $$;

-- ── AR-L03 An overseas registration is approved only after its documents are reviewed ──────────────────────────
-- Mitra, 2026-11-22: "Overseas only". Cosora can't check an overseas business against a public register, so its
-- documents are the evidence; Indian registrations keep their order (approve, documents reviewed in the KYC panel).
select pg_temp.patch_fn('public.admin_vendor_registration_decide(uuid,uuid,boolean,text)'::regprocedure,
'  if p_approve then
    if not exists (select 1 from public.vendor_contracts c where c.vendor_id = p_vendor) then',
'  if p_approve then
    -- AR-L03: an overseas registration waits for every submitted document to be reviewed.
    if (select r.country_code from public.vendor_registrations r where r.id = v_reg.id) is distinct from ''IN''
       and exists (select 1 from public.vendor_documents d where d.vendor_id = p_vendor and d.reviewed_at is null) then
      raise exception ''documents_unreviewed'' using errcode = ''P0001'';
    end if;
    if not exists (select 1 from public.vendor_contracts c where c.vendor_id = p_vendor) then',
'AR-L03');

-- ── AR-L04 vendor_ops reviews KYC documents too ──────────────────────────────────────────────────────────────────
-- Mitra, 2026-11-22: vendor_ops approved registrations but couldn't review their documents. It already reads them
-- (vendor_documents_select, business_docs_owner_select).
select pg_temp.patch_fn('admin.vendor_document_decide(uuid,boolean,text,boolean,timestamptz)'::regprocedure,
'  if not (public.is_admin() and public.admin_role() in (''support'', ''super_admin'')) then
    raise exception ''not authorized: reviewing KYC documents requires the support or super_admin role'';',
'  if not (public.is_admin() and public.admin_role() in (''support'', ''super_admin'', ''vendor_ops'')) then
    raise exception ''not authorized: reviewing KYC documents requires the support, vendor_ops or super_admin role'';',
'AR-L04');

-- ── AR-L05 Moving a moderation reason is one change ──────────────────────────────────────────────────────────────
-- Reordering swapped two rows with two saves: a failure between them left two reasons on one position.
create or replace function public.admin_product_reasons_swap(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  sa integer;
  sb integer;
begin
  if not admin.product_reasons_can_edit() then
    raise exception 'not authorized: product moderation reasons are for product moderators, managers and super admins'
      using errcode = '42501';
  end if;
  select r.sort into sa from admin.product_moderation_reasons r where r.id = p_a for update;
  select r.sort into sb from admin.product_moderation_reasons r where r.id = p_b for update;
  if sa is null or sb is null then
    raise exception 'That reason no longer exists' using errcode = 'P0002';
  end if;
  if sa = sb then sb := sb + 1; end if;
  perform set_config('cosora.audit_reason', 'Reasons reordered', true);
  update admin.product_moderation_reasons r set sort = case when r.id = p_a then sb else sa end
   where r.id in (p_a, p_b);
end
$function$;
revoke all on function public.admin_product_reasons_swap(uuid, uuid) from public, anon;
grant execute on function public.admin_product_reasons_swap(uuid, uuid) to authenticated;

-- ── AR-L12 Billing incidents page instead of stopping at 200 ─────────────────────────────────────────────────────
create or replace function public.admin_billing_incidents(p_open_only boolean, p_before_at timestamptz,
                                                          p_before_id uuid, p_limit integer)
returns table(id uuid, kind text, vendor_id uuid, vendor_name text, order_ref text, payment_ref text, detail jsonb,
              created_at timestamp with time zone, resolved_at timestamp with time zone, resolved_by_name text,
              resolution text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin', 'support'), false) then
    raise exception 'not authorized: billing incidents are for finance' using errcode = '42501';
  end if;
  return query
    select i.id, i.kind, i.vendor_id, vp.brand_name, i.order_ref, i.payment_ref, i.detail, i.created_at,
           i.resolved_at, admin.audit_actor_name(i.resolved_by), i.resolution
      from admin.billing_incidents i
      left join public.vendor_profiles vp on vp.id = i.vendor_id
     where (not coalesce(p_open_only, true) or i.resolved_at is null)
       and (p_before_at is null or (i.created_at, i.id) < (p_before_at, p_before_id))
     order by i.created_at desc, i.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 200);
end
$function$;
revoke all on function public.admin_billing_incidents(boolean, timestamptz, uuid, integer) from public, anon;
grant execute on function public.admin_billing_incidents(boolean, timestamptz, uuid, integer) to authenticated;

-- ── AR-L14 Resuming a campaign Cosora paused tells the seller ────────────────────────────────────────────────────
select pg_temp.patch_fn('public.resume_ad_campaign(uuid)'::regprocedure,
'  return v_target;',
'  -- AR-L14: Cosora paused it, so Cosora tells the seller it runs again (a seller resuming their own needs no notice).
  if v_cur = ''paused_by_admin'' then
    perform public.notify((select a.vendor_id from public.advertisements a where a.id = p_ad_id), ''ad_resumed'',
      ''Your campaign is running again'',
      ''Cosora has resumed your campaign. The time it was paused has been added to its end date.'');
  end if;
  return v_target;',
'AR-L14');

-- ── AR-L18 Blog button links are web addresses, site paths, email or phone links only ────────────────────────────
-- `javascript:` or `data:` links were accepted and rendered as <a href> on cosora.in/blogs.
create or replace function public.blog_href_ok(p_href text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_href is not null
     and btrim(p_href) ~* '^(https?://[^\s<>"]+|/[^/\\\s][^\s<>"]*|/|mailto:[^\s<>"]+|tel:\+?[0-9 ()-]+|#[A-Za-z0-9_-]*)$'
$$;
grant execute on function public.blog_href_ok(text) to anon, authenticated;

select pg_temp.patch_fn('public.blog_blocks_valid(jsonb)'::regprocedure,
'      if coalesce(btrim(b ->> ''label''), '''') = '''' then return false; end if;
      if coalesce(btrim(b ->> ''href''), '''') = '''' then return false; end if;',
'      if coalesce(btrim(b ->> ''label''), '''') = '''' then return false; end if;
      if coalesce(btrim(b ->> ''href''), '''') = '''' then return false; end if;
      if not public.blog_href_ok(b ->> ''href'') then return false; end if;  -- AR-L18',
'AR-L18 blocks');

select pg_temp.patch_fn('public.admin_blog_settings_save(boolean,text,text,text,text,text,text,text)'::regprocedure,
'  perform admin.require_content_admin();
  return query',
'  perform admin.require_content_admin();
  -- AR-L18: the hero button is a link like any other.
  if nullif(btrim(coalesce(p_hero_cta_href, '''')), '''') is not null and not public.blog_href_ok(p_hero_cta_href) then
    raise exception ''The button link must start with https://, / (a page on Cosora), mailto: or tel:'' using errcode = ''22023'';
  end if;
  return query',
'AR-L18 settings');

-- ── AR-L19 Which blog pictures nothing uses any more ─────────────────────────────────────────────────────────────
-- Cosora-Admin removes a replaced or removed picture after the save, if no article and not the blog's hero uses it.
create or replace function public.admin_blog_unused_images(p_paths text[])
returns text[]
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  perform admin.require_content_admin();
  return coalesce((
    select array_agg(x.path)
      from (select distinct unnest(p_paths) as path) x
     where x.path is not null and x.path like 'blog/%'
       and not exists (select 1 from public.blog_posts p
                        where x.path in (p.hero_image, p.thumbnail, p.og_image)
                           or (jsonb_typeof(p.blocks) = 'array'
                               and exists (select 1 from jsonb_array_elements(p.blocks) b where b ->> 'path' = x.path)))
       and not exists (select 1 from public.blog_settings s where s.hero_image = x.path)
  ), '{}');
end
$function$;
revoke all on function public.admin_blog_unused_images(text[]) from public, anon;
grant execute on function public.admin_blog_unused_images(text[]) to authenticated;
