-- Before: (status = 'active') OR (buyer_id = auth.uid()) OR is_admin()
--   Every active RFQ was readable by every signed-in user. Harmless while nothing
--   was targeted; a leak now that RFQs can be addressed to one vendor.
-- After: an active RFQ is public only while it is untargeted. A targeted one is
--   readable by its target vendor, its buyer, and admins.
drop policy if exists rfqs_select on public.rfqs;

create policy rfqs_select on public.rfqs
for select
using (
  (status = 'active'::rfq_status and (vendor_id is null or vendor_id = auth.uid()))
  or buyer_id = auth.uid()
  or is_admin()
);
