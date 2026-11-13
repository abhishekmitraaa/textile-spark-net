-- Vendor registration, part B (released AFTER both apps ship the new registration): a browser can no longer make
-- itself a registered seller or put photos on its storefront unreviewed (onboarding audit #2; Mitra, 2026-11-13).
--
-- vendor_profiles.onboarding_complete is set only by submit_vendor_registration() (India) and
-- admin_vendor_registration_decide() (overseas approval). vendor_profiles.office_photos is the approved-photo cache
-- kept by vendor_premises_photos' trigger. Both run with definer rights, so this guard, which acts only for
-- `authenticated`, never stops them. The old app wrote onboarding_complete itself, so this ships second.

create or replace function admin.vendor_profiles_registration_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.onboarding_complete, false) then
      raise exception 'Registration is completed through the registration form' using errcode = '42501';
    end if;
    if coalesce(cardinality(new.office_photos), 0) > 0 then
      raise exception 'Premises photos are added for review, not written to the profile' using errcode = '42501';
    end if;
  else
    if new.onboarding_complete is distinct from old.onboarding_complete then
      raise exception 'Registration is completed through the registration form' using errcode = '42501';
    end if;
    if new.office_photos is distinct from old.office_photos then
      raise exception 'Premises photos are added for review, not written to the profile' using errcode = '42501';
    end if;
  end if;
  return new;
end
$function$;
revoke all on function admin.vendor_profiles_registration_guard() from public, anon, authenticated;

-- What an old app wrote into office_photos between part A and now is replaced by the approved set (review #10).
update public.vendor_profiles v
   set office_photos = coalesce((select array_agg(p.url order by p.position, p.created_at)
                                   from public.vendor_premises_photos p
                                  where p.vendor_id = v.id and p.status = 'live'), '{}'::text[])
 where v.office_photos is distinct from coalesce((select array_agg(p.url order by p.position, p.created_at)
                                                   from public.vendor_premises_photos p
                                                  where p.vendor_id = v.id and p.status = 'live'), '{}'::text[]);

create trigger trg_vendor_profiles_registration_guard
  before insert or update on public.vendor_profiles
  for each row execute function admin.vendor_profiles_registration_guard();

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_vendor_profiles_registration_guard'
                   and tgrelid = 'public.vendor_profiles'::regclass and tgenabled <> 'D') then
    raise exception 'self-check: the registration guard is missing';
  end if;
  if (select prosecdef from pg_proc where oid = 'admin.vendor_profiles_registration_guard()'::regprocedure) then
    raise exception 'self-check: the guard must stay INVOKER (current_user is how it knows a browser wrote)';
  end if;
end
$check$;
