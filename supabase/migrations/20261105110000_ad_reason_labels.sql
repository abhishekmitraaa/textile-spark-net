-- A vendor's campaign card gives the reason in words (2026-11-05; ToDo "Show the reason label, not the code, on a
-- vendor's campaign card", 2026-09-28; Mitra 2026-11-05: "complete them fully").
-- advertisements.moderation_reason stores "<code> <note>" (ad_apply_decision, admin completion Phase 3), and the
-- vendor's card printed it as is ("Not approved: misleading_claims Please fix the headline"). The labels live in
-- admin.ad_reason_codes, which clients can't read; this hands signed-in accounts the code → label list (all codes,
-- including retired ones, so an old campaign still reads) without copying it into the app.
create function public.ad_reason_labels()
returns table(code text, label text)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.code, c.label from admin.ad_reason_codes c order by c.sort, c.code
$function$;
revoke all on function public.ad_reason_labels() from public, anon;
grant execute on function public.ad_reason_labels() to authenticated, service_role;

do $check$
begin
  if has_function_privilege('anon', 'public.ad_reason_labels()', 'execute')
     or not has_function_privilege('authenticated', 'public.ad_reason_labels()', 'execute') then
    raise exception 'self-check: ad_reason_labels is not signed-in only';
  end if;
  if (select count(*) from public.ad_reason_labels()) < 8 then
    raise exception 'self-check: ad_reason_labels returns fewer than the 8 reason codes';
  end if;
end
$check$;
