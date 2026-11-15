-- Seller Home fixes, Task 3 (SH-011, SH-033, SH-001 notice).
--   free_cap_is_10          the Free plan allows 10 listings, and its copy says so
--   free_paused_resumed     admin.resume_free_plan_listings() resumes a Free seller's paused listings up to 10
--   unread_skips_archived   chat_unread_counts() leaves out a chat the caller archived
--   registration_notice     a new registration writes the right notice for its status
-- Runs in one transaction and rolls back.
--
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < scripts/seller-home/plan_and_small_fixes.sql

begin;

do $$
declare
  v uuid;
  n int;
  conv uuid;
  me uuid;
  other uuid;
begin
  -- free_cap_is_10
  if (select limits ->> 'product_cap' from public.subscription_plans where id = 'free') is distinct from '10'
     or (select display ->> 'products' from public.subscription_plans where id = 'free') is distinct from '10' then
    raise exception 'free_cap_is_10: Free plan is % listings, copy says %',
      (select limits ->> 'product_cap' from public.subscription_plans where id = 'free'),
      (select display ->> 'products' from public.subscription_plans where id = 'free');
  end if;

  -- free_paused_resumed: a Free seller with 4 listings, 2 of them paused under the old cap of 2.
  select vp.id into v from public.vendor_profiles vp
   where vp.onboarding_complete
     and not exists (select 1 from public.vendor_subscriptions s where s.vendor_id = vp.id)
     and not exists (select 1 from public.products p where p.vendor_id = vp.id)
   order by vp.id limit 1;
  insert into public.products (vendor_id, name, price_value, status)
  select v, 'Paused test ' || g, 100, case when g <= 2 then 'live'::public.product_status else 'paused'::public.product_status end
    from generate_series(1, 4) g;
  perform admin.resume_free_plan_listings();
  select count(*) into n from public.products where vendor_id = v and status = 'paused';
  if n <> 0 then raise exception 'free_paused_resumed: % listings still paused', n; end if;

  -- unread_skips_archived
  select c.id, c.user_a, c.user_b into conv, me, other
    from public.conversations c order by c.created_at desc limit 1;
  insert into public.messages (conversation_id, sender_id, kind, body) values (conv, other, 'text', 'unread check');
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.chat_unread_counts() u where u.conversation_id = conv) then
    raise exception 'unread_skips_archived: setup, the chat should be unread before archiving';
  end if;
  insert into public.conversation_member_state (conversation_id, user_id, archived_at)
  values (conv, me, now())
  on conflict (conversation_id, user_id) do update set archived_at = now();
  if exists (select 1 from public.chat_unread_counts() u where u.conversation_id = conv) then
    raise exception 'unread_skips_archived: an archived chat still counts as unread';
  end if;

  -- registration_notice
  insert into public.vendor_registrations (id, vendor_id, status, country_code) values (gen_random_uuid(), v, 'registered', 'IN');
  if not exists (select 1 from public.notifications where profile_id = v and kind = 'registration_received'
                  and title = 'Your registration is in') then
    raise exception 'registration_notice: no "Your registration is in" notice';
  end if;
  insert into public.vendor_registrations (id, vendor_id, status, country_code) values (gen_random_uuid(), v, 'pending_review', 'AE');
  if not exists (select 1 from public.notifications where profile_id = v and kind = 'registration_received'
                  and title = 'Waiting for Cosora''s approval') then
    raise exception 'registration_notice: no "Waiting for Cosora''s approval" notice';
  end if;

  raise notice 'plan and small fixes ok';
end $$;

rollback;
