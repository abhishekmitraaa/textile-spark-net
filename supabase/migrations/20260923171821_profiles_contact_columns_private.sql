-- MPF-3: close the public read of profiles.email and profiles.phone.
--
-- Before this, `profiles_select` was USING (true) and anon and authenticated
-- held table-wide SELECT, so the public anon key alone listed every user's
-- email and phone (proven over HTTP: 20 emails, 7 phones, no session).
--
-- The policy stays as it is: names, avatars, roles and account_status are read
-- all over the app (chat, reviews, quotes, callGate) and are not part of the
-- leak. What changes is the column grant. Table SELECT is replaced by column
-- SELECT on everything EXCEPT email and phone, and the legitimate readers of
-- those two go through narrow SECURITY DEFINER functions:
--
--   my_contact_info()            the caller's own email and phone
--   call_buyer_contact(buyer)    a buyer's phone for a vendor who quoted on one
--                                of their RFQs, behind the same rules as
--                                callGate(), enforced here on the server
--   admin_profile_search(term)   Cosora-Admin's name-or-email account search
--   admin_profile_emails(ids)    Cosora-Admin's email lookup by id
--
-- A column added to profiles later is NOT readable by clients until it is
-- granted on purpose (the same convention as public.faqs).
-- UPDATE is unchanged: a user still edits their own email and phone through
-- profiles_update, and a filter or RETURNING on those columns needs SELECT, so
-- neither can be used to read someone else's.

revoke select on public.profiles from public, anon, authenticated;
revoke select (email, phone) on public.profiles from public, anon, authenticated;
grant select (id, full_name, avatar_url, active_role, onboarded, account_status, created_at)
  on public.profiles to anon, authenticated;

-- ── The caller's own contact details ─────────────────────────────────────────
create or replace function public.my_contact_info()
returns table (email text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.email, p.phone
  from public.profiles p
  where p.id = auth.uid();
$$;

comment on function public.my_contact_info() is
  'The signed-in user''s own profiles.email and profiles.phone. Clients cannot select those columns directly (MPF-3). No row when signed out.';

-- ── A buyer's phone, for the vendor calling about an RFQ ─────────────────────
-- The server-side form of callGate() in src/lib/queries/calls.ts, plus the RFQ
-- relationship the Call Buyer button implies. Refusals raise 42501 with a
-- reason code as the message, checked in this order:
--   not_signed_in, caller_suspended, no_rfq_relationship, target_suspended,
--   under_review
-- The relationship is checked before anything about the buyer, so a caller with
-- no business with them learns nothing further. It is "has quoted on one of
-- this buyer's RFQs", in any quote status: quote status is not a trustworthy
-- gate, because quotes_update lets a vendor set their own quote to 'accepted'.
create or replace function public.call_buyer_contact(p_buyer_id uuid)
returns table (phone text, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
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

  return query
    select p.phone, p.full_name
    from public.profiles p
    where p.id = p_buyer_id;
end;
$$;

comment on function public.call_buyer_contact(uuid) is
  'A buyer''s phone and name for a vendor who has quoted on one of their RFQs, refused (42501, reason code as message) when either account is suspended or their chat is under review. The server-side callGate() for useCallBuyer (MPF-3).';

-- ── Cosora-Admin: account search by name, email or exact id ──────────────────
-- Any active admin, as before: every admin could read these columns until now,
-- and the Accounts and Chats screens are open to every admin role.
create or replace function public.admin_profile_search(p_term text, p_limit integer default 50)
returns table (
  id uuid,
  full_name text,
  email text,
  account_status public.account_status_type,
  active_role text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_term text := btrim(coalesce(p_term, ''));
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Searching accounts requires an admin account' using errcode = '42501';
  end if;
  if length(v_term) < 2 then
    return;
  end if;
  return query
    select p.id, p.full_name, p.email, p.account_status, p.active_role, p.created_at
    from public.profiles p
    where p.full_name ilike '%' || v_term || '%'
       or p.email ilike '%' || v_term || '%'
       or p.id::text = lower(v_term)
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$$;

comment on function public.admin_profile_search(text, integer) is
  'Cosora-Admin account search: name or email contains the term, or the id equals it. Any active admin. Newest first, at most 500 rows (MPF-3).';

-- ── Cosora-Admin: emails for a set of profile ids ────────────────────────────
create or replace function public.admin_profile_emails(p_ids uuid[])
returns table (id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Reading account emails requires an admin account' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.email
    from public.profiles p
    where p.id = any (coalesce(p_ids, '{}'::uuid[]));
end;
$$;

comment on function public.admin_profile_emails(uuid[]) is
  'Cosora-Admin: full_name and email for the given profile ids. Any active admin (MPF-3).';

revoke execute on function public.my_contact_info() from public, anon;
revoke execute on function public.call_buyer_contact(uuid) from public, anon;
revoke execute on function public.admin_profile_search(text, integer) from public, anon;
revoke execute on function public.admin_profile_emails(uuid[]) from public, anon;
grant execute on function public.my_contact_info() to authenticated;
grant execute on function public.call_buyer_contact(uuid) to authenticated;
grant execute on function public.admin_profile_search(text, integer) to authenticated;
grant execute on function public.admin_profile_emails(uuid[]) to authenticated;

-- ── Self-check: fails the migration if any of the above did not take ─────────
do $$
declare
  r text;
  c text;
  f text;
  v_cols text[];
begin
  select array_agg(column_name::text order by column_name) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles';
  if v_cols <> array['account_status','active_role','avatar_url','created_at','email','full_name','id','onboarded','phone'] then
    raise exception 'self-check: profiles columns changed (%); review the grant list', v_cols;
  end if;

  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.profiles', 'SELECT') then
      raise exception 'self-check: % still holds table-wide SELECT on profiles', r;
    end if;
    foreach c in array array['email', 'phone'] loop
      if has_column_privilege(r, 'public.profiles', c, 'SELECT') then
        raise exception 'self-check: % can still read profiles.%', r, c;
      end if;
    end loop;
    foreach c in array array['id', 'full_name', 'avatar_url', 'active_role', 'onboarded', 'account_status', 'created_at'] loop
      if not has_column_privilege(r, 'public.profiles', c, 'SELECT') then
        raise exception 'self-check: % lost SELECT on profiles.%', r, c;
      end if;
    end loop;
  end loop;

  -- Own-row edits still work: UPDATE on the two columns is kept.
  if not (has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE')
          and has_column_privilege('authenticated', 'public.profiles', 'phone', 'UPDATE')) then
    raise exception 'self-check: authenticated lost UPDATE on email/phone';
  end if;

  foreach f in array array[
    'public.my_contact_info()',
    'public.call_buyer_contact(uuid)',
    'public.admin_profile_search(text, integer)',
    'public.admin_profile_emails(uuid[])'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'self-check: anon can execute %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'self-check: authenticated cannot execute %', f;
    end if;
  end loop;
end;
$$;
