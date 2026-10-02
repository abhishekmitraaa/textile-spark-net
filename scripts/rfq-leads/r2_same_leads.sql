-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/LEADS HARNESS R2: the same leads on every plan (2026-10-03).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R2".
--   every plan unlimited      limits.leads_per_month = -1 on all five plans
--   eleven leads, free plan   a vendor with no active plan quotes on 11 open RFQs in one
--                             period (the old free cap was 10)
--   the vendor's own plan     get_vendor_plan() reports -1
--   ranking for a free vendor match_vendor_rfqs scores the fixtures for that vendor
--   no FAQ promises a cap     no active FAQ mentions a lead limit, leads a month,
--                             pay-per-lead or lead access
--   rewritten FAQs translated every rewritten row present carries Hindi and Gujarati
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $r2$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  rewritten uuid[] := array[
    '8df64c7b-3c9a-4903-ac60-c42c4f15cdff', '28d6da8b-e415-4f5f-bc72-07956978bbcb',
    '8b7e9d19-0058-48dd-9d47-6599ec213aa9', '8394ec5f-babe-43b9-aecc-5720de8532b7',
    '92465a9f-516b-4250-a27d-daa2d64a4629', '74229530-ef50-48c8-b100-8221f067d59b',
    '0bcaaa6a-5316-4ff1-a3a2-eeb043a69b57']::uuid[];
  labels text[] := array[
    'every plan unlimited', 'eleven leads on a free plan', 'get_vendor_plan says unlimited',
    'ranking for a free vendor', 'no FAQ promises a cap', 'rewritten FAQs translated'];
  ids uuid[]; got text; want text; i int; k int; n int; present int;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      if i in (2, 4) then
        update public.vendor_subscriptions set status = 'expired' where vendor_id = vendor;
        ids := '{}';
        for k in 1..11 loop
          ids := ids || gen_random_uuid();
          insert into public.rfqs (id, buyer_id, title, status) values (ids[k], buyer, 'R2 lead ' || k, 'active');
        end loop;
      end if;
      if i in (2, 3, 4) then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', vendor::text, true);
        set local role authenticated;
      end if;

      if i = 1 then
        select string_agg(distinct coalesce(limits ->> 'leads_per_month', 'null'), ',') into got from public.subscription_plans;
        want := '-1';
      elsif i = 2 then
        n := 0;
        for k in 1..11 loop
          insert into public.quotes (rfq_id, vendor_id, price_per_unit, price_inr) values (ids[k], vendor, 100, 100);
          n := n + 1;
        end loop;
        got := n || ' quoted'; want := '11 quoted';
      elsif i = 3 then
        got := public.get_vendor_plan() -> 'limits' ->> 'leads_per_month'; want := '-1';
      elsif i = 4 then
        select count(*) into n from public.match_vendor_rfqs(vendor, 500) m where m.rfq_id = any (ids);
        got := n || ' scored'; want := '11 scored';
      elsif i = 5 then
        select count(*) into n from public.faqs
         where active and (question || ' ' || answer) ~* '(lead limit|leads a month|pay-per-lead|lead access)';
        got := n::text; want := '0';
      else
        select count(*), count(*) filter (where translations ? 'hi' and translations ? 'gu')
          into present, n from public.faqs where id = any (rewritten);
        got := n || ' of ' || present; want := present || ' of ' || present;
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 140) || E'\n';
    end;
  end loop;
  raise exception 'R2 (rolled back)%', E'\n' || out;
end
$r2$;
