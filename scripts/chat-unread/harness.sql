-- ─────────────────────────────────────────────────────────────
-- HARNESS for unread chat messages (2026-10-14; migration 20261014170000_chat_unread.sql).
-- Runs against the local stack's fixed buyer and vendor. Every line prints PASS or FAIL with what it
-- saw, and the last line is the tally.
-- HOW TO RUN: docker exec -i supabase_db_localstack psql -U postgres -At < scripts/chat-unread/harness.sql
-- It never commits: the block ends by raising, which rolls everything back.
-- ─────────────────────────────────────────────────────────────
create or replace function pg_temp.act(p_uid uuid) returns void language plpgsql as $f$
begin
  if p_uid is null then
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $f$;
grant execute on function pg_temp.act(uuid) to public;

do $h$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  admin  uuid := '33333333-3333-3333-3333-333333333333';
  conv uuid; conv2 uuid;
  got text; n int;
begin
  create temp table _r (i serial, label text, want text, got text) on commit drop;
  grant all on _r to public;
  grant usage on sequence _r_i_seq to public;

  -- A fresh chat between buyer and vendor, and one between buyer and admin.
  delete from public.messages where conversation_id in (select id from public.conversations
    where (user_a, user_b) in ((least(buyer, vendor), greatest(buyer, vendor)), (least(buyer, admin), greatest(buyer, admin))));
  insert into public.conversations (user_a, user_b) values (least(buyer, vendor), greatest(buyer, vendor))
    on conflict (user_a, user_b) do update set last_message_at = now() - interval '1 day' returning id into conv;
  insert into public.conversations (user_a, user_b) values (least(buyer, admin), greatest(buyer, admin))
    on conflict (user_a, user_b) do update set last_message_at = now() - interval '1 day' returning id into conv2;
  update public.conversations set status = 'active' where id in (conv, conv2);
  delete from public.conversation_reads where conversation_id in (conv, conv2);

  -- 1. The vendor writes three; the buyer writes one.
  insert into public.messages (conversation_id, sender_id, body, created_at) values
    (conv, vendor, 'one',   now() - interval '3 minutes'),
    (conv, vendor, 'two',   now() - interval '2 minutes'),
    (conv, buyer,  'reply', now() - interval '90 seconds'),
    (conv, vendor, 'three', now() - interval '1 minute'),
    (conv2, admin, 'hello', now() - interval '1 minute');

  perform pg_temp.act(buyer);
  select coalesce(string_agg(case when conversation_id = conv then 'v' else 'a' end || ':' || other_id::text || ':' || unread, ',' order by unread desc), '-')
    into got from public.chat_unread_counts();
  reset role;
  insert into _r (label, want, got) values ('the buyer: 3 unread from the vendor, 1 from the other chat; their own reply not counted',
    'v:' || vendor || ':3,a:' || admin || ':1', got);

  perform pg_temp.act(vendor);
  select coalesce(sum(unread), 0)::text into got from public.chat_unread_counts();
  reset role;
  insert into _r (label, want, got) values ('the vendor: the buyer''s one reply', '1', got);

  -- 2. Opening the chat marks it read.
  perform pg_temp.act(buyer);
  perform public.mark_conversation_read(conv);
  select coalesce(sum(unread), 0)::text into got from public.chat_unread_counts() where conversation_id = conv;
  reset role;
  insert into _r (label, want, got) values ('opened: nothing unread in it', '0', got);

  perform pg_temp.act(buyer);
  select coalesce(sum(unread), 0)::text into got from public.chat_unread_counts();
  reset role;
  insert into _r (label, want, got) values ('the other chat is still unread', '1', got);

  -- 3. A new message after that counts again.
  insert into public.messages (conversation_id, sender_id, body, created_at) values (conv, vendor, 'four', now() + interval '1 second');
  perform pg_temp.act(buyer);
  select coalesce(sum(unread), 0)::text into got from public.chat_unread_counts() where conversation_id = conv;
  reset role;
  insert into _r (label, want, got) values ('a later message is unread', '1', got);

  -- Marking never moves the line backwards.
  update public.conversation_reads set read_at = now() + interval '1 hour' where conversation_id = conv and user_id = buyer;
  perform pg_temp.act(buyer);
  perform public.mark_conversation_read(conv);
  reset role;
  select (read_at > now() + interval '59 minutes')::text into got from public.conversation_reads where conversation_id = conv and user_id = buyer;
  insert into _r (label, want, got) values ('a read line is never moved back', 'true', got);

  -- 4. Who may do what
  perform pg_temp.act(admin);
  begin perform public.mark_conversation_read(conv); got := 'marked'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('someone outside the chat can''t mark it', '42501', got);

  perform pg_temp.act(null);
  begin perform public.chat_unread_counts(); got := 'read'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a visitor can''t ask for counts', '42501', got);

  perform pg_temp.act(vendor);
  select count(*)::text into got from public.conversation_reads where user_id = buyer;
  reset role;
  insert into _r (label, want, got) values ('nobody reads another person''s read lines', '0', got);

  perform pg_temp.act(buyer);
  begin insert into public.conversation_reads values (conv2, buyer, now() + interval '1 day'); got := 'inserted'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('nobody writes a read line directly', '42501', got);

  -- 5. Capped at 100 a chat.
  insert into public.messages (conversation_id, sender_id, body, created_at)
    select conv2, admin, 'bulk ' || g, now() - interval '30 seconds' from generate_series(1, 150) g;
  perform pg_temp.act(buyer);
  select unread::text into got from public.chat_unread_counts() where conversation_id = conv2;
  reset role;
  insert into _r (label, want, got) values ('a chat counts up to 100', '100', got);

  for got in select format('%s %s | want %s | got %s', case when r.want = r.got then 'PASS' else 'FAIL' end, r.label, r.want, r.got) from _r r order by r.i loop
    raise notice '%', got;
  end loop;
  select count(*) into n from _r r where r.want is distinct from r.got;
  raise exception 'TALLY: % of % passed (rolled back)', (select count(*) from _r) - n, (select count(*) from _r);
end
$h$;
