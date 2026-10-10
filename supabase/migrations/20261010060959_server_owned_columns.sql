-- Server-owned values, and the advertising path (full test of 2026-10-10).
--
-- A signed-in browser writes its own rows through the API. Row policies say WHICH rows; they
-- say nothing about which columns, and every column of these tables is granted. The full test
-- wrote each column of an account's own rows, one at a time, and found values the server is
-- meant to own that a seller (or buyer) could set. This migration closes them. Nothing here
-- changes what the apps themselves send: they never write these values.
--
-- 1. ADVERTISING (the serious one: advertising without paying, and without review).
--    a. Any paid-plan seller could create a draft campaign through the API, set its status to
--       'paused_by_vendor' (the status rule let an owner set that from ANY status) and call
--       resume_ad_campaign(): the campaign went 'active' in every slot named, until any date
--       named, unpaid and unreviewed. The same two steps restarted a campaign Cosora had
--       paused, suspended or rejected, and one whose paid time had run out.
--    b. A campaign created straight in 'pending_review' sat in the review queue beside paid
--       ones; approving a 'trustedSeal' one granted the verified badge until its end date.
--    c. A draft naming 'verifiedCertificate' put a print-and-post certificate order in the
--       fulfilment queue.
--    d. On a running, paid campaign the owner could move the end date, add slots, restart the
--       wholesaler-pick boost (starts_at), date the campaign in the future to sit first in
--       every slot (created_at), and change the reviewed wording, picture and listing.
--    Now: a browser creates a DRAFT and nothing else (the payment functions, service role,
--    write the campaigns a reviewer sees). An owner's status changes go through
--    pause_ad_campaign_by_vendor(), resume_ad_campaign() and resubmit_ad_campaign() only,
--    which check where the campaign is and write the review log. A draft is the vendor's to
--    edit; after "changes requested" the wording, picture and targeting are; anything else is
--    as it was paid for and reviewed. A draft never orders a certificate.
-- 2. COUNTS, RATINGS AND DATES that rank, feature or vouch for a listing or a seller:
--    products         views, enquiries, sold, rating, review count, created_at, the search
--                     vector, and category_name (which follows category_id)
--    product_videos   likes, views, rating, reviews, created_at, the search vector
--    vendor_profiles  followers, created_at, the catalogue vector and its timestamp
--    rfqs             created_at (the search vector was already held: trg_rfqs_embedding_guard)
--    reviews, product_reviews, service_reviews   created_at
--    A browser's value is ignored, not refused: a new row starts at zero and now, an edit
--    keeps what is stored. So a form that sends a whole row back still saves. The functions
--    that move these (increment_product_view, increment_product_enquiry, sync_product_rating,
--    sync_video_likes_count, increment_video_view, the embedding workers) are definer
--    functions or the service role, not `authenticated`, and are untouched.
-- 3. CATALOGUES. The app uploads a catalogue as 'under_review' and approve_vendor_content()
--    puts it live; the table let a seller create one 'live', or set it live. Now held to the
--    rule product videos already follow: a seller sets 'draft' or 'under_review'.
--
-- Not changed here, for Mitra to decide (documentation/securityflags.md): whether editing a
-- listing, video or catalogue that is already live should send it back to review.
--
-- Harness: scripts/security/server_owned_columns.sql. End to end: the full-test attack
-- scripts (documentation/test.md).

-- ── 0. Guard ───────────────────────────────────────────────────────────────────────
-- The two functions replaced below, as they were read (line endings aside).
do $guard$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.enforce_ads_moderation()',   'f8621529a6930b37fc6a16f1d366cb10'),
      ('public.create_certificate_order()', '30568a7ff6bb92b2cb2e08b4cb74a855')) v(fn, want)
  loop
    if md5(replace((select prosrc from pg_proc where oid = r.fn::regprocedure), chr(13), '')) <> r.want then
      raise exception '% changed since it was read; re-read it before patching', r.fn;
    end if;
  end loop;
end
$guard$;

-- ── 1. Advertising ─────────────────────────────────────────────────────────────────
create or replace function public.enforce_ads_moderation()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_moderator boolean;
  v_open      text[];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  v_moderator := coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator'), false);

  if tg_op = 'INSERT' then
    if not v_moderator then
      new.moderation_reason := null;
      new.moderated_at      := null;
      new.moderated_by      := null;
    end if;
    -- A browser makes a draft and nothing else. The campaigns a reviewer sees are written by
    -- the payment functions (service role) once an order is paid. A draft never reaches
    -- review or buyers, so the dates and slots it names are a claim on nothing.
    new.status      := 'draft';
    new.ad_order_id := null;
    new.created_at  := now();
    -- Delivery counters start at zero; only ad_impression() / ad_click() move them.
    new.impressions := 0;
    new.clicks      := 0;
    return new;
  end if;

  if new.impressions is distinct from old.impressions or new.clicks is distinct from old.clicks then
    raise exception 'Impressions and clicks are counted by the ad server and cannot be set directly'
      using errcode = '42501';
  end if;

  if auth.uid() = old.vendor_id then
    -- The owner, writing the row directly. Status moves through pause_ad_campaign_by_vendor(),
    -- resume_ad_campaign() and resubmit_ad_campaign(): each checks where the campaign is and
    -- writes the review log. Set directly, 'paused_by_vendor' was the way from any status to
    -- resume_ad_campaign() and 'active'.
    if new.status is distinct from old.status then
      raise exception 'A campaign''s status changes when you pause, resume or resubmit it; it can''t be set directly'
        using errcode = '42501';
    end if;
    -- What was paid for (slots, dates, the listing) and what was reviewed (wording, picture)
    -- stay as they were. A draft is the vendor's to edit; after "changes requested" the
    -- wording, picture and targeting are, and resubmitting sends them back to review.
    v_open := case old.status
                when 'draft' then array['title', 'image_url', 'product_id', 'placement', 'daily_budget', 'starts_at', 'ends_at',
                                        'target_categories', 'target_cities', 'target_states', 'target_countries']
                when 'changes_requested' then array['title', 'image_url', 'target_categories', 'target_cities', 'target_states', 'target_countries']
                else array[]::text[]
              end;
    if (to_jsonb(new) - v_open) is distinct from (to_jsonb(old) - v_open) then
      raise exception '%', case old.status
          when 'draft' then 'That part of a campaign is set by Cosora and can''t be edited'
          when 'changes_requested' then 'Before you resubmit, the wording, picture and targeting can be changed; the slots and dates stay as they were paid for'
          else 'This campaign has been submitted, so it can''t be edited. Pause it, or book a new campaign'
        end
        using errcode = '42501';
    end if;
  elsif new.status is distinct from old.status and not v_moderator then
    raise exception 'Ad moderation requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  if (new.moderation_reason is distinct from old.moderation_reason
      or new.moderated_at is distinct from old.moderated_at
      or new.moderated_by is distinct from old.moderated_by)
     and not v_moderator then
    raise exception 'Recording an ad moderation reason requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- As it was, plus the first check: a draft is not a purchase.
create or replace function public.create_certificate_order()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v record;
begin
  -- A certificate is printed and posted for a campaign that was bought. The payment functions
  -- write that campaign as 'pending_review'; a draft is something a browser made.
  if new.status = 'draft' then
    return null;
  end if;

  if not exists (
    select 1 from unnest(string_to_array(coalesce(new.placement, ''), ',')) p
     where btrim(p) = 'verifiedCertificate'
  ) then
    return null;
  end if;

  if exists (
    select 1 from public.certificate_orders
     where vendor_id = new.vendor_id
       and status in ('processing', 'printed')
  ) then
    raise warning 'create_certificate_order: vendor % already has an open certificate order; skipping ad %',
      new.vendor_id, new.id;
    return null;
  end if;

  select brand_name, owner_name, phone, address_line, area, city, state, postal_code
    into v
    from public.vendor_profiles
   where id = new.vendor_id;

  insert into public.certificate_orders (
    reference, vendor_id, ad_id, status,
    vendor_name, contact_name, contact_phone,
    address_line, area, city, state, postal_code,
    purchased_at
  ) values (
    'CERT-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.certificate_reference_seq')::text, 3, '0'),
    new.vendor_id, new.id, 'processing',
    v.brand_name, v.owner_name, v.phone,
    v.address_line, v.area, v.city, v.state, v.postal_code,
    coalesce(new.created_at, now())
  );
  return null;
exception when others then
  raise warning 'create_certificate_order failed for ad % (vendor %): %',
    new.id, new.vendor_id, sqlerrm;
  return null;
end $function$;

-- ── 2. Counts, ratings and dates ───────────────────────────────────────────────────
-- Each guard fires only when one of its columns is written (or on a new row), and only a
-- browser's write is changed. No comparison of the vectors: their operators live in another
-- schema than these functions' empty search path (as trg_rfqs_embedding_guard).
create or replace function public.products_server_columns_guard()
returns trigger
language plpgsql set search_path = '' as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.views_count     := 0;
    new.enquiries_count := 0;
    new.sold_count      := 0;
    new.rating_avg      := 0;
    new.reviews_count   := 0;
    new.created_at      := now();
    new.embedding       := null;
  else
    new.views_count     := old.views_count;
    new.enquiries_count := old.enquiries_count;
    new.sold_count      := old.sold_count;
    new.rating_avg      := old.rating_avg;
    new.reviews_count   := old.reviews_count;
    new.created_at      := old.created_at;
    new.embedding       := old.embedding;
  end if;
  -- The category's name, never a name of the seller's choosing (trg_products_sync_category_name
  -- only runs when category_id is written).
  new.category_name := (select c.name from public.categories c where c.id = new.category_id);
  return new;
end
$function$;
create trigger trg_products_server_columns
  before insert or update of views_count, enquiries_count, sold_count, rating_avg, reviews_count, created_at, embedding, category_name
  on public.products
  for each row execute function public.products_server_columns_guard();

create or replace function public.product_videos_server_columns_guard()
returns trigger
language plpgsql set search_path = '' as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.likes_count := 0;
    new.views_count := 0;
    new.rating      := 0;
    new.reviews     := null;
    new.created_at  := now();
    new.embedding   := null;
  else
    new.likes_count := old.likes_count;
    new.views_count := old.views_count;
    new.rating      := old.rating;
    new.reviews     := old.reviews;
    new.created_at  := old.created_at;
    new.embedding   := old.embedding;
  end if;
  return new;
end
$function$;
create trigger trg_product_videos_server_columns
  before insert or update of likes_count, views_count, rating, reviews, created_at, embedding
  on public.product_videos
  for each row execute function public.product_videos_server_columns_guard();

create or replace function public.vendor_profiles_server_columns_guard()
returns trigger
language plpgsql set search_path = '' as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.followers_count              := 0;
    new.created_at                   := now();
    new.catalog_embedding            := null;
    new.catalog_embedding_updated_at := null;
  else
    new.followers_count              := old.followers_count;
    new.created_at                   := old.created_at;
    new.catalog_embedding            := old.catalog_embedding;
    new.catalog_embedding_updated_at := old.catalog_embedding_updated_at;
  end if;
  return new;
end
$function$;
create trigger trg_vendor_profiles_server_columns
  before insert or update of followers_count, created_at, catalog_embedding, catalog_embedding_updated_at
  on public.vendor_profiles
  for each row execute function public.vendor_profiles_server_columns_guard();

-- One function for the tables where the only server-owned value is when the row was made:
-- a requirement dated in the future sits first in every seller's Leads and outlives the age
-- windows; a review dated in the future sits first on a seller's page.
create or replace function public.created_at_guard()
returns trigger
language plpgsql set search_path = '' as $function$
begin
  if current_user = 'authenticated' then
    new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  end if;
  return new;
end
$function$;
create trigger trg_rfqs_created_at before insert or update of created_at on public.rfqs
  for each row execute function public.created_at_guard();
create trigger trg_reviews_created_at before insert or update of created_at on public.reviews
  for each row execute function public.created_at_guard();
create trigger trg_product_reviews_created_at before insert or update of created_at on public.product_reviews
  for each row execute function public.created_at_guard();
create trigger trg_service_reviews_created_at before insert or update of created_at on public.service_reviews
  for each row execute function public.created_at_guard();

-- ── 3. Catalogues ──────────────────────────────────────────────────────────────────
-- The rule enforce_product_videos_moderation() applies to a video's status. A moderator's
-- approval comes through approve_vendor_content() (a definer function), not through here.
create or replace function public.catalogues_moderation_guard()
returns trigger
language plpgsql set search_path = 'public' as $function$
declare
  v_moderator boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  v_moderator := coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator'), false);

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'under_review') and not v_moderator then
      new.status := 'under_review';
    end if;
    new.created_at := now();
    return new;
  end if;

  new.created_at := old.created_at;
  if new.status is distinct from old.status then
    if auth.uid() = old.vendor_id then
      if new.status not in ('draft', 'under_review') then
        raise exception 'Vendors cannot set catalogue status to %; moderation required', new.status
          using errcode = '42501';
      end if;
    elsif not v_moderator then
      raise exception 'Catalogue moderation requires the super_admin or product_moderator role'
        using errcode = '42501';
    end if;
  end if;
  return new;
end
$function$;
create trigger trg_catalogues_moderation before insert or update on public.catalogues
  for each row execute function public.catalogues_moderation_guard();

-- ── 4. Grants ──────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array['public.products_server_columns_guard()', 'public.product_videos_server_columns_guard()',
                           'public.vendor_profiles_server_columns_guard()', 'public.created_at_guard()',
                           'public.catalogues_moderation_guard()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$grants$;
