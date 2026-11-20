-- Hotfix for 20261120140100_low_batch5_revoke.sql (2026-11-20, found the same evening by the review-leftovers browser
-- check). guard_deleted_account() runs as the caller (it skips itself unless current_user is 'authenticated') and read
-- profiles.account_status with a SELECT, which browsers lost with the revoke: every signed-in update to profiles and
-- every insert or update to buyer_profiles failed with "permission denied for table profiles" (choosing a role in
-- sign-up, Account Information, interests, profile edits).
--
-- The rule is unchanged. On profiles the row being updated carries its own status (OLD), so nothing is read; on
-- buyer_profiles the row is always the caller's own (bprofiles_insert / bprofiles_update: id = auth.uid()), so
-- account_not_deleted(), a definer that answers a browser about its own account, reads it.

begin;

create or replace function public.guard_deleted_account()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_table_name = 'profiles' then
    if old.account_status = 'deleted' then
      raise exception 'this account has been deleted' using errcode = '42501';
    end if;
  elsif not coalesce(public.account_not_deleted(new.id), false) then
    raise exception 'this account has been deleted' using errcode = '42501';
  end if;
  return new;
end;
$function$;

do $check$
begin
  if (select p.prosrc from pg_proc p where p.oid = 'public.guard_deleted_account()'::regprocedure) ~ 'from public\.profiles' then
    raise exception 'guard_hotfix: guard_deleted_account still reads profiles';
  end if;
end
$check$;

commit;
