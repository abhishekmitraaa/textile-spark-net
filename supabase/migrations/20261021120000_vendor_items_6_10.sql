-- The 2026-10-21 vendor audit, items 6-10, database half (Mitra: "fix the items from 6 - 10").
--
--   #6 / #9 public.my_quoted_rfqs(): for each requirement the caller has quoted, its title, quantity, picture,
--      buyer and status, and how many quotes it has from every seller. The seller's screens read these straight
--      from rfqs and quotes, where the policies hide them: quotes_select shows a seller only their own quotes,
--      so every card said "1 quotes total"; rfqs_select shows a seller only active requirements from buyers
--      who haven't blocked them, so a won order lost its quantity (Total Order Value counted it ₹0) and My
--      Quotes lost its title, buyer and chat link once the requirement was removed or closed. Only rows the
--      caller quoted, and only these columns.
--   #10 rfqs.product_id is SET NULL when the listing is deleted. It was the only reference to products with no
--      delete action, so a listing a buyer had sent a direct request about couldn't be deleted (a raw foreign
--      key error). The request keeps its title, product name and pictures.

do $pin$
begin
  if to_regprocedure('public.my_quoted_rfqs()') is not null then
    raise exception 'pre-check: public.my_quoted_rfqs already exists';
  end if;
  if (select confdeltype from pg_constraint where conname = 'rfqs_product_id_fkey' and conrelid = 'public.rfqs'::regclass) <> 'a' then
    raise exception 'pre-check: rfqs_product_id_fkey is not the NO ACTION key this migration was written against';
  end if;
end
$pin$;

-- ── #6 / #9 ────────────────────────────────────────────────────────────────────────────────────────────────
create function public.my_quoted_rfqs()
returns table (rfq_id uuid, title text, product_name text, quantity integer, image text, buyer_id uuid,
               status public.rfq_status, quotes_total integer)
language sql
stable
security definer
set search_path = ''
as $function$
  select r.id, r.title, r.product_name, r.quantity, r.image, r.buyer_id, r.status,
         (select count(*)::int from public.quotes q2 where q2.rfq_id = r.id)
    from public.rfqs r
   where r.id in (select q.rfq_id from public.quotes q where q.vendor_id = (select auth.uid()))
$function$;

revoke all on function public.my_quoted_rfqs() from public, anon;
grant execute on function public.my_quoted_rfqs() to authenticated, service_role;

-- ── #10 ────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.rfqs
  drop constraint rfqs_product_id_fkey,
  add constraint rfqs_product_id_fkey foreign key (product_id) references public.products (id) on delete set null;

-- ── Self-checks ────────────────────────────────────────────────────────────────────────────────────────────
do $check$
begin
  if (select confdeltype from pg_constraint where conname = 'rfqs_product_id_fkey' and conrelid = 'public.rfqs'::regclass) <> 'n' then
    raise exception 'self-check: rfqs_product_id_fkey is not ON DELETE SET NULL';
  end if;
  if has_function_privilege('anon', 'public.my_quoted_rfqs()', 'execute')
     or not has_function_privilege('authenticated', 'public.my_quoted_rfqs()', 'execute') then
    raise exception 'self-check: my_quoted_rfqs grants are wrong';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.my_quoted_rfqs()'::regprocedure) is not true then
    raise exception 'self-check: my_quoted_rfqs is not security definer';
  end if;
  -- With no caller, nothing.
  if exists (select 1 from public.my_quoted_rfqs()) then
    raise exception 'self-check: my_quoted_rfqs answers without a caller';
  end if;
end
$check$;
