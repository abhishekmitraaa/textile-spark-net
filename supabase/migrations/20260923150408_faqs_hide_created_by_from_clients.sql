-- Phase 9 follow-up (2026-09-23): clients read every faqs column except
-- created_by.
--
-- 20260923144549 granted table-wide SELECT to anon and authenticated. Once an
-- admin adds an FAQ, created_by holds that admin's profile id. Profiles are
-- readable without signing in (MPF-3; securityflags.md 2026-09-23), so that id
-- resolves to the admin's name, email and phone: a signed-out visitor could list
-- who the super admins are. Proven before this migration with a rolled-back probe:
-- anon read created_by across all 17 rows.
--
-- Nothing reads created_by from the table. useFaqs() selects id, category_label,
-- question, answer and position, and Cosora-Admin gets creators through
-- admin_faq_list() (SECURITY DEFINER, so column grants don't apply to it). A column
-- grant closes the gap without touching the policy, the RPCs or any client.

revoke select on public.faqs from anon, authenticated;
grant select (id, surface, category_label, question, answer, position, active, created_at, updated_at)
  on public.faqs to anon, authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'public.faqs', 'created_by', 'SELECT') then
      raise exception '% can still read faqs.created_by', r;
    end if;
    if not (has_column_privilege(r, 'public.faqs', 'id', 'SELECT')
        and has_column_privilege(r, 'public.faqs', 'surface', 'SELECT')
        and has_column_privilege(r, 'public.faqs', 'category_label', 'SELECT')
        and has_column_privilege(r, 'public.faqs', 'question', 'SELECT')
        and has_column_privilege(r, 'public.faqs', 'answer', 'SELECT')
        and has_column_privilege(r, 'public.faqs', 'position', 'SELECT')
        and has_column_privilege(r, 'public.faqs', 'active', 'SELECT')
        and has_column_privilege(r, 'public.faqs', 'created_at', 'SELECT')) then
      raise exception '% lost read on a column the apps filter or order by', r;
    end if;
    if has_table_privilege(r, 'public.faqs', 'INSERT')
       or has_table_privilege(r, 'public.faqs', 'UPDATE')
       or has_table_privilege(r, 'public.faqs', 'DELETE') then
      raise exception '% can write faqs directly', r;
    end if;
  end loop;
end $$;
