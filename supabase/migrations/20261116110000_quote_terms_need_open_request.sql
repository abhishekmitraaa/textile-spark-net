-- A quote's terms can't change once its request is closed (Seller Home audit SH-075, 2026-11-16).
--
-- "Closed RFQs should not receive any quotes ... covers re-submitting an existing quote" (Mitra, 2026-09-23). The check
-- ran on INSERT and on UPDATE OF rfq_id, vendor_id only, so the app's upsert was refused but a plain update of the price
-- was not: a seller could turn an accepted ₹250 quote on a closed request into ₹1.00 and back to "pending" (un-winning
-- the order and dropping Total Order Value), or push new words to a buyer after Cosora removed the request.
--
-- Now the trigger fires on every update, and the function passes one only when nothing but the status (the buyer's
-- shortlist, accept or reject, which stays allowed after the request closes) or updated_at changed. Every other rule in
-- the function is as it was.

create or replace function public.enforce_quote_rfq_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  r_status   public.rfq_status;
  r_target   uuid;
  r_buyer    uuid;
  r_overseas boolean;
  r_until    timestamptz;
  r_expires  timestamptz;
  v_tier     text;
begin
  -- An update that leaves the terms alone (the buyer deciding the quote, a touch of updated_at) isn't a quote being
  -- sent. Anything else is, whoever writes it: the price, the quantity, the words, the request or the seller.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then
    return new;
  end if;

  select r.status, r.vendor_id, r.buyer_id, r.overseas, r.overseas_vip_until, r.expires_at
    into r_status, r_target, r_buyer, r_overseas, r_until, r_expires
    from public.rfqs r
   where r.id = new.rfq_id;

  if not found then
    return new;  -- the rfq_id foreign key refuses it, with its own error
  end if;

  -- A seller's own requirement, posted as a buyer (2026-10-21): quoting it and accepting it made an order
  -- that never was.
  if r_buyer = new.vendor_id then
    raise exception 'You can''t quote on your own requirement.'
      using errcode = '42501';
  end if;

  if r_status <> 'active' then
    raise exception 'This request is closed and is no longer accepting quotes.'
      using errcode = 'P0001';
  end if;

  -- The 7-day deadline (2026-10-19). The buyer can extend it; until then no new quote.
  if r_expires is not null and r_expires <= now() then
    raise exception 'This request''s deadline has passed and it is no longer accepting quotes.'
      using errcode = 'P0001';
  end if;

  if r_target is not null and r_target <> new.vendor_id then
    raise exception 'This request was sent to a different vendor and cannot be quoted.'
      using errcode = '42501';
  end if;

  -- Overseas requirements (P7): Gold and VIP only, VIP first. One sent to this vendor, or
  -- one they have already quoted on, is theirs to quote.
  if r_overseas and r_target is null
     and not exists (select 1 from public.quotes q where q.rfq_id = new.rfq_id and q.vendor_id = new.vendor_id) then
    v_tier := admin.vendor_overseas_tier(new.vendor_id);
    if not public.overseas_rfq_visible(true, r_until, v_tier) then
      if v_tier = 'gold' then
        raise exception 'This overseas requirement is with VIP sellers first. It opens to Gold on %.',
          to_char(r_until at time zone 'Asia/Kolkata', 'FMDD Mon, HH12:MI AM')
          using errcode = '42501';
      end if;
      raise exception 'Overseas requirements are part of the Gold and VIP plans.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- Every update, not only one that names rfq_id or vendor_id. Same name, so it still fires before the lead cap.
drop trigger if exists trg_quotes_accepting_rfq on public.quotes;
create trigger trg_quotes_accepting_rfq
  before insert or update on public.quotes
  for each row execute function public.enforce_quote_rfq_open();

-- Self-check: the trigger is there, fires on any update, and comes before the lead cap's.
do $$
declare
  t record;
begin
  select tgtype, tgattr into t from pg_trigger
   where tgrelid = 'public.quotes'::regclass and tgname = 'trg_quotes_accepting_rfq' and not tgisinternal;
  if not found then
    raise exception 'trg_quotes_accepting_rfq is missing';
  end if;
  if cardinality(t.tgattr::int2[]) <> 0 then
    raise exception 'trg_quotes_accepting_rfq still fires for named columns only';
  end if;
  if (t.tgtype & 2) = 0 or (t.tgtype & 4) = 0 or (t.tgtype & 16) = 0 then
    raise exception 'trg_quotes_accepting_rfq must be BEFORE INSERT OR UPDATE (tgtype %)', t.tgtype;
  end if;
  if 'trg_quotes_accepting_rfq' >= 'trg_quotes_lead_cap' then
    raise exception 'trg_quotes_accepting_rfq must sort before trg_quotes_lead_cap';
  end if;
end $$;
