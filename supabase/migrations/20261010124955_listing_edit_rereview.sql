-- Edited listings go back to review, and Cosora-Admin sees what changed (Mitra, 2026-10-10: "when editing, the
-- review should happen again, and the admin should be able to see that the product is edited").
--
-- The vendor app already sends a listing it edits back to review (Upload.tsx saves 'under_review'). The tables did
-- not: through the API an owner could change a live listing, video or catalogue and keep it live, or swap a live
-- listing's pictures, with no review. And a listing back in review looked new to a moderator.
--
-- 1. admin.listing_edits: one OPEN row per listing, video or catalogue its owner changed after it was approved or
--    rejected. `changes` holds each changed column's value before the first edit and its value now
--    ({"price_value": {"from": 450, "to": 99}}); a column put back to its old value drops out. Pictures are counted
--    ({"images": {"added": 2, "removed": 1, "reordered": true}}). Closed when a moderator approves ('live') or
--    rejects ('rejected'); kept afterwards as history.
-- 2. admin.listing_edit_rereview(): BEFORE UPDATE on products, product_videos and catalogues. An owner's change to
--    what buyers see (anything but status, moderation, plan pausing, counts, dates, derived and generated columns):
--      - a live item goes to 'under_review', hidden from buyers until approved (unless the owner asked for
--        'draft' or 'under_review' in the same write);
--      - the change is recorded when the item is live, rejected, paused after being live (products), or already
--        has an open record. A live item its owner sends to review with nothing changed is recorded as a
--        resubmission, so the pictures saved after it land on the same record.
-- 3. admin.product_images_rereview(): AFTER INSERT/UPDATE/DELETE on product_images. An owner's picture change on a
--    live listing sends it to review (on a paused one, marks it for review when it resumes), and is counted.
-- 4. admin.listing_edit_resolve(): AFTER UPDATE OF status on the three tables. A move to 'live' or 'rejected'
--    closes the open record, with who and when.
-- 5. public.admin_listing_edits(entity, ids): the open records, for the moderation screens. Staff only.
--
-- "The owner, from a browser": the request's role is 'authenticated' (current_setting('role'), as
-- guard_ad_deletion reads it; these functions are SECURITY DEFINER so they can write the admin table, which makes
-- current_user their owner) and auth.uid() is the item's vendor. The service role, scheduled jobs, a moderator's
-- updates and the counters other people move are left alone. Trigger order: these BEFORE triggers are named
-- *_rereview, so they run after the moderation triggers (*_moderation) have checked the owner's own status change.
--
-- Harness: scripts/security/listing_edits.sql.

-- ── 0. Guard ───────────────────────────────────────────────────────────────────────
do $guard$
begin
  if exists (select 1 from pg_trigger where tgname in ('trg_products_rereview', 'trg_product_videos_rereview',
               'trg_catalogues_rereview', 'trg_product_images_rereview', 'trg_products_edit_resolve',
               'trg_product_videos_edit_resolve', 'trg_catalogues_edit_resolve'))
     or to_regclass('admin.listing_edits') is not null then
    raise exception 'listing edit objects already exist; read them before applying this again';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_products_moderation' and tgrelid = 'public.products'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'trg_product_videos_moderation' and tgrelid = 'public.product_videos'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'trg_catalogues_moderation' and tgrelid = 'public.catalogues'::regclass) then
    raise exception 'a moderation trigger these run after is missing';
  end if;
end
$guard$;

-- ── 1. The record ──────────────────────────────────────────────────────────────────
create table admin.listing_edits (
  id             uuid primary key default gen_random_uuid(),
  entity         text not null check (entity in ('product', 'product_video', 'catalogue')),
  entity_id      uuid not null,
  vendor_id      uuid not null,
  was_status     text not null,
  changes        jsonb not null default '{}'::jsonb,
  edits          integer not null default 1,
  edited_at      timestamptz not null default now(),
  last_edited_at timestamptz not null default now(),
  resolved_at    timestamptz,
  outcome        text check (outcome in ('live', 'rejected')),
  resolved_by    uuid,
  constraint listing_edits_resolved_check check ((resolved_at is null) = (outcome is null))
);
create unique index listing_edits_one_open on admin.listing_edits (entity, entity_id) where resolved_at is null;
create index listing_edits_history on admin.listing_edits (entity, entity_id, edited_at desc);
alter table admin.listing_edits enable row level security;
revoke all on admin.listing_edits from public, anon, authenticated;

-- Two sets of changes as one: each column keeps the value before the first edit; a column back where it started
-- drops out; picture counts add up.
create or replace function admin.listing_edit_merge(p_old jsonb, p_new jsonb)
returns jsonb
language sql immutable set search_path = '' as $function$
  select coalesce(jsonb_object_agg(x.k, x.v), '{}'::jsonb)
    from (
      select keys.k,
             case
               when keys.k = 'images' then jsonb_build_object(
                 'added',     coalesce((p_old #>> '{images,added}')::integer, 0) + coalesce((p_new #>> '{images,added}')::integer, 0),
                 'removed',   coalesce((p_old #>> '{images,removed}')::integer, 0) + coalesce((p_new #>> '{images,removed}')::integer, 0),
                 'reordered', coalesce((p_old #>> '{images,reordered}')::boolean, false) or coalesce((p_new #>> '{images,reordered}')::boolean, false))
               when p_old ? keys.k and p_new ? keys.k then jsonb_build_object('from', p_old -> keys.k -> 'from', 'to', p_new -> keys.k -> 'to')
               when p_new ? keys.k then p_new -> keys.k
               else p_old -> keys.k
             end as v
        from (select jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) as k
              union
              select jsonb_object_keys(coalesce(p_new, '{}'::jsonb))) keys
    ) x
   where x.k = 'images' or (x.v -> 'from') is distinct from (x.v -> 'to');
$function$;

-- Opens the record, or adds to the open one. Concurrent picture writes meet at the unique index.
create or replace function admin.listing_edit_note(p_entity text, p_id uuid, p_vendor uuid, p_was text, p_changes jsonb)
returns void
language sql security definer set search_path = '' as $function$
  insert into admin.listing_edits as e (entity, entity_id, vendor_id, was_status, changes)
  values (p_entity, p_id, p_vendor, p_was, admin.listing_edit_merge('{}'::jsonb, p_changes))
  on conflict (entity, entity_id) where resolved_at is null
  do update set changes        = admin.listing_edit_merge(e.changes, excluded.changes),
                edits          = e.edits + 1,
                last_edited_at = now();
$function$;

-- ── 2. An owner's edit ─────────────────────────────────────────────────────────────
create or replace function admin.listing_edit_rereview()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_entity   text := case tg_table_name when 'products' then 'product' when 'product_videos' then 'product_video' else 'catalogue' end;
  v_skip     text[] := array['id', 'vendor_id', 'status', 'rejection_reason', 'created_at', 'embedding'];
  v_old      jsonb;
  v_new      jsonb;
  v_changes  jsonb;
  v_was      text := old.status::text;
  v_approved boolean;
begin
  if coalesce(current_setting('role', true), '') <> 'authenticated' or auth.uid() is distinct from old.vendor_id then
    return new;
  end if;

  v_skip := v_skip || case tg_table_name
    -- Moderation, the plan's pausing, the counts other people move, and the name that follows category_id.
    when 'products' then array['flagged_at', 'flag_reason', 'removed_at', 'removed_reason', 'paused_at', 'paused_from',
                               'views_count', 'enquiries_count', 'sold_count', 'rating_avg', 'reviews_count', 'category_name']
    when 'product_videos' then array['likes_count', 'views_count', 'rating', 'reviews']
    else array[]::text[]
  end;
  select v_skip || coalesce(array_agg(a.attname::text), '{}')
    into v_skip
    from pg_catalog.pg_attribute a
   where a.attrelid = tg_relid and a.attnum > 0 and not a.attisdropped and a.attgenerated <> '';

  v_old := to_jsonb(old) - v_skip;
  v_new := to_jsonb(new) - v_skip;
  select jsonb_object_agg(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k))
    into v_changes
    from jsonb_object_keys(v_new) as k
   where (v_old -> k) is distinct from (v_new -> k);

  if v_changes is null then
    -- Sent back to review unchanged (the vendor app's Save, before its pictures are added).
    if v_was = 'live' and new.status::text = 'under_review' then
      perform admin.listing_edit_note(v_entity, old.id, old.vendor_id, v_was, '{}'::jsonb);
    end if;
    return new;
  end if;

  if v_was = 'live' and new.status::text = 'live' then
    new.status := 'under_review';
  end if;

  v_approved := v_was in ('live', 'rejected')
             or (v_was = 'paused' and to_jsonb(old) ->> 'paused_from' = 'live');
  if v_approved or exists (select 1 from admin.listing_edits e
                            where e.entity = v_entity and e.entity_id = old.id and e.resolved_at is null) then
    perform admin.listing_edit_note(v_entity, old.id, old.vendor_id, v_was, v_changes);
  end if;
  return new;
end
$function$;

create trigger trg_products_rereview before update on public.products
  for each row execute function admin.listing_edit_rereview();
create trigger trg_product_videos_rereview before update on public.product_videos
  for each row execute function admin.listing_edit_rereview();
create trigger trg_catalogues_rereview before update on public.catalogues
  for each row execute function admin.listing_edit_rereview();

-- ── 3. An owner's pictures ─────────────────────────────────────────────────────────
create or replace function admin.product_images_rereview()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_pid    uuid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  v_p      record;
  v_change jsonb;
begin
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return null;
  end if;
  select p.id, p.vendor_id, p.status::text as status, p.paused_from into v_p from public.products p where p.id = v_pid;
  -- No listing: it is being deleted, and its pictures with it.
  if v_p.id is null or auth.uid() is distinct from v_p.vendor_id then
    return null;
  end if;

  v_change := case
    when tg_op = 'INSERT' then '{"images": {"added": 1}}'::jsonb
    when tg_op = 'DELETE' then '{"images": {"removed": 1}}'::jsonb
    when new.url is distinct from old.url then '{"images": {"added": 1, "removed": 1}}'::jsonb
    when new.position is distinct from old.position then '{"images": {"reordered": true}}'::jsonb
  end;
  if v_change is null then
    return null;
  end if;

  if v_p.status = 'live' then
    -- trg_products_rereview records the resubmission; the pictures are added to it below.
    update public.products set status = 'under_review' where id = v_p.id;
  elsif v_p.status = 'paused' and v_p.paused_from = 'live' then
    update public.products set paused_from = 'under_review' where id = v_p.id;
  end if;

  if v_p.status in ('live', 'rejected') or (v_p.status = 'paused' and v_p.paused_from = 'live')
     or exists (select 1 from admin.listing_edits e where e.entity = 'product' and e.entity_id = v_p.id and e.resolved_at is null) then
    perform admin.listing_edit_note('product', v_p.id, v_p.vendor_id, v_p.status, v_change);
  end if;
  return null;
end
$function$;

create trigger trg_product_images_rereview after insert or update or delete on public.product_images
  for each row execute function admin.product_images_rereview();

-- ── 4. A moderator's decision closes the record ────────────────────────────────────
create or replace function admin.listing_edit_resolve()
returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if new.status::text in ('live', 'rejected') and old.status::text is distinct from new.status::text then
    update admin.listing_edits
       set resolved_at = now(), outcome = new.status::text, resolved_by = auth.uid()
     where entity = case tg_table_name when 'products' then 'product' when 'product_videos' then 'product_video' else 'catalogue' end
       and entity_id = new.id
       and resolved_at is null;
  end if;
  return null;
end
$function$;

create trigger trg_products_edit_resolve after update of status on public.products
  for each row execute function admin.listing_edit_resolve();
create trigger trg_product_videos_edit_resolve after update of status on public.product_videos
  for each row execute function admin.listing_edit_resolve();
create trigger trg_catalogues_edit_resolve after update of status on public.catalogues
  for each row execute function admin.listing_edit_resolve();

-- ── 5. What the moderation screens read ────────────────────────────────────────────
create or replace function public.admin_listing_edits(p_entity text, p_ids uuid[])
returns table (entity_id uuid, was_status text, changes jsonb, edits integer, edited_at timestamptz, last_edited_at timestamptz)
language plpgsql stable security definer set search_path = '' as $function$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only Cosora staff can read listing edits' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 500 then
    raise exception 'Ask for at most 500 items at a time' using errcode = '22023';
  end if;
  return query
    select e.entity_id, e.was_status, e.changes, e.edits, e.edited_at, e.last_edited_at
      from admin.listing_edits e
     where e.entity = p_entity and e.entity_id = any (coalesce(p_ids, '{}'::uuid[])) and e.resolved_at is null;
end
$function$;

-- ── 6. Grants ──────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array['admin.listing_edit_merge(jsonb,jsonb)', 'admin.listing_edit_note(text,uuid,uuid,text,jsonb)',
                           'admin.listing_edit_rereview()', 'admin.product_images_rereview()', 'admin.listing_edit_resolve()',
                           'public.admin_listing_edits(text,uuid[])'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  grant execute on function public.admin_listing_edits(text, uuid[]) to authenticated;
end
$grants$;
