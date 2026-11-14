-- Buyer and profile fields are checked by the database (buyer sign-up audit 2026-11-13, item 15; plan task A2).
--
-- Sign-up's Account Info and the buyer's Edit Profile check these in the browser; the API reaches the tables directly,
-- so the database checks them too, for a browser's write of a new or changed value (the rule of
-- trg_vendor_profiles_tax_ids, 20261013100000):
--   buyer_profiles  display_name, company   trimmed, at most 120 characters; spaces only is saved as empty (NULL)
--                   postal_code             six digits not starting with 0, when the buyer's country is India (or unset)
--                   gstin, pan              upper-cased with spaces removed; gstin_is_valid() / pan_is_valid(); a GSTIN
--                                           must contain the PAN
--   profiles        full_name               trimmed, at most 120 characters; spaces only is saved as empty (NULL)
--                   email                   empty, or one address of at most 254 characters, not a sign-in placeholder
--                                           (…​.invalid)
-- A value saved before this stays until its owner changes it. Server code (definer functions, the service role,
-- handle_new_user's placeholder email, migrations) isn't checked. A refusal is 23514 with the constraint name below.

create or replace function admin.buyer_profiles_field_checks()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_insert boolean := tg_op = 'INSERT';
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if v_insert or new.display_name is distinct from old.display_name then
    new.display_name := nullif(btrim(new.display_name), '');
    if char_length(new.display_name) > 120 then
      raise exception 'Keep the business name to 120 characters.'
        using errcode = '23514', constraint = 'buyer_profiles_display_name_valid';
    end if;
  end if;

  if v_insert or new.company is distinct from old.company then
    new.company := nullif(btrim(new.company), '');
    if char_length(new.company) > 120 then
      raise exception 'Keep the company name to 120 characters.'
        using errcode = '23514', constraint = 'buyer_profiles_company_valid';
    end if;
  end if;

  if v_insert or new.postal_code is distinct from old.postal_code
     or new.country_code is distinct from old.country_code then
    new.postal_code := nullif(btrim(new.postal_code), '');
    if new.postal_code is not null and coalesce(new.country_code, 'IN') = 'IN'
       and new.postal_code !~ '^[1-9][0-9]{5}$' then
      raise exception 'A pincode is 6 digits and doesn''t start with 0.'
        using errcode = '23514', constraint = 'buyer_profiles_postal_code_valid';
    end if;
  end if;

  if v_insert or new.gstin is distinct from old.gstin then
    new.gstin := nullif(upper(regexp_replace(coalesce(new.gstin, ''), '\s+', '', 'g')), '');
    if new.gstin is not null and not public.gstin_is_valid(new.gstin) then
      raise exception 'That GSTIN isn''t valid. Check it against your GST certificate.'
        using errcode = '23514', constraint = 'buyer_profiles_gstin_valid';
    end if;
  end if;

  if v_insert or new.pan is distinct from old.pan then
    new.pan := nullif(upper(regexp_replace(coalesce(new.pan, ''), '\s+', '', 'g')), '');
    if new.pan is not null and not public.pan_is_valid(new.pan) then
      raise exception 'That PAN isn''t valid. A PAN is 5 letters, 4 digits, then 1 letter.'
        using errcode = '23514', constraint = 'buyer_profiles_pan_valid';
    end if;
  end if;

  if (v_insert or new.gstin is distinct from old.gstin or new.pan is distinct from old.pan)
     and new.gstin is not null and new.pan is not null
     and public.gstin_is_valid(new.gstin) and public.pan_is_valid(new.pan)
     and substr(new.gstin, 3, 10) <> new.pan then
    raise exception 'The GSTIN doesn''t match the PAN. A GSTIN contains the PAN it was issued for.'
      using errcode = '23514', constraint = 'buyer_profiles_gstin_matches_pan';
  end if;

  return new;
end
$function$;

revoke all on function admin.buyer_profiles_field_checks() from public, anon, authenticated;

drop trigger if exists trg_buyer_profiles_field_checks on public.buyer_profiles;
create trigger trg_buyer_profiles_field_checks
  before insert or update on public.buyer_profiles
  for each row execute function admin.buyer_profiles_field_checks();

create or replace function admin.profiles_field_checks()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_insert boolean := tg_op = 'INSERT';
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if v_insert or new.full_name is distinct from old.full_name then
    new.full_name := nullif(btrim(new.full_name), '');
    if char_length(new.full_name) > 120 then
      raise exception 'Keep your name to 120 characters.'
        using errcode = '23514', constraint = 'profiles_full_name_valid';
    end if;
  end if;

  if v_insert or new.email is distinct from old.email then
    new.email := nullif(btrim(new.email), '');
    if new.email is not null and (
         char_length(new.email) > 254
         or new.email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
         or lower(new.email) like '%.invalid') then
      raise exception 'Enter an email address like name@example.com.'
        using errcode = '23514', constraint = 'profiles_email_valid';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function admin.profiles_field_checks() from public, anon, authenticated;

drop trigger if exists trg_profiles_field_checks on public.profiles;
create trigger trg_profiles_field_checks
  before insert or update on public.profiles
  for each row execute function admin.profiles_field_checks();
