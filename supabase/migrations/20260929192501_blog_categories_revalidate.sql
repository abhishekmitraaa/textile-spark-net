-- Purge the Journal's ISR cache when a blog category changes.
--
-- trg_blog_posts_revalidate (20260929150000) only fires on blog_posts, so a
-- category rename, a new description or new SEO fields waited out the full hour
-- of `revalidate = 3600`. Category names also appear on every page (header nav,
-- article breadcrumbs, category labels), so this matters beyond the category's
-- own listing.
--
-- The endpoint, cosora-blogs src/app/api/revalidate/route.ts, recognises
-- table = 'blog_categories' and purges the root layout. It must be deployed
-- before this trigger exists; the older endpoint would read the category slug
-- as a post slug and purge the wrong paths.
--
-- Same shape and guarantees as blog_posts_revalidate: the secret comes from
-- Vault ('blog_revalidate_secret', never in this public repo), and every
-- failure is a warning, never an error, so a cache purge cannot fail an
-- editor's save. Unlike posts there is no draft state to skip: every category
-- is public.

create or replace function public.blog_categories_revalidate()
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
      raise warning 'blog category revalidate not sent: Vault secret blog_revalidate_secret is missing';
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
    raise warning 'blog category revalidate not sent: %', sqlerrm;
  end;

  return null;
end
$fn$;

revoke execute on function public.blog_categories_revalidate() from public, anon, authenticated;

drop trigger if exists trg_blog_categories_revalidate on public.blog_categories;
create trigger trg_blog_categories_revalidate
  after insert or update or delete on public.blog_categories
  for each row execute function public.blog_categories_revalidate();
