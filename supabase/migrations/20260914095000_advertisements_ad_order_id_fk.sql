-- ─────────────────────────────────────────────────────────────────────────────
-- LINK CAMPAIGNS BACK TO THE PAYMENT THAT BOUGHT THEM.
--
-- DEVIATION FROM THE BRIEF, FLAGGED. The Ads v4 prompt asks for "an `ad_id` FK
-- on `ad_orders` referencing advertisements(id)". That direction cannot express
-- the real relationship and would not deliver the stated goal ("per-campaign
-- revenue is real"):
--
--   ONE ad_order -> MANY advertisements rows
--
-- buildAdRows() emits one campaign row per product, plus one account-level row
-- when the order includes trustedSeal / verifiedCertificate. A single `ad_id`
-- column on ad_orders could only ever name one of them, so revenue for the rest
-- would still be unattributable — and the column would look authoritative while
-- being wrong.
--
-- The correct shape is the reverse: each campaign records which order paid for
-- it. Revenue per campaign is then the order's amount apportioned across its
-- rows, and revenue per order is a plain join.
--
-- Safe by inspection: `ad_orders` held 0 rows and `advertisements` 22 when this
-- was applied, so the new column is NULL everywhere and there was nothing to
-- backfill. Every existing campaign predates any recorded payment intent — the
-- live purchase path is still the demo-mode fallback, which records no order at
-- all (see todo.md) — so NULL is the honest value rather than a reconstructed
-- guess.
--
-- Both publish paths (razorpay-verify-payment, razorpay-webhook) stamp this on
-- insert. Demo mode leaves it null, which is precisely why demo campaigns are
-- unattributable revenue.
--
-- Additive: new nullable column, no existing column or row changes.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.advertisements
  add column if not exists ad_order_id text;

-- ON DELETE SET NULL, not CASCADE: deleting a payment record must never delete
-- the campaign it bought. The campaign is what the buyer saw.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'advertisements_ad_order_id_fkey'
       and conrelid = 'public.advertisements'::regclass
  ) then
    alter table public.advertisements
      add constraint advertisements_ad_order_id_fkey
      foreign key (ad_order_id) references public.ad_orders(order_id)
      on delete set null;
  end if;
end $$;

create index if not exists advertisements_ad_order_idx
  on public.advertisements (ad_order_id)
  where ad_order_id is not null;

comment on column public.advertisements.ad_order_id is
  'The ad_orders row whose payment created this campaign. One order produces many campaigns (one per product, plus one account-level row for trustedSeal/verifiedCertificate), so the FK lives here rather than on ad_orders. NULL for campaigns created before payments were recorded, and for demo-mode campaigns, which have no order at all.';
