-- Low bugs, batch 4 (2026-11-20): Seller Home and the careers page.
--
-- L-68 (Mitra, 2026-11-20: "Make a careers page but keep it hidden for now, make the feature to be able to turned on
-- from admin panel"): the switch `careers_page`, off. Super admins turn it on in Cosora-Admin › Feature switches (for
-- everyone, or for listed accounts to look first). careers_page_on() answers visitors too, like featured_listings_on().
--
-- seller_home_summary(), same shape plus:
--   L-74  a direct request without a photo of its own shows the requested listing's first picture;
--   L-76  a lead the seller quoted on carries quote_id, so "View quote" opens that quote;
--   L-77  review.products_rejected and review.products_paused, so Seller Home says what needs changes or is paused;
--   L-85  my_vendor_private() is read once, not once per column.
-- Everything else is unchanged: SECURITY INVOKER, so every requirement still passes rfqs_select.

begin;

insert into public.feature_flags (key, description, enabled)
values ('careers_page', 'The careers page (/careers) and the "Work with us" link on the seller landing page.', false)
on conflict (key) do nothing;

create or replace function public.careers_page_on()
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select admin.feature_on_for('careers_page', (select auth.uid()))
$function$;
revoke all on function public.careers_page_on() from public;
grant execute on function public.careers_page_on() to anon, authenticated, service_role;

create or replace function public.seller_home_summary()
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
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
    -- A request about a listing shows the listing's picture when the buyer added none (review L-74).
    select r.id, r.title, r.product_name, r.quantity, r.budget_min, r.budget_max,
           coalesce(r.image, (select i.url from public.product_images i where i.product_id = r.product_id
                               order by i.position limit 1)) as image,
           r.created_at, true as direct
      from public.rfqs r
     where r.status = 'active' and r.vendor_id = me
  ),
  own_quotes as (
    select q.id, q.rfq_id, q.status, q.created_at from public.quotes q where q.vendor_id = me
  ),
  priv as (
    select pv.phone, pv.owner_email from public.my_vendor_private() pv limit 1
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
        'phone', (select phone from priv),
        'owner_email', (select owner_email from priv))
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
      'products_rejected',   (select count(*) from own_products where status = 'rejected'),
      'products_paused',     (select count(*) from own_products where status = 'paused'),
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
      select jsonb_agg(l order by (l.direct and not l.quoted) desc, l.created_at desc)
        from (
          select a.*,
                 exists (select 1 from own_quotes q where q.rfq_id = a.id) as quoted,
                 (select q.id from own_quotes q where q.rfq_id = a.id order by q.created_at desc limit 1) as quote_id
            from (select * from direct_leads union all select * from open_leads) a
           order by (a.direct and not exists (select 1 from own_quotes q2 where q2.rfq_id = a.id)) desc, a.created_at desc
           limit 3
        ) l), '[]'::jsonb),
    'recent_chats', public.seller_home_chats()
  ) into result;

  return result;
end;
$function$;

-- Self-check.
do $check$
declare
  v_def text := pg_get_functiondef('public.seller_home_summary()'::regprocedure);
begin
  if not exists (select 1 from public.feature_flags where key = 'careers_page') then
    raise exception 'low_batch4: careers_page switch missing';
  end if;
  if position('products_paused' in v_def) = 0 or position('quote_id' in v_def) = 0 then
    raise exception 'low_batch4: seller_home_summary not replaced';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.seller_home_summary()'::regprocedure) then
    raise exception 'low_batch4: seller_home_summary must stay security invoker';
  end if;
  if (length(v_def) - length(replace(v_def, 'my_vendor_private()', ''))) / length('my_vendor_private()') <> 1 then
    raise exception 'low_batch4: my_vendor_private() should be read once';
  end if;
end
$check$;

commit;
