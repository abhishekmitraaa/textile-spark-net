-- Blog CMS, part 1 of 2: schema.
--
-- Gives the public blog (cosora-blogs, served at www.cosora.in/blogs) an
-- admin-authored content model: block-structured article bodies, thumbnails
-- distinct from hero art, richer categories, and a hero banner for the landing
-- page. Additive only; nothing existing changes shape.
--
-- Deliberately NOT added: created_by / updated_by on blog_posts. anon holds a
-- table-wide SELECT grant here, so those columns would publish admin user ids to
-- every reader. admin.audit_log already records who changed what, via the
-- trg_admin_audit triggers added at the bottom of this file.

-- ── blog_posts ───────────────────────────────────────────────────────────────

alter table public.blog_posts
  add column if not exists blocks        jsonb,
  add column if not exists thumbnail     text,
  add column if not exists thumbnail_alt text,
  add column if not exists tags          text[],
  add column if not exists canonical_url text,
  add column if not exists noindex       boolean not null default false;

-- blocks is an ordered array of {type, ...} objects. Array order IS the render
-- order, which is why there is no separate position column and no reorder RPC:
-- the admin saves the whole post in one call.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'blog_posts_blocks_is_array'
  ) then
    alter table public.blog_posts
      add constraint blog_posts_blocks_is_array
      check (blocks is null or jsonb_typeof(blocks) = 'array');
  end if;
end $$;

comment on column public.blog_posts.blocks is
  'Ordered array of content blocks: [{"type":"rich_text"|"heading"|"image"|"quote"|"table"|"faq"|"cta"|"divider", ...}]. Array order is render order. When null, the legacy Markdown in body is rendered instead.';
comment on column public.blog_posts.thumbnail is
  'Card image for listing grids. Falls back to hero_image when null.';
comment on column public.blog_posts.canonical_url is
  'Overrides the generated canonical. Leave null unless this post is a republication of something else.';
comment on column public.blog_posts.noindex is
  'Excludes this post from search engines while leaving it publicly reachable.';

-- ── blog_categories ──────────────────────────────────────────────────────────
-- Category pages are indexable URLs (/blogs/category/<slug>), so they need their
-- own title and description rather than inheriting the site defaults.

alter table public.blog_categories
  add column if not exists sort_order      int not null default 0,
  add column if not exists description     text,
  add column if not exists seo_title       text,
  add column if not exists seo_description text,
  add column if not exists updated_at      timestamptz not null default now();

-- ── blog_settings ────────────────────────────────────────────────────────────
-- Single row, same boolean-primary-key shape as public.site_theme.
--
-- A dedicated table rather than a placement on site_banners: anon has no grant on
-- site_banners at all (the buyer app reads it through a Storage JSON snapshot), so
-- reusing it would mean granting anon SELECT over every banner, vendor-dashboard
-- ones included.

create table if not exists public.blog_settings (
  id              boolean primary key default true check (id),
  hero_enabled    boolean not null default false,
  hero_image      text,
  hero_image_alt  text,
  hero_eyebrow    text,
  hero_title      text,
  hero_subtitle   text,
  hero_cta_label  text,
  hero_cta_href   text,
  updated_at      timestamptz not null default now()
);

comment on table public.blog_settings is
  'Single-row landing-page configuration for the public blog. Written only through admin_blog_settings_save.';

insert into public.blog_settings (id) values (true) on conflict (id) do nothing;

-- ── updated_at ───────────────────────────────────────────────────────────────

create or replace function public.touch_blog_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_blog_categories_updated_at on public.blog_categories;
create trigger trg_blog_categories_updated_at before update on public.blog_categories
for each row execute function public.touch_blog_updated_at();

drop trigger if exists trg_blog_settings_updated_at on public.blog_settings;
create trigger trg_blog_settings_updated_at before update on public.blog_settings
for each row execute function public.touch_blog_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.blog_settings enable row level security;

drop policy if exists blog_settings_select_public on public.blog_settings;
create policy blog_settings_select_public on public.blog_settings
  for select to anon, authenticated using (true);

grant select on public.blog_settings to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.blog_settings from anon, authenticated;

-- ── Audit ────────────────────────────────────────────────────────────────────
-- Required by the admin panel: a page that writes a table without this trigger
-- makes changes that never appear in the Admin Log. '' = no owner column, so
-- nothing is ever flagged as the actor's own row.

drop trigger if exists trg_admin_audit on public.blog_posts;
create trigger trg_admin_audit after insert or update or delete on public.blog_posts
for each row execute function admin.audit_row_change('');

drop trigger if exists trg_admin_audit on public.blog_categories;
create trigger trg_admin_audit after insert or update or delete on public.blog_categories
for each row execute function admin.audit_row_change('');

drop trigger if exists trg_admin_audit on public.blog_settings;
create trigger trg_admin_audit after insert or update or delete on public.blog_settings
for each row execute function admin.audit_row_change('');

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists blog_categories_sort_idx on public.blog_categories (sort_order, name);
create index if not exists blog_posts_tags_idx on public.blog_posts using gin (tags);
