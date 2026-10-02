-- Blog CMS, part 3: Storage access for blog images, and block validation.
--
-- The four existing site_content_admin_* policies on storage.objects are pinned
-- to '^banners/...', so an upload to 'blog/<uuid>.jpg' in the same bucket is
-- denied. These are additive siblings for the blog/ prefix; the banner policies
-- are left untouched.

drop policy if exists blog_media_admin_select on storage.objects;
create policy blog_media_admin_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'site-content'
    and name ~ '^blog/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    and (select public.admin_role())::text = 'super_admin'
  );

drop policy if exists blog_media_admin_insert on storage.objects;
create policy blog_media_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-content'
    and name ~ '^blog/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    and (select public.admin_role())::text = 'super_admin'
  );

drop policy if exists blog_media_admin_update on storage.objects;
create policy blog_media_admin_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'site-content'
    and name ~ '^blog/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    and (select public.admin_role())::text = 'super_admin'
  )
  with check (
    bucket_id = 'site-content'
    and name ~ '^blog/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    and (select public.admin_role())::text = 'super_admin'
  );

drop policy if exists blog_media_admin_delete on storage.objects;
create policy blog_media_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'site-content'
    and name ~ '^blog/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    and (select public.admin_role())::text = 'super_admin'
  );

-- ── Block validation ─────────────────────────────────────────────────────────
-- The renderer in cosora-blogs is deliberately total: an unknown block renders
-- nothing rather than throwing, because a throw during static generation fails
-- the whole deploy, not one page. That makes the database the only place a
-- malformed block can actually be caught, so the rules live here.
--
-- The two that earn their keep:
--   * every image carries non-empty alt text, which is the highest-leverage
--     SEO and accessibility constraint available;
--   * at most one FAQ block, because two FAQPage entities on one URL is a
--     structured-data error.

create or replace function public.blog_blocks_valid(p_blocks jsonb)
returns boolean language plpgsql immutable set search_path = '' as $fn$
declare
  b jsonb;
  v_type text;
  v_faqs int := 0;
begin
  if p_blocks is null then return true; end if;
  if jsonb_typeof(p_blocks) <> 'array' then return false; end if;
  if jsonb_array_length(p_blocks) > 200 then return false; end if;

  for b in select value from jsonb_array_elements(p_blocks) loop
    if jsonb_typeof(b) <> 'object' then return false; end if;
    v_type := b ->> 'type';
    if v_type is null then return false; end if;

    if v_type = 'heading' then
      if coalesce(b ->> 'level', '') not in ('2', '3') then return false; end if;
      if coalesce(btrim(b ->> 'text'), '') = '' then return false; end if;

    elsif v_type = 'rich_text' then
      if b ->> 'html' is null then return false; end if;

    elsif v_type = 'list' then
      if jsonb_typeof(b -> 'items') <> 'array' then return false; end if;

    elsif v_type = 'image' then
      if coalesce(btrim(b ->> 'path'), '') = '' then return false; end if;
      if coalesce(btrim(b ->> 'alt'), '') = '' then return false; end if;

    elsif v_type = 'table' then
      if jsonb_typeof(b -> 'columns') <> 'array' then return false; end if;
      if jsonb_typeof(b -> 'rows') <> 'array' then return false; end if;

    elsif v_type = 'faq' then
      v_faqs := v_faqs + 1;
      if jsonb_typeof(b -> 'items') <> 'array' then return false; end if;

    elsif v_type = 'quote' then
      if coalesce(btrim(b ->> 'text'), '') = '' then return false; end if;

    elsif v_type = 'cta' then
      if coalesce(btrim(b ->> 'label'), '') = '' then return false; end if;
      if coalesce(btrim(b ->> 'href'), '') = '' then return false; end if;

    elsif v_type = 'divider' then
      null;

    else
      return false;  -- unknown block type
    end if;
  end loop;

  return v_faqs <= 1;
end $fn$;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'blog_posts_blocks_valid') then
    alter table public.blog_posts
      add constraint blog_posts_blocks_valid check (public.blog_blocks_valid(blocks));
  end if;
end $c$;

create index if not exists blog_posts_blocks_gin
  on public.blog_posts using gin (blocks jsonb_path_ops);
