-- Blog read time: count every word a reader reads, on every write.
--
-- blog_read_time() concatenated only each block's top-level html, text,
-- question and answer keys. That skipped list items, table cells and image
-- captions, and every FAQ, because the editor stores FAQ items as
-- items[].q / items[].a rather than top-level question/answer. On the GSM
-- article it saw 254 of 382 words: 1.27 minutes, which rounds to "1 min read".
-- The 200 words-per-minute rate and round-to-nearest were right, and match the
-- blog's own readTime() and the admin editor; the word count was wrong.
--
-- Word extraction now mirrors the blog exactly (cosora-blogs src/lib/blocks.tsx
-- blocksToText and blocksWordCount, src/lib/inlineHtml.ts inlineToText,
-- src/lib/format.ts markdownWordCount), so the stored value is the one the
-- article page would compute for itself.
--
-- It also no longer depends on who writes the row. read_time was set only by
-- admin_blog_post_save, so direct SQL edits left it stale, and the three seed
-- posts carried hand-typed values (7, 4 and 3 minutes) that nothing had
-- calculated; measured by the blog's own code they are 2, 1 and 1. A BEFORE
-- trigger now derives it on every insert and update: from blocks when the post
-- has any, otherwise from the legacy Markdown body, the same precedence the
-- article page uses. admin_blog_post_save still passes blog_read_time(p_blocks);
-- the trigger runs after that assignment and has the final word.

-- inlineToText: <br> becomes a space, every other tag is dropped, and a
-- non-breaking space separates words (JS \s includes it).
create or replace function public.blog_inline_text(p_html text)
returns text language sql immutable set search_path = '' as $fn$
  select btrim(regexp_replace(
           translate(
             regexp_replace(
               regexp_replace(
                 regexp_replace(coalesce(p_html, ''), '&(nbsp|#160|#x0*a0);', ' ', 'gi'),
                 '<br\s*/?>', ' ', 'gi'),
               '<[^>]*>', '', 'g'),
             chr(160), ' '),
           '\s+', ' ', 'g'))
$fn$;

-- blocksWordCount: the same parts, in the same order, split on whitespace.
create or replace function public.blog_word_count(p_blocks jsonb)
returns integer language sql immutable set search_path = '' as $fn$
  with b as (
    select e.value as blk, e.value ->> 'type' as t
      from jsonb_array_elements(
             case when jsonb_typeof(p_blocks) = 'array' then p_blocks else '[]'::jsonb end) e
  ),
  parts(s) as (
    select blk ->> 'text' from b where t in ('heading', 'quote')
    union all
    select public.blog_inline_text(blk ->> 'html') from b where t = 'rich_text'
    union all
    select public.blog_inline_text(i #>> '{}')
      from b, jsonb_array_elements(
                case when jsonb_typeof(blk -> 'items') = 'array' then blk -> 'items' else '[]'::jsonb end) i
     where t = 'list'
    union all
    select public.blog_inline_text(c #>> '{}')
      from b,
           jsonb_array_elements(
             case when jsonb_typeof(blk -> 'rows') = 'array' then blk -> 'rows' else '[]'::jsonb end) r,
           jsonb_array_elements(case when jsonb_typeof(r) = 'array' then r else '[]'::jsonb end) c
     where t = 'table'
    union all
    select v.x
      from b,
           jsonb_array_elements(
             case when jsonb_typeof(blk -> 'items') = 'array' then blk -> 'items' else '[]'::jsonb end) i,
           lateral (values (i ->> 'q'), (public.blog_inline_text(i ->> 'a'))) v(x)
     where t = 'faq'
    union all
    select blk ->> 'caption' from b where t = 'image'
  )
  select count(*)::int
    from parts,
         regexp_split_to_table(
           btrim(regexp_replace(translate(coalesce(s, ''), chr(160), ' '), '\s+', ' ', 'g')), ' ') w
   where w <> ''
$fn$;

-- Same signature as before, so admin_blog_post_save needs no change.
create or replace function public.blog_read_time(p_blocks jsonb)
returns text language sql immutable set search_path = '' as $fn$
  select case
    when p_blocks is null or jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) = 0
      then null
    else (select case when w.n = 0 then null
                      else greatest(1, round(w.n / 200.0))::int || ' min read' end
            from (select public.blog_word_count(p_blocks) as n) w)
  end
$fn$;

-- markdownWordCount: the raw body split on whitespace.
create or replace function public.blog_read_time_markdown(p_body text)
returns text language sql immutable set search_path = '' as $fn$
  select case when w.clean = '' then null
              else greatest(1, round(array_length(string_to_array(w.clean, ' '), 1) / 200.0))::int
                   || ' min read' end
    from (select btrim(regexp_replace(translate(coalesce(p_body, ''), chr(160), ' '), '\s+', ' ', 'g')) as clean) w
$fn$;

create or replace function public.blog_posts_set_read_time()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  new.read_time := case
    when new.blocks is not null
         and jsonb_typeof(new.blocks) = 'array'
         and jsonb_array_length(new.blocks) > 0
      then public.blog_read_time(new.blocks)
    else public.blog_read_time_markdown(new.body)
  end;
  return new;
end
$fn$;

-- Helpers for triggers and SECURITY DEFINER functions only.
revoke execute on function public.blog_inline_text(text) from public, anon;
revoke execute on function public.blog_word_count(jsonb) from public, anon;
revoke execute on function public.blog_read_time(jsonb) from public, anon;
revoke execute on function public.blog_read_time_markdown(text) from public, anon;
revoke execute on function public.blog_posts_set_read_time() from public, anon, authenticated;

drop trigger if exists trg_blog_posts_read_time on public.blog_posts;
create trigger trg_blog_posts_read_time
  before insert or update on public.blog_posts
  for each row execute function public.blog_posts_set_read_time();

-- Recompute every stored value. The update also fires trg_blog_posts_revalidate,
-- so the live pages show the corrected times within seconds.
update public.blog_posts set read_time = read_time;
