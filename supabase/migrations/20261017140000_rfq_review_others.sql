-- ─────────────────────────────────────────────────────────────────────────────
-- Requirements are reviewed before sellers see them; "Others (custom)" reaches every seller (2026-10-17)
--
-- Mitra: "RFQs should go through the admin panel for approval and the buyer should know it has gone for review
-- and that it usually takes 3–5 minutes. If the admin doesn't approve it, they pick a proper reason made in
-- advance (by a manager), and the buyer is notified." And: "in Post your requirement add an 'Others' option for
-- totally custom clothes that fall in no category; those are shown to all types of manufacturers." Asked whether
-- a requirement nobody reviews should go live by itself: no, it always waits for an admin. This reverses the
-- 2026-10-02 rule "an RFQ is live the moment it's posted" (rfq-leads-pipeline design, claude.md).
--
-- HOW. A posted requirement (Post Your Requirement and Quick Quote: the app's createRfq) is written to
-- rfq_submissions, not to rfqs. Nothing about rfqs changes for sellers: they see only rfqs rows. Approving copies
-- the submission into rfqs (admin_rfq_review), so every existing trigger runs exactly as a buyer's post did:
-- overseas head start, embedding, seller alerts, CRM, the audit log, and the 48-hour alert window, all counted
-- from approval. Rejecting keeps the submission with the reason; the buyer is notified either way.
--
--   rfq_submissions            the buyer's own requirement until reviewed (pending / approved / rejected)
--   admin.rfq_review_reasons   the reasons a reviewer picks from, written by managers and super admins
--   admin_rfq_submissions()    the review queue (super_admin, product_moderator, manager)
--   admin_rfq_review()         approve, or reject with a reason; notifies the buyer
--   admin_rfq_review_reasons() / admin_rfq_review_reason_save()   the reasons list
--   rfqs_insert                a buyer may write only a request to one seller (a product page's quote request)
--                              straight to rfqs; an open requirement goes through review
--
-- "Others (custom)": a root category. match_rfq_vendors and match_vendor_rfqs treat it as a category match for
-- every seller with a live listing, and lead_alert_fanout doesn't let a seller's own category filter skip it.
-- Bodies = production's of 2026-10-17 (md5 match_rfq_vendors 475f23bc…, match_vendor_rfqs b7da5dea…,
-- admin.lead_alert_fanout e42c8284…) with only those lines changed, marked "2026-10-17".
-- ─────────────────────────────────────────────────────────────────────────────

-- ── "Others (custom)" ──────────────────────────────────────────────────────────
insert into public.categories (name, grp, parent_id)
select 'Others (Custom)', 'Taxonomy', null
 where not exists (select 1 from public.categories where name = 'Others (Custom)' and parent_id is null);

create or replace function public.rfq_category_is_open(p_category_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select coalesce(p_category_id is not null and exists (
    select 1 from public.categories c where c.id = p_category_id and c.name = 'Others (Custom)' and c.parent_id is null), false);
$function$;
revoke all on function public.rfq_category_is_open(uuid) from public;
grant execute on function public.rfq_category_is_open(uuid) to anon, authenticated;

-- ── Reasons ────────────────────────────────────────────────────────────────────
create table if not exists admin.rfq_review_reasons (
  id             uuid primary key default gen_random_uuid(),
  label          text not null constraint rfq_review_reasons_label check (char_length(btrim(label)) between 3 and 80),
  buyer_message  text not null constraint rfq_review_reasons_message check (char_length(btrim(buyer_message)) between 10 and 400),
  active         boolean not null default true,
  sort           integer not null default 0,
  updated_by     uuid references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now()
);
alter table admin.rfq_review_reasons enable row level security;
revoke all on admin.rfq_review_reasons from public, anon, authenticated;

insert into admin.rfq_review_reasons (label, buyer_message, sort)
select * from (values
  ('Details missing', 'Your requirement needs more detail for sellers to quote: what the item is, the quantity, and any size, fabric or colour you need. Please post it again with those details.', 1),
  ('Contact details in the text', 'Phone numbers, emails and links can''t be shared in a requirement. Sellers contact you through Cosora once they quote. Please post it again without them.', 2),
  ('Not allowed on Cosora', 'This item isn''t allowed on Cosora, so we can''t send it to sellers.', 3),
  ('Already posted', 'You''ve already posted this requirement, and it''s live. Sellers are quoting on that one.', 4),
  ('Not a textile or fashion requirement', 'Cosora connects buyers with textile, fashion and related businesses. This requirement is outside what our sellers offer.', 5),
  ('Quantity or price unclear', 'The quantity or budget doesn''t look right. Please check them and post the requirement again.', 6)
) as v(label, buyer_message, sort)
where not exists (select 1 from admin.rfq_review_reasons);

-- ── Submissions ────────────────────────────────────────────────────────────────
create table if not exists public.rfq_submissions (
  id             uuid primary key default gen_random_uuid(),
  buyer_id       uuid not null references auth.users (id) on delete cascade,
  title          text not null constraint rfq_submissions_title check (char_length(btrim(title)) between 1 and 200),
  product_name   text constraint rfq_submissions_product_name check (product_name is null or char_length(product_name) <= 200),
  quantity       integer constraint rfq_submissions_quantity check (quantity is null or quantity between 0 and 100000000),
  budget_min     numeric constraint rfq_submissions_budget_min check (budget_min is null or budget_min >= 0),
  budget_max     numeric constraint rfq_submissions_budget_max check (budget_max is null or budget_max >= 0),
  description    text constraint rfq_submissions_description check (description is null or char_length(description) <= 4000),
  image          text,
  images         text[] constraint rfq_submissions_images check (images is null or cardinality(images) <= 6),
  category_id    uuid references public.categories (id) on delete set null,
  attributes     jsonb not null default '{}'::jsonb
                 constraint rfq_submissions_attributes check (jsonb_typeof(attributes) = 'object' and octet_length(attributes::text) <= 8192),
  state          text not null default 'pending' constraint rfq_submissions_state check (state in ('pending', 'approved', 'rejected')),
  reason_id      uuid references admin.rfq_review_reasons (id) on delete set null,
  -- What the buyer reads: the reason's message as it was when chosen, and the reviewer's own note.
  buyer_message  text,
  review_note    text constraint rfq_submissions_note check (review_note is null or char_length(review_note) <= 500),
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  rfq_id         uuid references public.rfqs (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists rfq_submissions_queue_idx on public.rfq_submissions (created_at) where state = 'pending';
create index if not exists rfq_submissions_buyer_idx on public.rfq_submissions (buyer_id, created_at desc);

alter table public.rfq_submissions enable row level security;
drop policy if exists rfq_submissions_select on public.rfq_submissions;
create policy rfq_submissions_select on public.rfq_submissions for select to authenticated
  using (buyer_id = (select auth.uid()));
drop policy if exists rfq_submissions_insert on public.rfq_submissions;
create policy rfq_submissions_insert on public.rfq_submissions for insert to authenticated
  with check (buyer_id = (select auth.uid()) and (select public.account_is_active((select auth.uid()))));

revoke all on public.rfq_submissions from public, anon, authenticated;
-- The buyer reads their own, without who reviewed it.
grant select (id, buyer_id, title, product_name, quantity, budget_min, budget_max, description, image, images,
              category_id, attributes, state, buyer_message, review_note, reviewed_at, rfq_id, created_at)
  on public.rfq_submissions to authenticated;
grant insert (buyer_id, title, product_name, quantity, budget_min, budget_max, description, image, images, category_id, attributes)
  on public.rfq_submissions to authenticated;

-- A new submission is always pending, with today's time and nobody's review; at most 10 waiting per buyer.
create or replace function public.rfq_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.state := 'pending';
  new.reason_id := null; new.buyer_message := null; new.review_note := null;
  new.reviewed_by := null; new.reviewed_at := null; new.rfq_id := null;
  new.created_at := now();
  if (select count(*) from public.rfq_submissions s where s.buyer_id = new.buyer_id and s.state = 'pending') >= 10 then
    raise exception 'You have 10 requirements waiting for review. Please wait for those to be checked.' using errcode = '23514';
  end if;
  return new;
end
$function$;
drop trigger if exists trg_rfq_submissions_guard on public.rfq_submissions;
create trigger trg_rfq_submissions_guard before insert on public.rfq_submissions
  for each row execute function public.rfq_submissions_guard();

drop trigger if exists trg_admin_audit on public.rfq_submissions;
create trigger trg_admin_audit after insert or update or delete on public.rfq_submissions
  for each row execute function admin.audit_row_change('buyer_id');

-- ── An open requirement can't skip review ─────────────────────────────────────
-- Only a request to one seller (a product page's quote request: vendor_id set) is written straight to rfqs.
drop policy if exists rfqs_insert on public.rfqs;
create policy rfqs_insert on public.rfqs for insert
  with check ((buyer_id = (select auth.uid())) and (select public.account_is_active((select auth.uid())))
              and vendor_id is not null);

-- ── Review ─────────────────────────────────────────────────────────────────────
create or replace function admin.require_rfq_reviewer()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.is_admin()
                  and public.admin_role()::text in ('super_admin', 'product_moderator', 'manager'), false) then
    raise exception 'not authorized: reviewing requirements needs a super admin, a product moderator or a manager'
      using errcode = '42501';
  end if;
end
$function$;
revoke all on function admin.require_rfq_reviewer() from public, anon, authenticated;

create or replace function public.admin_rfq_review_reasons()
returns table (id uuid, label text, buyer_message text, active boolean, sort integer, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform admin.require_rfq_reviewer();
  return query select r.id, r.label, r.buyer_message, r.active, r.sort, r.updated_at
                 from admin.rfq_review_reasons r order by r.active desc, r.sort, r.label;
end
$function$;

create or replace function public.admin_rfq_review_reason_save(
  p_id uuid, p_label text, p_buyer_message text, p_active boolean default true, p_sort integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_msg   text := nullif(btrim(coalesce(p_buyer_message, '')), '');
  v_id    uuid;
begin
  if coalesce(public.admin_role()::text, '') not in ('super_admin', 'manager') then
    raise exception 'not authorized: managers and super admins write the reasons' using errcode = '42501';
  end if;
  if v_label is null or char_length(v_label) not between 3 and 80 then
    raise exception 'A reason needs a short name (3 to 80 characters).' using errcode = '22023';
  end if;
  if v_msg is null or char_length(v_msg) not between 10 and 400 then
    raise exception 'The message to the buyer needs 10 to 400 characters.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into admin.rfq_review_reasons (label, buyer_message, active, sort, updated_by)
    values (v_label, v_msg, coalesce(p_active, true),
            coalesce(p_sort, (select coalesce(max(sort), 0) + 1 from admin.rfq_review_reasons)), auth.uid())
    returning id into v_id;
  else
    update admin.rfq_review_reasons r
       set label = v_label, buyer_message = v_msg, active = coalesce(p_active, true),
           sort = coalesce(p_sort, r.sort), updated_by = auth.uid(), updated_at = now()
     where r.id = p_id
    returning r.id into v_id;
    if v_id is null then
      raise exception 'That reason no longer exists.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end
$function$;

create or replace function public.admin_rfq_submissions(p_state text default 'pending', p_limit integer default 100)
returns table (
  id uuid, buyer_id uuid, buyer_name text, buyer_phone_unverified boolean, title text, product_name text,
  quantity integer, budget_min numeric, budget_max numeric, description text, images text[], category text,
  attributes jsonb, state text, reason_label text, buyer_message text, review_note text, reviewed_at timestamptz,
  reviewer_name text, rfq_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform admin.require_rfq_reviewer();
  if p_state not in ('pending', 'approved', 'rejected') then
    raise exception 'Unknown state %', p_state using errcode = '22023';
  end if;
  return query
  select s.id, s.buyer_id, p.full_name,
         coalesce((select u.raw_app_meta_data ->> 'created_by' = 'otp-dev-verify' from auth.users u where u.id = s.buyer_id), false),
         s.title, s.product_name, s.quantity, s.budget_min, s.budget_max, s.description,
         coalesce(s.images, case when s.image is not null then array[s.image] end),
         c.name, s.attributes, s.state, rr.label, s.buyer_message, s.review_note, s.reviewed_at,
         rp.full_name, s.rfq_id, s.created_at
    from public.rfq_submissions s
    left join public.profiles p on p.id = s.buyer_id
    left join public.categories c on c.id = s.category_id
    left join admin.rfq_review_reasons rr on rr.id = s.reason_id
    left join public.profiles rp on rp.id = s.reviewed_by
   where s.state = p_state
   -- The queue oldest first (it should clear in minutes); decisions newest first.
   order by case when p_state = 'pending' then s.created_at end asc,
            case when p_state <> 'pending' then s.reviewed_at end desc nulls last
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end
$function$;

create or replace function public.admin_rfq_pending_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform admin.require_rfq_reviewer();
  return (select count(*)::integer from public.rfq_submissions where state = 'pending');
end
$function$;

create or replace function public.admin_rfq_review(
  p_id uuid, p_decision text, p_reason_id uuid default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s       public.rfq_submissions;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_msg   text;
  v_rfq   uuid;
  v_title text;
begin
  perform admin.require_rfq_reviewer();
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decide approve or reject.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'The note can be at most 500 characters.' using errcode = '22023';
  end if;

  select * into s from public.rfq_submissions x where x.id = p_id for update;
  if not found then
    raise exception 'That requirement doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.state <> 'pending' then
    raise exception 'This requirement was already reviewed.' using errcode = '55000';
  end if;
  v_title := left(btrim(s.title), 80);

  if p_decision = 'approve' then
    -- As the buyer's own post would have been: every rfqs trigger runs now.
    insert into public.rfqs (buyer_id, title, product_name, quantity, budget_min, budget_max, description,
                             image, images, category_id, status, attributes)
    values (s.buyer_id, s.title, coalesce(s.product_name, s.title), s.quantity, s.budget_min, s.budget_max,
            s.description, s.image, s.images, s.category_id, 'active', s.attributes)
    returning id into v_rfq;
    update public.rfq_submissions
       set state = 'approved', rfq_id = v_rfq, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;
    perform public.notify(s.buyer_id, 'rfq_review', 'Your requirement is live',
      '"' || v_title || '" was approved. Sellers can now see it and send you quotes.', null);
    return v_rfq;
  end if;

  select r.buyer_message into v_msg from admin.rfq_review_reasons r where r.id = p_reason_id and r.active;
  if v_msg is null then
    raise exception 'Pick a reason: the buyer reads it.' using errcode = '22023';
  end if;
  update public.rfq_submissions
     set state = 'rejected', reason_id = p_reason_id, buyer_message = v_msg, review_note = v_note,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
  perform public.notify(s.buyer_id, 'rfq_review', 'Your requirement wasn''t approved',
    '"' || v_title || '": ' || v_msg || coalesce(' ' || v_note, ''), null);
  return null;
end
$function$;

revoke all on function public.admin_rfq_review_reasons(), public.admin_rfq_review_reason_save(uuid, text, text, boolean, integer),
  public.admin_rfq_submissions(text, integer), public.admin_rfq_pending_count(), public.admin_rfq_review(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.admin_rfq_review_reasons(), public.admin_rfq_review_reason_save(uuid, text, text, boolean, integer),
  public.admin_rfq_submissions(text, integer), public.admin_rfq_pending_count(), public.admin_rfq_review(uuid, text, uuid, text)
  to authenticated;

-- ── Matching: "Others (custom)" is every seller's category ─────────────────────
CREATE OR REPLACE FUNCTION public.match_vendor_rfqs(p_vendor_id uuid, match_count integer DEFAULT 200)
 RETURNS TABLE(rfq_id uuid, similarity double precision, category_match boolean, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_tier text := admin.vendor_overseas_tier(p_vendor_id);
begin
  if auth.uid() is not null and p_vendor_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with v as materialized (
    select vp.catalog_embedding as emb,
           (select array_agg(distinct p.category_id)
              from public.products p
             where p.vendor_id = vp.id
               and p.status = 'live'
               and p.category_id is not null) as cat_ids
    from public.vendor_profiles vp
    where vp.id = p_vendor_id
  ),
  pool as (
    select r.id, r.embedding, r.category_id
    from public.rfqs r
    where r.status = 'active'
      and r.vendor_id is null
      -- Overseas requirements are Gold's and VIP's (P7), or a vendor's who already quoted.
      -- overseas_rfq_visible's rule, inline (it is tested on every row).
      and (not r.overseas
           or v_tier = 'vip'
           or (v_tier = 'gold' and (r.overseas_vip_until is null or now() >= r.overseas_vip_until))
           or exists (select 1 from public.quotes q where q.rfq_id = r.id and q.vendor_id = p_vendor_id))
  ),
  scored as (
    select
      pool.id as rfq_id,
      case when v.emb is not null and pool.embedding is not null
           then (1 - (pool.embedding <=> v.emb))::double precision
      end as similarity,
      coalesce(pool.category_id is not null
                 and (pool.category_id = any(v.cat_ids)
                      -- 2026-10-17: "Others (custom)" is every seller's category (one with a live listing).
                      or (public.rfq_category_is_open(pool.category_id) and v.cat_ids is not null)), false) as category_match
    from pool cross join v
  )
  select
    s.rfq_id,
    s.similarity,
    s.category_match,
    (0.7 * coalesce(s.similarity, 0)
       + 0.3 * s.category_match::int)::double precision as score
  from scored s
  order by score desc, s.similarity desc nulls last, s.rfq_id
  limit coalesce(match_count, 200);
end
$function$;

CREATE OR REPLACE FUNCTION public.match_rfq_vendors(p_rfq_id uuid, match_count integer DEFAULT 20)
 RETURNS TABLE(vendor_id uuid, similarity double precision, category_match boolean, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with rfq as (
    select r.id, r.embedding, r.category_id
    from public.rfqs r
    where r.id = p_rfq_id
  ),
  vec as (
    select v.id as vendor_id,
           (1 - (v.catalog_embedding <=> (select embedding from rfq)))::double precision as similarity
    from public.vendor_profiles v
    where v.catalog_embedding is not null
      and (select embedding from rfq) is not null
    order by v.catalog_embedding <=> (select embedding from rfq)
    limit greatest(coalesce(match_count, 20), 20)
  ),
  cat as (
    select distinct p.vendor_id
    from public.products p, rfq r
    where p.status = 'live'
      and r.category_id is not null
      -- 2026-10-17: "Others (custom)" is every seller's category (one with a live listing).
      and (p.category_id = r.category_id or public.rfq_category_is_open(r.category_id))
  )
  select
    coalesce(vec.vendor_id, cat.vendor_id)                          as vendor_id,
    vec.similarity                                                  as similarity,
    (cat.vendor_id is not null)                                     as category_match,
    (0.7 * coalesce(vec.similarity, 0)
       + 0.3 * (cat.vendor_id is not null)::int)::double precision  as score
  from vec
  full outer join cat on cat.vendor_id = vec.vendor_id
  order by score desc, similarity desc nulls last, 1
  limit coalesce(match_count, 20);
$function$;

CREATE OR REPLACE FUNCTION admin.lead_alert_fanout(p_rfq uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r        public.rfqs;
  cfg      admin.lead_alert_config;
  m        record;
  s        public.lead_alert_settings;
  v_plan   text[];
  v_now    text[];
  v_ext    text[];
  v_sent   text[];
  v_res    jsonb;
  v_held   text;
  v_id     uuid;
  v_cat    text;
  v_title  text;
  v_qty    text;
  v_clock  time := (now() at time zone 'Asia/Kolkata')::time;
  v_before integer;
  v_wait   text;
  n        integer := 0;
begin
  select * into r from public.rfqs where id = p_rfq;
  if not found or r.status::text <> 'active' or r.vendor_id is not null or r.removed_at is not null then
    return 0;
  end if;
  select * into cfg from admin.lead_alert_config;
  if r.created_at < now() - make_interval(hours => cfg.max_age_hours) then
    return 0;
  end if;
  -- One buyer's fan-outs run one at a time. The buyer's daily cap and a requirement's total
  -- count what earlier fan-outs wrote, so two running together would each find room: a
  -- buyer posting several requirements in the same instant would pass the cap with all of
  -- them. The lock is the buyer's own, so one account can't hold up anyone else's post. (The
  -- vendor's hourly cap is counted without a lock across buyers: fan-outs from different
  -- buyers that overlap can exceed it by as many as overlap.) The wait is bounded: a
  -- fan-out that can't start within three seconds raises, which its callers record and the
  -- daily run retries.
  v_wait := current_setting('lock_timeout');
  perform set_config('lock_timeout', '3s', true);
  perform pg_advisory_xact_lock(hashtextextended('cosora.lead_alert_fanout:' || r.buyer_id::text, 0));
  perform set_config('lock_timeout', v_wait, true);

  -- One buyer can't use alerts to reach vendors at will: past buyer_daily_cap requirements
  -- that raised alerts in 24 hours, the next ones tell nobody (they are still on Leads).
  if (select count(*) from admin.lead_alert_runs x join public.rfqs q on q.id = x.rfq_id
       where q.buyer_id = r.buyer_id and x.rfq_id <> p_rfq and x.alerted > 0 and x.ran_at > now() - interval '24 hours') >= cfg.buyer_daily_cap then
    insert into admin.lead_alert_runs (rfq_id, with_embedding, skipped) values (p_rfq, r.embedding is not null, 'buyer_cap')
    on conflict (rfq_id) do update set ran_at = now(), skipped = 'buyer_cap', error = null;
    return 0;
  end if;
  insert into admin.lead_alert_runs (rfq_id, with_embedding) values (p_rfq, r.embedding is not null)
  on conflict (rfq_id) do update
     set ran_at = now(), with_embedding = admin.lead_alert_runs.with_embedding or excluded.with_embedding, error = null;
  -- Both passes together tell at most max_vendors vendors.
  select count(*) into v_before from admin.lead_alerts a where a.rfq_id = p_rfq;

  select c.name into v_cat from public.categories c where c.id = r.category_id;
  v_title := admin.alert_text(coalesce(nullif(btrim(r.title), ''), r.product_name), 120);
  v_qty := case when r.quantity is not null and r.quantity > 0 then r.quantity::text else null end;

  -- More candidates than will be told are asked for: before the embedding arrives every
  -- vendor in the category scores the same, and who is told must not depend on their id.
  for m in
    select x.vendor_id, x.category_match, x.score, e.plan_id, p.limits
      from public.match_rfq_vendors(p_rfq, cfg.max_vendors * 4) x
      cross join lateral admin.vendor_effective_plan(x.vendor_id, now()) e
      join public.subscription_plans p on p.id = e.plan_id
     where (x.category_match or coalesce(x.similarity, 0) >= cfg.min_similarity)
       and x.vendor_id <> r.buyer_id
       and jsonb_array_length(coalesce(p.limits -> 'lead_alert_channels', '[]'::jsonb)) > 0
       and admin.feature_on_for('lead_alerts', x.vendor_id)
       and public.vendor_account_in_good_standing(x.vendor_id)
       and public.overseas_rfq_visible(r.overseas, r.overseas_vip_until, admin.vendor_overseas_tier(x.vendor_id))
     -- VIP is told first; then the closest match; between equals, the bigger plan.
     order by coalesce((p.limits ->> 'lead_alert_priority')::boolean, false) desc, x.score desc, p.sort_order desc, x.vendor_id
  loop
    exit when v_before + n >= cfg.max_vendors;
    select * into s from public.lead_alert_settings ls where ls.vendor_id = m.vendor_id;
    -- 2026-10-17: a seller's own category filter doesn't skip "Others (custom)": it is meant for every seller.
    if s.category_ids is not null and not public.rfq_category_is_open(r.category_id)
       and (r.category_id is null or not (r.category_id = any (s.category_ids))) then
      continue;
    end if;

    v_plan := array(select jsonb_array_elements_text(m.limits -> 'lead_alert_channels'));
    v_now := array(select c from unnest(v_plan) c where c <> 'digest');
    v_held := null;
    if not coalesce(s.instant, true) then
      v_now := '{}'; v_held := 'off';
    elsif cardinality(v_now) = 0 then
      v_held := 'digest_only';
    elsif (select count(*) from admin.lead_alerts a
            where a.vendor_id = m.vendor_id and a.created_at > now() - interval '1 hour' and cardinality(a.channels) > 0) >= cfg.hourly_cap then
      v_now := '{}'; v_held := 'rate_limit';
    elsif s.quiet_start is not null and (
            (s.quiet_start <= s.quiet_end and v_clock >= s.quiet_start and v_clock < s.quiet_end)
            or (s.quiet_start > s.quiet_end and (v_clock >= s.quiet_start or v_clock < s.quiet_end))) then
      -- Quiet hours: the bell still rings; nothing is sent to a phone or inbox.
      v_now := array(select c from unnest(v_now) c where c = 'app'); v_held := 'quiet_hours';
    end if;

    v_id := null;
    insert into admin.lead_alerts (rfq_id, vendor_id, score, category_match, plan_id, held)
    values (p_rfq, m.vendor_id, m.score, m.category_match, m.plan_id, v_held)
    on conflict (rfq_id, vendor_id) do nothing
    returning id into v_id;
    if v_id is null then
      continue;   -- told on the first pass
    end if;
    n := n + 1;

    -- The row records what actually went out: the bell, and each channel a message was
    -- queued on (not one that is waiting for a template, a consent or an address).
    v_sent := '{}';
    if 'app' = any (v_now) then
      perform public.notify(m.vendor_id, 'lead_match', 'New requirement: ' || v_title,
        coalesce(v_cat || '. ', '') || coalesce('Quantity ' || v_qty || '. ', '') || 'Open your leads to send a quote.', null);
      v_sent := array['app'];
    end if;
    v_ext := array(select c from unnest(v_now) c where c <> 'app');
    if cardinality(v_ext) > 0 then
      -- The vendor's own name, Cosora's category and a number: nothing the buyer wrote.
      v_res := public.notify_deliver(m.vendor_id, 'lead_alert',
        jsonb_build_object(
          'name', (select coalesce(nullif(btrim(v.brand_name), ''), 'there') from public.vendor_profiles v where v.id = m.vendor_id),
          'category', coalesce(v_cat, 'Uncategorised'), 'quantity', coalesce(v_qty, 'not given')),
        'lead_alert:' || p_rfq || ':' || m.vendor_id, v_ext);
      v_sent := v_sent || array(select t.k from jsonb_each_text(coalesce(v_res -> 'channels', '{}'::jsonb)) as t(k, v)
                                 where t.v = 'queued' order by t.k);
    end if;
    if cardinality(v_sent) > 0 then
      update admin.lead_alerts set channels = v_sent where id = v_id;
    end if;
  end loop;
  if n > 0 then
    update admin.lead_alert_runs set alerted = alerted + n where rfq_id = p_rfq;
  end if;
  return n;
end
$function$;


-- Self-checks
do $$
declare
  f text;
begin
  if not exists (select 1 from public.categories where name = 'Others (Custom)' and parent_id is null) then
    raise exception 'self-check: the Others (Custom) category is missing';
  end if;
  if (select count(*) from admin.rfq_review_reasons where active) < 1 then
    raise exception 'self-check: no review reasons';
  end if;
  if (select with_check from pg_policies where tablename = 'rfqs' and policyname = 'rfqs_insert') !~ 'vendor_id IS NOT NULL' then
    raise exception 'self-check: an open requirement can still skip review';
  end if;
  if has_table_privilege('anon', 'public.rfq_submissions', 'select') or has_table_privilege('authenticated', 'public.rfq_submissions', 'update')
     or has_column_privilege('authenticated', 'public.rfq_submissions', 'reviewed_by', 'select')
     or has_column_privilege('authenticated', 'public.rfq_submissions', 'state', 'insert') then
    raise exception 'self-check: rfq_submissions grants are too wide';
  end if;
  foreach f in array array['public.admin_rfq_review(uuid,text,uuid,text)', 'public.admin_rfq_submissions(text,integer)',
                           'public.admin_rfq_review_reason_save(uuid,text,text,boolean,integer)', 'public.admin_rfq_review_reasons()',
                           'public.admin_rfq_pending_count()'] loop
    if has_function_privilege('anon', f::regprocedure, 'execute') or not (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception 'self-check: % is open to anon or not SECURITY DEFINER', f;
    end if;
  end loop;
  if pg_get_functiondef('public.match_rfq_vendors(uuid,integer)'::regprocedure) !~ 'rfq_category_is_open'
     or pg_get_functiondef('public.match_vendor_rfqs(uuid,integer)'::regprocedure) !~ 'rfq_category_is_open'
     or pg_get_functiondef('admin.lead_alert_fanout(uuid)'::regprocedure) !~ 'rfq_category_is_open' then
    raise exception 'self-check: matching does not know Others (Custom)';
  end if;
end $$;
