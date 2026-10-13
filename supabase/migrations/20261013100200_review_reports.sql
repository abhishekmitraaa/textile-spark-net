-- Reporting a review (2026-10-13; ToDo "Decide whether reviews can be reported, and build it
-- if so"; Mitra: any signed-in user may report).
--
-- A signed-in, active account reports a store review (public.reviews), a product review
-- (public.product_reviews) or a service review (public.service_reviews) with a reason from
-- one list and an optional note. Cosora's team (super admin, support) reads the queue in
-- Cosora-Admin and dismisses the reports or removes the review.
--
-- Rules, all in the database:
--   * nobody reports their own review; one open report per account per review;
--   * at most 10 reports per account in 24 hours, counted under a lock per reporter, so
--     requests sent together can't pass the limit;
--   * the review is copied onto the report when it is filed (what it said, who wrote it,
--     what it was about), so the record survives the review's removal or its author's edit;
--   * removing needs a reason; it deletes the review (the rating follows through the
--     existing sync triggers), closes every open report on it, and tells the author with
--     Cosora's own words. No notice names who reported, or says that a report was made;
--   * the reporter is told nothing more than "reported": a decision isn't sent back.
--
-- Reasons are one list, admin.review_report_reasons, read by both apps through
-- review_report_reasons(); add a reason there, never as a UI constant.

create table if not exists admin.review_report_reasons (
  code     text primary key check (code ~ '^[a-z_]{2,40}$'),
  label    text not null,
  position integer not null default 100,
  active   boolean not null default true
);

insert into admin.review_report_reasons (code, label, position) values
  ('fake',          'Fake or not a real customer', 10),
  ('abusive',       'Abusive or hateful language', 20),
  ('spam',          'Spam or advertising', 30),
  ('personal_info', 'Shares private or contact details', 40),
  ('wrong_subject', 'About a different seller or product', 50),
  ('other',         'Something else', 90)
on conflict (code) do nothing;

alter table admin.review_report_reasons enable row level security;
revoke all on admin.review_report_reasons from public, anon, authenticated;

create table if not exists admin.review_reports (
  id              uuid primary key default gen_random_uuid(),
  review_kind     text not null check (review_kind in ('store', 'product', 'service')),
  review_id       uuid not null,
  reporter_id     uuid not null references public.profiles (id) on delete cascade,
  reason_code     text not null references admin.review_report_reasons (code),
  note            text check (note is null or char_length(note) <= 500),
  review_snapshot jsonb not null,
  status          text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  created_at      timestamptz not null default clock_timestamp(),
  decided_at      timestamptz,
  decided_by      uuid,
  decision_note   text check (decision_note is null or char_length(decision_note) <= 500),
  constraint review_reports_decided check ((status = 'open') = (decided_at is null))
);

comment on table admin.review_reports is
  'Reports of reviews, filed through public.report_review() and decided through public.admin_review_report_decide() (super admin, support). review_snapshot is the review as it stood when reported.';

create unique index if not exists review_reports_one_open_per_reporter
  on admin.review_reports (review_kind, review_id, reporter_id) where status = 'open';
create index if not exists review_reports_status_created_idx on admin.review_reports (status, created_at desc);
create index if not exists review_reports_review_idx on admin.review_reports (review_kind, review_id);
create index if not exists review_reports_reporter_created_idx on admin.review_reports (reporter_id, created_at desc);

alter table admin.review_reports enable row level security;
revoke all on admin.review_reports from public, anon, authenticated;

-- Decisions reach the Admin Log like every other admin change.
create or replace trigger trg_admin_audit
  after insert or delete or update on admin.review_reports
  for each row execute function admin.audit_row_change('reporter_id');

-- ── The reasons, for both apps ──────────────────────────────────────────────
create or replace function public.review_report_reasons()
returns table (code text, label text)
language sql
stable
security definer
set search_path = ''
as $function$
  select r.code, r.label from admin.review_report_reasons r where r.active order by r.position, r.code
$function$;

revoke all on function public.review_report_reasons() from public, anon;
grant execute on function public.review_report_reasons() to authenticated;

-- ── One review, whichever table it is in ────────────────────────────────────
-- Returns null when there is no such review. subject_owner is the seller the review is
-- about (null for a service review: those subjects have no account).
create or replace function admin.review_lookup(p_kind text, p_review_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v jsonb;
begin
  if p_kind = 'store' then
    select jsonb_build_object(
             'author_id', r.buyer_id, 'reviewer_name', r.reviewer_name, 'rating', r.rating, 'body', r.body,
             'created_at', r.created_at, 'subject_owner', r.vendor_id,
             'subject_id', r.vendor_id::text, 'subject_name', vp.brand_name)
      into v
      from public.reviews r
      left join public.vendor_profiles vp on vp.id = r.vendor_id
     where r.id = p_review_id;
  elsif p_kind = 'product' then
    select jsonb_build_object(
             'author_id', r.buyer_id, 'reviewer_name', r.reviewer_name, 'rating', r.rating, 'body', r.body,
             'created_at', r.created_at, 'subject_owner', p.vendor_id,
             'subject_id', r.product_id::text, 'subject_name', p.name)
      into v
      from public.product_reviews r
      left join public.products p on p.id = r.product_id
     where r.id = p_review_id;
  elsif p_kind = 'service' then
    select jsonb_build_object(
             'author_id', r.buyer_id, 'reviewer_name', r.reviewer_name, 'rating', r.rating, 'body', r.body,
             'created_at', r.created_at, 'subject_owner', null,
             'subject_id', r.service_id, 'subject_name', r.service_name, 'service_kind', r.service_kind)
      into v
      from public.service_reviews r
     where r.id = p_review_id;
  else
    raise exception 'unknown review kind %', p_kind using errcode = '22023';
  end if;
  return v;
end
$function$;

revoke all on function admin.review_lookup(text, uuid) from public, anon, authenticated;

-- ── Filing a report ─────────────────────────────────────────────────────────
-- Returns 'reported', 'already_reported' or 'rate_limited'. A limit is an answer, not an error.
create or replace function public.report_review(
  p_kind      text,
  p_review_id uuid,
  p_reason    text,
  p_note      text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid    uuid := auth.uid();
  v_review jsonb;
  v_note   text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
begin
  if v_uid is null then
    raise exception 'Sign in to report a review' using errcode = '42501';
  end if;
  if not coalesce(public.account_is_active(v_uid), false) then
    raise exception 'This account can''t report reviews' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('store', 'product', 'service') then
    raise exception 'unknown review kind %', p_kind using errcode = '22023';
  end if;
  if not exists (select 1 from admin.review_report_reasons r where r.code = p_reason and r.active) then
    raise exception 'Choose a reason for the report' using errcode = '22023';
  end if;

  v_review := admin.review_lookup(p_kind, p_review_id);
  if v_review is null then
    raise exception 'That review is no longer there' using errcode = 'P0002';
  end if;
  if (v_review ->> 'author_id')::uuid = v_uid then
    raise exception 'You can''t report your own review' using errcode = '42501';
  end if;

  -- Count and insert under one lock per reporter: two requests sent together would each
  -- count before either wrote, and both pass.
  perform pg_advisory_xact_lock(hashtextextended('cosora.review_report:' || v_uid::text, 0));

  if exists (select 1 from admin.review_reports rr
              where rr.review_kind = p_kind and rr.review_id = p_review_id
                and rr.reporter_id = v_uid and rr.status = 'open') then
    return 'already_reported';
  end if;
  if (select count(*) from admin.review_reports rr
       where rr.reporter_id = v_uid and rr.created_at > now() - interval '24 hours') >= 10 then
    return 'rate_limited';
  end if;

  insert into admin.review_reports (review_kind, review_id, reporter_id, reason_code, note, review_snapshot)
  values (p_kind, p_review_id, v_uid, p_reason, v_note, v_review - 'subject_owner');
  return 'reported';
end
$function$;

comment on function public.report_review(text, uuid, text, text) is
  'Files a report of a store, product or service review for the signed-in, active account. Not your own review; one open report per review; 10 in 24 hours. Returns reported, already_reported or rate_limited.';

revoke all on function public.report_review(text, uuid, text, text) from public, anon;
grant execute on function public.report_review(text, uuid, text, text) to authenticated;

-- ── The queue, for super admins and support ─────────────────────────────────
create or replace function admin.review_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'support']::public.admin_role_type[]), false)
$function$;

revoke all on function admin.review_moderator() from public, anon, authenticated;

-- One row per report. review_exists says whether the review is still published.
create or replace function public.admin_review_reports_list(p_status text default 'open')
returns table (
  id uuid, review_kind text, review_id uuid, review_exists boolean, review_snapshot jsonb,
  reason_code text, reason_label text, note text, status text, created_at timestamptz,
  reporter_id uuid, reporter_name text, decided_at timestamptz, decided_by_name text, decision_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not admin.review_moderator() then
    raise exception 'not authorized: review reports are for super admins and support' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open', 'removed', 'dismissed') then
    raise exception 'unknown status %', p_status using errcode = '22023';
  end if;
  return query
    select rr.id, rr.review_kind, rr.review_id,
           case rr.review_kind
             when 'store'   then exists (select 1 from public.reviews r where r.id = rr.review_id)
             when 'product' then exists (select 1 from public.product_reviews r where r.id = rr.review_id)
             else                exists (select 1 from public.service_reviews r where r.id = rr.review_id)
           end,
           rr.review_snapshot, rr.reason_code, rs.label, rr.note, rr.status, rr.created_at,
           rr.reporter_id, admin.audit_actor_name(rr.reporter_id),
           rr.decided_at, admin.audit_actor_name(rr.decided_by), rr.decision_note
      from admin.review_reports rr
      join admin.review_report_reasons rs on rs.code = rr.reason_code
     where p_status is null or rr.status = p_status
     order by rr.created_at desc
     limit 500;
end
$function$;

revoke all on function public.admin_review_reports_list(text) from public, anon;
grant execute on function public.admin_review_reports_list(text) to authenticated;

-- Decides every open report on one review. p_action: 'remove' (needs p_note) or 'dismiss'.
-- Returns how many reports it closed.
create or replace function public.admin_review_report_decide(
  p_kind      text,
  p_review_id uuid,
  p_action    text,
  p_note      text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid    uuid := auth.uid();
  v_note   text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_review jsonb;
  v_author uuid;
  v_count  integer;
begin
  if not admin.review_moderator() then
    raise exception 'not authorized: review reports are for super admins and support' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('store', 'product', 'service') then
    raise exception 'unknown review kind %', p_kind using errcode = '22023';
  end if;
  if p_action is null or p_action not in ('remove', 'dismiss') then
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;
  if p_action = 'remove' and v_note is null then
    raise exception 'Say why the review is being removed' using errcode = '22023';
  end if;
  if not exists (select 1 from admin.review_reports rr
                  where rr.review_kind = p_kind and rr.review_id = p_review_id and rr.status = 'open') then
    raise exception 'There is no open report on that review' using errcode = 'P0002';
  end if;

  perform set_config('cosora.audit_reason', coalesce(v_note, 'review reports dismissed'), true);

  if p_action = 'remove' then
    v_review := admin.review_lookup(p_kind, p_review_id);
    if v_review is not null then
      v_author := (v_review ->> 'author_id')::uuid;
      if p_kind = 'store' then
        delete from public.reviews r where r.id = p_review_id;
      elsif p_kind = 'product' then
        delete from public.product_reviews r where r.id = p_review_id;
      else
        delete from public.service_reviews r where r.id = p_review_id;
      end if;
      -- Cosora's own words, and nothing about a report or who made it.
      if v_author is not null then
        perform public.notify(
          v_author, 'review_removed', 'A review you wrote was removed',
          'Cosora removed one of your reviews because it didn''t follow our review guidelines. Contact Cosora Support if you think this was a mistake.',
          null);
      end if;
    end if;
  end if;

  update admin.review_reports rr
     set status        = case when p_action = 'remove' then 'removed' else 'dismissed' end,
         decided_at    = clock_timestamp(),
         decided_by    = v_uid,
         decision_note = v_note
   where rr.review_kind = p_kind and rr.review_id = p_review_id and rr.status = 'open';
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

comment on function public.admin_review_report_decide(text, uuid, text, text) is
  'Super admin or support: closes every open report on one review. remove (reason required) deletes the review and tells its author; dismiss leaves the review up. The reporter is never named to anyone.';

revoke all on function public.admin_review_report_decide(text, uuid, text, text) from public, anon;
grant execute on function public.admin_review_report_decide(text, uuid, text, text) to authenticated;

-- Self-check.
do $check$
begin
  if has_table_privilege('authenticated', 'admin.review_reports', 'SELECT')
     or has_table_privilege('authenticated', 'admin.review_reports', 'INSERT')
     or has_table_privilege('anon', 'admin.review_reports', 'SELECT') then
    raise exception 'self-check: admin.review_reports is reachable by a browser role';
  end if;
  if has_function_privilege('anon', 'public.report_review(text, uuid, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_review_reports_list(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_review_report_decide(text, uuid, text, text)', 'EXECUTE') then
    raise exception 'self-check: a review-report function is callable signed out';
  end if;
  if (select count(*) from admin.review_report_reasons where active) < 5 then
    raise exception 'self-check: the report reasons are missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_admin_audit'
                    and tgrelid = 'admin.review_reports'::regclass and not tgisinternal) then
    raise exception 'self-check: admin.review_reports is not audited';
  end if;
end
$check$;
