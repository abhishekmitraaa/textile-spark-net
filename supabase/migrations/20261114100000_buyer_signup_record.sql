-- Buyer sign-up record (buyer sign-up audit 2026-11-13, items 1 and 5; plan task A1).
--
--   buyer_profiles.buyer_role      the Sub-role answer ("What best describes you"), one of six ids, one choice (D1).
--                                  Not business_type: that drives trade-buyer ranking with its own words.
--   profiles.terms_version         the Terms version the account last accepted, and when; written only by
--   profiles.terms_accepted_at     accept_buyer_terms(). Readable by the signed-in only.
--   public.terms_acceptances       every acceptance, kept (signup, or reaccept when the account was already onboarded).
--   buyer_terms_version()          the version the sign-up card shows today. The app's BUYER_TERMS_VERSION
--                                  (src/lib/buyerTerms.ts) must equal it; a new wording is a new version here and there.
--   accept_buyer_terms(version)    the one writer: records the acceptance and finishes sign-up (onboarded) together.
--   buyer_signup_required          switch: send a signed-in buyer who hasn't finished sign-up back to it (D3), off.
--
-- `profiles.onboarded` itself becomes the server's in 20261114100600_profiles_signup_guard.sql, applied only once the
-- app that calls accept_buyer_terms() is live: before that, the live app's Terms step still writes it directly.

-- ── 1. The Sub-role answer ───────────────────────────────────────────────────
alter table public.buyer_profiles
  add column if not exists buyer_role text;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'buyer_profiles_buyer_role_check') then
    alter table public.buyer_profiles
      add constraint buyer_profiles_buyer_role_check check (buyer_role in
        ('brand_owner', 'sourcing_manager', 'merchandiser', 'designer', 'buying_house', 'retail_chain'));
  end if;
end
$c$;

-- ── 2. The Terms record ──────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

-- profiles has column SELECT grants: signed-in accounts read the new columns, visitors don't.
grant select (terms_version, terms_accepted_at) on public.profiles to authenticated;

create table if not exists public.terms_acceptances (
  id bigserial primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null check (source in ('signup', 'reaccept'))
);

create index if not exists terms_acceptances_profile_idx on public.terms_acceptances (profile_id, accepted_at desc);

alter table public.terms_acceptances enable row level security;

drop policy if exists terms_acceptances_select on public.terms_acceptances;
create policy terms_acceptances_select on public.terms_acceptances
  for select to authenticated
  using (profile_id = (select auth.uid()));

revoke all on table public.terms_acceptances from public, anon, authenticated;
grant select on table public.terms_acceptances to authenticated;
revoke all on sequence public.terms_acceptances_id_seq from public, anon, authenticated;

-- ── 3. The version and the writer ────────────────────────────────────────────
create or replace function public.buyer_terms_version()
returns text
language sql
immutable
set search_path = ''
as $function$
  select '2026-11-v1'::text
$function$;

revoke all on function public.buyer_terms_version() from public, anon;
grant execute on function public.buyer_terms_version() to authenticated, service_role;

create or replace function public.accept_buyer_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_was_onboarded boolean;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not coalesce(public.account_not_deleted(v_uid), false) then
    raise exception 'account_deleted' using errcode = '42501';
  end if;
  if p_version is distinct from public.buyer_terms_version() then
    raise exception 'stale_terms' using errcode = '22023';
  end if;

  select p.onboarded into v_was_onboarded from public.profiles p where p.id = v_uid for update;
  if not found then
    raise exception 'no_profile' using errcode = '42501';
  end if;

  insert into public.terms_acceptances (profile_id, terms_version, source)
  values (v_uid, p_version, case when v_was_onboarded then 'reaccept' else 'signup' end);

  update public.profiles
     set onboarded = true, terms_version = p_version, terms_accepted_at = now()
   where id = v_uid;
end
$function$;

revoke all on function public.accept_buyer_terms(text) from public, anon;
grant execute on function public.accept_buyer_terms(text) to authenticated;

-- ── 4. The Terms columns are the server's from the start ─────────────────────
-- A browser's new profiles row gets no Terms record; a browser's edit may not change one. Server code (definer
-- functions such as accept_buyer_terms, the service role, migrations) isn't `authenticated` and passes.
create or replace function admin.profiles_signup_owned()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.terms_version := null;
    new.terms_accepted_at := null;
    return new;
  end if;
  if new.terms_version is distinct from old.terms_version
     or new.terms_accepted_at is distinct from old.terms_accepted_at then
    raise exception 'the Terms record is written by accept_buyer_terms() only' using errcode = '42501';
  end if;
  return new;
end
$function$;

revoke all on function admin.profiles_signup_owned() from public, anon, authenticated;

drop trigger if exists trg_profiles_signup_owned on public.profiles;
create trigger trg_profiles_signup_owned
  before insert or update on public.profiles
  for each row execute function admin.profiles_signup_owned();

-- ── 5. The gate's switch (created off; Mitra turns it on) ────────────────────
insert into public.feature_flags (key, description, enabled) values
  ('buyer_signup_required',
   'A signed-in buyer who has not finished sign-up (or has not accepted the current Terms) is sent back to finish it.',
   false)
on conflict (key) do nothing;

-- ── 6. Self-check ────────────────────────────────────────────────────────────
do $check$
begin
  if has_function_privilege('anon', 'public.accept_buyer_terms(text)', 'EXECUTE') then
    raise exception 'self-check: anon can execute accept_buyer_terms';
  end if;
  if has_column_privilege('anon', 'public.profiles', 'terms_version', 'SELECT')
     or not has_column_privilege('authenticated', 'public.profiles', 'terms_version', 'SELECT') then
    raise exception 'self-check: terms_version grants are wrong';
  end if;
  if has_table_privilege('authenticated', 'public.terms_acceptances', 'INSERT')
     or has_table_privilege('authenticated', 'public.terms_acceptances', 'UPDATE')
     or has_table_privilege('authenticated', 'public.terms_acceptances', 'DELETE')
     or has_table_privilege('anon', 'public.terms_acceptances', 'SELECT') then
    raise exception 'self-check: terms_acceptances is writable or anon-readable';
  end if;
  if not exists (select 1 from public.feature_flags where key = 'buyer_signup_required' and not enabled) then
    raise exception 'self-check: the buyer_signup_required switch must exist and start off';
  end if;
end
$check$;
