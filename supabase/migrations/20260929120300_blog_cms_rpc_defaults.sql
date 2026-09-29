-- Blog CMS, part 4: defaults on the optional RPC parameters.
--
-- Matches admin_site_banner_save. Two reasons: the generated TypeScript then
-- marks each parameter optional, so the client omits rather than passing null,
-- and PostgREST leaves an omitted key out of the call entirely.
--
-- The bodies are identical to 20260929120100; only the signatures gain
-- defaults. See that file for what each function does.

create or replace function public.admin_blog_post_save(
  p_id              uuid default null,
  p_title           text default null,
  p_slug            text default null,
  p_excerpt         text default null,
  p_blocks          jsonb default null,
  p_hero_image      text default null,
  p_hero_image_alt  text default null,
  p_thumbnail       text default null,
  p_thumbnail_alt   text default null,
  p_author          text default null,
  p_category_id     uuid default null,
  p_is_featured     boolean default false,
  p_status          text default 'draft',
  p_published_at    timestamptz default null,
  p_seo_title       text default null,
  p_seo_description text default null,
  p_og_image        text default null,
  p_tags            text[] default null,
  p_canonical_url   text default null,
  p_noindex         boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare
  v_slug text;
  v_published timestamptz := p_published_at;
  v_id uuid;
begin
  perform admin.require_content_admin();

  if coalesce(p_status, '') not in ('draft', 'published', 'scheduled') then
    raise exception 'Status must be draft, published or scheduled.' using errcode = '22023';
  end if;

  v_slug := public.blog_assert_slug(coalesce(nullif(trim(p_slug), ''), p_title), p_id);

  if p_status = 'published' and v_published is null then
    v_published := now();
  end if;
  if p_status = 'scheduled' and v_published is null then
    raise exception 'A scheduled post needs a publish date.' using errcode = '22023';
  end if;

  if coalesce(p_is_featured, false) then
    update public.blog_posts set is_featured = false
     where is_featured and (p_id is null or id <> p_id);
  end if;

  if p_id is null then
    insert into public.blog_posts (
      title, slug, excerpt, blocks, hero_image, hero_image_alt,
      thumbnail, thumbnail_alt, author, category_id, is_featured,
      status, published_at, seo_title, seo_description, og_image,
      tags, canonical_url, noindex, read_time)
    values (
      p_title, v_slug, p_excerpt, p_blocks, p_hero_image, p_hero_image_alt,
      p_thumbnail, p_thumbnail_alt, p_author, p_category_id, coalesce(p_is_featured, false),
      p_status, v_published, p_seo_title, p_seo_description, p_og_image,
      p_tags, p_canonical_url, coalesce(p_noindex, false),
      public.blog_read_time(p_blocks))
    returning id into v_id;
  else
    update public.blog_posts set
      title = p_title, slug = v_slug, excerpt = p_excerpt, blocks = p_blocks,
      hero_image = p_hero_image, hero_image_alt = p_hero_image_alt,
      thumbnail = p_thumbnail, thumbnail_alt = p_thumbnail_alt,
      author = p_author, category_id = p_category_id,
      is_featured = coalesce(p_is_featured, false),
      status = p_status, published_at = v_published,
      seo_title = p_seo_title, seo_description = p_seo_description,
      og_image = p_og_image, tags = p_tags, canonical_url = p_canonical_url,
      noindex = coalesce(p_noindex, false),
      read_time = public.blog_read_time(p_blocks)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'That post no longer exists.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

create or replace function public.admin_blog_category_save(
  p_id uuid default null, p_name text default null, p_slug text default null,
  p_description text default null, p_seo_title text default null,
  p_seo_description text default null
) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare v_slug text; v_id uuid;
begin
  perform admin.require_content_admin();
  v_slug := public.blog_slugify(coalesce(nullif(trim(p_slug), ''), p_name));
  if v_slug = '' then
    raise exception 'A category needs a name.' using errcode = '22023';
  end if;
  if exists (select 1 from public.blog_categories c
              where c.slug = v_slug and (p_id is null or c.id <> p_id)) then
    raise exception 'Another category already uses the slug "%".', v_slug
      using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.blog_categories (name, slug, description, seo_title, seo_description, sort_order)
    values (p_name, v_slug, p_description, p_seo_title, p_seo_description,
            coalesce((select max(c2.sort_order) + 1 from public.blog_categories c2), 0))
    returning id into v_id;
  else
    update public.blog_categories set
      name = p_name, slug = v_slug, description = p_description,
      seo_title = p_seo_title, seo_description = p_seo_description
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'That category no longer exists.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end $fn$;

create or replace function public.admin_blog_settings_save(
  p_hero_enabled boolean default false, p_hero_image text default null,
  p_hero_image_alt text default null, p_hero_eyebrow text default null,
  p_hero_title text default null, p_hero_subtitle text default null,
  p_hero_cta_label text default null, p_hero_cta_href text default null
) returns table (hero_image text)
language plpgsql security definer set search_path = '' as $fn$
begin
  perform admin.require_content_admin();
  return query
    update public.blog_settings s set
      hero_enabled = coalesce(p_hero_enabled, false),
      hero_image = p_hero_image, hero_image_alt = p_hero_image_alt,
      hero_eyebrow = p_hero_eyebrow, hero_title = p_hero_title,
      hero_subtitle = p_hero_subtitle,
      hero_cta_label = p_hero_cta_label, hero_cta_href = p_hero_cta_href
     where s.id
    returning s.hero_image;
end $fn$;

-- CREATE OR REPLACE resets privileges to the PUBLIC default, so re-apply them.
do $grants$
declare fn text;
begin
  for fn in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'admin\_blog\_%'
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $grants$;
