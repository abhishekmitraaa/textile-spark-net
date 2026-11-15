-- Seller Home fixes, Task 3 (SH-011; documentation/seller-home-audit-2026-11-15.md).
--
-- The Free plan allows 10 listings (Mitra, 2026-11-16: "allow 10 listing for free plan"; the other plans are
-- unchanged, so Free and Basic both allow 10). The profile score's "List 10 products" step is now reachable on Free.
-- The plans page copy (display.products) moves with the limit; re-run scripts/subscriptions/p13_truth_pass.sql.
-- The FAQ "Lowest billing plan?" still says Free gives 2 listings: Andy's wording, raised in ToDo.md.
--
-- Free sellers whose listings were paused under the old limit of 2 get them back now, up to 10, through
-- admin.apply_product_cap(vendor, false), the one place that pauses and resumes (claude.md).

update public.subscription_plans
   set limits  = jsonb_set(limits, '{product_cap}', '10'::jsonb),
       display = jsonb_set(display, '{products}', '"10"'::jsonb)
 where id = 'free';

-- Resumes paused listings for every seller whose plan in force is Free. Returns how many sellers it touched.
-- A seller whose registration waits for approval or was sent back is skipped: nothing of theirs may go live
-- (trg_hold_until_registered), and that refusal used to abort the whole resume, and the migration with it (final
-- review, 2026-11-16). Their listings stay paused, as before.
create or replace function admin.resume_free_plan_listings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v uuid;
  touched integer := 0;
begin
  for v in
    select distinct p.vendor_id
      from public.products p
     where p.status = 'paused'
       and (select e.plan_id from admin.vendor_effective_plan(p.vendor_id, now()) e) = 'free'
       and not public.registration_held(p.vendor_id)
  loop
    perform admin.apply_product_cap(v, false);
    touched := touched + 1;
  end loop;
  return touched;
end;
$$;

revoke all on function admin.resume_free_plan_listings() from public, anon, authenticated;

select admin.resume_free_plan_listings();

do $$
begin
  if (select limits ->> 'product_cap' from public.subscription_plans where id = 'free') <> '10'
     or (select display ->> 'products' from public.subscription_plans where id = 'free') <> '10' then
    raise exception 'free plan self-check: product_cap and display.products must both be 10';
  end if;
end $$;
