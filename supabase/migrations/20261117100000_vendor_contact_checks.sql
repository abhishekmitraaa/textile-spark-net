-- Seller Home audit SH-043 (2026-11-17): a seller's contact fields are checked by the database, as registration
-- checks them (src/lib/registrationValidation.ts; submit_vendor_registration). The Business Profile's Contact Details
-- sheet wrote phone, WhatsApp, email and website raw: website "x" earned 7 profile points and became a buyer link to
-- https://x, phone "call me" earned 8.
--
-- Like the GSTIN/PAN guard (20261013100000): only a browser's write, and only a NEW or CHANGED value, is judged. A
-- value saved before this stays until its owner edits it. Definer functions (submit_vendor_registration) are trusted.
--   phone, whatsapp: E.164. India (country_code 'IN' or unset): +91 and 10 digits, the first 1–9. Elsewhere: + and
--                    8–15 digits, not +91.
--   website:         https://host.tld[:port][/path], at most 200 characters (normaliseWebsite()).
--   owner_email:     something@host.tld, at most 254 characters (isValidEmail()).

create or replace function public.vendor_profiles_contact_checks()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_india boolean := coalesce(new.country_code, 'IN') = 'IN';
  v_phone_re text := case when coalesce(new.country_code, 'IN') = 'IN' then '^\+91[1-9][0-9]{9}$' else '^\+[1-9][0-9]{7,14}$' end;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  new.phone       := nullif(btrim(new.phone), '');
  new.whatsapp    := nullif(btrim(new.whatsapp), '');
  new.website     := nullif(btrim(new.website), '');
  new.owner_email := nullif(btrim(new.owner_email), '');

  if new.phone is not null and (tg_op = 'INSERT' or new.phone is distinct from old.phone)
     and (new.phone !~ v_phone_re or (not v_india and new.phone like '+91%')) then
    raise exception 'That phone number isn''t valid. %', case when v_india
      then 'Enter a 10-digit Indian number.' else 'Enter the full international number, starting with + and the country code.' end
      using errcode = '23514', constraint = 'vendor_profiles_phone_valid';
  end if;

  if new.whatsapp is not null and (tg_op = 'INSERT' or new.whatsapp is distinct from old.whatsapp)
     and (new.whatsapp !~ v_phone_re or (not v_india and new.whatsapp like '+91%')) then
    raise exception 'That WhatsApp number isn''t valid. %', case when v_india
      then 'Enter a 10-digit Indian number.' else 'Enter the full international number, starting with + and the country code.' end
      using errcode = '23514', constraint = 'vendor_profiles_whatsapp_valid';
  end if;

  if new.website is not null and (tg_op = 'INSERT' or new.website is distinct from old.website)
     and (char_length(new.website) > 200
          or new.website !~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$') then
    raise exception 'That website address isn''t valid. Enter it like https://yourbusiness.in.'
      using errcode = '23514', constraint = 'vendor_profiles_website_valid';
  end if;

  if new.owner_email is not null and (tg_op = 'INSERT' or new.owner_email is distinct from old.owner_email)
     and (char_length(new.owner_email) > 254 or new.owner_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:].]{2,}$') then
    raise exception 'That email address isn''t valid. Enter it like you@business.in.'
      using errcode = '23514', constraint = 'vendor_profiles_owner_email_valid';
  end if;

  return new;
end
$function$;

revoke all on function public.vendor_profiles_contact_checks() from public, anon, authenticated;

drop trigger if exists trg_vendor_profiles_contact_checks on public.vendor_profiles;
create trigger trg_vendor_profiles_contact_checks
  before insert or update of phone, whatsapp, website, owner_email, country_code on public.vendor_profiles
  for each row execute function public.vendor_profiles_contact_checks();

-- Self-check: a browser's bad new values are refused, good ones stored, an untouched old value passes.
do $check$
declare
  v_id uuid;
  v_refused int := 0;
  v_case text;
begin
  select id into v_id from public.vendor_profiles order by created_at limit 1;
  if v_id is null then
    raise notice 'vendor_profiles_contact_checks: no vendor row to test with, self-check skipped';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach v_case in array array[
    'update public.vendor_profiles set phone = ''call me'', country_code = ''IN'' where id = $1',
    'update public.vendor_profiles set whatsapp = ''12345'', country_code = ''IN'' where id = $1',
    'update public.vendor_profiles set website = ''x'' where id = $1',
    'update public.vendor_profiles set owner_email = ''nobody'' where id = $1',
    'update public.vendor_profiles set phone = ''+919876543210'', country_code = ''GB'' where id = $1'
  ] loop
    begin
      execute v_case using v_id;
    exception when check_violation then
      v_refused := v_refused + 1;
    end;
  end loop;
  reset role;
  if v_refused <> 5 then
    raise exception 'vendor_profiles_contact_checks self-check: % of 5 bad values refused', v_refused;
  end if;
end
$check$;
