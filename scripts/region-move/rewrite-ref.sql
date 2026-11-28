-- Region move: point stored addresses and function bodies at the new project (host part only).
-- Run with psql -v old=<old ref> -v new=<new ref>. Triggers are off for the row updates, so a changed photo address
-- doesn't send a live listing back to review or touch any timestamp.
begin;
set local session_replication_role = replica;
select set_config('cosora.old_ref', :'old', true), set_config('cosora.new_ref', :'new', true);
update public.product_images        set url = replace(url, :'old', :'new') where url like '%' || :'old' || '%';
update public.vendor_premises_photos set url = replace(url, :'old', :'new') where url like '%' || :'old' || '%';
update public.blog_posts            set body = replace(body, :'old', :'new') where body like '%' || :'old' || '%';
update public.rfq_submissions       set image = replace(image, :'old', :'new') where image like '%' || :'old' || '%';
update public.rfq_submissions       set images = replace(images::text, :'old', :'new')::text[] where images::text like '%' || :'old' || '%';
update public.product_videos        set video_url = replace(video_url, :'old', :'new') where video_url like '%' || :'old' || '%';
update public.product_videos        set thumbnail_url = replace(thumbnail_url, :'old', :'new') where thumbnail_url like '%' || :'old' || '%';
update admin.storage_origin         set origin = replace(origin, :'old', :'new') where origin like '%' || :'old' || '%';
do $$
declare r record; o text := current_setting('cosora.old_ref'); n text := current_setting('cosora.new_ref');
begin
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname in ('public','admin') and p.prosrc like '%' || o || '%' loop
    execute replace(pg_get_functiondef(r.oid), o, n);
  end loop;
end $$;
-- Nothing may still name the old project.
do $$
declare o text := current_setting('cosora.old_ref'); left_over int;
begin
  select count(*) into left_over from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname in ('public','admin') and p.prosrc like '%' || o || '%';
  if left_over > 0 then raise exception 'rewrite-ref: % function(s) still name the old project', left_over; end if;
  if exists (select 1 from public.product_images where url like '%' || o || '%') then raise exception 'rewrite-ref: product_images still old'; end if;
end $$;
commit;
