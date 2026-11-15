-- Seller Home fixes, Task 2 (SH-006, SH-014, SH-016, SH-026, SH-027; documentation/seller-home-audit-2026-11-15.md).
--
-- Seller Home made 23 API calls per load and downloaded every open requirement, every own product with its
-- pictures and every chat to show three of each. seller_home_summary() answers the whole page in one call.
--
-- SECURITY INVOKER on purpose: every requirement it counts or lists passes through rfqs_select exactly as /leads
-- does, so no copy of the overseas, VIP-window, quoted or block rules lives here. The only private values (the
-- business phone and email, for the profile score) come from my_vendor_private(), which returns the caller's own.
--
-- Returns null signed out or without a vendor_profiles row. Arrays are always arrays, at most 3 items.
-- Harness: scripts/seller-home/summary.sql.

create or replace function public.seller_home_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  reg jsonb;
  result jsonb;
begin
  if me is null or not exists (select 1 from public.vendor_profiles v where v.id = me) then
    return null;
  end if;

  reg := public.my_seller_registration();

  with
  own_products as (
    select p.id, p.name, p.price_value, p.unit, p.status, p.views_count, p.enquiries_count, p.created_at
      from public.products p where p.vendor_id = me
  ),
  open_leads as (
    select r.id, r.title, r.product_name, r.quantity, r.budget_min, r.budget_max, r.image, r.created_at,
           false as direct
      from public.rfqs r
     where r.status = 'active' and r.vendor_id is null and r.expires_at > now() and r.buyer_id <> me
  ),
  direct_leads as (
    select r.id, r.title, r.product_name, r.quantity, r.budget_min, r.budget_max, r.image, r.created_at,
           true as direct
      from public.rfqs r
     where r.status = 'active' and r.vendor_id = me
  ),
  own_quotes as (
    select q.rfq_id, q.status from public.quotes q where q.vendor_id = me
  ),
  unread as (
    select u.conversation_id, u.unread from public.chat_unread_counts() u
  ),
  chats as (
    select c.id, case when c.user_a = me then c.user_b else c.user_a end as other_id,
           c.last_message, c.last_message_at
      from public.conversations c
      left join public.conversation_member_state ms on ms.conversation_id = c.id and ms.user_id = me
     where (c.user_a = me or c.user_b = me)
       and c.last_message_at is not null
       and ms.archived_at is null
       and (ms.cleared_at is null or c.last_message_at > ms.cleared_at)
     order by c.last_message_at desc
     limit 3
  )
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'total',           (select count(*) from own_products),
      'live',            (select count(*) from own_products where status = 'live'),
      'under_review',    (select count(*) from own_products where status = 'under_review'),
      'open_leads',      (select count(*) from open_leads),
      'direct_requests', (select count(*) from direct_leads),
      'enquiries',       (select coalesce(sum(enquiries_count), 0) from own_products),
      'quotes_sent',     (select count(*) from own_quotes),
      'quotes_accepted', (select count(*) from own_quotes where status = 'accepted')
    ),
    'profile', (
      select jsonb_build_object(
        'about', v.about, 'website', v.website, 'category', v.category, 'office_photos', v.office_photos,
        'year_established', v.year_established, 'employee_count', v.employee_count,
        'annual_turnover', v.annual_turnover, 'capacity', v.capacity, 'social', v.social,
        'reviews_count', v.reviews_count,
        'phone', (select pv.phone from public.my_vendor_private() pv),
        'owner_email', (select pv.owner_email from public.my_vendor_private() pv))
        from public.vendor_profiles v where v.id = me
    ),
    'review', jsonb_build_object(
      'registration_status', reg ->> 'status',
      'contract_signed',     coalesce((reg ->> 'contract_signed')::boolean, false),
      'documents_pending',   (select count(*) from public.vendor_documents d
                               where d.vendor_id = me and not d.verified and d.rejection_reason is null),
      'documents_rejected',  (select count(*) from public.vendor_documents d
                               where d.vendor_id = me and not d.verified and d.rejection_reason is not null),
      'products_in_review',  (select count(*) from own_products where status = 'under_review'),
      'premises_in_review',  (select count(*) from public.vendor_premises_photos ph
                               where ph.vendor_id = me and ph.status = 'under_review')
    ),
    'top_products', coalesce((
      select jsonb_agg(t order by t.inquiries desc, t.views desc)
        from (
          select p.id, p.name, p.price_value, p.unit, p.views_count as views, p.enquiries_count as inquiries,
                 (select i.url from public.product_images i where i.product_id = p.id
                   order by i.position limit 1) as image
            from own_products p
           where p.status = 'live'
           order by p.enquiries_count desc, p.views_count desc, p.created_at desc
           limit 3
        ) t), '[]'::jsonb),
    'recent_leads', coalesce((
      select jsonb_agg(l order by l.direct desc, l.created_at desc)
        from (
          select a.*, exists (select 1 from own_quotes q where q.rfq_id = a.id) as quoted
            from (select * from direct_leads union all select * from open_leads) a
           order by a.direct desc, a.created_at desc
           limit 3
        ) l), '[]'::jsonb),
    'recent_chats', coalesce((
      select jsonb_agg(jsonb_build_object(
               'other_id', ch.other_id,
               'name', coalesce(vp.brand_name, pr.full_name, 'User'),
               'avatar', pr.avatar_url,
               'last_message', ch.last_message,
               'last_message_at', ch.last_message_at,
               'unread', coalesce(u.unread, 0))
             order by ch.last_message_at desc)
        from chats ch
        left join public.vendor_profiles vp on vp.id = ch.other_id
        left join public.profiles pr on pr.id = ch.other_id
        left join unread u on u.conversation_id = ch.id), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.seller_home_summary() from public, anon;
grant execute on function public.seller_home_summary() to authenticated;

comment on function public.seller_home_summary() is
  'Seller Home in one call (counts, score inputs, review states, top 3 products, newest 3 leads, newest 3 chats). SECURITY INVOKER: requirements pass rfqs_select.';

do $$
begin
  if (select prosecdef from pg_proc where oid = 'public.seller_home_summary()'::regprocedure) then
    raise exception 'seller_home_summary self-check: must be SECURITY INVOKER so rfqs_select applies';
  end if;
  if has_function_privilege('anon', 'public.seller_home_summary()', 'execute') then
    raise exception 'seller_home_summary self-check: anon must not execute it';
  end if;
end $$;
