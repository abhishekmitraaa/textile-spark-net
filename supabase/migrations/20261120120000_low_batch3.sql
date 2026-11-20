-- Low bugs, batch 3 (2026-11-20): the buyer Terms, version 2026-11-v2 (review L-55, L-59).
--
-- L-59 (Mitra, 2026-11-20, "New text, don't re-ask"): the Terms text no longer says "India's premier" and is dated
-- 20th November 2026 (src/data/terms.ts). That is a new version, so buyer_terms_version() says 2026-11-v2 and the app's
-- BUYER_TERMS_VERSION says the same. Buyers who accepted 2026-11-v1 are not asked again: the sign-up gate, SignupStep
-- and admin.enforce_buyer_terms() check that a Terms record exists, not which version it names.
--
-- L-55: accepting the same version again no longer adds a terms_acceptances row. A second call for the version the
-- account already accepted, once onboarded, changes nothing (terms_accepted_at keeps the first acceptance).
--
-- Order: apply this, then deploy the app. In between, a tab running the old app gets "stale_terms" when it accepts
-- ("These Terms have changed. Reload the page to read the new version.").

begin;

create or replace function public.buyer_terms_version()
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select '2026-11-v2'::text
$function$;

create or replace function public.accept_buyer_terms(p_version text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_was_onboarded boolean;
  v_current text;
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

  select p.onboarded, p.terms_version into v_was_onboarded, v_current
    from public.profiles p where p.id = v_uid for update;
  if not found then
    raise exception 'no_profile' using errcode = '42501';
  end if;

  -- Already accepted this version and onboarded: nothing to record (review L-55).
  if v_was_onboarded and v_current = p_version
     and exists (select 1 from public.terms_acceptances a where a.profile_id = v_uid and a.terms_version = p_version) then
    return;
  end if;

  if not exists (select 1 from public.terms_acceptances a where a.profile_id = v_uid and a.terms_version = p_version) then
    insert into public.terms_acceptances (profile_id, terms_version, source)
    values (v_uid, p_version, case when v_was_onboarded then 'reaccept' else 'signup' end);
  end if;

  update public.profiles
     set onboarded = true, terms_version = p_version, terms_accepted_at = now()
   where id = v_uid;
end
$function$;

-- Self-check.
do $check$
declare
  v_def text := pg_get_functiondef('public.accept_buyer_terms(text)'::regprocedure);
begin
  if public.buyer_terms_version() <> '2026-11-v2' then
    raise exception 'low_batch3: buyer_terms_version is %', public.buyer_terms_version();
  end if;
  if position('Already accepted this version' in v_def) = 0 then
    raise exception 'low_batch3: accept_buyer_terms not replaced';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.accept_buyer_terms(text)'::regprocedure) is not true then
    raise exception 'low_batch3: accept_buyer_terms must stay security definer';
  end if;
end
$check$;

commit;
