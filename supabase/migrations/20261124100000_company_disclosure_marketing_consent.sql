-- Company disclosure and marketing consent (Mitra, 2026-11-24;
-- documentation/company-disclosure-plan-2026-11-24.md).
--
-- 1. Marketing consent, apart from contact_consent. contact_consent is consent to SERVICE messages (lead alerts) on
--    WhatsApp and SMS; this is consent to offers and promotions on WhatsApp and email. A yes to one is never a yes to
--    the other. public.marketing_consent is the current answer; admin.marketing_consent_log keeps every change with
--    the address it applied to, where it was given and the exact words shown: the proof of consent.
-- 2. A deleted account's marketing consent goes, and its log keeps no address.
-- 3. The buyer Terms are version 2026-11-v3 (the company named, a Communications clause, the contact clause).
--    Buyers who accepted an earlier version aren't asked again (the gate checks that a record exists).
-- 4. Support's email and phone are the company's: teamcosora@gmail.com, +917904840367.
--
-- Order: apply this, then deploy the app. In between, an open Terms tab sends v2 and gets "stale_terms"
-- ("These Terms have changed. Reload the page to read the new version.").

begin;

-- ── 1. Marketing consent ─────────────────────────────────────────────────────────────
create table public.marketing_consent (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  channel    text not null check (channel in ('whatsapp', 'email')),
  opted_in   boolean not null,
  address    text,
  source     text not null check (source in ('signup', 'checkout', 'settings', 'support')),
  wording    text not null,
  changed_at timestamptz not null default now(),
  primary key (profile_id, channel)
);
alter table public.marketing_consent enable row level security;
revoke all on public.marketing_consent from public, anon, authenticated;
grant select on public.marketing_consent to authenticated;
create policy marketing_consent_select on public.marketing_consent
  for select to authenticated using (profile_id = (select auth.uid()));
comment on table public.marketing_consent is
  'Opt-in to Cosora offers and promotions by WhatsApp and email, per person and channel: the current answer, with the address, the words shown, where and when. Written only through set_marketing_consent(), which also appends to admin.marketing_consent_log. No row means no. Separate from contact_consent (service messages).';

create table admin.marketing_consent_log (
  id         bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  channel    text not null,
  opted_in   boolean not null,
  address    text,
  source     text not null,
  wording    text not null,
  at         timestamptz not null default now()
);
alter table admin.marketing_consent_log enable row level security;
create index marketing_consent_log_profile_idx on admin.marketing_consent_log (profile_id, at desc);
comment on table admin.marketing_consent_log is
  'Append-only history of marketing opt-ins and opt-outs (set_marketing_consent): who, which channel, the address it applied to, where it was given, the words shown, and when. The proof of consent.';

-- The words shown beside each box, as the app renders them in English (src/lib/marketingConsent.ts). The server
-- records these, never words a browser sends.
create or replace function admin.marketing_consent_wording(p_channel text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case p_channel
    when 'whatsapp' then 'Send me offers and updates from Cosora on WhatsApp at this number.'
    when 'email'    then 'Send me offers and updates from Cosora by email.'
  end
$function$;
revoke all on function admin.marketing_consent_wording(text) from public, anon, authenticated;

create or replace function public.set_marketing_consent(p_channel text, p_opted_in boolean, p_source text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_address text;
  v_wording text;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not coalesce(public.account_not_deleted(v_me), false) then
    raise exception 'account_deleted' using errcode = '42501';
  end if;
  if p_channel is null or p_channel not in ('whatsapp', 'email') then
    raise exception 'unknown channel %', p_channel using errcode = '22023';
  end if;
  if p_opted_in is null or p_source is null or p_source not in ('signup', 'checkout', 'settings') then
    raise exception 'say yes or no, from sign-up, checkout or settings' using errcode = '22023';
  end if;

  v_address := admin.contact_address(v_me, p_channel);
  v_wording := admin.marketing_consent_wording(p_channel);

  insert into public.marketing_consent (profile_id, channel, opted_in, address, source, wording, changed_at)
  values (v_me, p_channel, p_opted_in, v_address, p_source, v_wording, now())
  on conflict (profile_id, channel) do update
    set opted_in = excluded.opted_in, address = excluded.address, source = excluded.source,
        wording = excluded.wording, changed_at = excluded.changed_at
    where public.marketing_consent.opted_in is distinct from excluded.opted_in;
  -- Only a real change of mind is logged (ticking yes twice is one opt-in).
  if found then
    insert into admin.marketing_consent_log (profile_id, channel, opted_in, address, source, wording)
    values (v_me, p_channel, p_opted_in, v_address, p_source, v_wording);
  end if;
end
$function$;
revoke all on function public.set_marketing_consent(text, boolean, text) from public, anon;
grant execute on function public.set_marketing_consent(text, boolean, text) to authenticated;

create or replace function public.my_marketing_consent()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'whatsapp', coalesce((select c.opted_in from public.marketing_consent c where c.profile_id = v_me and c.channel = 'whatsapp'), false),
    'email',    coalesce((select c.opted_in from public.marketing_consent c where c.profile_id = v_me and c.channel = 'email'), false));
end
$function$;
revoke all on function public.my_marketing_consent() from public, anon;
grant execute on function public.my_marketing_consent() to authenticated;

-- ── 2. A deleted account keeps no marketing consent, and its log no address ─────────
create or replace function admin.marketing_consent_off_when_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.account_status = 'deleted' and old.account_status is distinct from 'deleted' then
    delete from public.marketing_consent where profile_id = new.id;
    update admin.marketing_consent_log set address = null where profile_id = new.id and address is not null;
  end if;
  return new;
end
$function$;
revoke all on function admin.marketing_consent_off_when_deleted() from public, anon, authenticated;

drop trigger if exists trg_profiles_marketing_consent_off_when_deleted on public.profiles;
create trigger trg_profiles_marketing_consent_off_when_deleted after update of account_status on public.profiles
  for each row execute function admin.marketing_consent_off_when_deleted();

-- ── 3. Buyer Terms version 2026-11-v3 ────────────────────────────────────────────────
create or replace function public.buyer_terms_version()
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select '2026-11-v3'::text
$function$;

-- ── 4. Support's email and phone are the company's ───────────────────────────────────
update public.support_settings
   set support_email = 'teamcosora@gmail.com', support_phone = '+917904840367', updated_at = now()
 where singleton;

-- ── Self-check ───────────────────────────────────────────────────────────────────────
do $check$
begin
  if public.buyer_terms_version() <> '2026-11-v3' then
    raise exception 'company_disclosure: buyer_terms_version is %', public.buyer_terms_version();
  end if;
  if (select prosecdef from pg_proc where oid = 'public.set_marketing_consent(text, boolean, text)'::regprocedure) is not true then
    raise exception 'company_disclosure: set_marketing_consent must be security definer';
  end if;
  if has_table_privilege('authenticated', 'public.marketing_consent', 'insert')
     or has_table_privilege('authenticated', 'public.marketing_consent', 'update')
     or has_table_privilege('anon', 'public.marketing_consent', 'select') then
    raise exception 'company_disclosure: marketing_consent is written only through set_marketing_consent';
  end if;
  if has_function_privilege('anon', 'public.set_marketing_consent(text, boolean, text)', 'execute') then
    raise exception 'company_disclosure: anon may not set marketing consent';
  end if;
  if admin.marketing_consent_wording('whatsapp') is null or admin.marketing_consent_wording('email') is null then
    raise exception 'company_disclosure: wording missing';
  end if;
  if exists (select 1 from public.support_settings where singleton
              and (support_email <> 'teamcosora@gmail.com' or support_phone <> '+917904840367')) then
    raise exception 'company_disclosure: support_settings not updated';
  end if;
end
$check$;

commit;
