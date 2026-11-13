-- Vendor registration, part 3: publishing needs a registered seller (onboarding audit #3; Mitra D1, 2026-11-13).
--
-- While the switch `seller_registration_required` is on for a seller, a browser can't add a listing, a video, a
-- catalogue, an ad or a quote for them unless seller_registered() says yes: registered with a signed Supplier
-- Agreement, or one of Cosora's exempt demo sellers. Existing content is untouched (an INSERT gate only), admins
-- are not stopped, and definer paths (the registration submit itself) aren't browsers. The trigger is named to
-- fire before the other BEFORE INSERT triggers, so the seller hears "finish your registration" first.
-- Plan checkout (subscription_checkout_gate) and buyer phone reveals (call_buyer_contact) already need the flag.

create or replace function admin.require_registered_seller()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user <> 'authenticated' or coalesce(public.is_admin(), false) then
    return new;
  end if;
  if not coalesce(public.seller_registered(new.vendor_id), false) then
    raise exception 'Finish your seller registration first'
      using errcode = '42501', hint = 'registration_required';
  end if;
  return new;
end
$function$;
revoke all on function admin.require_registered_seller() from public, anon, authenticated;

create trigger trg_0_registered_seller before insert on public.products
  for each row execute function admin.require_registered_seller();
create trigger trg_0_registered_seller before insert on public.product_videos
  for each row execute function admin.require_registered_seller();
create trigger trg_0_registered_seller before insert on public.catalogues
  for each row execute function admin.require_registered_seller();
create trigger trg_0_registered_seller before insert on public.advertisements
  for each row execute function admin.require_registered_seller();
create trigger trg_0_registered_seller before insert on public.quotes
  for each row execute function admin.require_registered_seller();

-- ── Nothing goes live while a registration waits or was sent back (review #3) ──
-- What a seller outside India sent with their registration (the first product, a catalogue), or added since, goes to
-- the usual review queues; a moderator approving it must not put it in front of buyers before Cosora approves the
-- registration. Applies to every writer: moderators, approve_vendor_content(), jobs. Sellers without a registration
-- row (before 2026-11-13, the demo sellers) are untouched.
create or replace function public.registration_held(p_vendor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select not exists (select 1 from public.vendor_profiles v where v.id = p_vendor and v.onboarding_complete)
     and not exists (select 1 from admin.registration_exempt e where e.vendor_id = p_vendor)
     and coalesce((select r.status from public.vendor_registrations r
                     where r.vendor_id = p_vendor order by r.created_at desc limit 1) in ('pending_review', 'rejected'), false)
$function$;
revoke all on function public.registration_held(uuid) from public, anon, authenticated;
grant execute on function public.registration_held(uuid) to authenticated, service_role;

create or replace function admin.hold_until_registered()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status::text = 'live' and old.status::text is distinct from 'live' and public.registration_held(new.vendor_id) then
    raise exception 'This seller''s registration is waiting for Cosora''s approval; approve the registration first'
      using errcode = 'P0001', hint = 'registration_pending';
  end if;
  return new;
end
$function$;
revoke all on function admin.hold_until_registered() from public, anon, authenticated;

create trigger trg_hold_until_registered before update of status on public.products
  for each row execute function admin.hold_until_registered();
create trigger trg_hold_until_registered before update of status on public.product_videos
  for each row execute function admin.hold_until_registered();
create trigger trg_hold_until_registered before update of status on public.catalogues
  for each row execute function admin.hold_until_registered();

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  t text;
begin
  foreach t in array array['products', 'product_videos', 'catalogues', 'advertisements', 'quotes'] loop
    if not exists (select 1 from pg_trigger where tgname = 'trg_0_registered_seller'
                     and tgrelid = ('public.' || t)::regclass) then
      raise exception 'self-check: % has no registration gate', t;
    end if;
    -- First of the BEFORE INSERT row triggers, so its message is the one a seller sees.
    if (select tgname from pg_trigger
         where tgrelid = ('public.' || t)::regclass and not tgisinternal
           and (tgtype & 2) = 2 and (tgtype & 4) = 4 and (tgtype & 1) = 1
         order by tgname limit 1) <> 'trg_0_registered_seller' then
      raise exception 'self-check: on %, another BEFORE INSERT trigger fires before the registration gate', t;
    end if;
  end loop;
  foreach t in array array['products', 'product_videos', 'catalogues'] loop
    if not exists (select 1 from pg_trigger where tgname = 'trg_hold_until_registered'
                     and tgrelid = ('public.' || t)::regclass) then
      raise exception 'self-check: % can go live while its seller''s registration waits', t;
    end if;
  end loop;
  if (select prosecdef from pg_proc where oid = 'admin.require_registered_seller()'::regprocedure) then
    raise exception 'self-check: the gate must stay INVOKER';
  end if;
end
$check$;
