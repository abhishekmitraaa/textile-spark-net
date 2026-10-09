-- Subscriptions P2 was run in the SQL editor (the apply tool declines a file with a delete inside a
-- function), and the paste left Windows line endings (CR LF) inside its function bodies. Later
-- migrations guard notify_deliver by its exact md5 and patch it by text, so the bodies go back to
-- the tested bytes: the same definition with the carriage returns removed. Privileges, owner,
-- settings and triggers are kept by create or replace. notification_dispatch_heartbeat is left as it
-- is (it holds the delete the tool declined; nothing patches or guards it).
do $fix$
declare
  r record;
  n integer := 0;
begin
  for r in
    select p.oid
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname in ('public', 'admin')
       and p.proname in ('phone_e164_digits', 'contact_address', 'mask_address', 'notify_deliver', 'notification_claim',
                         'notification_mark', 'subscription_invoice_notify', 'set_contact_consent', 'my_contact_channels',
                         'admin_notification_health', 'admin_notification_test')
       and p.prosrc like E'%\r%'
  loop
    execute replace(pg_get_functiondef(r.oid), E'\r', '');
    n := n + 1;
  end loop;
  if n <> 11 then
    raise exception 'expected 11 functions with carriage returns, found %', n;
  end if;
  if md5((select prosrc from pg_proc where oid = 'public.notify_deliver(uuid,text,jsonb,text,text[])'::regprocedure))
     <> 'c771242998921a6c779c4fdb5c87ef32' then
    raise exception 'notify_deliver is not the tested body';
  end if;
  if has_function_privilege('authenticated', 'public.notify_deliver(uuid,text,jsonb,text,text[])', 'execute')
     or has_function_privilege('anon', 'public.notification_claim(integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_contact_consent(text,boolean,text)', 'execute') then
    raise exception 'privileges changed';
  end if;
end
$fix$;