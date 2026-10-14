-- New Arrivals' hero carousel, chosen by the team (Mitra, 2026-10-14: "the top carousel in the new
-- arrivals should be controllable as in what to put in the top carousel").
--
-- The carousel at the top of /home/new-arrivals (src/components/buyer/EverydayFashionHero.tsx) showed
-- eight invented products: Unsplash photographs, vendor ids that match no seller, and links to
-- /product/ef-1..8, which never existed (ToDo 2026-09-13). It now shows real live listings:
--
--   public.hero_slides   the listings the team picked, in order (position 1..12), each with an
--                        optional start and end time. A listing that isn't live is skipped by the
--                        app (feed_products returns live listings only), so a paused or removed
--                        listing drops out of the carousel by itself. With nothing picked, the app
--                        shows the most popular live listings instead.
--
-- WHO: super admins and managers, the same people who set the category pictures, through two RPCs:
--   admin_hero_slides()               the picked listings with name, seller, status and picture
--   admin_hero_slides_save(slides)    replaces the whole ordered list: [{product_id, starts_at,
--                                     ends_at}], at most 12. A listing added to the list must be
--                                     live; one already on it may stay while it isn't (the panel
--                                     marks it, and the app skips it).
-- The table carries trg_admin_audit, so each change is in the Admin Log.
--
-- READS: anyone reads the slides that haven't ended (RLS), through column grants. The buyer app reads
-- them from site-config/site.json: trg_hero_slides_snapshot queues the same rebuild as the theme,
-- banners and category pictures, and site-config-snapshot adds a `hero_slides` list. A change
-- reaches visitors in about a minute.

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.hero_slides (
  -- Its own id, because the Admin Log names a row by `id` (admin.audit_row_change).
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null unique references public.products (id) on delete cascade,
  position    integer not null constraint hero_slides_position check (position between 1 and 12),
  starts_at   timestamptz,
  ends_at     timestamptz,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint hero_slides_window check (starts_at is null or ends_at is null or ends_at > starts_at),
  -- Deferred, so a save can swap two positions inside one statement sequence.
  constraint hero_slides_position_key unique (position) deferrable initially deferred
);

alter table public.hero_slides enable row level security;

drop policy if exists hero_slides_public_read on public.hero_slides;
create policy hero_slides_public_read on public.hero_slides
  for select to anon, authenticated
  using (ends_at is null or ends_at > now());

revoke all on public.hero_slides from anon, authenticated;
grant select (product_id, position, starts_at, ends_at) on public.hero_slides to anon, authenticated;

drop trigger if exists trg_admin_audit on public.hero_slides;
create trigger trg_admin_audit after insert or update or delete on public.hero_slides
  for each row execute function admin.audit_row_change('');

-- ── Who may change them ──────────────────────────────────────────────────────
create or replace function admin.require_hero_slides_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce(public.admin_role()::text, '') not in ('super_admin', 'manager') then
    raise exception 'not authorized: super admins and managers only' using errcode = '42501';
  end if;
end
$function$;
revoke all on function admin.require_hero_slides_admin() from public, anon, authenticated;

create or replace function public.admin_hero_slides()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform admin.require_hero_slides_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'product_id', h.product_id, 'position', h.position,
             'starts_at', h.starts_at, 'ends_at', h.ends_at,
             'name', p.name, 'status', p.status, 'brand_name', v.brand_name,
             'image', (select i.url from public.product_images i
                        where i.product_id = p.id order by i.position limit 1),
             'updated_at', h.updated_at,
             'updated_by_name', admin.audit_actor_name(h.updated_by))
           order by h.position)
      from public.hero_slides h
      join public.products p on p.id = h.product_id
      left join public.vendor_profiles v on v.id = p.vendor_id), '[]'::jsonb);
end
$function$;

create or replace function public.admin_hero_slides_save(p_slides jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_slide  jsonb;
  v_ids    uuid[] := '{}';
  v_id     uuid;
  v_start  timestamptz;
  v_end    timestamptz;
  v_pos    integer := 0;
begin
  perform admin.require_hero_slides_admin();

  if p_slides is null or jsonb_typeof(p_slides) <> 'array' then
    raise exception 'The slides must be a list.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_slides) > 12 then
    raise exception 'The carousel holds at most 12 listings.' using errcode = '22023';
  end if;

  -- One save at a time: two people saving at once would interleave positions.
  perform pg_advisory_xact_lock(hashtext('public.hero_slides'));

  for v_slide in select value from jsonb_array_elements(p_slides) loop
    v_pos := v_pos + 1;
    begin
      v_id    := (v_slide ->> 'product_id')::uuid;
      v_start := nullif(v_slide ->> 'starts_at', '')::timestamptz;
      v_end   := nullif(v_slide ->> 'ends_at', '')::timestamptz;
    exception when others then
      raise exception 'Slide % isn''t a listing with valid dates.', v_pos using errcode = '22023';
    end;
    if v_id is null then
      raise exception 'Slide % has no listing.', v_pos using errcode = '22023';
    end if;
    if v_id = any (v_ids) then
      raise exception 'A listing is in the carousel twice (slide %).', v_pos using errcode = '22023';
    end if;
    if v_start is not null and v_end is not null and v_end <= v_start then
      raise exception 'Slide % ends before it starts.', v_pos using errcode = '22023';
    end if;
    -- A listing joining the carousel must be live; one already in it may stay while it isn't.
    if not exists (select 1 from public.hero_slides h where h.product_id = v_id)
       and not exists (select 1 from public.products p where p.id = v_id and p.status = 'live') then
      raise exception 'Slide % isn''t a live listing. Pick one buyers can see.', v_pos using errcode = '22023';
    end if;
    v_ids := v_ids || v_id;

    insert into public.hero_slides as h (product_id, position, starts_at, ends_at, updated_by, updated_at)
    values (v_id, v_pos, v_start, v_end, auth.uid(), now())
    on conflict (product_id) do update
       set position = excluded.position, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
           updated_by = excluded.updated_by, updated_at = excluded.updated_at
     where (h.position, h.starts_at, h.ends_at)
           is distinct from (excluded.position, excluded.starts_at, excluded.ends_at);
  end loop;

  delete from public.hero_slides h where not (h.product_id = any (v_ids));
  return v_pos;
end
$function$;

revoke all on function public.admin_hero_slides(), public.admin_hero_slides_save(jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_hero_slides(), public.admin_hero_slides_save(jsonb) to authenticated;

-- ── Snapshot: the same one rebuild per transaction as the theme, banners and pictures ──
drop trigger if exists trg_hero_slides_snapshot on public.hero_slides;
create trigger trg_hero_slides_snapshot
  after insert or update or delete or truncate on public.hero_slides
  for each statement execute function public.site_config_queue_snapshot();

-- ── Self-checks ──────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.hero_slides'::regclass) then
    raise exception 'self-check: RLS is off on hero_slides';
  end if;
  if has_table_privilege('anon', 'public.hero_slides', 'INSERT')
     or has_table_privilege('authenticated', 'public.hero_slides', 'UPDATE')
     or has_table_privilege('authenticated', 'public.hero_slides', 'DELETE')
     or has_column_privilege('anon', 'public.hero_slides', 'updated_by', 'SELECT')
     or not has_column_privilege('anon', 'public.hero_slides', 'product_id', 'SELECT') then
    raise exception 'self-check: client grants on hero_slides are wrong';
  end if;
  if has_column_privilege('anon', 'public.hero_slides', 'id', 'SELECT') then
    raise exception 'self-check: anon reads hero_slides.id, which nothing public needs';
  end if;
  foreach f in array array['admin_hero_slides()', 'admin_hero_slides_save(jsonb)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
       or not (select p.prosecdef from pg_proc p where p.oid = ('public.' || f)::regprocedure) then
      raise exception 'self-check: % has the wrong grants or is not SECURITY DEFINER', f;
    end if;
  end loop;
  if (select count(*) from pg_trigger where tgrelid = 'public.hero_slides'::regclass
        and tgname in ('trg_admin_audit', 'trg_hero_slides_snapshot')) <> 2 then
    raise exception 'self-check: a hero_slides trigger is missing';
  end if;
end
$check$;
