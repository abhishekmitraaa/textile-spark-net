-- A block stops every way of reaching the other person, and Cosora-Admin reads the whole chat (Mitra, 2026-10-18:
-- "A block should not let the person contact in any ways possible"; "The admin panel should be able to read the
-- entire chat and not just the screenshot").
--
-- Block (chat_blocks, 20261018160000) already stopped chat messages, files and contact cards. Now, while either of
-- the two has blocked the other:
--   call_vendor_contact()  / call_buyer_contact()   refuse with 'blocked' (no phone, WhatsApp or e-mail is revealed)
--   log_call()                                       refuses with 'blocked'
--   a direct quote request (rfqs with vendor_id)     refused (guard_rfq_block)
--   a quote, a quote edit, a shortlist or accept     refused (guard_quote_block); the buyer may still reject
--   reply_to_review() / reply_to_product_review()    refused (the seller can't answer the person publicly)
--   match_rfq_vendors()                              never matches the seller: no lead alert, no digest entry
--   match_vendor_rfqs() and rfqs_select              the seller doesn't see the buyer's requirements (open or direct)
-- Reviews themselves are NOT blocked: a block must not let a seller silence a buyer's review.
--
-- Cosora-Admin (support and super admins, who already read every chat):
--   admin_conversation_state(id)   who blocked whom and when, and who starred, archived or deleted the chat for
--                                  themselves (staff see the messages a person deleted for themselves)
--   admin_chat_contact_number(id)  the number behind a contact card, written to the Admin Log like support's reveals
--   (chat files: the read policy of 20261018160000 already admits support and super admins)
--
-- Each changed function is its current body plus the block check. The pre-check below stops the whole file if any
-- of them isn't the body this was written against (a version applied in the SQL editor, say).
-- No DROP of a table or function. call_vendor_contact() keeps its existing delete of the caller's old reveal rows;
-- no new DELETE.

-- ── 0. Pre-check ────────────────────────────────────────────────────────────
do $pin$
begin
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.call_vendor_contact(uuid)'::regprocedure), chr(13), '')) <> '0d05efc74cec5b95cf5e53542e121fdd' then
    raise exception 'pre-check: public.call_vendor_contact(uuid) is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.call_buyer_contact(uuid)'::regprocedure), chr(13), '')) <> 'f432844807c29476a60e2c347338a397' then
    raise exception 'pre-check: public.call_buyer_contact(uuid) is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.log_call(uuid,text)'::regprocedure), chr(13), '')) <> '972be0ca17b350b0f2775f79e5f323cf' then
    raise exception 'pre-check: public.log_call(uuid,text) is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.reply_to_review(uuid,text)'::regprocedure), chr(13), '')) <> 'ffb4bbc42ec6863af03cc3b5c074f6ed' then
    raise exception 'pre-check: public.reply_to_review(uuid,text) is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.reply_to_product_review(uuid,text)'::regprocedure), chr(13), '')) <> '47c255d3d5daf0cc0235f324b875fa67' then
    raise exception 'pre-check: public.reply_to_product_review(uuid,text) is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.match_rfq_vendors(uuid,integer)'::regprocedure), chr(13), '')) <> '2f166f0366d14ef50a883bb1d7a64c10' then
    raise exception 'pre-check: public.match_rfq_vendors(uuid,integer) is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.match_vendor_rfqs(uuid,integer)'::regprocedure), chr(13), '')) <> 'd4490f7447e14de4880201ccfa17c41a' then
    raise exception 'pre-check: public.match_vendor_rfqs(uuid,integer) is not the version this migration was written against';
  end if;
end
$pin$;

-- ── 1. "Have I blocked them, or they me?", for row policies ────────────────
create or replace function public.blocked_with_me(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(auth.uid() is not null and p_other is not null
                  and public.chat_blocked_between(auth.uid(), p_other), false);
$function$;
revoke all on function public.blocked_with_me(uuid) from public, anon, authenticated;
grant execute on function public.blocked_with_me(uuid) to authenticated;

-- ── 2. Contact reveals and call logs ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.call_vendor_contact(p_vendor_id uuid)
 RETURNS TABLE(phone text, whatsapp text, brand_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me     uuid := auth.uid();
  v_seen   boolean;
  v_hour   int;
  v_day    int;
begin
  if v_me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_me and p.account_status = 'suspended') then
    raise exception 'caller_suspended' using errcode = '42501';
  end if;
  if p_vendor_id is null or not exists (select 1 from public.vendor_profiles v where v.id = p_vendor_id) then
    raise exception 'not_a_vendor' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_vendor_id and p.account_status = 'suspended') then
    raise exception 'target_suspended' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.conversations c
     where c.user_a = least(v_me, p_vendor_id)
       and c.user_b = greatest(v_me, p_vendor_id)
       and c.status = 'under_review') then
    raise exception 'under_review' using errcode = '42501';
  end if;

  -- A block either way (chat_blocks, 20261018160000) stops every way of reaching the other person.
  if public.chat_blocked_between(v_me, p_vendor_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  -- The rate limit counts DIFFERENT vendors. One lock per caller serialises their
  -- concurrent requests, so parallel calls can't all read the same count.
  if v_me <> p_vendor_id then
    perform pg_advisory_xact_lock(hashtext('vendor_contact:' || v_me::text));
    -- Each caller's ledger holds their last day only: older rows no longer count.
    delete from admin.vendor_contact_reveals r
     where r.caller_id = v_me and r.revealed_at <= now() - interval '1 day';
    select exists (select 1 from admin.vendor_contact_reveals r
                    where r.caller_id = v_me and r.vendor_id = p_vendor_id)
      into v_seen;
    -- A vendor revealed in the last day is served again without counting or moving.
    if not v_seen then
      select count(*) filter (where r.revealed_at > now() - interval '1 hour'),
             count(*)
        into v_hour, v_day
        from admin.vendor_contact_reveals r
       where r.caller_id = v_me;
      if v_hour >= 30 or v_day >= 100 then
        raise exception 'rate_limited' using errcode = '42501';
      end if;
      insert into admin.vendor_contact_reveals (caller_id, vendor_id, revealed_at)
      values (v_me, p_vendor_id, now());
    end if;
  end if;

  return query
    select v.phone, v.whatsapp, v.brand_name
      from public.vendor_profiles v
     where v.id = p_vendor_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.call_buyer_contact(p_buyer_id uuid)
 RETURNS TABLE(phone text, full_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_me and p.account_status = 'suspended') then
    raise exception 'caller_suspended' using errcode = '42501';
  end if;

  if p_buyer_id is null or not exists (
    select 1
    from public.quotes q
    join public.rfqs r on r.id = q.rfq_id
    where q.vendor_id = v_me
      and r.buyer_id = p_buyer_id
  ) then
    raise exception 'no_rfq_relationship' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = p_buyer_id and p.account_status = 'suspended') then
    raise exception 'target_suspended' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.conversations c
    where c.user_a = least(v_me, p_buyer_id)
      and c.user_b = greatest(v_me, p_buyer_id)
      and c.status = 'under_review'
  ) then
    raise exception 'under_review' using errcode = '42501';
  end if;

  -- A block either way (chat_blocks, 20261018160000) stops every way of reaching the other person.
  if public.chat_blocked_between(v_me, p_buyer_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  return query
    select p.phone, p.full_name
    from public.profiles p
    where p.id = p_buyer_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_call(p_vendor_id uuid, p_product_context text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me   uuid := auth.uid();
  v_ctx  text;
  v_last timestamptz;
  v_id   uuid;
begin
  if v_me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not public.account_is_active(v_me) then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  if p_vendor_id is null or not exists (select 1 from public.vendor_profiles v where v.id = p_vendor_id) then
    raise exception 'not_a_vendor' using errcode = '22023';
  end if;
  if p_vendor_id = v_me then
    raise exception 'cannot_call_self' using errcode = '22023';
  end if;

  -- A block either way (chat_blocks, 20261018160000) stops every way of reaching the other person.
  if public.chat_blocked_between(v_me, p_vendor_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  -- One writer per caller at a time, so two taps can't both pass the limits.
  -- Same idiom as the plan caps (20260923082118) and account deletion.
  perform pg_advisory_xact_lock(hashtext('log_call:' || v_me::text));

  select max(c.created_at) into v_last
    from public.calls c
   where c.buyer_id = v_me and c.vendor_id = p_vendor_id;
  if v_last > now() - interval '60 seconds' then
    return jsonb_build_object(
      'status', 'rate_limited',
      'retry_after_seconds', ceil(extract(epoch from (v_last + interval '60 seconds' - now())))::int);
  end if;
  if (select count(*) from public.calls c
       where c.buyer_id = v_me and c.vendor_id = p_vendor_id
         and c.created_at > now() - interval '24 hours') >= 5
     or (select count(*) from public.calls c
          where c.buyer_id = v_me and c.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'too_many_calls');
  end if;

  -- Whitespace collapsed, trimmed, at most 200 characters; empty becomes null.
  v_ctx := nullif(btrim(left(regexp_replace(btrim(coalesce(p_product_context, '')), '\s+', ' ', 'g'), 200)), '');

  insert into public.calls (buyer_id, vendor_id, direction, product_context, created_at)
  values (v_me, p_vendor_id, 'outgoing', v_ctx, now())
  returning id into v_id;

  return jsonb_build_object('status', 'logged', 'id', v_id);
end;
$function$;

-- ── 3. Review replies ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reply_to_review(review_id uuid, reply text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.account_is_active(auth.uid()) then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  if coalesce(btrim(reply), '') = '' then
    raise exception 'A reply can''t be empty' using errcode = '22023';
  end if;
  -- A seller can't answer someone who blocked them, or whom they blocked (20261018160200).
  if exists (select 1 from public.reviews x where x.id = review_id and x.vendor_id = auth.uid()
              and public.chat_blocked_between(auth.uid(), x.buyer_id)) then
    raise exception 'You can''t reply to this review: one of you has blocked the other.' using errcode = '42501';
  end if;
  perform set_config('cosora.review_reply', 'on', true);
  update public.reviews
     set reply_body = btrim(reply), replied_at = now()
   where id = review_id and vendor_id = auth.uid();
  if not found then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  perform set_config('cosora.review_reply', '', true);
end $function$;

CREATE OR REPLACE FUNCTION public.reply_to_product_review(review_id uuid, reply text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.account_is_active(auth.uid()) then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  if coalesce(btrim(reply), '') = '' then
    raise exception 'A reply can''t be empty' using errcode = '22023';
  end if;
  -- A seller can't answer someone who blocked them, or whom they blocked (20261018160200).
  if exists (select 1 from public.product_reviews x join public.products p on p.id = x.product_id where x.id = review_id and p.vendor_id = auth.uid()
              and public.chat_blocked_between(auth.uid(), x.buyer_id)) then
    raise exception 'You can''t reply to this review: one of you has blocked the other.' using errcode = '42501';
  end if;
  perform set_config('cosora.review_reply', 'on', true);
  update public.product_reviews pr
     set reply_body = btrim(reply), replied_at = now()
    from public.products p
   where pr.id = review_id and p.id = pr.product_id and p.vendor_id = auth.uid();
  if not found then
    raise exception 'not authorized to reply to this review' using errcode = '42501';
  end if;
  perform set_config('cosora.review_reply', '', true);
end $function$;

-- ── 4. Requirements and quotes ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_rfq_vendors(p_rfq_id uuid, match_count integer DEFAULT 20)
 RETURNS TABLE(vendor_id uuid, similarity double precision, category_match boolean, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with rfq as (
    select r.id, r.embedding, r.category_id, r.buyer_id
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
  -- A seller blocked by the buyer, or who blocked them, is never matched (no alert, no digest).
  where not public.chat_blocked_between(coalesce(vec.vendor_id, cat.vendor_id), (select buyer_id from rfq))
  order by score desc, similarity desc nulls last, 1
  limit coalesce(match_count, 20);
$function$;

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
      -- Not a buyer who blocked this seller, or whom the seller blocked (20261018160200).
      and not public.chat_blocked_between(r.buyer_id, p_vendor_id)
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

-- The seller-facing half of rfqs_select leaves out a buyer either of them blocked; the buyer's own rows and
-- admins are unchanged.
alter policy rfqs_select on public.rfqs
  using ((((status = 'active'::public.rfq_status)
           and (((vendor_id is null)
                 and ((not overseas)
                      or ((select public.my_overseas_tier()) = 'vip'::text)
                      or (((select public.my_overseas_tier()) = 'gold'::text)
                          and ((overseas_vip_until is null) or (now() >= overseas_vip_until)))
                      or public.vendor_quoted_rfq(id)))
                or (vendor_id = (select auth.uid())))
           and (not public.blocked_with_me(buyer_id)))
          or (buyer_id = (select auth.uid()))
          or (select public.is_admin())));

-- A direct request to a seller.
create or replace function public.guard_rfq_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.vendor_id is not null and public.chat_blocked_between(new.buyer_id, new.vendor_id) then
    raise exception 'One of you has blocked the other, so this seller can''t be sent a request.' using errcode = '42501';
  end if;
  return new;
end
$function$;
revoke all on function public.guard_rfq_block() from public, anon, authenticated;
drop trigger if exists trg_rfqs_block on public.rfqs;
create trigger trg_rfqs_block before insert on public.rfqs
  for each row execute function public.guard_rfq_block();

-- Quotes: none sent, edited, shortlisted or accepted between the two. The buyer may still reject one (it closes
-- the thread of business rather than opening it).
create or replace function public.guard_quote_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_buyer uuid;
begin
  select r.buyer_id into v_buyer from public.rfqs r where r.id = new.rfq_id;
  if v_buyer is null or not public.chat_blocked_between(v_buyer, new.vendor_id) then
    return new;
  end if;
  if tg_op = 'UPDATE' and auth.uid() = v_buyer and new.status = 'rejected'::public.quote_status then
    return new;
  end if;
  raise exception 'One of you has blocked the other, so quotes can''t be sent or changed.' using errcode = '42501';
end
$function$;
revoke all on function public.guard_quote_block() from public, anon, authenticated;
drop trigger if exists trg_quotes_block on public.quotes;
create trigger trg_quotes_block before insert or update on public.quotes
  for each row execute function public.guard_quote_block();

-- ── 5. Cosora-Admin: the whole chat ─────────────────────────────────────────
-- Who blocked whom, and each person's own marks on the chat.
create or replace function public.admin_conversation_state(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_conv public.conversations%rowtype;
begin
  if not coalesce(public.admin_role()::text in ('super_admin', 'support'), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations c where c.id = p_conversation_id;
  if not found then
    raise exception 'no conversation %', p_conversation_id using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'blocks', coalesce((select jsonb_agg(jsonb_build_object(
                  'blocker_id', b.blocker_id, 'blocked_id', b.blocked_id,
                  'created_at', b.created_at, 'unblocked_at', b.unblocked_at) order by b.created_at)
                from public.chat_blocks b
               where (b.blocker_id = v_conv.user_a and b.blocked_id = v_conv.user_b)
                  or (b.blocker_id = v_conv.user_b and b.blocked_id = v_conv.user_a)), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                  'user_id', s.user_id, 'starred_at', s.starred_at, 'archived_at', s.archived_at,
                  'cleared_at', s.cleared_at))
                from public.conversation_member_state s
               where s.conversation_id = p_conversation_id), '[]'::jsonb));
end
$function$;

-- The number behind a contact card, for staff reviewing the chat. Every reveal is an Admin Log row.
create or replace function public.admin_chat_contact_number(p_message_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_uid    uuid := auth.uid();
  v_sender uuid;
  v_conv   uuid;
  v_phone  text;
begin
  if not coalesce(public.admin_role()::text in ('super_admin', 'support'), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select m.sender_id, m.conversation_id into v_sender, v_conv
    from public.messages m
   where m.id = p_message_id and m.kind = 'contact';
  if v_sender is null then
    raise exception 'not a contact card' using errcode = 'P0002';
  end if;
  select nullif(btrim(u.phone), '') into v_phone from auth.users u where u.id = v_sender;
  insert into admin.audit_log (actor_id, actor_role, actor_name, action, target_table, target_id, changes, source)
  values (v_uid, public.admin_role(), admin.audit_actor_name(v_uid), 'reveal_contact', 'public.messages',
          p_message_id::text, jsonb_build_object('conversation_id', v_conv, 'sender_id', v_sender, 'found', v_phone is not null),
          'admin-app');
  if v_phone is null then
    return null;
  end if;
  return case when left(v_phone, 1) = '+' then v_phone else '+' || v_phone end;
end
$function$;

revoke all on function public.admin_conversation_state(uuid) from public, anon, authenticated;
revoke all on function public.admin_chat_contact_number(uuid) from public, anon, authenticated;
grant execute on function public.admin_conversation_state(uuid) to authenticated;
grant execute on function public.admin_chat_contact_number(uuid) to authenticated;

-- ── Self-checks ─────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array['call_vendor_contact(uuid)', 'call_buyer_contact(uuid)', 'log_call(uuid,text)',
                           'reply_to_review(uuid,text)', 'reply_to_product_review(uuid,text)',
                           'match_rfq_vendors(uuid,integer)', 'match_vendor_rfqs(uuid,integer)'] loop
    if position('chat_blocked_between' in (select p.prosrc from pg_proc p where p.oid = ('public.' || f)::regprocedure)) = 0 then
      raise exception 'self-check: % has no block check', f;
    end if;
  end loop;
  foreach f in array array['blocked_with_me(uuid)', 'admin_conversation_state(uuid)', 'admin_chat_contact_number(uuid)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') then
      raise exception 'self-check: % has the wrong grants', f;
    end if;
  end loop;
  foreach f in array array['guard_rfq_block()', 'guard_quote_block()'] loop
    if has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') then
      raise exception 'self-check: % must not be callable by clients', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.call_vendor_contact(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.call_vendor_contact(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.match_vendor_rfqs(uuid,integer)', 'EXECUTE') then
    raise exception 'self-check: grants on the replaced functions changed';
  end if;
  if position('blocked_with_me' in (select pg_get_expr(polqual, polrelid) from pg_policy
                                     where polrelid = 'public.rfqs'::regclass and polname = 'rfqs_select')) = 0 then
    raise exception 'self-check: rfqs_select has no block filter';
  end if;
end
$check$;
