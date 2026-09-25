-- Andy's Seller Registration and Subscription FAQs, codified (Phase 24 of the My
-- Profile brief, 2026-09-25; Phase 9 Q4).
--
-- The content in documentation/seller-registration-and-subscription-faq-content.md went
-- live on 2026-09-23 through the admin_faq_* RPCs as demo-admin, not a migration. This
-- file makes it reproducible without duplicating it (Mitra's choice, 2026-09-25): on a
-- fresh database, after 20260923144549, it produces the state that is live; on the live
-- database it changes nothing. Every statement is conditional.
--
--   seller_registration  Andy's 10 questions, positions 10–100, no category. Shown on
--                        the vendor landing page /seller (Phase 9's placement).
--   subscription         Andy's 5 at 10–50, in his order, "Lowest billing plan?" last
--                        with the answer written in Phase 9 from the live plans (kept,
--                        Mitra 2026-09-25). Then three of the five questions
--                        20260923144549 seeded, still accurate and not covered by Andy's
--                        list, at 120–140. The other two are deactivated at 210 and 240,
--                        because Andy's versions of the same questions replaced them.
--
-- "Contact us?" in Andy's list is not a question. It is the Subscription FAQ's button
-- (Subscription.tsx), which goes to mailto:hello@cosora.in (Mitra, 2026-09-25).
--
-- Text is copied from the live rows byte for byte, so the pages don't change. Andy's
-- answers are published verbatim by Mitra's decision (2026-09-23), including the ones the
-- product doesn't match yet (MPF-16, MPF-17).

-- ── 1. Move the five seeded Subscription rows below Andy's list ─────────────────
-- Matched on question AND the answer 20260923144549 seeded, so a row an admin has
-- since edited is left alone. Already in place on the live database: 0 rows.
update public.faqs f
   set position = v.position, active = v.active, updated_at = now()
  from (values
    ($q$How does billing work — is there autopay?$q$,
     $q$No auto-debit. Every billing period is a discrete payment. When your period nears its end you'll get a renew reminder; if you don't renew, your account falls back to the Free plan.$q$,
     120, true),
    ($q$What payment methods do you accept?$q$,
     $q$All major cards, UPI, and net banking via Razorpay. Yearly billing gives you two months free versus paying monthly.$q$,
     130, true),
    ($q$How is GST handled?$q$,
     $q$Plan prices are exclusive of GST; 18% GST is added at checkout. Add your GSTIN below and it's recorded on every invoice for your input tax credit.$q$,
     140, true),
    ($q$Can I upgrade or downgrade my plan anytime?$q$,
     $q$Yes. Upgrading takes effect immediately for the period you pay for. There's no autopay — each period (monthly or yearly) is a one-time payment you make explicitly, so you're always in control.$q$,
     210, false),
    ($q$What happens when I reach my lead or product limit?$q$,
     $q$You'll be prompted to upgrade at the point of action (quoting a lead or publishing a product). Existing listings and quotes are never removed.$q$,
     240, false)
  ) as v(question, answer, position, active)
 where f.surface = 'subscription'
   and f.question = v.question
   and f.answer = v.answer
   and (f.position, f.active) is distinct from (v.position, v.active);

-- ── 2. Andy's questions, wherever an active copy isn't already there ────────────
-- On the live database every one exists: 0 rows. "Can I upgrade or downgrade my plan
-- anytime?" is also the question of a deactivated seeded row, hence `active`.
insert into public.faqs (surface, category_label, question, answer, position)
select v.surface, null, v.question, v.answer, v.position
  from (values
    ('seller_registration', 10, $q$What is Cosora?$q$,
     $q$Cosora is a B2B platform where manufacturers of textiles, garments, and accessories can connect directly with fashion brands, wholesalers, and retailers to generate quality leads and grow their business.$q$),
    ('seller_registration', 20, $q$Who can register as a seller on Cosora?$q$,
     $q$Manufacturers, wholesalers, exporters, or distributors of:
• Fabrics & textiles
• Ready-made garments
• Fashion accessories (labels, tags, trims, etc.)
• Anyone related to Fashion industry$q$),
    ('seller_registration', 30, $q$Is there any cost to register?$q$,
     $q$NO, Basic registration is free. You only pay if you opt for:
• Premium listings
• Pay-per-lead access
• Featured vendor badges$q$),
    ('seller_registration', 40, $q$What documents are required to register?$q$,
     $q$• GST Certificate
• PAN card
• Business registration (or MSME/Udyam)
• Aadhar card
• Product catalog (PDF, Excel, or images)$q$),
    ('seller_registration', 50, $q$I don't have a GST number. Can I still register?$q$,
     $q$Yes, but your account will be marked as "Unverified Seller", which may affect visibility and lead access. We recommend registering your business officially.$q$),
    ('seller_registration', 60, $q$How do buyers contact me?$q$,
     $q$Buyers can call or chat with you directly through the platform once your product listings are approved.$q$),
    ('seller_registration', 70, $q$How are leads managed on Cosora?$q$,
     $q$You'll get notified via dashboard, email, or WhatsApp when a buyer is interested. In future, you can also choose pay-per-lead plans to access high-intent buyers.$q$),
    ('seller_registration', 80, $q$How long does it take to get verified?$q$,
     $q$Verification usually takes 3–5 days, depending on the documents submitted.$q$),
    ('seller_registration', 90, $q$Do I need to ship products through Cosora?$q$,
     $q$Not right now. Cosora helps you connect with buyers. You can handle payments and shipping directly until we integrate logistics support.$q$),
    ('seller_registration', 100, $q$Can I edit my listings after uploading?$q$,
     $q$Yes. You can log in to your dashboard to update prices, product details, or contact information anytime.$q$),
    ('subscription', 10, $q$Can I upgrade or downgrade my plan anytime?$q$,
     $q$Yes, you can upgrade your plan at any time and the difference will be prorated. Downgrades will take effect from your next billing cycle.$q$),
    ('subscription', 20, $q$Is there a refund policy?$q$,
     $q$We offer a 7-day money-back guarantee for first-time subscribers. If you're not satisfied, contact us for a full refund.$q$),
    ('subscription', 30, $q$What happens when I reach my lead limit?$q$,
     $q$You'll receive notifications as you approach your limit. You can always upgrade your plan to get more leads or wait for the next billing cycle.$q$),
    ('subscription', 40, $q$Do you offer discounts for annual billing?$q$,
     $q$Yes! You save up to 17% when you choose annual billing. That's effectively 2 months free!$q$),
    ('subscription', 50, $q$Lowest billing plan?$q$,
     $q$Yes! Plans start at just ₹699/month (or ₹6,990/year) with Basic: 10 product listings and 150 leads a month. Just getting started? Our Free plan costs nothing and gives you 2 listings and 10 leads a month. Prices exclude GST.$q$)
  ) as v(surface, position, question, answer)
 where not exists (
   select 1 from public.faqs f
    where f.surface = v.surface and f.question = v.question and f.active
 );

-- ── Self-check: 20260923144549's seed-count check, for the new totals ──────────
do $check$
declare
  q text;
begin
  if (select count(*) from public.faqs where surface = 'seller_registration' and active) <> 10 then
    raise exception 'seller_registration should have 10 active FAQs';
  end if;
  if (select count(*) from public.faqs where surface = 'subscription' and active) <> 8
     or (select count(*) from public.faqs where surface = 'subscription') <> 10 then
    raise exception 'subscription should have 8 active FAQs and 10 in all';
  end if;
  foreach q in array array[$q$What is Cosora?$q$, $q$Who can register as a seller on Cosora?$q$, $q$Is there any cost to register?$q$, $q$What documents are required to register?$q$, $q$I don't have a GST number. Can I still register?$q$, $q$How do buyers contact me?$q$, $q$How are leads managed on Cosora?$q$, $q$How long does it take to get verified?$q$, $q$Do I need to ship products through Cosora?$q$, $q$Can I edit my listings after uploading?$q$] loop
    if (select count(*) from public.faqs where surface = 'seller_registration' and question = q and active) <> 1 then
      raise exception 'seller_registration: % is not active exactly once', q;
    end if;
  end loop;
  foreach q in array array[$q$Can I upgrade or downgrade my plan anytime?$q$, $q$Is there a refund policy?$q$, $q$What happens when I reach my lead limit?$q$, $q$Do you offer discounts for annual billing?$q$, $q$Lowest billing plan?$q$, $q$How does billing work — is there autopay?$q$, $q$What payment methods do you accept?$q$, $q$How is GST handled?$q$] loop
    if (select count(*) from public.faqs where surface = 'subscription' and question = q and active) <> 1 then
      raise exception 'subscription: % is not active exactly once', q;
    end if;
  end loop;
  foreach q in array array[$q$Can I upgrade or downgrade my plan anytime?$q$, $q$What happens when I reach my lead or product limit?$q$] loop
    if exists (select 1 from public.faqs where surface = 'subscription' and question = q and active and position >= 200) then
      raise exception 'subscription: the superseded % is still active', q;
    end if;
  end loop;
  -- Andy's list comes first, in his order; the kept seeded rows after it.
  if (select array_agg(question order by position, created_at, id) from public.faqs where surface = 'subscription' and active)
     <> array[$q$Can I upgrade or downgrade my plan anytime?$q$, $q$Is there a refund policy?$q$, $q$What happens when I reach my lead limit?$q$, $q$Do you offer discounts for annual billing?$q$, $q$Lowest billing plan?$q$, $q$How does billing work — is there autopay?$q$, $q$What payment methods do you accept?$q$, $q$How is GST handled?$q$] then
    raise exception 'subscription FAQs are not in the expected order';
  end if;
end
$check$;
