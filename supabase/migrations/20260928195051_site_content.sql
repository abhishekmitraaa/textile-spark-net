-- Admin completion, Phase 9 (Mitra, 2026-09-27): site content, the real thing.
--
-- Mitra's decision: no banner placements on the buyer side ("remove the banner edit for
-- the buyer side"); keep vendor-dashboard banners, and make the Theme tab live on the site.
-- Cosora-Admin's Content page edited a dev-seed fixture until now.
--
--   public.site_banners   the vendor dashboard's banners. Placement vendor_dashboard only.
--                         Headline 1–80 characters, supporting line up to 160, button label
--                         up to 30 (a button needs a destination). The destination is a path
--                         on Cosora ("/advertisements"): one leading "/", never "//" or "/\",
--                         no spaces or quotes. The image is an object this migration's
--                         `site-content` bucket holds, under banners/<uuid>.<jpg|png|webp>.
--                         A schedule starts before it ends.
--   public.site_theme     one row: five colours (#rrggbb, lowercase) and a heading and a body
--                         font from admin.site_theme_fonts(). Contrast floors, in the table:
--                         body text at least 4.5:1 on white, white text at least 3:1 on each
--                         accent. Seeded with the values the buyer app ships today.
--
-- READS: anyone reads the theme and the active banners that haven't ended (RLS), through
-- column grants that leave out who wrote them. WRITES: only these RPCs, super_admin only
-- (roles.ts section "content"): admin_site_banners, admin_site_banner_save,
-- admin_site_banner_delete (returns the image path, so the panel removes the object after
-- the row), admin_site_banner_reorder, admin_site_theme_get, admin_site_theme_save. Both
-- tables carry trg_admin_audit.
--
-- DELIVERY, the FAQ snapshot pattern (20260924174051): statement triggers queue one call
-- per transaction to the `site-config-snapshot` edge function, which writes
-- site-config/site.json (max-age 300) from what anon can read. The hourly
-- `faq-snapshots-refresh` job now rebuilds it too (its command changes; its schedule
-- doesn't), so a lost call can't leave the file stale for more than an hour.

-- ── Colour and font helpers ──────────────────────────────────────────────────
create or replace function admin.srgb_luminance(p_hex text)
returns numeric
language sql
immutable
strict
set search_path = ''
as $function$
  -- WCAG 2 relative luminance of #rrggbb.
  select 0.2126 * c[1] + 0.7152 * c[2] + 0.0722 * c[3]
    from (select array_agg(case when v <= 0.04045 then v / 12.92
                                else power((v + 0.055) / 1.055, 2.4) end order by i) as c
            from (select i, ('x' || substr(p_hex, 2 * i, 2))::bit(8)::int / 255.0 as v
                    from generate_series(1, 3) as i) s) t
$function$;

create or replace function admin.contrast_ratio(p_a text, p_b text)
returns numeric
language sql
immutable
strict
set search_path = ''
as $function$
  select (greatest(la, lb) + 0.05) / (least(la, lb) + 0.05)
    from (select admin.srgb_luminance(p_a) as la, admin.srgb_luminance(p_b) as lb) x
$function$;

-- Google Fonts families the buyer app can load. Open Sans and Roboto are what it ships
-- today (index.html preloads them); the rest load on demand. Change the list here and in
-- textile-spark-net src/lib/siteConfig.ts (THEME_FONTS) together.
create or replace function admin.site_theme_fonts()
returns text[]
language sql
immutable
set search_path = ''
as $function$
  select array['Open Sans', 'Roboto', 'Inter', 'Poppins', 'Mukta', 'Noto Sans', 'DM Sans',
               'Work Sans', 'Lato', 'Montserrat']
$function$;

-- The values the buyer app shipped before this migration ("Cosora defaults" on the panel).
create or replace function admin.site_theme_defaults()
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select jsonb_build_object(
    'vendor_accent', '#256fef', 'buyer_accent', '#ef4d62', 'success', '#14ae5c',
    'border', '#d0d4dc', 'ink', '#363636', 'heading_font', 'Roboto', 'body_font', 'Open Sans')
$function$;

revoke all on function admin.srgb_luminance(text), admin.contrast_ratio(text, text),
  admin.site_theme_fonts(), admin.site_theme_defaults() from public, anon, authenticated;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.site_banners (
  id          uuid primary key default gen_random_uuid(),
  placement   text not null default 'vendor_dashboard'
              constraint site_banners_placement check (placement = 'vendor_dashboard'),
  title       text not null
              constraint site_banners_title check (title = btrim(title) and char_length(title) between 1 and 80),
  subtitle    text
              constraint site_banners_subtitle check (subtitle is null or (subtitle = btrim(subtitle) and char_length(subtitle) between 1 and 160)),
  cta_label   text
              constraint site_banners_cta_label check (cta_label is null or (cta_label = btrim(cta_label) and char_length(cta_label) between 1 and 30)),
  link_path   text
              constraint site_banners_link_path check (link_path is null or (
                char_length(link_path) <= 200 and link_path ~ '^/[^/\\]' and link_path !~ '[[:space:][:cntrl:]<>"''`]')),
  image_path  text
              constraint site_banners_image_path check (image_path is null or image_path ~ '^banners/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'),
  position    integer not null default 0,
  active      boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint site_banners_schedule check (starts_at is null or ends_at is null or starts_at < ends_at),
  constraint site_banners_cta_needs_link check (cta_label is null or link_path is not null)
);

create table if not exists public.site_theme (
  id            boolean primary key default true constraint site_theme_singleton check (id),
  vendor_accent text not null constraint site_theme_vendor_accent check (vendor_accent ~ '^#[0-9a-f]{6}$'),
  buyer_accent  text not null constraint site_theme_buyer_accent check (buyer_accent ~ '^#[0-9a-f]{6}$'),
  success       text not null constraint site_theme_success check (success ~ '^#[0-9a-f]{6}$'),
  border        text not null constraint site_theme_border check (border ~ '^#[0-9a-f]{6}$'),
  ink           text not null constraint site_theme_ink check (ink ~ '^#[0-9a-f]{6}$'),
  heading_font  text not null constraint site_theme_heading_font check (heading_font = any (admin.site_theme_fonts())),
  body_font     text not null constraint site_theme_body_font check (body_font = any (admin.site_theme_fonts())),
  updated_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint site_theme_contrast check (
    admin.contrast_ratio(ink, '#ffffff') >= 4.5
    and admin.contrast_ratio('#ffffff', vendor_accent) >= 3
    and admin.contrast_ratio('#ffffff', buyer_accent) >= 3)
);

alter table public.site_banners enable row level security;
alter table public.site_theme enable row level security;

drop policy if exists site_banners_public_read on public.site_banners;
create policy site_banners_public_read on public.site_banners
  for select to anon, authenticated
  using (active and (ends_at is null or ends_at > now()));

drop policy if exists site_theme_public_read on public.site_theme;
create policy site_theme_public_read on public.site_theme
  for select to anon, authenticated
  using (true);

revoke all on public.site_banners, public.site_theme from anon, authenticated;
grant select (id, title, subtitle, cta_label, link_path, image_path, position, starts_at, ends_at)
  on public.site_banners to anon, authenticated;
grant select (vendor_accent, buyer_accent, success, border, ink, heading_font, body_font, updated_at)
  on public.site_theme to anon, authenticated;

drop trigger if exists trg_admin_audit on public.site_banners;
create trigger trg_admin_audit after insert or update or delete on public.site_banners
  for each row execute function admin.audit_row_change('');
drop trigger if exists trg_admin_audit on public.site_theme;
create trigger trg_admin_audit after insert or update or delete on public.site_theme
  for each row execute function admin.audit_row_change('');

-- ── Seed: today's values and today's banner ──────────────────────────────────
insert into public.site_theme (id, vendor_accent, buyer_accent, success, border, ink, heading_font, body_font)
select true, d ->> 'vendor_accent', d ->> 'buyer_accent', d ->> 'success', d ->> 'border', d ->> 'ink',
       d ->> 'heading_font', d ->> 'body_font'
  from (select admin.site_theme_defaults() as d) s
on conflict (id) do nothing;

-- PromoBanner's copy, without its "3x more inquiries": nothing measures that.
insert into public.site_banners (title, subtitle, cta_label, link_path, position, active, created_by)
select 'Get Prime Placement Above Competitors', 'Boost your visibility with featured listings',
       'Claim This Banner', '/advertisements', 1, true, null
 where not exists (select 1 from public.site_banners);

-- ── Admin RPCs (super_admin only) ────────────────────────────────────────────
create or replace function admin.require_content_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce(public.admin_role()::text, '') <> 'super_admin' then
    raise exception 'not authorized: super admins only' using errcode = '42501';
  end if;
end
$function$;
revoke all on function admin.require_content_admin() from public, anon, authenticated;

create or replace function public.admin_site_banners()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform admin.require_content_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
            'id', b.id, 'title', b.title, 'subtitle', b.subtitle, 'cta_label', b.cta_label,
            'link_path', b.link_path, 'image_path', b.image_path, 'position', b.position,
            'active', b.active, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
            'created_at', b.created_at, 'updated_at', b.updated_at)
            order by b.position, b.created_at, b.id)
          from public.site_banners b where b.placement = 'vendor_dashboard'), '[]'::jsonb);
end
$function$;

create or replace function public.admin_site_banner_save(
  p_id        uuid default null,
  p_title     text default null,
  p_subtitle  text default null,
  p_cta_label text default null,
  p_link_path text default null,
  p_image_path text default null,
  p_active    boolean default true,
  p_starts_at timestamptz default null,
  p_ends_at   timestamptz default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_sub   text := nullif(btrim(coalesce(p_subtitle, '')), '');
  v_cta   text := nullif(btrim(coalesce(p_cta_label, '')), '');
  v_link  text := nullif(btrim(coalesce(p_link_path, '')), '');
  v_img   text := nullif(btrim(coalesce(p_image_path, '')), '');
  v_id    uuid;
begin
  perform admin.require_content_admin();

  if v_title is null then
    raise exception 'A banner needs a headline.' using errcode = '22023';
  elsif char_length(v_title) > 80 then
    raise exception 'The headline can be at most 80 characters.' using errcode = '22023';
  elsif char_length(coalesce(v_sub, '')) > 160 then
    raise exception 'The supporting line can be at most 160 characters.' using errcode = '22023';
  elsif char_length(coalesce(v_cta, '')) > 30 then
    raise exception 'The button label can be at most 30 characters.' using errcode = '22023';
  elsif v_cta is not null and v_link is null then
    raise exception 'A button needs a destination path.' using errcode = '22023';
  elsif v_link is not null and (char_length(v_link) > 200 or v_link !~ '^/[^/\\]'
                                or v_link ~ '[[:space:][:cntrl:]<>"''`]') then
    raise exception 'The destination must be a path on Cosora that starts with one "/", like /advertisements.'
      using errcode = '22023';
  elsif v_img is not null and v_img !~ '^banners/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' then
    raise exception 'The image must be one uploaded from this page.' using errcode = '22023';
  elsif v_img is not null and not exists (select 1 from storage.objects o
                                           where o.bucket_id = 'site-content' and o.name = v_img) then
    raise exception 'That image isn''t uploaded. Upload it again.' using errcode = '22023';
  elsif p_starts_at is not null and p_ends_at is not null and p_starts_at >= p_ends_at then
    raise exception 'The banner must start before it ends.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.site_banners
      (title, subtitle, cta_label, link_path, image_path, active, starts_at, ends_at, position, created_by)
    values
      (v_title, v_sub, v_cta, v_link, v_img, coalesce(p_active, true), p_starts_at, p_ends_at,
       coalesce((select max(b.position) from public.site_banners b where b.placement = 'vendor_dashboard'), 0) + 1,
       auth.uid())
    returning id into v_id;
  else
    update public.site_banners b
       set title = v_title, subtitle = v_sub, cta_label = v_cta, link_path = v_link,
           image_path = v_img, active = coalesce(p_active, true), starts_at = p_starts_at,
           ends_at = p_ends_at, updated_at = now()
     where b.id = p_id
    returning b.id into v_id;
    if v_id is null then
      raise exception 'That banner no longer exists.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end
$function$;

create or replace function public.admin_site_banner_delete(p_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_img text;
begin
  perform admin.require_content_admin();
  delete from public.site_banners b where b.id = p_id returning b.image_path into v_img;
  if not found then
    raise exception 'That banner no longer exists.' using errcode = 'P0002';
  end if;
  -- The caller removes the image object after this commits (the MPF rule: row first,
  -- then the object).
  return v_img;
end
$function$;

create or replace function public.admin_site_banner_reorder(p_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform admin.require_content_admin();
  if p_ids is null
     or cardinality(p_ids) <> (select count(*) from public.site_banners b where b.placement = 'vendor_dashboard')
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids)
     or exists (select 1 from unnest(p_ids) x
                 where not exists (select 1 from public.site_banners b where b.id = x and b.placement = 'vendor_dashboard')) then
    raise exception 'The new order must list every banner exactly once. Reload and try again.' using errcode = '22023';
  end if;
  update public.site_banners b
     set position = o.ord, updated_at = now()
    from unnest(p_ids) with ordinality as o(id, ord)
   where b.id = o.id and b.position is distinct from o.ord;
end
$function$;

create or replace function public.admin_site_theme_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform admin.require_content_admin();
  return jsonb_build_object(
    'theme', (select jsonb_build_object(
                'vendor_accent', t.vendor_accent, 'buyer_accent', t.buyer_accent, 'success', t.success,
                'border', t.border, 'ink', t.ink, 'heading_font', t.heading_font, 'body_font', t.body_font,
                'updated_at', t.updated_at)
                from public.site_theme t),
    'defaults', admin.site_theme_defaults(),
    'fonts', to_jsonb(admin.site_theme_fonts()),
    'floors', jsonb_build_object('ink_on_white', 4.5, 'white_on_accent', 3));
end
$function$;

create or replace function public.admin_site_theme_save(
  p_vendor_accent text,
  p_buyer_accent  text,
  p_success       text,
  p_border        text,
  p_ink           text,
  p_heading_font  text,
  p_body_font     text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_vendor text := lower(btrim(coalesce(p_vendor_accent, '')));
  v_buyer  text := lower(btrim(coalesce(p_buyer_accent, '')));
  v_ok     text := lower(btrim(coalesce(p_success, '')));
  v_border text := lower(btrim(coalesce(p_border, '')));
  v_ink    text := lower(btrim(coalesce(p_ink, '')));
  v_head   text := btrim(coalesce(p_heading_font, ''));
  v_body   text := btrim(coalesce(p_body_font, ''));
  v_label  text;
  v_value  text;
begin
  perform admin.require_content_admin();

  for v_label, v_value in
    select * from (values ('The vendor accent', v_vendor), ('The buyer accent', v_buyer),
                          ('The success colour', v_ok), ('The border colour', v_border),
                          ('The text colour', v_ink)) as c(label, value)
  loop
    if v_value !~ '^#[0-9a-f]{6}$' then
      raise exception '% must be a colour like #256fef.', v_label using errcode = '22023';
    end if;
  end loop;
  if not (v_head = any (admin.site_theme_fonts())) then
    raise exception 'The heading font must be one of the offered fonts.' using errcode = '22023';
  end if;
  if not (v_body = any (admin.site_theme_fonts())) then
    raise exception 'The body font must be one of the offered fonts.' using errcode = '22023';
  end if;
  if admin.contrast_ratio(v_ink, '#ffffff') < 4.5 then
    raise exception 'Text on white needs a contrast of at least 4.5:1; % gives %:1.',
      v_ink, round(admin.contrast_ratio(v_ink, '#ffffff'), 2) using errcode = '22023';
  end if;
  if admin.contrast_ratio('#ffffff', v_vendor) < 3 then
    raise exception 'White text on the vendor accent needs at least 3:1; % gives %:1.',
      v_vendor, round(admin.contrast_ratio('#ffffff', v_vendor), 2) using errcode = '22023';
  end if;
  if admin.contrast_ratio('#ffffff', v_buyer) < 3 then
    raise exception 'White text on the buyer accent needs at least 3:1; % gives %:1.',
      v_buyer, round(admin.contrast_ratio('#ffffff', v_buyer), 2) using errcode = '22023';
  end if;

  insert into public.site_theme as t
    (id, vendor_accent, buyer_accent, success, border, ink, heading_font, body_font, updated_by, updated_at)
  values (true, v_vendor, v_buyer, v_ok, v_border, v_ink, v_head, v_body, auth.uid(), now())
  on conflict (id) do update
     set vendor_accent = excluded.vendor_accent, buyer_accent = excluded.buyer_accent,
         success = excluded.success, border = excluded.border, ink = excluded.ink,
         heading_font = excluded.heading_font, body_font = excluded.body_font,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  return public.admin_site_theme_get() -> 'theme';
end
$function$;

revoke all on function public.admin_site_banners(), public.admin_site_banner_save(uuid, text, text, text, text, text, boolean, timestamptz, timestamptz),
  public.admin_site_banner_delete(uuid), public.admin_site_banner_reorder(uuid[]), public.admin_site_theme_get(),
  public.admin_site_theme_save(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_site_banners(), public.admin_site_banner_save(uuid, text, text, text, text, text, boolean, timestamptz, timestamptz),
  public.admin_site_banner_delete(uuid), public.admin_site_banner_reorder(uuid[]), public.admin_site_theme_get(),
  public.admin_site_theme_save(text, text, text, text, text, text, text) to authenticated;

-- ── Storage ──────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-content', 'site-content', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
       ('site-config', 'site-config', true, 65536, array['application/json'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- site-content: super admins write banner images (banners/<uuid>.<ext>), nothing else.
-- SELECT is needed by the Storage API to replace or remove an object; public reads use
-- the public URL. site-config: no client policy at all; the edge function writes it.
drop policy if exists site_content_admin_select on storage.objects;
create policy site_content_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'site-content' and name ~ '^banners/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
         and (select public.admin_role())::text = 'super_admin');
drop policy if exists site_content_admin_insert on storage.objects;
create policy site_content_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-content' and name ~ '^banners/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
              and (select public.admin_role())::text = 'super_admin');
drop policy if exists site_content_admin_update on storage.objects;
create policy site_content_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'site-content' and name ~ '^banners/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
         and (select public.admin_role())::text = 'super_admin')
  with check (bucket_id = 'site-content' and name ~ '^banners/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
              and (select public.admin_role())::text = 'super_admin');
drop policy if exists site_content_admin_delete on storage.objects;
create policy site_content_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-content' and name ~ '^banners/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
         and (select public.admin_role())::text = 'super_admin');

-- ── Snapshot: queue one rebuild per transaction ──────────────────────────────
create or replace function public.site_config_queue_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text;
begin
  -- A reorder writes several rows; one rebuild per transaction is enough.
  if coalesce(current_setting('cosora.site_config_snapshot_queued', true), '') = 'on' then
    return null;
  end if;
  perform set_config('cosora.site_config_snapshot_queued', 'on', true);

  begin
    select s.decrypted_secret into v_key from vault.decrypted_secrets s where s.name = 'service_role_key';
    if v_key is null then
      raise warning 'site config snapshot not queued: Vault secret service_role_key is missing';
      return null;
    end if;
    perform net.http_post(
      url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/site-config-snapshot',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('reason', tg_table_name || ' ' || lower(tg_op)),
      timeout_milliseconds := 30000
    );
  exception when others then
    -- Never fail an admin's write over the cache. The hourly job catches up.
    raise warning 'site config snapshot not queued: %', sqlerrm;
  end;
  return null;
end
$function$;

revoke all on function public.site_config_queue_snapshot() from public, anon, authenticated, service_role;

drop trigger if exists trg_site_banners_snapshot on public.site_banners;
create trigger trg_site_banners_snapshot
  after insert or update or delete or truncate on public.site_banners
  for each statement execute function public.site_config_queue_snapshot();
drop trigger if exists trg_site_theme_snapshot on public.site_theme;
create trigger trg_site_theme_snapshot
  after insert or update or delete or truncate on public.site_theme
  for each statement execute function public.site_config_queue_snapshot();

-- ── The hourly job rebuilds both snapshots (same job, same schedule) ─────────
select cron.alter_job(
  job_id  := (select jobid from cron.job where jobname = 'faq-snapshots-refresh'),
  command := $job$
  do $do$
  declare
    v_key text;
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
    if v_key is null then
      raise exception 'faq-snapshots-refresh: Vault secret service_role_key is missing, so the FAQ and site-config snapshots can''t be rebuilt';
    end if;
    perform net.http_post(
      url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/faqs-snapshot',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := '{"reason":"cron"}'::jsonb,
      timeout_milliseconds := 30000
    );
    perform net.http_post(
      url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/site-config-snapshot',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := '{"reason":"cron"}'::jsonb,
      timeout_milliseconds := 30000
    );
  end
  $do$;
  $job$
);

-- ── Self-checks ──────────────────────────────────────────────────────────────
do $check$
declare
  pol record;
  f   text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.site_banners'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.site_theme'::regclass) then
    raise exception 'self-check: RLS is off on a site table';
  end if;
  if has_table_privilege('anon', 'public.site_banners', 'INSERT') or has_table_privilege('authenticated', 'public.site_banners', 'UPDATE')
     or has_table_privilege('authenticated', 'public.site_theme', 'UPDATE') or has_table_privilege('anon', 'public.site_theme', 'DELETE')
     or has_column_privilege('anon', 'public.site_banners', 'created_by', 'SELECT')
     or has_column_privilege('authenticated', 'public.site_theme', 'updated_by', 'SELECT')
     or not has_column_privilege('anon', 'public.site_banners', 'link_path', 'SELECT')
     or not has_column_privilege('anon', 'public.site_theme', 'ink', 'SELECT') then
    raise exception 'self-check: client grants on the site tables are wrong';
  end if;
  foreach f in array array['admin_site_banners()', 'admin_site_banner_delete(uuid)', 'admin_site_banner_reorder(uuid[])',
                           'admin_site_theme_get()', 'admin_site_theme_save(text,text,text,text,text,text,text)',
                           'admin_site_banner_save(uuid,text,text,text,text,text,boolean,timestamptz,timestamptz)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
       or not (select p.prosecdef from pg_proc p where p.oid = ('public.' || f)::regprocedure) then
      raise exception 'self-check: % has the wrong grants or is not SECURITY DEFINER', f;
    end if;
  end loop;
  if not exists (select 1 from storage.buckets where id = 'site-content' and public and file_size_limit = 2097152
                  and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'])
     or not exists (select 1 from storage.buckets where id = 'site-config' and public and file_size_limit = 65536
                     and allowed_mime_types = array['application/json']) then
    raise exception 'self-check: a site bucket is missing or misconfigured';
  end if;
  for pol in select policyname, cmd, coalesce(with_check, qual) as expr
               from pg_policies where schemaname = 'storage' and tablename = 'objects' loop
    if pol.expr like '%site-config%' then
      raise exception 'self-check: storage policy % mentions site-config', pol.policyname;
    end if;
    if pol.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and pol.expr not like '%bucket_id = ''%' then
      raise exception 'self-check: storage write policy % is not pinned to a bucket', pol.policyname;
    end if;
    if pol.expr like '%site-content%' and pol.expr not like '%super_admin%' then
      raise exception 'self-check: storage policy % opens site-content beyond super admins', pol.policyname;
    end if;
  end loop;
  if (select count(*) from pg_trigger where tgname in ('trg_site_banners_snapshot', 'trg_site_theme_snapshot') and tgenabled = 'O') <> 2
     or (select count(*) from pg_trigger where tgname = 'trg_admin_audit'
          and tgrelid in ('public.site_banners'::regclass, 'public.site_theme'::regclass)) <> 2 then
    raise exception 'self-check: a site table trigger is missing';
  end if;
  if not exists (select 1 from cron.job where jobname = 'faq-snapshots-refresh' and schedule = '17 * * * *' and active
                  and command like '%/functions/v1/faqs-snapshot%' and command like '%/functions/v1/site-config-snapshot%') then
    raise exception 'self-check: faq-snapshots-refresh does not rebuild both snapshots';
  end if;
  if (select count(*) from public.site_theme) <> 1 then
    raise exception 'self-check: site_theme must hold exactly one row';
  end if;
  -- WCAG values for today's colours, computed independently: 12.08, 4.57, 3.55.
  if round(admin.contrast_ratio('#363636', '#ffffff'), 2) <> 12.08
     or round(admin.contrast_ratio('#ffffff', '#256fef'), 2) <> 4.57
     or round(admin.contrast_ratio('#ffffff', '#ef4d62'), 2) <> 3.55 then
    raise exception 'self-check: contrast_ratio is off (#363636 on white %, white on #256fef %)',
      round(admin.contrast_ratio('#363636', '#ffffff'), 2), round(admin.contrast_ratio('#ffffff', '#256fef'), 2);
  end if;
end
$check$;
