-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 05: the Phase 3a review RPCs (2026-09-27).
--
-- Each case runs in its own rolled-back subtransaction. The pending chat review
-- it needs is a fixture created inside that subtransaction (production had no
-- pending review). A cell reads `ok <detail>` or `-> SQLSTATE`.
--
--   block_account_from_review
--     support blocks the buyer side     ok: review buyer_blocked, account suspended,
--                                        one active suspension row linked to the review
--     a second block on the same review -> P0002
--     a non-participant                 -> 22023
--     no reason                         -> 22023
--     product_moderator                 -> 42501
--   approve_vendor_videos_bulk
--     product_moderator                 ok: 1 video live; that vendor's products untouched
--     vendor_ops                        -> 42501
--   admin_ad_reason_codes
--     ads_moderator                     ok: 8 codes
--     buyer                             -> 42501
--   pause_ad_campaign_by_admin (ads_moderator)
--     code + note                       ok: paused_by_admin; log has code and note; notice = the note
--     code only                         ok: notice = the code's label
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h05$
declare
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';   -- promoted in-txn
  buyer  uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  outsider uuid := '948b930b-eae6-47eb-bcf6-06e1870f58dd';
  v_conv uuid; v_a uuid; v_b uuid; v_review uuid; v_reason uuid; v_video uuid; v_vvendor uuid; v_ad uuid;
  n int; n2 int; t text; t2 text;
  labels text[] := array[
    'block: support, buyer side', 'block: second block', 'block: non-participant', 'block: no reason',
    'block: product_moderator', 'videos bulk: product_moderator', 'videos bulk: vendor_ops',
    'reason codes: ads_moderator', 'reason codes: buyer', 'pause: code + note', 'pause: code only'];
  i int; out text := '';
begin
  -- A conversation with no admin in it (support may not suspend an admin, Phase 1c).
  select c.id, c.user_a, c.user_b into v_conv, v_a, v_b
    from public.conversations c
   where not exists (select 1 from admin.admin_users u where u.is_active and u.id in (c.user_a, c.user_b))
     and outsider not in (c.user_a, c.user_b)
   order by c.created_at limit 1;
  if v_conv is null then
    raise exception 'H05: no conversation without an admin participant';
  end if;
  select r.id into v_reason from admin.chat_block_reasons r where r.active order by r.created_at limit 1;
  select v.id, v.vendor_id into v_video, v_vvendor from public.product_videos v order by v.created_at limit 1;
  select a.id into v_ad from public.advertisements a where a.status = 'active' order by a.created_at limit 1;

  for i in 1..array_length(labels, 1) loop
    begin
      -- Fixtures, as postgres, inside this subtransaction.
      if i between 1 and 5 then
        insert into admin.conversation_reviews (conversation_id, source, status, reported_reason)
        values (v_conv, 'user_report', 'pending', 'H05 fixture')
        returning id into v_review;
      end if;
      if i in (6, 7) then
        -- A pending video AND a pending product from the same vendor: the bulk
        -- approve must move the first and leave the second.
        update public.product_videos set status = 'under_review' where id = v_video;
        insert into public.products (vendor_id, name, status) values (v_vvendor, 'H05 pending product', 'under_review');
        select count(*) into n2 from public.products where vendor_id = v_vvendor and status = 'under_review';
      end if;

      insert into admin.admin_users (id, admin_role, is_active)
      values (pr, (case when i in (1, 2, 3, 4) then 'support'
                        when i in (5, 6) then 'product_moderator'
                        when i = 7 then 'vendor_ops'
                        else 'ads_moderator' end)::public.admin_role_type, true)
      on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;

      perform set_config('request.jwt.claims',
        json_build_object('sub', case when i = 9 then buyer else pr end, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', (case when i = 9 then buyer else pr end)::text, true);
      set local role authenticated;

      if i = 1 then
        perform public.block_account_from_review(v_review, v_a, 'buyer', v_reason, false);
        reset role;
        select r.status into t from admin.conversation_reviews r where r.id = v_review;
        select p.account_status::text into t2 from public.profiles p where p.id = v_a;
        select count(*) into n from admin.account_suspensions s where s.conversation_review_id = v_review and s.active;
        raise exception using errcode = 'P0099', message = format('review %s, account %s, linked suspensions %s', t, t2, n);
      elsif i = 2 then
        perform public.block_account_from_review(v_review, v_a, 'buyer', v_reason, false);
        perform public.block_account_from_review(v_review, v_b, 'vendor', v_reason, false);
      elsif i = 3 then
        perform public.block_account_from_review(v_review, outsider, 'buyer', v_reason, false);
      elsif i = 4 then
        perform public.block_account_from_review(v_review, v_a, 'buyer', null, false);
      elsif i = 5 then
        perform public.block_account_from_review(v_review, v_a, 'buyer', v_reason, false);
      elsif i in (6, 7) then
        n := public.approve_vendor_videos_bulk(v_vvendor);
        reset role;
        select count(*) into t from public.products where vendor_id = v_vvendor and status = 'under_review';
        raise exception using errcode = 'P0099',
          message = format('%s video(s) live; vendor''s pending products %s -> %s', n, n2, t);
      elsif i in (8, 9) then
        select count(*) into n from public.admin_ad_reason_codes();
        raise exception using errcode = 'P0099', message = format('%s codes', n);
      elsif i in (10, 11) then
        perform public.pause_ad_campaign_by_admin(v_ad, 'poor_creative',
          case when i = 10 then 'Use a sharper product photo' else null end);
        reset role;
        select a.status into t from public.advertisements a where a.id = v_ad;
        select coalesce(l.reason_code, '-') || ' / ' || coalesce(l.note, '-') into t2
          from admin.ad_review_log l where l.ad_id = v_ad order by l.created_at desc limit 1;
        raise exception using errcode = 'P0099', message = format('%s; log %s; notice "%s"', t, t2,
          (select n.body from public.notifications n where n.kind = 'ad_paused' order by n.created_at desc limit 1));
      end if;
      raise exception using errcode = 'P0099', message = 'no error';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ok ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': -> ' || sqlstate || ' ' || left(sqlerrm, 90) || E'\n';
    end;
  end loop;
  raise exception 'H05 (rolled back)%', E'\n' || out;
end
$h05$;
