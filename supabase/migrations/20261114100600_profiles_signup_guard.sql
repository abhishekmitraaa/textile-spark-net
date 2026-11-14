-- profiles.onboarded is the server's (buyer sign-up audit 2026-11-13, item 5; plan task A1b).
--
-- APPLY ONLY AFTER the buyer app that finishes sign-up through accept_buyer_terms() is live: the app before it sets
-- onboarded from the browser on the Terms step, and this refuses that write.
--
-- A browser's new profiles row starts unfinished; a browser's edit may not change onboarded (or the Terms record).
-- Finishing sign-up is accept_buyer_terms() (buyers) or submit_vendor_registration() (sellers): both definer
-- functions, so they pass, as do the service role and migrations. An unchanged value sent back by a form still saves.

do $guard$
begin
  -- The body 20261114100000_buyer_signup_record.sql creates (LF).
  if (select md5(prosrc) from pg_proc where oid = 'admin.profiles_signup_owned'::regproc)
     <> 'd885415f87aa0611e4a32b8ffae60ce2' then
    raise exception 'guard: admin.profiles_signup_owned() is not the body 20261114100000 created';
  end if;
end
$guard$;

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
    new.onboarded := false;
    new.terms_version := null;
    new.terms_accepted_at := null;
    return new;
  end if;
  if new.onboarded is distinct from old.onboarded then
    raise exception 'sign-up is finished by accept_buyer_terms() or the seller registration only' using errcode = '42501';
  end if;
  if new.terms_version is distinct from old.terms_version
     or new.terms_accepted_at is distinct from old.terms_accepted_at then
    raise exception 'the Terms record is written by accept_buyer_terms() only' using errcode = '42501';
  end if;
  return new;
end
$function$;

revoke all on function admin.profiles_signup_owned() from public, anon, authenticated;
