-- Card thumbnails: queue only photos stored in this project's Storage (commit security review of 20261118170000,
-- 2026-11-18). The first version matched any address ending in /storage/v1/object/public/product-images/<path>, so a
-- listing photo hosted elsewhere under a look-alike path could name another seller's photo. The function also checks
-- the exact address now, and writes <path>.jpg (the source extension kept, so two photos never share a thumbnail).

begin;

create or replace function admin.queue_product_thumbs(p_product_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_key    text;
  v_path   text;
  v_queued integer := 0;
begin
  if not exists (select 1 from public.products p where p.id = p_product_id and p.status = 'live') then
    return 0;
  end if;
  select s.decrypted_secret into v_key from vault.decrypted_secrets s where s.name = 'service_role_key';
  if v_key is null then
    raise warning 'product thumbnails not queued: Vault secret service_role_key is missing';
    return 0;
  end if;
  for v_path in
    select substring(i.url from '^https://vxdhhgdfubqedfpwfyrb\.supabase\.co/storage/v1/object/public/product-images/(.+)$')
      from public.product_images i
     where i.product_id = p_product_id
       and i.url ~ '^https://vxdhhgdfubqedfpwfyrb\.supabase\.co/storage/v1/object/public/product-images/[^?#]+\.(jpe?g|png)$'
  loop
    perform net.http_post(
      url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/product-thumbs',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('path', v_path),
      timeout_milliseconds := 30000
    );
    v_queued := v_queued + 1;
  end loop;
  return v_queued;
end
$function$;
revoke all on function admin.queue_product_thumbs(uuid) from public, anon, authenticated;

do $check$
begin
  if position('^https://vxdhhgdfubqedfpwfyrb' in (select prosrc from pg_proc where oid = 'admin.queue_product_thumbs(uuid)'::regprocedure)) = 0 then
    raise exception 'product_thumbs_own_host self-check: the queue is not anchored to this project''s host';
  end if;
end
$check$;

commit;
