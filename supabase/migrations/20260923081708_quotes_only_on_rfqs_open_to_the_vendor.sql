-- A quote is accepted only on an RFQ that is open to the quoting vendor
-- (Master Prompt 12; decided 2026-09-23: "closed RFQs should not receive any
-- quotes").
--
-- Before this, quotes_insert checked only `vendor_id = auth.uid()` and the
-- account's standing, so the RFQ itself was never consulted. Reproduced live,
-- over real HTTP, immediately before this migration
-- (scripts/quote-rfq-open-check.mjs, loadtest-vendor-56 / loadtest-buyer-1):
--   * a quote on an open-marketplace RFQ the buyer had CLOSED     -> accepted
--   * a quote on a request addressed to the vendor, then closed   -> accepted
--   * re-submitting an existing quote after the buyer closed it   -> accepted
--   * a quote on a request addressed to a DIFFERENT vendor        -> accepted
-- The last one was logged as a suspected gap on 2026-09-23. rfqs_select hides
-- such a request from every other vendor, so no screen offers it, but the
-- write path never checked. It is the same question ("is this RFQ open to
-- THIS vendor's quote?"), so it is answered in the same place.
--
-- ── Rule ────────────────────────────────────────────────────────────────
--   rfqs.status must be 'active', and if the request is addressed to a vendor
--   (rfqs.vendor_id is not null) it must be addressed to new.vendor_id.
-- Applied to every writer, not only signed-in ones: no seed, admin tool or
-- migration has a reason to put a quote on a closed request, and the
-- review-aggregate guard (20260922153114) showed what a signed-in-only guard
-- misses.
--
-- ── Why SECURITY DEFINER here, when enforce_lead_cap() must NOT be ──────────
-- enforce_lead_cap() keys its bypass on current_user, which a definer function
-- rewrites. This function has no current_user test, and it has to read the
-- RFQ whatever its visibility: rfqs_select hides a closed RFQ, or one
-- addressed to someone else, from the vendor, and reading it through RLS
-- could only answer "no row". Reading it with definer rights lets the refusal
-- say which rule was broken. EXECUTE is revoked from every client role: a
-- trigger function needs no EXECUTE grant to fire (verified for
-- guard_ad_deletion in 3c, and again here by the live refusals).
--
-- ── Writes it covers ─────────────────────────────────────────────────────
-- INSERT, which includes the app's own submitQuote() upsert: a BEFORE INSERT
-- trigger fires before ON CONFLICT is resolved, so revising a quote after the
-- buyer closed the request is refused as well. It also covers an UPDATE that
-- actually moves a quote to another RFQ or vendor, because quotes_update lets a
-- vendor rewrite rfq_id on their own quote. An UPDATE that leaves both ids as
-- they were passes straight through, so the buyer's accept/reject and the
-- upsert's DO UPDATE are unaffected.
--
-- Existing rows are not touched. Trigger name order puts this check before
-- trg_quotes_lead_cap, so a closed RFQ is reported as closed, not as a cap hit.

create or replace function public.enforce_quote_rfq_open()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r_status public.rfq_status;
  r_target uuid;
begin
  if tg_op = 'UPDATE'
     and new.rfq_id = old.rfq_id and new.vendor_id = old.vendor_id then
    return new;
  end if;

  select r.status, r.vendor_id
    into r_status, r_target
    from public.rfqs r
   where r.id = new.rfq_id;

  if not found then
    return new;  -- the rfq_id foreign key refuses it, with its own error
  end if;

  if r_status <> 'active' then
    raise exception 'This request is closed and is no longer accepting quotes.'
      using errcode = 'P0001';
  end if;

  if r_target is not null and r_target <> new.vendor_id then
    raise exception 'This request was sent to a different vendor and cannot be quoted.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_quote_rfq_open() from public, anon, authenticated;

drop trigger if exists trg_quotes_accepting_rfq on public.quotes;
create trigger trg_quotes_accepting_rfq
  before insert or update of rfq_id, vendor_id on public.quotes
  for each row execute function public.enforce_quote_rfq_open();

do $$
begin
  if has_function_privilege('anon', 'public.enforce_quote_rfq_open()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.enforce_quote_rfq_open()', 'EXECUTE') then
    raise exception 'enforce_quote_rfq_open must not be directly executable by a client role';
  end if;
  -- Same-timing row triggers fire in name order; the RFQ check must come first.
  if (select array_agg(tgname::text order by tgname::text)
        from pg_trigger
       where tgrelid = 'public.quotes'::regclass and not tgisinternal)
     <> array['trg_quotes_accepting_rfq', 'trg_quotes_lead_cap'] then
    raise exception 'unexpected trigger set on public.quotes';
  end if;
end $$;
