-- ─────────────────────────────────────────────────────────────
-- MPF-18: a vendor could set its own quote to "accepted", and a buyer could
-- rewrite a vendor's price.
--
-- quotes_update is `vendor_id = auth.uid() OR owns_rfq(rfq_id) OR is_admin()`
-- for both USING and WITH CHECK, and no trigger guarded which columns each side
-- changes. So the vendor could mark its own quote accepted (the buyer's list, the
-- vendor's acceptance rate and Total Order Value all count it), and the RFQ's
-- buyer could change the vendor's price or terms.
--
-- The rule, per signed-in caller:
--   - the buyer who owns the request decides: it may change `status` (shortlist,
--     accept, reject, or back to pending) and nothing else;
--   - the vendor who wrote the quote may change its terms, and may move `status`
--     only to 'pending'. Changing the terms of a quote that isn't pending puts it
--     back to pending, so revised terms go back in front of the buyer
--     (submitQuote already re-submits with status 'pending');
--   - nobody but an admin changes id, rfq_id, vendor_id or created_at;
--   - admins may change anything; so may service_role, postgres and migrations,
--     which have no JWT user (the plan-cap triggers' `current_user` test).
--
-- The trigger stays SECURITY INVOKER, or `current_user` would be the owner and
-- the rule would never apply. owns_rfq() and is_admin() are definer helpers, so
-- they answer correctly whatever RLS the caller has.
-- ─────────────────────────────────────────────────────────────

create or replace function public.enforce_quote_update_roles()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_vendor boolean;
  v_owner  boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if coalesce(public.is_admin(), false) then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.rfq_id is distinct from old.rfq_id
     or new.vendor_id is distinct from old.vendor_id
     or new.created_at is distinct from old.created_at then
    raise exception 'A quote''s request, vendor and creation time can''t be changed'
      using errcode = '42501';
  end if;

  v_vendor := old.vendor_id = v_uid;
  v_owner  := coalesce(public.owns_rfq(old.rfq_id), false);

  -- Revised terms go back to the buyer. Without this a vendor could raise the
  -- price of a quote the buyer had accepted, and it would stay "accepted" at a
  -- price nobody agreed to (and count in Total Order Value).
  if v_vendor and not v_owner
     and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    new.status := 'pending';
  end if;

  if new.status is distinct from old.status
     and not (v_owner or (v_vendor and new.status = 'pending')) then
    raise exception 'Only the buyer who posted the request can shortlist, accept or reject a quote'
      using errcode = '42501';
  end if;

  if not v_vendor and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Only the vendor who sent a quote can change its price or terms'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_quote_update_roles() from public, anon, authenticated;

drop trigger if exists trg_quotes_update_roles on public.quotes;
create trigger trg_quotes_update_roles
  before update on public.quotes
  for each row execute function public.enforce_quote_update_roles();

-- Self-check.
do $check$
begin
  if not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = 'public.quotes'::regclass and t.tgname = 'trg_quotes_update_roles'
                    and p.proname = 'enforce_quote_update_roles' and not p.prosecdef and t.tgenabled = 'O') then
    raise exception 'self-check: trg_quotes_update_roles missing, disabled, or on a definer function';
  end if;
end
$check$;
