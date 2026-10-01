-- Admin completion, Phase 10 follow-up (2026-09-29): every parameter of
-- admin_discount_code_save() gets a default of null.
--
-- The generated client types make a parameter without a default a required,
-- non-null argument, so Cosora-Admin couldn't send "no id" (a new code), "no cap",
-- "no end date" or "no note" without casting. With defaults, the client leaves out
-- what's empty, like admin_site_banner_save() (Phase 9). Nothing else changes: the
-- body is 20260929080502's, and null still means what it meant there (a new code,
-- no cap, no end, every plan, no note; on/off and the start date keep their values
-- when editing). A required value left out is refused by the same checks as before.
-- Replacing in place keeps the function's grants.

create or replace function public.admin_discount_code_save(
  p_id               uuid        default null,
  p_code             text        default null,
  p_kind             text        default null,
  p_value            integer     default null,
  p_applies_to       text        default null,
  p_plan_ids         text[]      default null,
  p_max_uses         integer     default null,
  p_per_vendor_limit integer     default null,
  p_valid_from       timestamptz default null,
  p_valid_to         timestamptz default null,
  p_active           boolean     default null,
  p_note             text        default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_old   admin.discount_codes;
  v_from  timestamptz;
  v_plans text[];
  v_bad   text;
  v_used  bigint := 0;
  v_id    uuid;
begin
  if not admin.discounts_can_manage() then
    raise exception 'not authorized: discounts are for super admins and finance' using errcode = '42501';
  end if;

  if p_id is not null then
    select * into v_old from admin.discount_codes c where c.id = p_id for update;
    if v_old.id is null then
      raise exception 'no such discount code' using errcode = 'P0002';
    end if;
    select count(*) into v_used from admin.discount_redemptions r where r.code_id = p_id and r.status = 'confirmed';
  end if;
  v_from := coalesce(p_valid_from, v_old.valid_from, now());

  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    raise exception 'A code is 3 to 32 letters, digits, dashes or underscores, and starts with a letter or digit.'
      using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('percent', 'flat') then
    raise exception 'Choose a percentage or a flat rupee discount.' using errcode = '22023';
  end if;
  if p_kind = 'percent' and (p_value is null or p_value not between 1 and 100) then
    raise exception 'A percentage is 1 to 100.' using errcode = '22023';
  end if;
  if p_kind = 'flat' and (p_value is null or p_value not between 1 and 1000000) then
    raise exception 'A flat discount is ₹1 to ₹10,00,000, in whole rupees.' using errcode = '22023';
  end if;
  if p_applies_to is null or p_applies_to not in ('vendor_plan', 'ad_purchase', 'certificate') then
    raise exception 'Choose what the code applies to.' using errcode = '22023';
  end if;

  -- Plans narrow a plan code only, and each has to be one a vendor can buy themselves.
  v_plans := array(select distinct btrim(p) from unnest(coalesce(p_plan_ids, '{}'::text[])) as p
                    where nullif(btrim(p), '') is not null order by 1);
  if cardinality(v_plans) = 0 then
    v_plans := null;
  elsif p_applies_to <> 'vendor_plan' then
    raise exception 'Only a plan code can be limited to particular plans.' using errcode = '22023';
  elsif cardinality(v_plans) > 20 then
    raise exception 'A code can name at most 20 plans.' using errcode = '22023';
  else
    select string_agg(p, ', ' order by p) into v_bad
      from unnest(v_plans) as p
     where not exists (select 1 from public.subscription_plans sp
                        where sp.id = p and not sp.is_invite_only
                          and (sp.monthly_price > 0 or sp.yearly_price > 0));
    if v_bad is not null then
      raise exception 'Not a plan vendors can buy themselves: %.', v_bad using errcode = '22023';
    end if;
  end if;

  if p_max_uses is not null and p_max_uses not between 1 and 1000000 then
    raise exception 'Maximum uses is at least 1. Leave it blank for no cap.' using errcode = '22023';
  end if;
  if p_per_vendor_limit is null or p_per_vendor_limit not between 1 and 1000 then
    raise exception 'Uses per vendor is 1 to 1,000.' using errcode = '22023';
  end if;
  if p_valid_to is not null and p_valid_to <= v_from then
    raise exception 'The end date has to be after the start date.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'The note is at most 200 characters.' using errcode = '22023';
  end if;

  if p_id is null then
    begin
      insert into admin.discount_codes
        (code, kind, value, applies_to, plan_ids, max_uses, per_vendor_limit,
         valid_from, valid_to, active, note, created_by)
      values
        (v_code, p_kind, p_value, p_applies_to, v_plans, p_max_uses, p_per_vendor_limit,
         v_from, p_valid_to, coalesce(p_active, true), v_note, auth.uid())
      returning id into v_id;
    exception when unique_violation then
      raise exception '% already exists. Codes stay unique, even after they end.', v_code using errcode = '23505';
    end;
    return v_id;
  end if;

  if v_used > 0 and (v_code <> v_old.code or p_kind <> v_old.kind or p_value <> v_old.value
                     or p_applies_to <> v_old.applies_to or v_plans is distinct from v_old.plan_ids) then
    raise exception '% has been used %, so its code, discount and what it applies to are fixed. Create a new code instead.',
      v_old.code, case when v_used = 1 then 'once' else v_used || ' times' end
      using errcode = '22023';
  end if;
  if p_max_uses is not null and p_max_uses < v_used then
    raise exception 'Maximum uses can''t be below the % already made.', v_used using errcode = '22023';
  end if;

  begin
    update admin.discount_codes c
       set code = v_code, kind = p_kind, value = p_value, applies_to = p_applies_to,
           plan_ids = v_plans, max_uses = p_max_uses, per_vendor_limit = p_per_vendor_limit,
           valid_from = v_from, valid_to = p_valid_to, active = coalesce(p_active, c.active),
           note = v_note, updated_at = now()
     where c.id = p_id;
  exception when unique_violation then
    raise exception '% already exists. Codes stay unique, even after they end.', v_code using errcode = '23505';
  end;
  return p_id;
end
$function$;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  f regprocedure := 'public.admin_discount_code_save(uuid,text,text,integer,text,text[],integer,integer,timestamptz,timestamptz,boolean,text)';
begin
  if (select p.pronargdefaults from pg_proc p where p.oid = f) <> 12 then
    raise exception 'self-check: admin_discount_code_save() should default all 12 parameters';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = f) then
    raise exception 'self-check: admin_discount_code_save() is not SECURITY DEFINER';
  end if;
  if has_function_privilege('anon', f, 'execute') or not has_function_privilege('authenticated', f, 'execute') then
    raise exception 'self-check: grants on admin_discount_code_save() are wrong';
  end if;
end
$check$;
