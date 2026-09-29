-- Blog CMS, part 2 of 2: the admin write path.
--
-- Every admin_blog_* function is SECURITY DEFINER and starts with
-- admin.require_content_admin(), which raises 42501 for anyone who is not a
-- super admin. Clients hold no write grant on the blog tables, so this is the
-- only way in.

-- ── Fix: scheduled posts could never go live ─────────────────────────────────
-- The original policy required status = 'published', but nothing ever flips a
-- 'scheduled' row to 'published', so a scheduled post stayed invisible forever
-- even after its date passed. Treating "scheduled and due" as live makes the
-- schedule self-executing with no cron job. A draft stays hidden regardless of
-- its date.

drop policy if exists blog_posts_select_published on public.blog_posts;
create policy blog_posts_select_published on public.blog_posts
  for select to anon, authenticated
  using (
    status in ('published', 'scheduled')
    and published_at is not null
    and published_at <= now()
  );

-- ── Helpers ──────────────────────────────────────────────────────────────────

create or replace function public.blog_slugify(p_text text)
returns text language sql immutable set search_path = '' as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'))
$$;

-- 'category', 'page' and 'api' collide with real route segments in the Next.js
-- app (/blogs/category/..., /blogs/page/2, /blogs/api/revalidate). A post using
-- one would be shadowed by the static route and unreachable.
create or replace function public.blog_assert_slug(p_slug text, p_id uuid)
returns text language plpgsql set search_path = '' as $$
declare v_slug text := public.blog_slugify(p_slug);
begin
  if v_slug = '' then
    raise exception 'A post needs a title or a slug.' using errcode = '22023';
  end if;
  if v_slug in ('category', 'page', 'api') then
    raise exception 'The slug "%" is reserved by the blog router. Pick another.', v_slug
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.blog_posts b
     where b.slug = v_slug and (p_id is null or b.id <> p_id)
  ) then
    raise exception 'Another post already uses the slug "%".', v_slug
      using errcode = '23505';
  end if;
  return v_slug;
end $$;

-- Reading time, derived rather than typed by hand so it cannot drift from the
-- body. Roughly 200 words a minute over the text every block carries.
create or replace function public.blog_read_time(p_blocks jsonb)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_blocks is null then null
    else greatest(1, round(
      coalesce(array_length(
        regexp_split_to_array(
          trim(regexp_replace(
            coalesce((
              select string_agg(
                coalesce(b->>'html', '') || ' ' ||
                coalesce(b->>'text', '') || ' ' ||
                coalesce(b->>'question', '') || ' ' ||
                coalesce(b->>'answer', ''), ' ')
                from jsonb_array_elements(p_blocks) b
            ), ''),
            '<[^>]*>', ' ', 'g')),
          '\s+'), 1), 0)::numeric / 200))::text || ' min read'
  end
$$;

-- ── Posts ────────────────────────────────────────────────────────────────────

create or replace function public.admin_blog_post_list()
returns table (
  id uuid, title text, slug text, excerpt text, status text,
  is_featured boolean, sort_order int, published_at timestamptz,
  category_id uuid, category_name text, thumbnail text, hero_image text,
  noindex boolean, has_blocks boolean, tags text[], updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform admin.require_content_admin();
  return query
    select b.id, b.title, b.slug, b.excerpt, b.status,
           b.is_featured, b.sort_order, b.published_at,
           b.category_id, c.name, b.thumbnail, b.hero_image,
           b.noindex, (b.blocks is not null), b.tags, b.updated_at
      from public.blog_posts b
      left join public.blog_categories c on c.id = b.category_id
     order by b.sort_order, b.published_at desc nulls first, b.created_at desc;
end $$;

create or replace function public.admin_blog_post_get(p_id uuid)
returns table (
  id uuid, title text, slug text, excerpt text, body text, blocks jsonb,
  hero_image text, hero_image_alt text, thumbnail text, thumbnail_alt text,
  author text, category_id uuid, is_featured boolean, sort_order int,
  status text, published_at timestamptz, seo_title text, seo_description text,
  og_image text, read_time text, tags text[], canonical_url text,
  noindex boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform admin.require_content_admin();
  return query
    select b.id, b.title, b.slug, b.excerpt, b.body, b.blocks,
           b.hero_image, b.hero_image_alt, b.thumbnail, b.thumbnail_alt,
           b.author, b.category_id, b.is_featured, b.sort_order,
           b.status, b.published_at, b.seo_title, b.seo_description,
           b.og_image, b.read_time, b.tags, b.canonical_url,
           b.noindex, b.created_at, b.updated_at
      from public.blog_posts b
     where b.id = p_id;
end $$;

-- Full save. Omit p_id to insert. Every field is written as given, so the client
-- sends the whole post: the same contract as admin_site_banner_save.
create or replace function public.admin_blog_post_save(
  p_id              uuid,
  p_title           text,
  p_slug            text,
  p_excerpt         text,
  p_blocks          jsonb,
  p_hero_image      text,
  p_hero_image_alt  text,
  p_thumbnail       text,
  p_thumbnail_alt   text,
  p_author          text,
  p_category_id     uuid,
  p_is_featured     boolean,
  p_status          text,
  p_published_at    timestamptz,
  p_seo_title       text,
  p_seo_description text,
  p_og_image        text,
  p_tags            text[],
  p_canonical_url   text,
  p_noindex         boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
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

  -- Publishing with no date means now. Without this a freshly published post
  -- stays invisible, because the public policy requires published_at <= now().
  if p_status = 'published' and v_published is null then
    v_published := now();
  end if;
  if p_status = 'scheduled' and v_published is null then
    raise exception 'A scheduled post needs a publish date.' using errcode = '22023';
  end if;

  -- Only one post can be the hero at a time.
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
end $$;

-- Returns the image paths so the caller can clean up Storage, the same shape as
-- admin_site_banner_delete.
create or replace function public.admin_blog_post_delete(p_id uuid)
returns table (id uuid, images text[])
language plpgsql security definer set search_path = '' as $$
begin
  perform admin.require_content_admin();
  return query
    delete from public.blog_posts b
     where b.id = p_id
    returning b.id, array_remove(array[b.hero_image, b.thumbnail, b.og_image], null);
end $$;

create or replace function public.admin_blog_post_set_status(
  p_id uuid, p_status text, p_published_at timestamptz default null
) returns table (id uuid, status text, published_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_published timestamptz := p_published_at;
begin
  perform admin.require_content_admin();
  if coalesce(p_status, '') not in ('draft', 'published', 'scheduled') then
    raise exception 'Status must be draft, published or scheduled.' using errcode = '22023';
  end if;
  if p_status = 'published' and v_published is null then
    select coalesce(b.published_at, now()) into v_published
      from public.blog_posts b where b.id = p_id;
  end if;
  return query
    update public.blog_posts b
       set status = p_status, published_at = v_published
     where b.id = p_id
    returning b.id, b.status, b.published_at;
end $$;

create or replace function public.admin_blog_post_reorder(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform admin.require_content_admin();
  update public.blog_posts b
     set sort_order = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where b.id = x.id;
end $$;

-- ── Categories ───────────────────────────────────────────────────────────────

create or replace function public.admin_blog_category_list()
returns table (
  id uuid, name text, slug text, description text,
  seo_title text, seo_description text, sort_order int, posts bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform admin.require_content_admin();
  return query
    select c.id, c.name, c.slug, c.description,
           c.seo_title, c.seo_description, c.sort_order, count(b.id)
      from public.blog_categories c
      left join public.blog_posts b on b.category_id = c.id
     group by c.id
     order by c.sort_order, c.name;
end $$;

create or replace function public.admin_blog_category_save(
  p_id uuid, p_name text, p_slug text, p_description text,
  p_seo_title text, p_seo_description text
) returns uuid
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- Refuses while posts still point at it, rather than silently orphaning them.
create or replace function public.admin_blog_category_delete(p_id uuid)
returns table (id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_posts bigint;
begin
  perform admin.require_content_admin();
  select count(*) into v_posts from public.blog_posts b where b.category_id = p_id;
  if v_posts > 0 then
    raise exception 'That category still has % post(s). Move them first.', v_posts
      using errcode = '23503';
  end if;
  return query delete from public.blog_categories c where c.id = p_id returning c.id;
end $$;

create or replace function public.admin_blog_category_reorder(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform admin.require_content_admin();
  update public.blog_categories c
     set sort_order = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where c.id = x.id;
end $$;

-- ── Landing-page settings ────────────────────────────────────────────────────

create or replace function public.admin_blog_settings_get()
returns table (
  hero_enabled boolean, hero_image text, hero_image_alt text,
  hero_eyebrow text, hero_title text, hero_subtitle text,
  hero_cta_label text, hero_cta_href text, updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform admin.require_content_admin();
  return query
    select s.hero_enabled, s.hero_image, s.hero_image_alt,
           s.hero_eyebrow, s.hero_title, s.hero_subtitle,
           s.hero_cta_label, s.hero_cta_href, s.updated_at
      from public.blog_settings s where s.id;
end $$;

create or replace function public.admin_blog_settings_save(
  p_hero_enabled boolean, p_hero_image text, p_hero_image_alt text,
  p_hero_eyebrow text, p_hero_title text, p_hero_subtitle text,
  p_hero_cta_label text, p_hero_cta_href text
) returns table (hero_image text)
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which would let a
-- logged-out caller reach every one of these. Revoke that and hand execute to
-- authenticated only; the gate inside each function decides from there.

do $$
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
end $$;
