-- Journal authors: a real author entity behind every byline (E-E-A-T).
--
-- Until now each post carried free text in blog_posts.author ('Cosora Team')
-- and the Journal guessed Person or Organization from the string. This adds
-- public.authors, one row per byline, and blog_posts.author_id pointing at it.
-- The Journal renders the byline, the author page (/blogs/authors/<slug>) and
-- the post's author JSON-LD from the row: Person for a person, Organization
-- for Cosora itself.
--
-- The four rows are exactly the details supplied on 2026-09-30. No biography
-- is stored for the three people: their byline is name and role, linked to
-- their LinkedIn profile, and nothing more goes here unless they supply it.
-- role holds the job title alone ('CEO'); the Journal renders 'CEO, Cosora'
-- and emits worksFor Cosora, so the JSON-LD jobTitle stays a title.
--
-- Expand step. blog_posts.author and the p_author parameter stay for now, so
-- an admin tab or a Journal build from before this migration keeps working.
-- The follow-up migration, blog_authors_drop_free_text, drops both once the
-- Journal and Cosora-Admin read author_id.

create table if not exists public.authors (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  entity_type  text not null,
  role         text,
  linkedin_url text,
  website_url  text,
  avatar_url   text,
  logo_url     text,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- The slug is the URL segment in /blogs/authors/<slug>.
  constraint authors_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint authors_name_present check (btrim(name) <> ''),
  constraint authors_entity_type check (entity_type in ('person', 'organization')),
  -- Each type carries only what its JSON-LD uses: a person has a role and a
  -- LinkedIn profile, the organisation has a website and a logo.
  constraint authors_person_fields check (
    entity_type <> 'person' or (website_url is null and logo_url is null)),
  constraint authors_organization_fields check (
    entity_type <> 'organization'
    or (role is null and linkedin_url is null and avatar_url is null)),
  -- A profile URL, not a share, feed or tracking link: it is the Person's
  -- sameAs, which is how a search engine ties the profile to the byline.
  constraint authors_linkedin_url check (
    linkedin_url ~ '^https://www\.linkedin\.com/in/[^/?#[:space:]]+/?$'),
  constraint authors_website_url check (website_url ~ '^https://[^[:space:]]+$')
);

-- Seeded before the triggers below exist: this is setup, not an edit, so it
-- neither pings the Journal nor lands in the Admin Log. logo_url stays null
-- for Cosora because the Journal's Organization JSON-LD already names the
-- logo it serves.
insert into public.authors (slug, name, entity_type, role, linkedin_url, website_url, description)
values
  ('cosora', 'Cosora', 'organization', null, null, 'https://www.cosora.in',
   'Cosora is a B2B fashion and textile sourcing marketplace connecting brands with verified manufacturers and suppliers.'),
  ('anandita-mitra', 'Anandita Mitra', 'person', 'CEO',
   'https://www.linkedin.com/in/ananditamitra/', null, null),
  ('ishani-banerjee', 'Ishani Banerjee', 'person', 'CMO',
   'https://www.linkedin.com/in/ishanibanerjee1/', null, null),
  ('abhishek-mitra', 'Abhishek Mitra', 'person', 'CTO',
   'https://www.linkedin.com/in/abhishek-mitra-6a6070327/', null, null)
on conflict (slug) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Every byline is public, like every category. No client writes.

alter table public.authors enable row level security;

drop policy if exists authors_select_public on public.authors;
create policy authors_select_public on public.authors
  for select to anon, authenticated using (true);

grant select on public.authors to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.authors from anon, authenticated;

-- ── Triggers ─────────────────────────────────────────────────────────────────

drop trigger if exists trg_authors_updated_at on public.authors;
create trigger trg_authors_updated_at before update on public.authors
for each row execute function public.touch_blog_updated_at();

-- '' = no owner column, as on the other blog tables.
drop trigger if exists trg_admin_audit on public.authors;
create trigger trg_admin_audit after insert or update or delete on public.authors
for each row execute function admin.audit_row_change('');

-- A name or role appears on every card and article, so an author change purges
-- the whole Journal. Same Vault secret and never-fail guarantees as
-- blog_categories_revalidate; the endpoint recognises table = 'authors'.
create or replace function public.blog_authors_revalidate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_secret text;
  v_new_slug text := null;
  v_old_slug text := null;
begin
  if tg_op <> 'INSERT' then v_old_slug := old.slug; end if;
  if tg_op <> 'DELETE' then v_new_slug := new.slug; end if;

  begin
    select s.decrypted_secret into v_secret
      from vault.decrypted_secrets s
     where s.name = 'blog_revalidate_secret';

    if v_secret is null then
      raise warning 'blog author revalidate not sent: Vault secret blog_revalidate_secret is missing';
      return null;
    end if;

    perform net.http_post(
      url     := 'https://www.cosora.in/blogs/api/revalidate',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-revalidate-secret', v_secret),
      body    := jsonb_build_object(
                   'type', tg_op,
                   'table', tg_table_name,
                   'record', case when v_new_slug is null then null
                                  else jsonb_build_object('slug', v_new_slug) end,
                   'old_record', case when v_old_slug is null then null
                                      else jsonb_build_object('slug', v_old_slug) end),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'blog author revalidate not sent: %', sqlerrm;
  end;

  return null;
end
$fn$;

revoke execute on function public.blog_authors_revalidate() from public, anon, authenticated;

drop trigger if exists trg_authors_revalidate on public.authors;
create trigger trg_authors_revalidate
  after insert or update or delete on public.authors
  for each row execute function public.blog_authors_revalidate();

-- ── blog_posts.author_id ─────────────────────────────────────────────────────
-- Nullable for now; the Journal reads a null as Cosora. RESTRICT, so an author
-- with posts cannot be deleted until the posts are reassigned: deleting must
-- never silently re-attribute published work.

alter table public.blog_posts
  add column if not exists author_id uuid references public.authors (id) on delete restrict;
create index if not exists blog_posts_author_idx on public.blog_posts (author_id);

-- The three existing posts were unattributed 'Cosora Team' pieces, so they go
-- to the Cosora row, not to a guessed person; an editor can reassign any of
-- them from the admin. updated_at is held still: a byline change is not a
-- content change, and bumping it would move every post's dateModified and
-- sitemap lastmod.
alter table public.blog_posts disable trigger trg_blog_posts_updated_at;
update public.blog_posts
   set author_id = (select a.id from public.authors a where a.slug = 'cosora')
 where author_id is null;
alter table public.blog_posts enable trigger trg_blog_posts_updated_at;

-- ── Reserve 'authors' ────────────────────────────────────────────────────────
-- /blogs/authors/<slug> is a static segment in the Journal. Same function as
-- 20260929185324 with 'authors' added; CREATE OR REPLACE keeps its grants.

create or replace function public.blog_assert_slug(p_slug text, p_id uuid)
returns text language plpgsql set search_path = '' as $$
declare v_slug text := public.blog_slugify(p_slug);
begin
  if v_slug = '' then
    raise exception 'A post needs a title or a slug.' using errcode = '22023';
  end if;
  if v_slug in ('category', 'page', 'api', 'about', 'authors') then
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

-- ── Admin RPCs ───────────────────────────────────────────────────────────────
-- A new parameter changes the signature, so both are dropped and recreated
-- rather than replaced (a replace would leave an ambiguous overload behind).
-- Bodies match 20260929123402 apart from the author lines.

drop function if exists public.admin_blog_post_save(
  uuid, text, text, text, jsonb, text, text, text, text, text, uuid, boolean,
  text, timestamptz, text, text, text, text[], text, boolean);

create function public.admin_blog_post_save(
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
  p_author_id       uuid default null,
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

  if p_author_id is not null
     and not exists (select 1 from public.authors a where a.id = p_author_id) then
    raise exception 'That author no longer exists.' using errcode = '23503';
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
      thumbnail, thumbnail_alt, author, author_id, category_id, is_featured,
      status, published_at, seo_title, seo_description, og_image,
      tags, canonical_url, noindex, read_time)
    values (
      p_title, v_slug, p_excerpt, p_blocks, p_hero_image, p_hero_image_alt,
      p_thumbnail, p_thumbnail_alt, p_author, p_author_id, p_category_id,
      coalesce(p_is_featured, false),
      p_status, v_published, p_seo_title, p_seo_description, p_og_image,
      p_tags, p_canonical_url, coalesce(p_noindex, false),
      public.blog_read_time(p_blocks))
    returning id into v_id;
  else
    update public.blog_posts set
      title = p_title, slug = v_slug, excerpt = p_excerpt, blocks = p_blocks,
      hero_image = p_hero_image, hero_image_alt = p_hero_image_alt,
      thumbnail = p_thumbnail, thumbnail_alt = p_thumbnail_alt,
      author = p_author, author_id = p_author_id, category_id = p_category_id,
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

drop function if exists public.admin_blog_post_get(uuid);

create function public.admin_blog_post_get(p_id uuid)
returns table (
  id uuid, title text, slug text, excerpt text, body text, blocks jsonb,
  hero_image text, hero_image_alt text, thumbnail text, thumbnail_alt text,
  author_id uuid, category_id uuid, is_featured boolean, sort_order integer,
  status text, published_at timestamptz, seo_title text, seo_description text,
  og_image text, read_time text, tags text[], canonical_url text,
  noindex boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform admin.require_content_admin();
  return query
    select b.id, b.title, b.slug, b.excerpt, b.body, b.blocks,
           b.hero_image, b.hero_image_alt, b.thumbnail, b.thumbnail_alt,
           b.author_id, b.category_id, b.is_featured, b.sort_order,
           b.status, b.published_at, b.seo_title, b.seo_description,
           b.og_image, b.read_time, b.tags, b.canonical_url,
           b.noindex, b.created_at, b.updated_at
      from public.blog_posts b
     where b.id = p_id;
end $fn$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC. Same grants as every admin_blog_*.
do $grants$
declare fn text;
begin
  for fn in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('admin_blog_post_save', 'admin_blog_post_get')
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $grants$;
