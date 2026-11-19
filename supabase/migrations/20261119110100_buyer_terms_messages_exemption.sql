-- Follow-up to 20261119110000 (commit security review, 2026-11-19).
--
-- The messages exemption also accepted admin.is_real_seller(), which counts rows an account can create for itself
-- (listings while the registration switch is off) and rows another account creates for it (a buyer's direct request
-- names a seller in rfqs.vendor_id; a store review names it in reviews.vendor_id). So an account that never accepted
-- the Terms could become "a seller" for this check. The exemption now rests only on a vendor_registrations row, which
-- only submit_vendor_registration() writes (browsers have no insert on that table). The two production accounts that
-- held seller content without a registration (2026-11-19) had sent no message in the last 30 days.

create or replace function admin.enforce_buyer_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A seller who submitted a registration (any outcome) keeps answering buyers in chats.
  if tg_table_name = 'messages'
     and exists (select 1 from public.vendor_registrations r where r.vendor_id = (select auth.uid())) then
    return new;
  end if;
  if not admin.caller_may_act_as_buyer() then
    raise exception 'Accept the Cosora Terms to continue'
      using errcode = '42501', hint = 'terms_required';
  end if;
  return new;
end
$$;

revoke all on function admin.enforce_buyer_terms() from public, anon, authenticated;

do $$
begin
  if position('is_real_seller' in pg_get_functiondef('admin.enforce_buyer_terms()'::regprocedure)) > 0 then
    raise exception 'self-check: enforce_buyer_terms still trusts is_real_seller';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'vendor_registrations'
                and grantee in ('anon', 'authenticated') and privilege_type = 'INSERT')
     and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vendor_registrations'
                  and cmd in ('INSERT', 'ALL')) then
    raise exception 'self-check: browsers can write vendor_registrations; the exemption would be self-asserted';
  end if;
end $$;
