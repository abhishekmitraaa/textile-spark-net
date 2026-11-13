-- Vendor registration, part 4: staff review premises photos, see who is waiting, and decide overseas registrations
-- (onboarding audit #15 #20; Mitra D3 D5, 2026-11-13).
--
--   admin_premises_photo_review(photo, approve, reason)   super_admin, product_moderator (as catalogues)
--   admin_premises_photo_queue(limit, after, after_id)    super_admin, product_moderator, support (read)
--   admin_registration_queue(kind, limit, after, after_id) super_admin, vendor_ops, support: 'approval' (overseas
--                                                           registrations waiting) or 'documents' (sellers with
--                                                           documents nobody has reviewed), oldest first
--   admin_registration_queue_counts()                      the four counts for Cosora-Admin's navigation
--   admin_vendor_registration_decide(vendor, submission, approve, reason)  super_admin, vendor_ops, support
--
-- Queues page by keyset (created_at, id), oldest first, so "Load more" stays cheap at any size. A rejection needs
-- a reason, the seller is told either way (notify), and the reason reaches the Admin Log (cosora.audit_reason).

create index if not exists vendor_documents_unreviewed_idx
  on public.vendor_documents (created_at, id) where not verified and reviewed_at is null;

create or replace function admin.require_admin_role(p_roles public.admin_role_type[])
returns void
language plpgsql
stable
set search_path = ''
as $function$
begin
  if not (coalesce(public.is_admin(), false) and public.admin_role() = any (p_roles)) then
    raise exception 'Your admin role can''t do this' using errcode = '42501';
  end if;
end
$function$;
revoke all on function admin.require_admin_role(public.admin_role_type[]) from public, anon, authenticated;

-- ── Premises photos ──────────────────────────────────────────────────────────
create or replace function public.admin_premises_photo_review(p_photo uuid, p_approve boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_photo  record;
  v_reason text := admin.reg_text(p_reason);
begin
  perform admin.require_admin_role(array['super_admin', 'product_moderator']::public.admin_role_type[]);
  if p_approve is null then
    raise exception 'approve or reject' using errcode = '22023';
  end if;
  select ph.id, ph.vendor_id, ph.url into v_photo from public.vendor_premises_photos ph where ph.id = p_photo for update;
  if not found then
    raise exception 'That photo no longer exists' using errcode = 'P0002';
  end if;
  -- Only a file in Cosora's own Storage, in the seller's folder, is approved (review #1).
  if p_approve and not public.own_storage_object(v_photo.url, 'product-images', v_photo.vendor_id) then
    raise exception 'This photo isn''t stored on Cosora. Reject it with a reason.' using errcode = '22023';
  end if;
  if p_approve then
    update public.vendor_premises_photos ph
       set status = 'live', rejection_reason = null, reviewed_at = now(), reviewed_by = auth.uid()
     where ph.id = p_photo;
  else
    if v_reason is null then
      raise exception 'A rejection needs a reason the seller can act on' using errcode = '22023';
    end if;
    perform set_config('cosora.audit_reason', left(v_reason, 500), true);
    update public.vendor_premises_photos ph
       set status = 'rejected', rejection_reason = left(v_reason, 500), reviewed_at = now(), reviewed_by = auth.uid()
     where ph.id = p_photo;
    perform public.notify(v_photo.vendor_id, 'premises_photo_rejected', 'A premises photo wasn''t approved', left(v_reason, 500));
  end if;
end
$function$;

create or replace function public.admin_premises_photo_queue(p_limit integer default 50, p_after timestamptz default null,
                                                             p_after_id uuid default null)
returns table (id uuid, vendor_id uuid, brand_name text, url text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform admin.require_admin_role(array['super_admin', 'product_moderator', 'support']::public.admin_role_type[]);
  return query
    select ph.id, ph.vendor_id, v.brand_name, ph.url, ph.created_at
      from public.vendor_premises_photos ph
      join public.vendor_profiles v on v.id = ph.vendor_id
     where ph.status = 'under_review'
       and (p_after is null or (ph.created_at, ph.id) > (p_after, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
     order by ph.created_at, ph.id
     limit least(greatest(coalesce(p_limit, 50), 1), 100);
end
$function$;

-- ── Who is waiting ───────────────────────────────────────────────────────────
create or replace function public.admin_registration_queue(p_kind text, p_limit integer default 50,
                                                           p_after timestamptz default null, p_after_id uuid default null)
returns table (vendor_id uuid, brand_name text, country_code text, kind text, waiting_since timestamptz,
               days_waiting integer, pending_docs integer, submission_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform admin.require_admin_role(array['super_admin', 'vendor_ops', 'support']::public.admin_role_type[]);
  if p_kind = 'approval' then
    return query
      select r.vendor_id, v.brand_name, r.country_code, 'approval'::text, r.created_at,
             floor(extract(epoch from now() - r.created_at) / 86400)::integer,
             (select count(*)::integer from public.vendor_documents d
               where d.vendor_id = r.vendor_id and not d.verified and d.reviewed_at is null),
             r.id
        from public.vendor_registrations r
        left join public.vendor_profiles v on v.id = r.vendor_id
       where r.status = 'pending_review'
         and (p_after is null or (r.created_at, r.id) > (p_after, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
       order by r.created_at, r.id
       limit v_limit;
  elsif p_kind = 'documents' then
    return query
      with waiting as (
        select d.vendor_id, min(d.created_at) as since, count(*)::integer as n
          from public.vendor_documents d
         where not d.verified and d.reviewed_at is null
         group by d.vendor_id
      )
      select w.vendor_id, v.brand_name, v.country_code, 'documents'::text, w.since,
             floor(extract(epoch from now() - w.since) / 86400)::integer, w.n, null::uuid
        from waiting w
        join public.vendor_profiles v on v.id = w.vendor_id
       where p_after is null or (w.since, w.vendor_id) > (p_after, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
       order by w.since, w.vendor_id
       limit v_limit;
  else
    raise exception 'Unknown queue %', p_kind using errcode = '22023';
  end if;
end
$function$;

create or replace function public.admin_registration_queue_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_cut timestamptz := now() - interval '5 days';
begin
  perform admin.require_admin_role(array['super_admin', 'vendor_ops', 'support', 'product_moderator']::public.admin_role_type[]);
  return jsonb_build_object(
    'approval', (select count(*) from public.vendor_registrations r where r.status = 'pending_review'),
    'documents', (select count(distinct d.vendor_id) from public.vendor_documents d where not d.verified and d.reviewed_at is null),
    'photos', (select count(*) from public.vendor_premises_photos ph where ph.status = 'under_review'),
    'overdue', (select count(*) from (
                  select r.vendor_id from public.vendor_registrations r where r.status = 'pending_review' and r.created_at < v_cut
                  union
                  select d.vendor_id from public.vendor_documents d
                   where not d.verified and d.reviewed_at is null and d.created_at < v_cut) o));
end
$function$;

-- ── An overseas registration: approve or reject ──────────────────────────────
-- Names the submission the admin reviewed (review #8): a stale queue can't approve documents nobody saw.
create or replace function public.admin_vendor_registration_decide(p_vendor uuid, p_submission uuid, p_approve boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_reg    record;
  v_reason text := admin.reg_text(p_reason);
begin
  perform admin.require_admin_role(array['super_admin', 'vendor_ops', 'support']::public.admin_role_type[]);
  if p_vendor is null or p_submission is null or p_approve is null then
    raise exception 'say which seller and submission, and approve or reject' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cosora.vendor_registration:' || p_vendor::text, 0));
  select r.id, r.status into v_reg from public.vendor_registrations r
   where r.vendor_id = p_vendor order by r.created_at desc limit 1;
  if v_reg.status is distinct from 'pending_review' or v_reg.id is distinct from p_submission then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;
  if p_approve then
    if not exists (select 1 from public.vendor_contracts c where c.vendor_id = p_vendor) then
      raise exception 'no_contract' using errcode = 'P0001';
    end if;
    perform set_config('cosora.audit_reason', coalesce(left(v_reason, 500), 'Registration approved'), true);
    update public.vendor_registrations r
       set status = 'registered', decided_by = auth.uid(), decided_at = now(), reason = left(v_reason, 1000),
           result = r.result || jsonb_build_object('status', 'registered')
     where r.id = v_reg.id;
    update public.vendor_profiles v set onboarding_complete = true where v.id = p_vendor;
    perform public.notify(p_vendor, 'registration_approved', 'Your seller registration is approved',
                          'You can now add listings, videos and catalogues.');
  else
    if v_reason is null then
      raise exception 'A rejection needs a reason the seller can act on' using errcode = '22023';
    end if;
    perform set_config('cosora.audit_reason', left(v_reason, 500), true);
    update public.vendor_registrations r
       set status = 'rejected', decided_by = auth.uid(), decided_at = now(), reason = left(v_reason, 1000),
           result = r.result || jsonb_build_object('status', 'rejected')
     where r.id = v_reg.id;
    perform public.notify(p_vendor, 'registration_rejected', 'Your seller registration needs changes', left(v_reason, 500));
  end if;
end
$function$;

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_premises_photo_review(uuid, boolean, text)',
    'public.admin_premises_photo_queue(integer, timestamptz, uuid)',
    'public.admin_registration_queue(text, integer, timestamptz, uuid)',
    'public.admin_registration_queue_counts()',
    'public.admin_vendor_registration_decide(uuid, uuid, boolean, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if has_function_privilege('anon', 'public.admin_vendor_registration_decide(uuid, uuid, boolean, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_registration_queue(text, integer, timestamptz, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_premises_photo_review(uuid, boolean, text)', 'EXECUTE') then
    raise exception 'self-check: an admin function is open to anon';
  end if;
end
$check$;
