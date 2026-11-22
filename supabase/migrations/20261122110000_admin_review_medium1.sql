-- Cosora-Admin review 2026-11-22, Medium batch 1 (AR-M01 to AR-M21).
-- Plan: documentation/admin-review-medium1-plan-2026-11-22.md. Patches by anchored text normalise CRLF first.

-- ── AR-M01 Suspension says what it stops, and stops catalogues too ──────────────────────────────────────────────
-- The seller's notice said only messages and calls; the insert policies also refuse requirements, quotes, products,
-- videos, ads and reviews. Catalogues were the one creation path left open to a suspended account.
do $$
declare
  d   text := replace(pg_get_functiondef('public.set_account_status(uuid,account_status_type,uuid,text,uuid)'::regprocedure), E'\r\n', E'\n');
  old text := '''You cannot send messages or place calls while your account is suspended. ''
      || ''Contact support if you think this is a mistake.''';
  new text := '''While your account is suspended you can''''t send messages, make calls, post requirements, send ''
      || ''quotes, add listings, start ads or write reviews. What''''s already live stays up. ''
      || ''Contact support if you think this is a mistake.''';
begin
  if (length(d) - length(replace(d, old, ''))) / length(old) <> 1 then
    raise exception 'AR-M01: set_account_status notice anchor not found exactly once';
  end if;
  execute replace(d, old, new);
end $$;

drop policy if exists catalogues_insert on public.catalogues;
create policy catalogues_insert on public.catalogues for insert to public
  with check (
    ((vendor_id = (select auth.uid()))
      or ((select public.is_admin())
          and (select public.admin_role()) = any (array['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))
    and (select public.account_not_deleted((select auth.uid())))
    and (select public.account_is_active((select auth.uid())))
  );

-- ── AR-M09 Geography counts every vendor ─────────────────────────────────────────────────────────────────────────
-- The page read vendor_profiles rows and stopped at PostgREST's 1,000 ("972 of 1,000"; 6,779 exist). One JSON value
-- of (city, state, n) groups instead: one row per place, never per vendor, and no row cap.
create or replace function public.admin_vendor_location_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not coalesce(public.is_admin(), false)
     or public.admin_role() <> all (array['super_admin', 'vendor_ops', 'support']::admin_role_type[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('city', g.city, 'state', g.state, 'n', g.n) order by g.n desc)
    from (
      select v.city, v.state, count(*)::integer as n
      from public.vendor_profiles v
      group by v.city, v.state
    ) g
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_vendor_location_counts() from public, anon;
grant execute on function public.admin_vendor_location_counts() to authenticated;

-- ── AR-M11 Hiding a trending term doesn't recompute the trends ───────────────────────────────────────────────────
-- The hide re-ran admin.search_trends_refresh() over raw search events inside the admin's request, so at scale it
-- could time out and leave the term listed. Now it takes the term out of the published run at once (the next nightly
-- run leaves it out by itself: search_trend_terms reads the hidden list) and the site's snapshot is rebuilt.
-- Unhiding still recomputes: it's rare, and if it fails the term just stays hidden.
create or replace function public.admin_search_trend_hide(p_term text, p_reason text)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_term text := admin.search_term_norm(p_term);
  v_run  bigint;
begin
  perform admin.require_search_trends(true);
  if char_length(v_term) not between 1 and 100 then
    raise exception 'Give the term to hide (at most 100 characters).' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Say why it is hidden (3 to 500 characters).' using errcode = '22023';
  end if;
  perform set_config('cosora.audit_reason', 'Trending search hidden: ' || left(btrim(p_reason), 470), true);
  insert into admin.search_trend_hidden as h (term_norm, hidden, reason, updated_by, updated_at)
  values (v_term, true, btrim(p_reason), auth.uid(), now())
  on conflict (term_norm) do update
     set hidden = true, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = excluded.updated_at
   where h.term_norm = excluded.term_norm;

  select r.id into v_run from admin.search_trend_runs r order by r.id desc limit 1;
  if v_run is not null then
    delete from admin.search_trend_items i
     where i.run_id = v_run and i.kind = 'term' and admin.search_term_norm(i.label) = v_term;
  end if;
  return v_run;
end
$function$;

-- A term taken out of the published run rebuilds site-config/site.json, as a new run does.
drop trigger if exists trg_search_trend_items_snapshot on admin.search_trend_items;
create trigger trg_search_trend_items_snapshot
  after delete on admin.search_trend_items
  for each statement execute function public.site_config_queue_snapshot();

-- ── AR-M12 / AR-M13 Moderation queues read 50 at a time, in either order ─────────────────────────────────────────
-- Cosora-Admin pages Products, Video Closeups and Catalogues by (created_at, id) within a status, oldest first on the
-- review tab by default. These indexes serve both directions.
create index if not exists products_status_created_idx on public.products (status, created_at, id);
create index if not exists product_videos_status_created_idx on public.product_videos (status, created_at, id);
create index if not exists catalogues_status_created_idx on public.catalogues (status, created_at, id);

-- ── AR-M15 A photo or KYC decision applies only to what the moderator saw ────────────────────────────────────────
-- Two moderators could decide the same premises photo or KYC document one after the other: the second silently
-- overwrote the first and the seller got both notices. The new four-argument forms carry what the moderator was
-- shown (the photo's status; the document's reviewed_at, null when unreviewed) and refuse with hint
-- 'changed_since_loaded' when it has moved. The three-argument forms (the app before this release) keep working.
create or replace function admin.premises_photo_decide(p_photo uuid, p_approve boolean, p_reason text,
                                                       p_check boolean, p_from text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_photo  record;
  v_reason text := admin.reg_text(p_reason);
begin
  perform admin.require_admin_role(array['super_admin', 'product_moderator']::public.admin_role_type[]);
  if p_approve is null then
    raise exception 'approve or reject' using errcode = '22023';
  end if;
  select ph.id, ph.vendor_id, ph.url, ph.status::text as status into v_photo
    from public.vendor_premises_photos ph where ph.id = p_photo for update;
  if not found then
    raise exception 'That photo no longer exists' using errcode = 'P0002';
  end if;
  if p_check and v_photo.status is distinct from p_from then
    raise exception 'Someone else decided this photo since you loaded it. The list has been refreshed.'
      using errcode = 'P0001', hint = 'changed_since_loaded';
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
revoke all on function admin.premises_photo_decide(uuid, boolean, text, boolean, text) from public, anon, authenticated;

create or replace function public.admin_premises_photo_review(p_photo uuid, p_approve boolean, p_reason text)
returns void language sql security definer set search_path to ''
as $$ select admin.premises_photo_decide(p_photo, p_approve, p_reason, false, null) $$;

create or replace function public.admin_premises_photo_review(p_photo uuid, p_approve boolean, p_reason text, p_from text)
returns void language sql security definer set search_path to ''
as $$ select admin.premises_photo_decide(p_photo, p_approve, p_reason, true, p_from) $$;
revoke all on function public.admin_premises_photo_review(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_premises_photo_review(uuid, boolean, text, text) to authenticated;

create or replace function admin.vendor_document_decide(p_doc_id uuid, p_verified boolean, p_reason text,
                                                        p_check boolean, p_seen_reviewed_at timestamptz)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_vendor_id uuid;
  v_doc_type  text;
  v_reviewed  timestamptz;
begin
  -- Authorization INSIDE the function, matching set_account_status(). A client-side UPDATE that RLS denies
  -- matches zero rows and returns success: the silent-denial trap this repo has already been bitten by.
  if not (public.is_admin() and public.admin_role() in ('support', 'super_admin')) then
    raise exception 'not authorized: reviewing KYC documents requires the support or super_admin role';
  end if;

  -- A rejection without a reason is a dead end for the vendor.
  if not p_verified and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'a rejection reason is required';
  end if;

  select d.reviewed_at into v_reviewed from public.vendor_documents d where d.id = p_doc_id for update;
  if not found then
    raise exception 'vendor document % not found', p_doc_id;
  end if;
  if p_check and v_reviewed is distinct from p_seen_reviewed_at then
    raise exception 'Someone else decided this document since you loaded it. It has been refreshed.'
      using errcode = 'P0001', hint = 'changed_since_loaded';
  end if;

  update public.vendor_documents
     set verified         = p_verified,
         -- Approving clears any stale note, mirroring what approve_vendor_content() does for products and videos.
         rejection_reason = case when p_verified then null else btrim(p_reason) end,
         reviewed_at      = now(),
         reviewed_by      = auth.uid()
   where id = p_doc_id
  returning vendor_id, doc_type into v_vendor_id, v_doc_type;

  if p_verified then
    perform public.notify(
      v_vendor_id,
      'kyc_approved',
      'Your ' || upper(v_doc_type) || ' document was verified',
      'Thanks — that document has passed review. You can see its status under KYC in My Business.'
    );
  else
    perform public.notify(
      v_vendor_id,
      'kyc_rejected',
      'Your ' || upper(v_doc_type) || ' document needs attention',
      btrim(p_reason)
    );
  end if;
end;
$function$;
revoke all on function admin.vendor_document_decide(uuid, boolean, text, boolean, timestamptz) from public, anon, authenticated;

create or replace function public.set_vendor_document_verified(p_doc_id uuid, p_verified boolean, p_reason text default null)
returns void language sql security definer set search_path to 'public', 'pg_temp'
as $$ select admin.vendor_document_decide(p_doc_id, p_verified, p_reason, false, null) $$;

create or replace function public.set_vendor_document_verified(p_doc_id uuid, p_verified boolean, p_reason text,
                                                              p_seen_reviewed_at timestamptz)
returns void language sql security definer set search_path to 'public', 'pg_temp'
as $$ select admin.vendor_document_decide(p_doc_id, p_verified, p_reason, true, p_seen_reviewed_at) $$;
revoke all on function public.set_vendor_document_verified(uuid, boolean, text, timestamptz) from public, anon;
grant execute on function public.set_vendor_document_verified(uuid, boolean, text, timestamptz) to authenticated;

-- ── AR-M16 Reported reviews: a decision closes the reports the moderator saw; the list pages ─────────────────────
-- Dismissing closed every open report on the review, including ones filed after the moderator loaded the card (a new
-- reason nobody read). The five-argument decide takes the report ids on screen: a dismiss closes those only, and a
-- decision is refused (hint 'changed_since_loaded') when none of them is still open. Removing still closes every open
-- report: the review is gone. The list reads 100 at a time, newest first, by (created_at, id); it stopped at 500.
create or replace function admin.review_report_decide(p_kind text, p_review_id uuid, p_action text, p_note text,
                                                      p_report_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to ''
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
  -- One decision at a time per review: a second moderator waits, then finds the reports closed.
  perform pg_advisory_xact_lock(hashtextextended('cosora.review_report:' || p_kind || ':' || p_review_id::text, 0));
  if not exists (select 1 from admin.review_reports rr
                  where rr.review_kind = p_kind and rr.review_id = p_review_id and rr.status = 'open'
                    and (p_report_ids is null or rr.id = any (p_report_ids))) then
    if p_report_ids is null then
      raise exception 'There is no open report on that review' using errcode = 'P0002';
    end if;
    raise exception 'Someone else decided these reports since you loaded them. The list has been refreshed.'
      using errcode = 'P0001', hint = 'changed_since_loaded';
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
   where rr.review_kind = p_kind and rr.review_id = p_review_id and rr.status = 'open'
     and (p_action = 'remove' or p_report_ids is null or rr.id = any (p_report_ids));
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;
revoke all on function admin.review_report_decide(text, uuid, text, text, uuid[]) from public, anon, authenticated;

create or replace function public.admin_review_report_decide(p_kind text, p_review_id uuid, p_action text,
                                                             p_note text default null)
returns integer language sql security definer set search_path to ''
as $$ select admin.review_report_decide(p_kind, p_review_id, p_action, p_note, null) $$;

create or replace function public.admin_review_report_decide(p_kind text, p_review_id uuid, p_action text,
                                                             p_note text, p_report_ids uuid[])
returns integer language sql security definer set search_path to ''
as $$ select admin.review_report_decide(p_kind, p_review_id, p_action, p_note, coalesce(p_report_ids, '{}'::uuid[])) $$;
revoke all on function public.admin_review_report_decide(text, uuid, text, text, uuid[]) from public, anon;
grant execute on function public.admin_review_report_decide(text, uuid, text, text, uuid[]) to authenticated;

create or replace function public.admin_review_reports_list(p_status text, p_before_at timestamptz,
                                                            p_before_id uuid, p_limit integer)
returns table(id uuid, review_kind text, review_id uuid, review_exists boolean, review_snapshot jsonb,
              reason_code text, reason_label text, note text, status text, created_at timestamp with time zone,
              reporter_id uuid, reporter_name text, decided_at timestamp with time zone, decided_by_name text,
              decision_note text)
language plpgsql
stable
security definer
set search_path to ''
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
     where (p_status is null or rr.status = p_status)
       and (p_before_at is null or (rr.created_at, rr.id) < (p_before_at, p_before_id))
     order by rr.created_at desc, rr.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 200);
end
$function$;
revoke all on function public.admin_review_reports_list(text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.admin_review_reports_list(text, timestamptz, uuid, integer) to authenticated;
create index if not exists review_reports_status_created_idx on admin.review_reports (status, created_at desc, id desc);

-- ── AR-M17 My vendors: the 500 kept are the right 500 ────────────────────────────────────────────────────────────
-- The list cut entitled vendors to 500 BEFORE filtering by who the caller serves and before sorting unread first, so
-- at scale an unread thread could fall outside the list. Now: filter, serve-check and order first, then keep 500.
create or replace function public.admin_am_vendors(p_filter text default 'mine'::text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_me    uuid := admin.am_staff();
  v_role  public.admin_role_type := (select a.admin_role from admin.admin_users a where a.id = v_me);
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
begin
  if p_filter not in ('mine', 'shared', 'unassigned', 'all') then
    raise exception 'unknown filter %', p_filter using errcode = '22023';
  end if;
  if p_filter = 'all' and v_role = 'account_manager' then
    raise exception 'Managers and super admins only.' using errcode = '42501';
  end if;
  return coalesce((
    with entitled as (
      select s.vendor_id, admin.vendor_am_level(s.vendor_id) as level
        from public.vendor_subscriptions s
       where s.plan_id in (select p.id from public.subscription_plans p where coalesce(p.limits ->> 'am_level', 'none') <> 'none')
    ), v as (
      select e.vendor_id, e.level, admin.am_named_manager(e.vendor_id) as manager_id
        from entitled e where e.level <> 'none'
    ), picked as (
      select v.vendor_id, v.level, v.manager_id, vp.brand_name, vp.city,
             t.last_message_at,
             (select count(*) from public.account_manager_messages m
               where m.vendor_id = v.vendor_id and m.author_kind = 'vendor'
                 and m.created_at > coalesce(t.staff_read_at, '-infinity')) as unread
        from v
        join public.vendor_profiles vp on vp.id = v.vendor_id
        left join public.account_manager_threads t on t.vendor_id = v.vendor_id
       where case p_filter
               when 'mine' then v.manager_id = v_me
               when 'shared' then v.manager_id is null
               when 'unassigned' then v.manager_id is null and v.level in ('named', 'vip')
               else true end
         and admin.am_serves(v_me, v.vendor_id)
       order by 7 desc, t.last_message_at desc nulls last, vp.brand_name
       limit 500
    )
    select jsonb_agg(jsonb_build_object(
             'vendor_id', p.vendor_id,
             'brand_name', p.brand_name,
             'city', p.city,
             'level', p.level,
             'plan_id', s.plan_id,
             'status', s.status,
             'period_end', s.current_period_end,
             'auto_renew', s.auto_renew,
             'manager_id', p.manager_id,
             'manager_name', case when p.manager_id is not null then admin.audit_actor_name(p.manager_id) end,
             'unread', p.unread,
             'last_message_at', p.last_message_at,
             'callback', (select jsonb_build_object('id', c.id, 'date', c.preferred_date, 'window', c.time_window)
                            from public.account_manager_callbacks c where c.vendor_id = p.vendor_id and c.status = 'requested'),
             'pipeline', (select jsonb_build_object('open', count(*) filter (where l.stage not in ('won', 'lost')),
                                                    'open_value', coalesce(sum(l.value_inr) filter (where l.stage not in ('won', 'lost')), 0),
                                                    'won_30d', count(*) filter (where l.stage = 'won' and l.closed_at > now() - interval '30 days'))
                            from public.vendor_lead_pipeline l where l.vendor_id = p.vendor_id),
             'review_due', p.level = 'vip' and not exists (select 1 from public.account_manager_notes n
                                                           where n.vendor_id = p.vendor_id and n.kind = 'success_review' and n.period = v_month))
             order by p.unread desc, p.last_message_at desc nulls last, p.brand_name)
      from picked p
      left join public.vendor_subscriptions s on s.vendor_id = p.vendor_id), '[]'::jsonb);
end
$function$;

-- ── AR-M19 The chat review tabs read 100 at a time ───────────────────────────────────────────────────────────────
-- admin_conversation_review_list returned every review ever on the closed tabs. This is the same list, a page at a
-- time: newest first by when it was decided (closed tabs) or flagged (pending), keyset on (sort_at, id).
create or replace function public.admin_conversation_review_page(p_status text, p_before_at timestamptz,
                                                                 p_before_id uuid, p_limit integer)
returns table(id uuid, conversation_id uuid, flagged_message_id uuid, matched_pattern_id uuid, source text,
              status text, reason_id uuid, reviewed_by uuid, reviewed_at timestamp with time zone,
              created_at timestamp with time zone, reported_reason text, pattern_label text, pattern_pattern text,
              reason text, flagged_body text, flagged_kind text, flagged_created_at timestamp with time zone,
              flagged_sender_id uuid, conversation_status text, conversation_user_a uuid, conversation_user_b uuid,
              sort_at timestamp with time zone)
language plpgsql
stable
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_closed boolean := p_status is not null and p_status <> 'pending';
begin
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Reading conversation reviews requires the support or super_admin role'
      using errcode = '42501';
  end if;

  return query
    select r.id, r.conversation_id, r.flagged_message_id, r.matched_pattern_id,
           r.source, r.status, r.reason_id, r.reviewed_by, r.reviewed_at,
           r.created_at, r.reported_reason,
           fp.label, fp.pattern, cbr.reason,
           m.body, m.kind::text, m.created_at, m.sender_id,
           cv.status::text, cv.user_a, cv.user_b,
           k.sort_at
      from admin.conversation_reviews r
      cross join lateral (select case when v_closed then coalesce(r.reviewed_at, r.created_at) else r.created_at end as sort_at) k
      left join admin.flag_patterns      fp  on fp.id  = r.matched_pattern_id
      left join admin.chat_block_reasons cbr on cbr.id = r.reason_id
      left join public.messages           m   on m.id   = r.flagged_message_id
      left join public.conversations      cv  on cv.id  = r.conversation_id
     where (p_status is null or r.status = p_status)
       and (p_before_at is null or (k.sort_at, r.id) < (p_before_at, p_before_id))
     order by k.sort_at desc, r.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 200);
end
$function$;
revoke all on function public.admin_conversation_review_page(text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.admin_conversation_review_page(text, timestamptz, uuid, integer) to authenticated;

-- ── AR-M20 Requirement-reason edits reach the Admin Log ──────────────────────────────────────────────────────────
-- Every other reason list the panel edits (chat block reasons, product moderation reasons) is audited; this one wasn't.
drop trigger if exists trg_admin_audit on admin.rfq_review_reasons;
create trigger trg_admin_audit
  after insert or update or delete on admin.rfq_review_reasons
  for each row execute function admin.audit_row_change('');

-- ── AR-M21 A refund that fails after its guarantee was closed is a billing incident ──────────────────────────────
-- Finance may close a 7-day guarantee while Razorpay still has the refund (status pending): the plan ends and the
-- seller is told the refund is on its way. A later refund.failed only set refund_status = 'failed' on the invoice,
-- which nothing watched. Every failed plan refund now opens a 'refund_failed' incident (super and finance admins are
-- told), saying when the guarantee it belonged to is already closed.
alter table admin.billing_incidents drop constraint if exists billing_incidents_kind_check;
alter table admin.billing_incidents add constraint billing_incidents_kind_check
  check (kind = any (array['activation_failed', 'invoice_incomplete', 'dispute', 'reconcile_mismatch',
                           'autopay_cancel_failed', 'autopay_amount_mismatch', 'refund_failed']));

do $$
declare
  d   text := replace(pg_get_functiondef('admin.billing_incident_open(text,uuid,text,text,jsonb)'::regprocedure), E'\r\n', E'\n');
  old text := 'when ''dispute'' then ''A payment is disputed''';
  new text := 'when ''dispute'' then ''A payment is disputed''' || E'\n        when ''refund_failed'' then ''A refund failed''';
begin
  if position('refund_failed' in d) > 0 then
    return;
  end if;
  if (length(d) - length(replace(d, old, ''))) / length(old) <> 1 then
    raise exception 'AR-M21: billing_incident_open title anchor not found exactly once';
  end if;
  execute replace(d, old, new);
end $$;

create or replace function public.subscription_refund_event(p_payment_ref text, p_refund_ref text, p_status text, p_amount_paise bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id     uuid;
  v_vendor uuid;
  v_order  text;
  v_req    record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'subscription_refund_event is for the payment functions only' using errcode = '42501';
  end if;
  if p_status = 'processed' then
    -- A refund of the whole charge makes the invoice refunded, as admin-refund-payment does.
    update public.subscription_invoices
       set refund_status = 'processed', razorpay_refund_id = p_refund_ref,
           refunded_amount = coalesce(p_amount_paise, refunded_amount)::integer, refunded_at = coalesce(refunded_at, now()),
           status = case when coalesce(p_amount_paise, refunded_amount, 0)
                              >= coalesce(total_paise, (amount::bigint + coalesce(gst_amount, 0)) * 100)
                         then 'refunded' else status end
     where razorpay_payment_id = p_payment_ref
       and (refund_status is distinct from 'processed')
       and (razorpay_refund_id is null or razorpay_refund_id = p_refund_ref)
    returning id into v_id;
  elsif p_status = 'failed' then
    update public.subscription_invoices
       set refund_status = 'failed'
     where razorpay_payment_id = p_payment_ref and razorpay_refund_id = p_refund_ref and refund_status = 'pending'
    returning id, vendor_id into v_id, v_vendor;
    -- AR-M21: a failed refund needs a person, above all when its guarantee was already closed.
    if v_id is not null then
      select r.id, r.status into v_req
        from public.refund_guarantee_requests r
       where v_id = any (r.invoice_ids)
       order by r.requested_at desc
       limit 1;
      perform admin.billing_incident_open('refund_failed', v_vendor, null, p_payment_ref,
        jsonb_build_object('invoice_id', v_id, 'refund_id', p_refund_ref, 'amount_paise', p_amount_paise,
                           'guarantee_request_id', v_req.id, 'guarantee_closed', coalesce(v_req.status = 'closed', false)));
    end if;
  else
    raise exception 'unknown refund status %', p_status using errcode = '22023';
  end if;
  if v_id is not null then
    return jsonb_build_object('matched', true, 'invoice_id', v_id);
  end if;
  -- AR-H15: an ad order refunded from Cosora-Admin.
  select o.order_id into v_order from public.ad_orders o
   where o.razorpay_refund_id = p_refund_ref
      or (o.razorpay_payment_id = p_payment_ref and o.refund_status = 'pending')
   limit 1;
  if v_order is not null then
    if p_status = 'processed' or exists (select 1 from public.ad_orders o where o.order_id = v_order and o.refund_status = 'pending') then
      perform public.ad_order_refund_record(v_order, p_payment_ref, p_refund_ref, p_status, p_amount_paise);
    end if;
    return jsonb_build_object('matched', true, 'ad_order_id', v_order);
  end if;
  return jsonb_build_object('matched', false, 'invoice_id', null);
end
$function$;
