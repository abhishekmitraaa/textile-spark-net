-- ─────────────────────────────────────────────────────────────────────────────
-- Product moderation: remove and flag a listing with a reason from managed templates
-- (Mitra, 2026-10-07). documentation/product-moderation-design-2026-10-07.md.
--
--   * Templates: admin.product_moderation_reasons, edited by super_admin and manager
--     (admin_product_reason_save). Never deleted, only switched off.
--   * REMOVE (admin_product_remove): a final takedown. status 'rejected' plus removed_at /
--     removed_reason, which the vendor reads. A removed listing is frozen for every browser
--     client; the vendor may still delete it. super_admin and manager can REINSTATE it
--     (admin_product_reinstate), which returns it to the vendor's drafts, so resubmitting
--     goes through the plan cap like any other submission.
--   * FLAG (admin_product_flag): a live listing goes back to under_review with flagged_at /
--     flag_reason, until a moderator approves (flag cleared) or rejects or removes it.
--   * Every action: a reason picked from the templates (plus an optional note the vendor
--     reads), a row in admin.product_moderation_actions (who, role, when), the Admin Log
--     reason through cosora.audit_reason, and a notification to the vendor.
--   * The manager role joins product moderation (approve, reject, flag, remove).
--   * A product flag in the flagged-items log needs one of the three moderation roles.
-- Harness: scripts/product-moderation/pm1_remove_flag.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Reason templates ─────────────────────────────────────────────────────
create table admin.product_moderation_reasons (
  id             uuid primary key default gen_random_uuid(),
  label          text not null,
  vendor_message text not null,
  applies_to     text[] not null,
  active         boolean not null default true,
  sort           integer not null default 100,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint product_moderation_reasons_label_check check (length(btrim(label)) between 1 and 80),
  constraint product_moderation_reasons_message_check check (length(btrim(vendor_message)) between 1 and 500),
  constraint product_moderation_reasons_applies_check
    check (cardinality(applies_to) > 0 and applies_to <@ array['remove', 'flag']::text[])
);
create unique index product_moderation_reasons_label_key
  on admin.product_moderation_reasons (lower(btrim(label)));
alter table admin.product_moderation_reasons enable row level security;
revoke all on admin.product_moderation_reasons from public, anon, authenticated;
comment on table admin.product_moderation_reasons is
  'Reasons a moderator picks when removing or flagging a listing. vendor_message is what the vendor reads. Edited by super_admin and manager through admin_product_reason_save(); never deleted, only switched off.';
create trigger trg_admin_audit
  after insert or update or delete on admin.product_moderation_reasons
  for each row execute function admin.audit_row_change('');

insert into admin.product_moderation_reasons (label, vendor_message, applies_to, sort) values
  ('Counterfeit or brand infringement',
   'This listing appears to use another brand''s name, logo or design without permission. Cosora doesn''t allow counterfeit or infringing products.',
   array['remove', 'flag'], 10),
  ('Prohibited item',
   'This product isn''t allowed on Cosora under our listing rules.',
   array['remove'], 20),
  ('Misleading or inaccurate details',
   'The listing''s details (price, MOQ, fabric, GSM or specifications) look misleading or don''t match the product.',
   array['remove', 'flag'], 30),
  ('Wrong category',
   'This listing is in a category that doesn''t match the product. Move it to the right category and submit it again.',
   array['flag'], 40),
  ('Images not allowed',
   'The photos are low quality, copied from elsewhere, or show content that isn''t allowed.',
   array['remove', 'flag'], 50),
  ('Duplicate listing',
   'This product is already listed in your catalogue. Keep one listing per product.',
   array['remove', 'flag'], 60),
  ('Contact details in the listing',
   'The listing shows a phone number, email address or outside link. Buyers reach you through Cosora.',
   array['remove', 'flag'], 70),
  ('Reported by buyers',
   'Buyers reported a problem with this listing, and Cosora is checking it.',
   array['flag'], 80);

-- ── 2. The action ledger ────────────────────────────────────────────────────
-- Who did what to which listing. Kept off public.products, which vendors read, so no
-- admin identity reaches a vendor. product_id is set null if the vendor later deletes
-- the listing; the name and vendor stay.
create table admin.product_moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid references public.products(id) on delete set null,
  vendor_id    uuid not null,
  product_name text not null,
  action       text not null check (action in ('remove', 'flag', 'reinstate')),
  reason_id    uuid references admin.product_moderation_reasons(id),
  message      text,
  note         text,
  actor_id     uuid,
  actor_role   public.admin_role_type,
  created_at   timestamptz not null default now()
);
create index product_moderation_actions_product_idx
  on admin.product_moderation_actions (product_id, created_at desc);
create index product_moderation_actions_reason_idx
  on admin.product_moderation_actions (reason_id);
alter table admin.product_moderation_actions enable row level security;
revoke all on admin.product_moderation_actions from public, anon, authenticated;
comment on table admin.product_moderation_actions is
  'One row per remove, flag or reinstate of a listing. Written only by the admin_product_* functions; read through admin_product_moderation_history().';

-- ── 3. What the vendor reads, on the listing ────────────────────────────────
alter table public.products
  add column removed_at     timestamptz,
  add column removed_reason text,
  add column flagged_at     timestamptz,
  add column flag_reason    text;
alter table public.products add constraint products_removal_shape check (
  (removed_at is null and removed_reason is null)
  or (removed_at is not null and status = 'rejected'::public.product_status and length(btrim(removed_reason)) > 0)
);
alter table public.products add constraint products_flag_shape check (
  (flagged_at is null and flag_reason is null)
  or (flagged_at is not null
      and status = any (array['under_review', 'draft']::public.product_status[])
      and length(btrim(flag_reason)) > 0)
);
comment on column public.products.removed_at is
  'Set by admin_product_remove() when Cosora takes the listing down. A removed listing is rejected and frozen for every browser client.';
comment on column public.products.removed_reason is
  'What the vendor reads: the reason template''s message plus the moderator''s note.';
comment on column public.products.flagged_at is
  'Set by admin_product_flag(): a live listing sent back to review. Cleared when it goes live or is rejected.';
comment on column public.products.flag_reason is
  'What the vendor reads about the flag.';

-- ── 4. The guard ────────────────────────────────────────────────────────────
create or replace function public.products_moderation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Browser clients only. The admin_product_* functions are definer functions, so their
  -- updates run as the owner; service-role jobs are not `authenticated` either.
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.removed_at is not null or new.removed_reason is not null
         or new.flagged_at is not null or new.flag_reason is not null then
        raise exception 'Only Cosora''s moderators can mark a listing as removed or flagged.' using errcode = '42501';
      end if;
    else
      if old.removed_at is not null then
        raise exception 'Cosora removed this listing, so it can''t be changed or resubmitted.' using errcode = '42501';
      end if;
      if (new.removed_at, new.removed_reason, new.flagged_at, new.flag_reason)
         is distinct from (old.removed_at, old.removed_reason, old.flagged_at, old.flag_reason) then
        raise exception 'Only Cosora''s moderators can mark a listing as removed or flagged.' using errcode = '42501';
      end if;
    end if;
  end if;

  -- A moderator's verdict settles a flag: approving (live) or rejecting clears it,
  -- whoever writes the status. A vendor moving a flagged listing to draft keeps it.
  if new.flagged_at is not null and new.status = any (array['live', 'rejected']::public.product_status[]) then
    new.flagged_at := null;
    new.flag_reason := null;
  end if;
  return new;
end
$$;
revoke execute on function public.products_moderation_guard() from public, anon, authenticated;
create trigger trg_products_moderation_guard
  before insert or update on public.products
  for each row execute function public.products_moderation_guard();

-- ── 5. The manager role joins product moderation ────────────────────────────
-- The column guard: same rules, a third role, and the flag columns left out of the
-- "a moderator changes only status and reason" comparison (the guard above owns them),
-- so the two triggers don't depend on firing order.
create or replace function public.enforce_products_moderation()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_generated text[];
  v_moderator boolean := coalesce(public.is_admin()
    and public.admin_role() in ('super_admin', 'product_moderator', 'manager'), false);
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'under_review') and not v_moderator then
      new.status := 'under_review';
    end if;
    if not v_moderator then
      new.rejection_reason := null;
    end if;
    return new;
  end if;

  -- A moderator who is not the owner changes the moderation columns only.
  if auth.uid() is distinct from old.vendor_id and public.is_admin() then
    select coalesce(array_agg(a.attname::text), '{}') into v_generated
      from pg_attribute a
     where a.attrelid = tg_relid and a.attnum > 0 and not a.attisdropped and a.attgenerated <> '';
    if (to_jsonb(new) - v_generated - array['status', 'rejection_reason', 'flagged_at', 'flag_reason'])
       is distinct from (to_jsonb(old) - v_generated - array['status', 'rejection_reason', 'flagged_at', 'flag_reason']) then
      raise exception 'A moderator changes a listing''s status and rejection reason only; the rest of the listing is the vendor''s'
        using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if auth.uid() = old.vendor_id then
      if new.status not in ('draft', 'under_review') then
        raise exception 'Vendors cannot set product status to %; moderation required', new.status
          using errcode = '42501';
      end if;
    elsif not v_moderator then
      raise exception 'Product moderation requires the super_admin, product_moderator or manager role'
        using errcode = '42501';
    end if;
  end if;

  -- A rejection carries a reason the vendor can act on.
  if new.status = 'rejected' and old.status is distinct from 'rejected'
     and coalesce(btrim(new.rejection_reason), '') = '' then
    raise exception 'A rejection needs a reason the vendor can act on'
      using errcode = '22023';
  end if;

  if new.rejection_reason is distinct from old.rejection_reason and not v_moderator then
    raise exception 'Changing a product rejection reason requires the super_admin, product_moderator or manager role'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

alter policy products_insert on public.products
  with check (
    (select public.account_is_active((select auth.uid())))
    and (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'product_moderator', 'manager']::public.admin_role_type[])))
  );
alter policy products_update on public.products
  using (
    vendor_id = (select auth.uid())
    or ((select public.is_admin())
        and (select public.admin_role()) = any (array['super_admin', 'product_moderator', 'manager']::public.admin_role_type[]))
  )
  with check (
    (vendor_id = (select auth.uid())
     or ((select public.is_admin())
         and (select public.admin_role()) = any (array['super_admin', 'product_moderator', 'manager']::public.admin_role_type[])))
    and (select public.account_not_deleted((select auth.uid())))
  );
alter policy products_delete on public.products
  using (
    (vendor_id = (select auth.uid())
     or ((select public.is_admin())
         and (select public.admin_role()) = any (array['super_admin', 'product_moderator', 'manager']::public.admin_role_type[])))
    and (select public.account_not_deleted((select auth.uid())))
  );

-- The per-item RPCs: a manager moderates products; videos and catalogues keep their roles.
create or replace function public.approve_vendor_content(target_table text, target_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  affected int;
begin
  if not coalesce(public.is_admin() and (
       public.admin_role() in ('super_admin', 'product_moderator')
       or (target_table = 'products' and public.admin_role() = 'manager')), false) then
    raise exception 'not authorized: product moderation requires the product_moderator role';
  end if;

  if target_table = 'products' then
    update public.products
       set status = 'live', rejection_reason = null
     where id = target_id and status = 'under_review';
  elsif target_table = 'product_videos' then
    update public.product_videos
       set status = 'live', rejection_reason = null
     where id = target_id and status = 'under_review';
  elsif target_table = 'catalogues' then
    -- catalogues has no rejection_reason column (confirmed: 42703). Status-only,
    -- matching reject_vendor_content's own precedent for this table.
    update public.catalogues
       set status = 'live'
     where id = target_id and status = 'under_review';
  else
    raise exception 'unknown moderation target: %', target_table
      using errcode = '22023';
  end if;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'no under_review % row with id %', target_table, target_id
      using errcode = 'P0002';
  end if;
end;
$function$;

create or replace function public.reject_vendor_content(target_table text, target_id uuid, reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  affected int;
begin
  if not coalesce(public.is_admin() and (
       public.admin_role() in ('super_admin', 'product_moderator')
       or (target_table = 'products' and public.admin_role() = 'manager')), false) then
    raise exception 'not authorized: product moderation requires the product_moderator role';
  end if;

  -- Catalogues have no reason column; a listing or video tells the vendor why.
  if target_table in ('products', 'product_videos') and coalesce(btrim(reason), '') = '' then
    raise exception 'A rejection needs a reason the vendor can act on'
      using errcode = '22023';
  end if;

  if target_table = 'products' then
    -- A removed listing stays removed: un-removing is admin_product_reinstate().
    update public.products
       set status = 'rejected', rejection_reason = reason
     where id = target_id and removed_at is null;
  elsif target_table = 'product_videos' then
    update public.product_videos
       set status = 'rejected', rejection_reason = reason
     where id = target_id;
  elsif target_table = 'catalogues' then
    update public.catalogues
       set status = 'rejected'
     where id = target_id;
  else
    raise exception 'unknown moderation target: %', target_table
      using errcode = '22023';
  end if;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'no % row with id %', target_table, target_id
      using errcode = 'P0002';
  end if;
end;
$function$;

-- ── 6. Gates ────────────────────────────────────────────────────────────────
create or replace function admin.product_moderation_can_act()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_admin()
    and public.admin_role() = any (array['super_admin', 'product_moderator', 'manager']::public.admin_role_type[]), false)
$$;
create or replace function admin.product_reasons_can_edit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_admin()
    and public.admin_role() = any (array['super_admin', 'manager']::public.admin_role_type[]), false)
$$;
revoke execute on function admin.product_moderation_can_act() from public, anon, authenticated;
revoke execute on function admin.product_reasons_can_edit() from public, anon, authenticated;

-- ── 7. Templates: read and save ─────────────────────────────────────────────
create or replace function public.admin_product_reasons(p_include_inactive boolean default false)
returns table (id uuid, label text, vendor_message text, applies_to text[], active boolean, sort integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'not authorized: admins only' using errcode = '42501';
  end if;
  if coalesce(p_include_inactive, false) and not admin.product_reasons_can_edit() then
    raise exception 'not authorized: switched-off reasons are for super admins and managers' using errcode = '42501';
  end if;
  return query
    select r.id, r.label, r.vendor_message, r.applies_to, r.active, r.sort
      from admin.product_moderation_reasons r
     where coalesce(p_include_inactive, false) or r.active
     order by r.sort, lower(r.label);
end
$$;

create or replace function public.admin_product_reason_save(
  p_id uuid,
  p_label text,
  p_vendor_message text,
  p_applies_to text[],
  p_active boolean default true,
  p_sort integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label   text := btrim(coalesce(p_label, ''));
  v_message text := btrim(coalesce(p_vendor_message, ''));
  v_applies text[];
  v_id      uuid;
begin
  if not admin.product_reasons_can_edit() then
    raise exception 'not authorized: moderation reasons are edited by super admins and managers' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_applies
    from unnest(coalesce(p_applies_to, '{}')) x;
  if length(v_label) not between 1 and 80 then
    raise exception 'A reason needs a name of 1 to 80 characters.' using errcode = '22023';
  end if;
  if length(v_message) not between 1 and 500 then
    raise exception 'The message for the vendor needs 1 to 500 characters.' using errcode = '22023';
  end if;
  if cardinality(v_applies) = 0 or not (v_applies <@ array['remove', 'flag']::text[]) then
    raise exception 'Choose where the reason applies: remove, flag or both.' using errcode = '22023';
  end if;

  begin
    if p_id is null then
      insert into admin.product_moderation_reasons (label, vendor_message, applies_to, active, sort, created_by)
      values (v_label, v_message, v_applies, coalesce(p_active, true),
              coalesce(p_sort, (select coalesce(max(r.sort), 0) + 10 from admin.product_moderation_reasons r)),
              auth.uid())
      returning id into v_id;
    else
      update admin.product_moderation_reasons r
         set label = v_label, vendor_message = v_message, applies_to = v_applies,
             active = coalesce(p_active, r.active), sort = coalesce(p_sort, r.sort), updated_at = now()
       where r.id = p_id
      returning r.id into v_id;
      if v_id is null then
        raise exception 'no moderation reason %', p_id using errcode = 'P0002';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'A reason called "%" already exists.', v_label using errcode = '23505';
  end;
  return v_id;
end
$$;

-- ── 8. Remove, flag, reinstate ──────────────────────────────────────────────
-- The vendor reads the template's message, then "Details: <note>" when there is one.
-- The Admin Log reason is "<action>: <label>", with the note in brackets.
create or replace function public.admin_product_remove(p_product_id uuid, p_reason_id uuid, p_note text default null)
returns table (id uuid, removed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason  admin.product_moderation_reasons%rowtype;
  v_name    text;
  v_vendor  uuid;
  v_removed timestamptz;
  v_message text;
  v_at      timestamptz := now();
begin
  if not admin.product_moderation_can_act() then
    raise exception 'not authorized: removing a listing needs a super admin, a product moderator or a manager' using errcode = '42501';
  end if;
  if length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;
  select * into v_reason from admin.product_moderation_reasons r where r.id = p_reason_id;
  if not found or not v_reason.active or not ('remove' = any (v_reason.applies_to)) then
    raise exception 'Pick an active removal reason; the vendor will read it.' using errcode = '22023';
  end if;

  select p.name, p.vendor_id, p.removed_at into v_name, v_vendor, v_removed
    from public.products p where p.id = p_product_id for update;
  if not found then
    raise exception 'no product %', p_product_id using errcode = 'P0002';
  end if;
  if v_removed is not null then
    raise exception 'This listing was already removed.' using errcode = '55000';
  end if;

  v_message := btrim(v_reason.vendor_message) || coalesce(E'\nDetails: ' || v_note, '');
  perform set_config('cosora.audit_reason', 'Removed: ' || v_reason.label || coalesce(' (' || v_note || ')', ''), true);
  update public.products p
     set status = 'rejected', rejection_reason = v_message,
         removed_at = v_at, removed_reason = v_message, flagged_at = null, flag_reason = null
   where p.id = p_product_id;
  perform set_config('cosora.audit_reason', '', true);

  insert into admin.product_moderation_actions
    (product_id, vendor_id, product_name, action, reason_id, message, note, actor_id, actor_role, created_at)
  values (p_product_id, v_vendor, v_name, 'remove', v_reason.id, v_message, v_note, auth.uid(), public.admin_role(), v_at);

  perform public.notify(v_vendor, 'product_removed', 'Cosora removed your listing',
    '"' || v_name || '": ' || v_message);

  return query select p_product_id, v_at;
end
$$;

create or replace function public.admin_product_flag(p_product_id uuid, p_reason_id uuid, p_note text default null)
returns table (id uuid, flagged_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason  admin.product_moderation_reasons%rowtype;
  v_name    text;
  v_vendor  uuid;
  v_status  public.product_status;
  v_message text;
  v_at      timestamptz := now();
begin
  if not admin.product_moderation_can_act() then
    raise exception 'not authorized: flagging a listing needs a super admin, a product moderator or a manager' using errcode = '42501';
  end if;
  if length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;
  select * into v_reason from admin.product_moderation_reasons r where r.id = p_reason_id;
  if not found or not v_reason.active or not ('flag' = any (v_reason.applies_to)) then
    raise exception 'Pick an active flag reason; the vendor will read it.' using errcode = '22023';
  end if;

  select p.name, p.vendor_id, p.status into v_name, v_vendor, v_status
    from public.products p where p.id = p_product_id for update;
  if not found then
    raise exception 'no product %', p_product_id using errcode = 'P0002';
  end if;
  if v_status <> 'live' then
    raise exception 'Only a live listing can be flagged. Reject or remove it instead.' using errcode = '55000';
  end if;

  v_message := btrim(v_reason.vendor_message) || coalesce(E'\nDetails: ' || v_note, '');
  perform set_config('cosora.audit_reason', 'Flagged: ' || v_reason.label || coalesce(' (' || v_note || ')', ''), true);
  update public.products p
     set status = 'under_review', flagged_at = v_at, flag_reason = v_message
   where p.id = p_product_id;
  -- The flagged-items log shows it beside the free-text notes.
  insert into admin.admin_flags (entity_type, entity_id, note, author_id)
  values ('product', p_product_id, 'Flagged: ' || v_reason.label || coalesce(E'\n' || v_note, ''), auth.uid());
  perform set_config('cosora.audit_reason', '', true);

  insert into admin.product_moderation_actions
    (product_id, vendor_id, product_name, action, reason_id, message, note, actor_id, actor_role, created_at)
  values (p_product_id, v_vendor, v_name, 'flag', v_reason.id, v_message, v_note, auth.uid(), public.admin_role(), v_at);

  perform public.notify(v_vendor, 'product_flagged', 'Your listing is back under review',
    '"' || v_name || '" is hidden from buyers while Cosora reviews it. ' || v_message);

  return query select p_product_id, v_at;
end
$$;

create or replace function public.admin_product_reinstate(p_product_id uuid, p_note text)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_name    text;
  v_vendor  uuid;
  v_removed timestamptz;
begin
  if not admin.product_reasons_can_edit() then
    raise exception 'not authorized: reinstating a listing needs a super admin or a manager' using errcode = '42501';
  end if;
  if v_note is null or length(v_note) > 500 then
    raise exception 'Say why the removal is being undone (up to 500 characters); it goes in the Admin Log.' using errcode = '22023';
  end if;

  select p.name, p.vendor_id, p.removed_at into v_name, v_vendor, v_removed
    from public.products p where p.id = p_product_id for update;
  if not found then
    raise exception 'no product %', p_product_id using errcode = 'P0002';
  end if;
  if v_removed is null then
    raise exception 'This listing isn''t removed.' using errcode = '55000';
  end if;

  perform set_config('cosora.audit_reason', 'Reinstated: ' || v_note, true);
  -- Back to the vendor's drafts: resubmitting runs the plan cap as the vendor.
  update public.products p
     set status = 'draft', rejection_reason = null, removed_at = null, removed_reason = null
   where p.id = p_product_id;
  perform set_config('cosora.audit_reason', '', true);

  insert into admin.product_moderation_actions
    (product_id, vendor_id, product_name, action, note, actor_id, actor_role)
  values (p_product_id, v_vendor, v_name, 'reinstate', v_note, auth.uid(), public.admin_role());

  perform public.notify(v_vendor, 'product_reinstated', 'Your listing is back in your drafts',
    '"' || v_name || '" was reinstated. Check it, then submit it for review again.');

  return query select p_product_id, 'draft'::text;
end
$$;

create or replace function public.admin_product_moderation_history(p_product_id uuid)
returns table (id uuid, action text, reason_label text, message text, note text,
               actor_name text, actor_role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'not authorized: admins only' using errcode = '42501';
  end if;
  return query
    select a.id, a.action, r.label, a.message, a.note,
           admin.audit_actor_name(a.actor_id), a.actor_role::text, a.created_at
      from admin.product_moderation_actions a
      left join admin.product_moderation_reasons r on r.id = a.reason_id
     where a.product_id = p_product_id
     order by a.created_at desc
     limit 50;
end
$$;

-- ── 9. Product flags in the flagged-items log need a moderation role ────────
create or replace function public.admin_flag_add(p_entity_type text, p_entity_id uuid, p_note text)
 returns table(id uuid, entity_type text, entity_id uuid, note text, author_id uuid, created_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_id uuid;
begin
  -- Gate = admin_flags_insert: WITH CHECK (is_admin() AND author_id = auth.uid())
  if not coalesce(public.is_admin(), false) then
    raise exception 'Adding to the flagged-items log requires an admin account'
      using errcode = '42501';
  end if;
  -- A lead is flagged by the roles that may remove one (RFQ/leads R3).
  if p_entity_type = 'rfq'
     and not coalesce(public.admin_role() = any (array['super_admin', 'product_moderator']::public.admin_role_type[]), false) then
    raise exception 'Flagging a lead needs a super admin or a product moderator'
      using errcode = '42501';
  end if;
  -- A listing is flagged by the roles that moderate listings (product moderation, 2026-10-07).
  if p_entity_type = 'product' and not admin.product_moderation_can_act() then
    raise exception 'Flagging a listing needs a super admin, a product moderator or a manager'
      using errcode = '42501';
  end if;

  -- The table's CHECK constraints (entity_type, non-blank note) still apply and
  -- raise 23514 exactly as they do for a direct insert.
  insert into admin.admin_flags as f (entity_type, entity_id, note, author_id)
  values (p_entity_type, p_entity_id, p_note, auth.uid())
  returning f.id into v_id;

  return query
    select f.id, f.entity_type, f.entity_id, f.note, f.author_id, f.created_at
      from admin.admin_flags f
     where f.id = v_id;
end
$function$;

-- ── 10. Grants ──────────────────────────────────────────────────────────────
revoke execute on function public.admin_product_reasons(boolean) from public, anon;
revoke execute on function public.admin_product_reason_save(uuid, text, text, text[], boolean, integer) from public, anon;
revoke execute on function public.admin_product_remove(uuid, uuid, text) from public, anon;
revoke execute on function public.admin_product_flag(uuid, uuid, text) from public, anon;
revoke execute on function public.admin_product_reinstate(uuid, text) from public, anon;
revoke execute on function public.admin_product_moderation_history(uuid) from public, anon;
grant execute on function public.admin_product_reasons(boolean) to authenticated;
grant execute on function public.admin_product_reason_save(uuid, text, text, text[], boolean, integer) to authenticated;
grant execute on function public.admin_product_remove(uuid, uuid, text) to authenticated;
grant execute on function public.admin_product_flag(uuid, uuid, text) to authenticated;
grant execute on function public.admin_product_reinstate(uuid, text) to authenticated;
grant execute on function public.admin_product_moderation_history(uuid) to authenticated;

-- ── 11. Self-check ──────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_product_reasons(boolean)',
    'public.admin_product_reason_save(uuid,text,text,text[],boolean,integer)',
    'public.admin_product_remove(uuid,uuid,text)',
    'public.admin_product_flag(uuid,uuid,text)',
    'public.admin_product_reinstate(uuid,text)',
    'public.admin_product_moderation_history(uuid)'] loop
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'self-check: % is not SECURITY DEFINER', f;
    end if;
    if has_function_privilege('anon', f::regprocedure, 'execute') then
      raise exception 'self-check: anon can execute %', f;
    end if;
    if not has_function_privilege('authenticated', f::regprocedure, 'execute') then
      raise exception 'self-check: authenticated cannot execute %', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'admin.product_moderation_reasons', 'select')
     or has_table_privilege('authenticated', 'admin.product_moderation_actions', 'select') then
    raise exception 'self-check: a client role can read the moderation tables';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.products'::regclass
        and tgname in ('trg_products_moderation_guard', 'trg_products_moderation', 'trg_admin_audit')) <> 3 then
    raise exception 'self-check: a products trigger is missing';
  end if;
  if (select count(*) from admin.product_moderation_reasons where active) < 1 then
    raise exception 'self-check: no active moderation reason';
  end if;
end
$check$;
