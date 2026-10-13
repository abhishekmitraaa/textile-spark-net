-- GSTIN and PAN are checked when a seller saves them (2026-10-13; ToDo "Check GSTIN and PAN
-- at seller registration", securityflags S-6).
--
-- Subscriptions P0 checked both on /subscription, in the browser. Onboarding saved whatever
-- was typed, and the API reaches vendor_profiles directly, so the form was the only check.
-- Both values are printed on tax invoices.
--
-- This trigger, for every writer:
--   * stores a GSTIN and a PAN upper-cased with spaces removed, and an empty one as null
--     (the same as normaliseTaxId() in src/lib/taxIds.ts);
-- and for a browser's write (anon, authenticated), only when the value is new or changed:
--   * refuses a GSTIN that fails gstin_is_valid() (shape and checksum);
--   * refuses a PAN that isn't 5 letters, 4 digits, 1 letter;
--   * refuses a GSTIN that doesn't contain the PAN saved with it.
-- A row saved before this keeps what it holds until its owner changes that value: a form that
-- sends the whole row back still saves. Seeds, jobs and the service role are normalised but
-- not refused, like the other server-owned guards on this table.

create or replace function public.pan_is_valid(p_pan text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_pan is not null and p_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
$function$;

comment on function public.pan_is_valid(text) is
  'True for a PAN in its stored form: 5 capital letters, 4 digits, 1 capital letter. Mirrors isValidPan() in src/lib/taxIds.ts. A format check only: nothing here looks a PAN up.';

revoke all on function public.pan_is_valid(text) from public;
grant execute on function public.pan_is_valid(text) to anon, authenticated, service_role;

create or replace function public.vendor_profiles_tax_ids()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_browser      boolean := current_user in ('anon', 'authenticated');
  v_gstin_change boolean;
  v_pan_change   boolean;
begin
  new.gstin := nullif(upper(regexp_replace(coalesce(new.gstin, ''), '\s+', '', 'g')), '');
  new.pan   := nullif(upper(regexp_replace(coalesce(new.pan, ''), '\s+', '', 'g')), '');

  if not v_browser then
    return new;
  end if;

  -- Compared with the stored value in the same form, so a row saved in lower case before
  -- this guard, sent back as it is, doesn't count as a change.
  v_gstin_change := tg_op = 'INSERT' or new.gstin is distinct from
                    nullif(upper(regexp_replace(coalesce(old.gstin, ''), '\s+', '', 'g')), '');
  v_pan_change   := tg_op = 'INSERT' or new.pan is distinct from
                    nullif(upper(regexp_replace(coalesce(old.pan, ''), '\s+', '', 'g')), '');

  if v_gstin_change and new.gstin is not null and not public.gstin_is_valid(new.gstin) then
    raise exception 'That GSTIN isn''t valid. Check it against your GST certificate.'
      using errcode = '23514', constraint = 'vendor_profiles_gstin_valid';
  end if;

  if v_pan_change and new.pan is not null and not public.pan_is_valid(new.pan) then
    raise exception 'That PAN isn''t valid. A PAN is 5 letters, 4 digits, then 1 letter.'
      using errcode = '23514', constraint = 'vendor_profiles_pan_valid';
  end if;

  if (v_gstin_change or v_pan_change)
     and new.gstin is not null and new.pan is not null
     and public.gstin_is_valid(new.gstin) and public.pan_is_valid(new.pan)
     and substr(new.gstin, 3, 10) <> new.pan then
    raise exception 'The GSTIN doesn''t match the PAN. A GSTIN contains the PAN it was issued for.'
      using errcode = '23514', constraint = 'vendor_profiles_gstin_matches_pan';
  end if;

  return new;
end
$function$;

revoke all on function public.vendor_profiles_tax_ids() from public, anon, authenticated;

create or replace trigger trg_vendor_profiles_tax_ids
  before insert or update of gstin, pan on public.vendor_profiles
  for each row execute function public.vendor_profiles_tax_ids();

-- Self-check.
do $check$
begin
  if not public.pan_is_valid('ABCDE1234F') or public.pan_is_valid('abcde1234f')
     or public.pan_is_valid('ABCDE12345') or public.pan_is_valid(null) then
    raise exception 'self-check: pan_is_valid() is wrong';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_vendor_profiles_tax_ids'
                    and tgrelid = 'public.vendor_profiles'::regclass and not tgisinternal) then
    raise exception 'self-check: trg_vendor_profiles_tax_ids is missing';
  end if;
  if has_function_privilege('authenticated', 'public.vendor_profiles_tax_ids()', 'EXECUTE') then
    raise exception 'self-check: the trigger function is callable by browsers';
  end if;
end
$check$;
