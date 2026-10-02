-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 17: RLS plans before and after a policy change (Phase 12,
-- 2026-10-02). EXPLAIN (ANALYZE, BUFFERS) of count(*) on products, rfqs, messages and
-- quotes, as demo-vendor and as a super_admin, with 20,000 extra open RFQs added inside
-- the transaction so a per-row cost shows. Each plan is summarised as: Filter lines that
-- still call is_admin() per row, InitPlan count, execution time, the top node's buffers.
--
-- HOW TO RUN: paste the change where marked and execute the whole file as ONE statement.
-- It never commits (the summary is raised, which also discards the 20,000 rows).
-- Phase 12: is_admin() per row in every "before" plan, in none "after"; top-node buffer
-- hits vendor messages 98 -> 18, products 55 -> 37, quotes 13 -> 4; rfqs (20,000 rows)
-- ~5.7 ms either way, because the cheap open-RFQ branch decides most rows first.
-- ─────────────────────────────────────────────────────────────────────────────
set transaction isolation level repeatable read;
create temp table hx (phase text, who text, q text, n bigint, line text) on commit drop;
create or replace function pg_temp.hx(p_phase text) returns void language plpgsql as $f$
declare
  who text; uid uuid; q text; r record; lines text[];
  pr uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  qs text[] := array['select count(*) from public.products', 'select count(*) from public.rfqs',
                     'select count(*) from public.messages', 'select count(*) from public.quotes'];
begin
  insert into admin.admin_users (id, admin_role, is_active) values (pr, 'super_admin', true)
  on conflict (id) do update set admin_role = 'super_admin', is_active = true;
  foreach who in array array['vendor', 'super_admin'] loop
    uid := case who when 'vendor' then vendor else pr end;
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
    foreach q in array qs loop
      lines := '{}';
      set local role authenticated;
      for r in execute 'explain (analyze, buffers, costs off) ' || q loop
        lines := lines || r."QUERY PLAN";
      end loop;
      reset role;
      insert into hx select p_phase, who, q, u.o, u.l from unnest(lines) with ordinality as u(l, o);
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end
$f$;
insert into public.rfqs (buyer_id, title, product_name, quantity, status)
select 'cee2058e-eb8c-4380-8961-1ed71783c321', 'HX load probe ' || g, 'Cotton poplin', 100, 'active'
  from generate_series(1, 20000) g;
select pg_temp.hx('before');

-- >>> paste the change here <<<

select pg_temp.hx('after');
do $s$
declare out text;
begin
  select string_agg(format('%s %s %s | is_admin() per row in %s filter(s), %s InitPlan(s) | %s | top node %s',
           g.who, g.tbl, g.phase, g.per_row, g.initplans, g.exec, g.buf),
         E'\n' order by g.who, g.tbl, g.phase desc)
    into out
    from (select h.who, split_part(h.q, '.', 2) as tbl, h.phase,
                 sum((h.line ~ 'Filter:.*is_admin\(\)')::int) as per_row,
                 sum((h.line ~ 'InitPlan')::int) as initplans,
                 max(case when h.line ~ '^Execution Time' then h.line end) as exec,
                 (array_agg(substring(h.line from 'shared hit=\d+') order by h.n) filter (where h.line ~ 'Buffers:'))[1] as buf
            from hx h group by h.who, h.q, h.phase) g;
  raise exception 'EXPLAIN before/after (rolled back, 20,000 extra open RFQs)%', E'\n' || out;
end
$s$;
