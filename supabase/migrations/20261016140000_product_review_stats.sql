-- Real review numbers for a set of listings (Mitra, 2026-10-16: "no options in the video closeups are working
-- for a buyer, make everything functional").
--
-- The Video Closeups card showed `product_videos.rating` / `reviews`, numbers stored on the video and never
-- written from real reviews (production's one live video: "★ 0 ·" with nothing after it). It now shows the
-- tagged listing's real reviews from `product_reviews`, summarised here so a reel asks once for all its
-- listings instead of downloading every review row.
--
--   product_review_stats(ids)   for each listing among the first 100 ids that has reviews: how many, and the
--                               average to one decimal. Listings without reviews are left out.
--
-- SECURITY INVOKER: product_reviews is readable by everyone already (product_reviews_select_all), so this
-- gives nobody anything new. Uses product_reviews_product_idx (product_id, created_at).
--
-- No DROP of a table or function and no DELETE anywhere in this file.

create or replace function public.product_review_stats(p_product_ids uuid[])
returns table (product_id uuid, reviews_count integer, rating_avg numeric)
language sql stable security invoker set search_path = '' as $function$
  select r.product_id, count(*)::integer, round(avg(r.rating)::numeric, 1)
    from public.product_reviews r
   where r.product_id = any ((coalesce(p_product_ids, '{}'::uuid[]))[1:100])
   group by r.product_id;
$function$;

revoke all on function public.product_review_stats(uuid[]) from public;
grant execute on function public.product_review_stats(uuid[]) to anon, authenticated;

do $check$
begin
  if (select p.prosecdef from pg_proc p where p.oid = 'public.product_review_stats(uuid[])'::regprocedure) then
    raise exception 'self-check: product_review_stats must not be SECURITY DEFINER';
  end if;
  if not has_function_privilege('anon', 'public.product_review_stats(uuid[])', 'EXECUTE') then
    raise exception 'self-check: visitors must be able to read review numbers';
  end if;
  if (select count(*) from public.product_review_stats(array[gen_random_uuid()])) <> 0 then
    raise exception 'self-check: an unknown listing returned review numbers';
  end if;
end
$check$;
