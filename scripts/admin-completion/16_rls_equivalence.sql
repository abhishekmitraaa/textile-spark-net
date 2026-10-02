-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 16: RLS equivalence (Phase 12, 2026-10-02).
--
-- Proves a policy rewrite changes nobody's access. pg_temp.h16_probe(phase) records,
-- for 10 personas (anon, demo-buyer, demo-vendor, and an account given each of the
-- 7 admin roles):
--   read    count(*) visible in EVERY table with RLS in `public` and `admin`
--           (or the refusal's SQLSTATE)
--   update  rows an `update t set <first column> = <first column>` reaches, and
--   delete  rows a `delete from t` reaches, on the ten tables whose policies were
--           split; each write runs in its own subtransaction and is rolled back
-- Run it, apply the change in the SAME transaction, run it again, and compare:
-- every cell must be identical. The transaction is REPEATABLE READ, so live traffic
-- between the two runs can't move a count.
--
-- HOW TO RUN: paste the change (the migration's statements) where marked below, and
-- execute the whole file as ONE statement (MCP execute_sql). It never commits: the
-- compare block raises. Run as is, with nothing pasted, it is a sanity run: 0 differ.
-- Phase 12 (2026-10-02): 1,020 cells before, 1,020 after, 0 differ; with two
-- deliberately wrong policies pasted instead, 24 differ (the harness sees a change).
-- ─────────────────────────────────────────────────────────────────────────────
set transaction isolation level repeatable read;
create temp table h16 (phase text, persona text, item text, result text) on commit drop;

create or replace function pg_temp.h16_probe(p_phase text) returns int
language plpgsql as $f$
declare
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  buyer  uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  personas text[] := array['anon', 'buyer', 'vendor', 'super_admin', 'product_moderator', 'vendor_ops',
                           'ads_moderator', 'finance_admin', 'support', 'manager'];
  split text[] := array['buyer_profiles', 'catalogues', 'categories', 'follows', 'product_images', 'recently_viewed',
                        'subscription_invoices', 'subscription_plans', 'vendor_documents', 'vendor_subscriptions'];
  tabs text[];
  per text; uid uuid; t text; c text; n bigint; res text;
  items text[]; results text[]; total int := 0;
begin
  select array_agg(format('%I.%I', n.nspname, cl.relname) order by n.nspname, cl.relname)
    into tabs
    from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
   where n.nspname in ('public', 'admin') and cl.relkind in ('r', 'p') and cl.relrowsecurity;

  foreach per in array personas loop
    items := '{}'; results := '{}';
    if per not in ('anon', 'buyer', 'vendor') then
      insert into admin.admin_users (id, admin_role, is_active)
      values (pr, per::public.admin_role_type, true)
      on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
    end if;
    uid := case per when 'anon' then null when 'buyer' then buyer when 'vendor' then vendor else pr end;
    if uid is null then
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      perform set_config('request.jwt.claim.sub', '', true);
      set local role anon;
    else
      perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', uid::text, true);
      set local role authenticated;
    end if;

    foreach t in array tabs loop
      begin
        execute format('select count(*) from %s', t) into n;
        res := n::text;
      exception when others then
        res := '!' || sqlstate;
      end;
      items := items || ('read ' || t); results := results || res;
    end loop;

    foreach t in array split loop
      select a.attname into c from pg_attribute a
       where a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped
       order by a.attnum limit 1;
      begin
        execute format('update public.%I set %I = %I', t, c, c);
        get diagnostics n = row_count;
        res := n::text;
        raise exception using errcode = 'P0098';
      exception
        when sqlstate 'P0098' then null;
        when others then res := '!' || sqlstate;
      end;
      items := items || ('update ' || t); results := results || res;
      begin
        execute format('delete from public.%I', t);
        get diagnostics n = row_count;
        res := n::text;
        raise exception using errcode = 'P0098';
      exception
        when sqlstate 'P0098' then null;
        when others then res := '!' || sqlstate;
      end;
      items := items || ('delete ' || t); results := results || res;
    end loop;

    reset role;
    insert into h16 select p_phase, per, i, r from unnest(items, results) as u(i, r);
    total := total + array_length(items, 1);
  end loop;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return total;
end
$f$;

select pg_temp.h16_probe('before');

-- >>> paste the change here <<<

select pg_temp.h16_probe('after');

do $cmp$
declare n_before int; n_after int; n_diff int; diffs text; sample text;
begin
  select count(*) into n_before from h16 where phase = 'before';
  select count(*) into n_after from h16 where phase = 'after';
  select count(*), string_agg(format('%s | %s: %s -> %s', b.persona, b.item, b.result, coalesce(a.result, 'missing')), E'\n')
    into n_diff, diffs
    from h16 b left join h16 a on a.phase = 'after' and a.persona = b.persona and a.item = b.item
   where b.phase = 'before' and a.result is distinct from b.result;
  select string_agg(format('%s: %s', persona, string_agg_md5), E'\n') into sample
    from (select persona, md5(string_agg(item || '=' || result, ',' order by item)) as string_agg_md5
            from h16 where phase = 'after' group by persona) s;
  raise exception 'H16 (rolled back): % cells before, % after, % differ%', n_before, n_after, n_diff,
    E'\n' || coalesce(diffs, '') || E'\n' || coalesce(sample, '');
end
$cmp$;
