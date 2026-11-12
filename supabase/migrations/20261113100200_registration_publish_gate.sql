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
  if (select prosecdef from pg_proc where oid = 'admin.require_registered_seller()'::regprocedure) then
    raise exception 'self-check: the gate must stay INVOKER';
  end if;
end
$check$;
