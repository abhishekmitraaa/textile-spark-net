-- Medium bugs batch 3 (2026-11-19; plan documentation/medium-bugs-batch3-plan-2026-11-19.md).
--
-- 1. M-46: chat_unread_counts() called auth.uid() eight times per row; it reads it once.
-- 2. M-65: Seller Home's Recent Leads pinned direct requests the seller had already quoted on; only direct requests
--    still waiting for the seller's quote go first.
-- 3. M-50 (Mitra: "Show to chat sellers"): chat_buyer_social(), the buyer's own web links, under chat_buyer_card()'s
--    rule (a seller the buyer has written to in a chat, never while blocked). Only http(s) addresses, at most 6.
-- 4. M-47: a browser's new or changed profiles.phone is E.164 (it is what a seller dials through call_buyer_contact).

-- ── 1. Unread counts: the caller read once ───────────────────────────────────
create or replace function public.chat_unread_counts()
returns table(conversation_id uuid, other_id uuid, unread integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  mine as (
    select c.id, case when c.user_a = me.id then c.user_b else c.user_a end as other_id,
           coalesce(r.read_at, '-infinity'::timestamptz) as read_at, me.id as me_id
      from me
      join public.conversations c on (c.user_a = me.id or c.user_b = me.id)
      left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = me.id
      left join public.conversation_member_state ms on ms.conversation_id = c.id and ms.user_id = me.id
     where me.id is not null
       and ms.archived_at is null
       -- cheap first cut: nothing has happened since it was read
       and c.last_message_at > coalesce(r.read_at, '-infinity'::timestamptz)
  )
  select x.id, x.other_id, x.n
    from (
      select mine.id, mine.other_id,
             (select count(*)::integer from (
                select 1 from public.messages m
                 where m.conversation_id = mine.id
                   and m.created_at > mine.read_at
                   and m.sender_id is distinct from mine.me_id
                 limit 100) l) as n
        from mine
    ) x
   where x.n > 0;
$$;

-- ── 2. Recent Leads: unquoted direct requests first ──────────────────────────
do $$
declare
  d text := pg_get_functiondef('public.seller_home_summary()'::regprocedure);
  a1 text := 'select jsonb_agg(l order by l.direct desc, l.created_at desc)';
  b1 text := 'select jsonb_agg(l order by (l.direct and not l.quoted) desc, l.created_at desc)';
  a2 text := 'order by a.direct desc, a.created_at desc';
  b2 text := 'order by (a.direct and not exists (select 1 from own_quotes q2 where q2.rfq_id = a.id)) desc, a.created_at desc';
begin
  if position(b1 in d) = 0 then
    if position(a1 in d) = 0 or position(a2 in d) = 0 then
      raise exception 'seller_home_summary: recent_leads anchors not found; change it by hand';
    end if;
    execute replace(replace(d, a1, b1), a2, b2);
  end if;
end $$;

-- ── 3. A buyer's web links, for a seller the buyer has written to ────────────
create or replace function public.chat_buyer_social(p_other uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_object_agg(k.key, left(btrim(k.value), 200))
      from public.buyer_profiles bp,
           jsonb_each_text(case when jsonb_typeof(bp.social) = 'object' then bp.social else '{}'::jsonb end) k
     where bp.id = p_other
       and k.key in ('facebook', 'x', 'linkedin', 'youtube', 'instagram', 'other')
       and btrim(k.value) ~* '^https?://[^\s/$.?#][^\s]*$'
  ), '{}'::jsonb)
  where (select auth.uid()) is not null
    and p_other <> (select auth.uid())
    and exists (select 1 from public.conversations c
                  join public.messages m on m.conversation_id = c.id and m.sender_id = p_other
                 where (c.user_a = (select auth.uid()) and c.user_b = p_other)
                    or (c.user_b = (select auth.uid()) and c.user_a = p_other))
    and not public.chat_blocked_between((select auth.uid()), p_other);
$$;

revoke all on function public.chat_buyer_social(uuid) from public, anon;
grant execute on function public.chat_buyer_social(uuid) to authenticated;

-- ── 4. The profile phone a seller dials is E.164 ─────────────────────────────
-- SECURITY DEFINER: a browser's role can't reach the admin schema (admin.trusted_caller()), and the check must run for
-- it. The caller is still read from the request (session_user, the token's role).
create or replace function admin.profiles_phone_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if admin.trusted_caller() then
    return new;
  end if;
  if (tg_op = 'INSERT' or new.phone is distinct from old.phone) and new.phone is not null
     and (new.phone !~ '^\+[1-9][0-9]{7,14}$' or (new.phone like '+91%' and new.phone !~ '^\+91[6-9][0-9]{9}$')) then
    raise exception 'Enter a 10-digit Indian mobile number, or a number with its +country code.'
      using errcode = '22023', hint = 'phone_format';
  end if;
  return new;
end
$$;

revoke all on function admin.profiles_phone_check() from public, anon, authenticated;

drop trigger if exists trg_profiles_phone_check on public.profiles;
create trigger trg_profiles_phone_check before insert or update of phone on public.profiles
  for each row execute function admin.profiles_phone_check();

-- ── Self-check ───────────────────────────────────────────────────────────────
do $$
begin
  if (select count(*) from regexp_matches(pg_get_functiondef('public.chat_unread_counts()'::regprocedure), 'auth\.uid\(\)', 'g')) <> 1 then
    raise exception 'self-check: chat_unread_counts should read auth.uid() once';
  end if;
  if position('(l.direct and not l.quoted)' in pg_get_functiondef('public.seller_home_summary()'::regprocedure)) = 0 then
    raise exception 'self-check: recent leads order not changed';
  end if;
  if has_function_privilege('anon', 'public.chat_buyer_social(uuid)', 'EXECUTE') then
    raise exception 'self-check: anon can read buyer links';
  end if;
end $$;
