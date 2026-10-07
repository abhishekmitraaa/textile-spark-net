-- ─────────────────────────────────────────────────────────────────────────────
-- Ranking Part 1, F2: who the vendor is, and where (Mitra, 2026-10-07).
-- documentation/ranking-foundations-design-2026-10-07.md, "F2".
--
--   * public.india_states: the 36 states and union territories (ISO 3166-2:IN codes,
--     English, Hindi, Gujarati, older spellings), seeded from src/data/indiaStates.ts.
--     Readable by everyone.
--   * state_code_for(text): the code for a typed name or alias (case, punctuation and
--     "&" ignored), or null.
--   * vendor_profiles.state_code and buyer_profiles.state_code follow the free-text
--     `state` (trigger), unless the writer sets the code itself. Backfilled.
--   * vendor_profiles.served_states ("states I serve"), primary_type and capabilities,
--     each a public column (own column grant), each checked against its list. Type and
--     capabilities are backfilled from the business labels (vendor_profiles.category)
--     and business_type by vendor_type_from_labels(), only where still empty.
--   * public.vendor_capacity: a monthly number and unit per top-level seller category,
--     readable by the vendor and admins only.
-- Harness: scripts/ranking/f2_vendor_profile.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. States ───────────────────────────────────────────────────────────────
create table public.india_states (
  code    text primary key check (code ~ '^[A-Z]{2}$'),
  name    text not null unique,
  name_hi text not null,
  name_gu text not null,
  aliases text[] not null default '{}'
);
comment on table public.india_states is
  'India''s 36 states and union territories. Seeded from src/data/indiaStates.ts; change both together.';
alter table public.india_states enable row level security;
revoke all on public.india_states from anon, authenticated;
grant select on public.india_states to anon, authenticated;
create policy india_states_select on public.india_states for select to anon, authenticated using (true);

insert into public.india_states (code, name, name_hi, name_gu, aliases) values
  ('AN', 'Andaman and Nicobar Islands', 'अंडमान और निकोबार द्वीपसमूह', 'આંદામાન અને નિકોબાર ટાપુઓ', array['Andaman', 'Andaman Nicobar']::text[]),
  ('AP', 'Andhra Pradesh', 'आंध्र प्रदेश', 'આંધ્ર પ્રદેશ', '{}'::text[]),
  ('AR', 'Arunachal Pradesh', 'अरुणाचल प्रदेश', 'અરુણાચલ પ્રદેશ', '{}'::text[]),
  ('AS', 'Assam', 'असम', 'આસામ', '{}'::text[]),
  ('BR', 'Bihar', 'बिहार', 'બિહાર', '{}'::text[]),
  ('CH', 'Chandigarh', 'चंडीगढ़', 'ચંડીગઢ', '{}'::text[]),
  ('CT', 'Chhattisgarh', 'छत्तीसगढ़', 'છત્તીસગઢ', array['Chattisgarh', 'Chhatisgarh']::text[]),
  ('DH', 'Dadra and Nagar Haveli and Daman and Diu', 'दादरा और नगर हवेली और दमन और दीव', 'દાદરા અને નગર હવેલી અને દમણ અને દીવ', array['Dadra and Nagar Haveli', 'Daman and Diu']::text[]),
  ('DL', 'Delhi', 'दिल्ली', 'દિલ્હી', array['New Delhi', 'NCT of Delhi', 'National Capital Territory of Delhi']::text[]),
  ('GA', 'Goa', 'गोवा', 'ગોવા', '{}'::text[]),
  ('GJ', 'Gujarat', 'गुजरात', 'ગુજરાત', array['Gujrat']::text[]),
  ('HR', 'Haryana', 'हरियाणा', 'હરિયાણા', '{}'::text[]),
  ('HP', 'Himachal Pradesh', 'हिमाचल प्रदेश', 'હિમાચલ પ્રદેશ', '{}'::text[]),
  ('JK', 'Jammu and Kashmir', 'जम्मू और कश्मीर', 'જમ્મુ અને કાશ્મીર', array['J and K', 'JnK']::text[]),
  ('JH', 'Jharkhand', 'झारखंड', 'ઝારખંડ', '{}'::text[]),
  ('KA', 'Karnataka', 'कर्नाटक', 'કર્ણાટક', '{}'::text[]),
  ('KL', 'Kerala', 'केरल', 'કેરળ', '{}'::text[]),
  ('LA', 'Ladakh', 'लद्दाख', 'લદ્દાખ', '{}'::text[]),
  ('LD', 'Lakshadweep', 'लक्षद्वीप', 'લક્ષદ્વીપ', '{}'::text[]),
  ('MP', 'Madhya Pradesh', 'मध्य प्रदेश', 'મધ્ય પ્રદેશ', '{}'::text[]),
  ('MH', 'Maharashtra', 'महाराष्ट्र', 'મહારાષ્ટ્ર', '{}'::text[]),
  ('MN', 'Manipur', 'मणिपुर', 'મણિપુર', '{}'::text[]),
  ('ML', 'Meghalaya', 'मेघालय', 'મેઘાલય', '{}'::text[]),
  ('MZ', 'Mizoram', 'मिज़ोरम', 'મિઝોરમ', '{}'::text[]),
  ('NL', 'Nagaland', 'नागालैंड', 'નાગાલેન્ડ', '{}'::text[]),
  ('OR', 'Odisha', 'ओडिशा', 'ઓડિશા', array['Orissa']::text[]),
  ('PY', 'Puducherry', 'पुडुचेरी', 'પુડુચેરી', array['Pondicherry']::text[]),
  ('PB', 'Punjab', 'पंजाब', 'પંજાબ', '{}'::text[]),
  ('RJ', 'Rajasthan', 'राजस्थान', 'રાજસ્થાન', '{}'::text[]),
  ('SK', 'Sikkim', 'सिक्किम', 'સિક્કિમ', '{}'::text[]),
  ('TN', 'Tamil Nadu', 'तमिलनाडु', 'તમિલનાડુ', array['Tamilnadu']::text[]),
  ('TG', 'Telangana', 'तेलंगाना', 'તેલંગાણા', array['Telengana']::text[]),
  ('TR', 'Tripura', 'त्रिपुरा', 'ત્રિપુરા', '{}'::text[]),
  ('UP', 'Uttar Pradesh', 'उत्तर प्रदेश', 'ઉત્તર પ્રદેશ', '{}'::text[]),
  ('UT', 'Uttarakhand', 'उत्तराखंड', 'ઉત્તરાખંડ', array['Uttaranchal']::text[]),
  ('WB', 'West Bengal', 'पश्चिम बंगाल', 'પશ્ચિમ બંગાળ', '{}'::text[]);

-- A typed state name, lower-cased with "&" read as "and" and everything but letters dropped.
create or replace function public.state_name_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(regexp_replace(replace(lower(coalesce(p, '')), '&', ' and '), '[^a-z]', '', 'g'), '');
$$;

create or replace function public.state_code_for(p text)
returns text
language sql
stable
parallel safe
set search_path = ''
as $$
  select s.code
    from public.india_states s
   where public.state_name_key(p) is not null
     and (public.state_name_key(s.name) = public.state_name_key(p)
          or exists (select 1 from unnest(s.aliases) a where public.state_name_key(a) = public.state_name_key(p)))
   order by s.code
   limit 1;
$$;
comment on function public.state_code_for(text) is
  'The india_states code for a typed state name or alias, or null. Mirrors stateCodeFor() in src/data/indiaStates.ts.';

-- ── 2. The columns ──────────────────────────────────────────────────────────
alter table public.vendor_profiles
  add column state_code    text references public.india_states(code),
  add column served_states text[] not null default '{}',
  add column primary_type  text,
  add column capabilities  text[] not null default '{}';
alter table public.vendor_profiles add constraint vendor_profiles_served_states_known
  check (served_states <@ array['AN', 'AP', 'AR', 'AS', 'BR', 'CH', 'CT', 'DH', 'DL', 'GA', 'GJ', 'HR', 'HP', 'JK', 'JH', 'KA', 'KL', 'LA', 'LD', 'MP', 'MH', 'MN', 'ML', 'MZ', 'NL', 'OR', 'PY', 'PB', 'RJ', 'SK', 'TN', 'TG', 'TR', 'UP', 'UT', 'WB']::text[]);
alter table public.vendor_profiles add constraint vendor_profiles_primary_type_known
  check (primary_type is null or primary_type = any (array['manufacturer', 'trader_wholesaler', 'retailer', 'job_worker',
                                                            'service_provider', 'freelancer']));
alter table public.vendor_profiles add constraint vendor_profiles_capabilities_known
  check (capabilities <@ array['private_label', 'made_to_order', 'export_ready', 'sampling', 'sustainable']::text[]);
-- vendor_profiles exposes its columns one by one (the PII revoke): the new public ones need their own.
grant select (state_code, served_states, primary_type, capabilities) on public.vendor_profiles to anon, authenticated;
comment on column public.vendor_profiles.served_states is 'States the vendor serves beyond its own (india_states codes).';
comment on column public.vendor_profiles.primary_type is
  'manufacturer, trader_wholesaler, retailer, job_worker, service_provider or freelancer. Required in the app from F2; null on profiles not yet updated.';

alter table public.buyer_profiles add column state_code text references public.india_states(code);

-- ── 3. state_code follows state ─────────────────────────────────────────────
create or replace function public.sync_state_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The writer's own code wins; otherwise the code follows the typed name.
  if tg_op = 'INSERT' then
    if new.state_code is null then
      new.state_code := public.state_code_for(new.state);
    end if;
  elsif new.state is distinct from old.state and new.state_code is not distinct from old.state_code then
    new.state_code := public.state_code_for(new.state);
  end if;
  return new;
end
$$;
revoke execute on function public.sync_state_code() from public, anon, authenticated;
create trigger trg_vendor_profiles_state_code
  before insert or update of state, state_code on public.vendor_profiles
  for each row execute function public.sync_state_code();
create trigger trg_buyer_profiles_state_code
  before insert or update of state, state_code on public.buyer_profiles
  for each row execute function public.sync_state_code();

-- ── 4. Type and capabilities from today's business labels ───────────────────
-- The labels are src/data/businessCategoryGroups.ts (vendor_profiles.category). The
-- first group a vendor ticked, in this order, is its primary type.
create or replace function public.vendor_type_from_labels(p_labels text[], p_business_type text)
returns table (primary_type text, capabilities text[])
language sql
immutable
parallel safe
set search_path = ''
as $$
  with l as (select unnest(coalesce(p_labels, '{}'::text[])) as label),
  g as (
    select case
             when label in ('Garment Manufacturer', 'Fabric Manufacturer', 'Accessories Manufacturer', 'Embroidery manufacturers', 'Printing manufacturers', 'Luxury/premium wear manufacturers', 'Home Textile Manufacturers', 'Export-grade manufacturers', 'Leather Goods Manufacturer', 'Footwear Manufacturer', 'Uniforms / Corporate Wear', 'Sportswear / Athleisure Manufacturer', 'Private Label Manufacturer', 'Made-to-Order / Custom Manufacturing', 'Recycled fabric manufacturers', 'Sustainable & organic wear manufacturers') then 1
             when label in ('Textile Trader', 'Garment Wholesaler', 'Fabric Wholesaler', 'Export House', 'Import / Trading Company', 'Multi-brand Distributor') then 2
             when label in ('Apparel Retail Store', 'Online Fashion Retailer', 'Multi-brand Outlet', 'Boutique / Designer Studio', 'Departmental Store') then 3
             when label in ('Logistics & Shipping', 'Quality Inspection / Testing Lab', 'Fashion Designer / Consultant', 'Sourcing Agent', 'Buying House') then 4
           end as grp
      from l
  )
  select coalesce(
           (select case min(grp) when 1 then 'manufacturer' when 2 then 'trader_wholesaler'
                                 when 3 then 'retailer' when 4 then 'service_provider' end
              from g where grp is not null),
           case when lower(btrim(coalesce(p_business_type, ''))) like 'manufactur%' then 'manufacturer' end),
         coalesce(array(
           select distinct c.cap
             from (select case l.label
                            when 'Private Label Manufacturer' then 'private_label'
                            when 'Made-to-Order / Custom Manufacturing' then 'made_to_order'
                            when 'Export-grade manufacturers' then 'export_ready'
                            when 'Export House' then 'export_ready'
                            when 'Recycled fabric manufacturers' then 'sustainable'
                            when 'Sustainable & organic wear manufacturers' then 'sustainable'
                          end as cap
                     from l) c
            where c.cap is not null
            order by c.cap), '{}'::text[]);
$$;

-- Backfill: only what's still empty, so a re-run never overwrites a vendor's choice. The
-- buyer-facing "Export-grade" capacity band counts as export-ready too.
update public.vendor_profiles vp
   set primary_type = coalesce(vp.primary_type, t.primary_type),
       capabilities = case when cardinality(vp.capabilities) > 0 then vp.capabilities
                           else array(select distinct x from unnest(
                                  t.capabilities
                                  || case when 'Export-grade' = any (coalesce(vp.capacity, '{}'::text[]))
                                          then array['export_ready'] else '{}'::text[] end) as x order by x) end
  from public.vendor_profiles v2
  cross join lateral public.vendor_type_from_labels(v2.category, v2.business_type) t
 where v2.id = vp.id
   and (vp.primary_type is null or cardinality(vp.capabilities) = 0);

update public.vendor_profiles set state_code = public.state_code_for(state)
 where state_code is null and public.state_code_for(state) is not null;
update public.buyer_profiles set state_code = public.state_code_for(state)
 where state_code is null and public.state_code_for(state) is not null;

-- ── 5. Capacity ─────────────────────────────────────────────────────────────
create table public.vendor_capacity (
  vendor_id        uuid not null references public.vendor_profiles(id) on delete cascade,
  category_root    text not null check (category_root ~ '^[a-z][a-z-]*$'),
  monthly_capacity numeric(14, 2) not null check (monthly_capacity > 0),
  unit             text not null check (unit = any (array['pieces', 'metres', 'kg', 'litres', 'orders', 'projects'])),
  updated_at       timestamptz not null default now(),
  primary key (vendor_id, category_root)
);
comment on table public.vendor_capacity is
  'A vendor''s monthly capacity per top-level seller category (src/data/sellerCategories.ts id). Private to the vendor and admins; ranking reads it through definer functions.';
alter table public.vendor_capacity enable row level security;
revoke all on public.vendor_capacity from anon, authenticated;
grant select, insert, update, delete on public.vendor_capacity to authenticated;
create policy vendor_capacity_select on public.vendor_capacity for select to authenticated
  using (vendor_id = (select auth.uid()) or (select public.is_admin()));
create policy vendor_capacity_insert on public.vendor_capacity for insert to authenticated
  with check (vendor_id = (select auth.uid()) and (select public.account_is_active((select auth.uid()))));
create policy vendor_capacity_update on public.vendor_capacity for update to authenticated
  using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()) and (select public.account_is_active((select auth.uid()))));
create policy vendor_capacity_delete on public.vendor_capacity for delete to authenticated
  using (vendor_id = (select auth.uid()));
create trigger trg_admin_audit
  after insert or update or delete on public.vendor_capacity
  for each row execute function admin.audit_row_change('vendor_id');

-- ── Self-check ──────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from public.india_states) <> 36 then
    raise exception 'F2 self-check: india_states does not have 36 rows';
  end if;
  if public.state_code_for('Orissa') is distinct from 'OR' or public.state_code_for('j & k') is distinct from 'JK'
     or public.state_code_for('Atlantis') is not null then
    raise exception 'F2 self-check: state_code_for is wrong';
  end if;
  if has_table_privilege('anon', 'public.vendor_capacity', 'SELECT') then
    raise exception 'F2 self-check: anon can read vendor_capacity';
  end if;
  if not has_column_privilege('anon', 'public.vendor_profiles', 'primary_type', 'SELECT') then
    raise exception 'F2 self-check: vendor_profiles.primary_type is not readable';
  end if;
end
$check$;
