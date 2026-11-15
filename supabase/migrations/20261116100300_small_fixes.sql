-- Seller Home fixes, Task 3 (SH-033 and SH-001; documentation/seller-home-audit-2026-11-15.md).
--
-- 1. chat_unread_counts() leaves out chats the caller archived, so the Chats badge counts what the inbox's "All"
--    view shows (SH-033). Same signature and result shape.
-- 2. A new registration writes a notice (SH-001): nothing told a new seller their registration had arrived or what
--    happens next. Written for every submission, with text that follows its status. It must never fail the
--    registration, so any error is only raised as a warning.

create or replace function public.chat_unread_counts()
returns table(conversation_id uuid, other_id uuid, unread integer)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.id, case when c.user_a = auth.uid() then c.user_b else c.user_a end as other_id,
           coalesce(r.read_at, '-infinity'::timestamptz) as read_at
      from public.conversations c
      left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
      left join public.conversation_member_state ms on ms.conversation_id = c.id and ms.user_id = auth.uid()
     where auth.uid() is not null
       and (c.user_a = auth.uid() or c.user_b = auth.uid())
       and ms.archived_at is null
       -- cheap first cut: nothing has happened since it was read
       and c.last_message_at > coalesce(r.read_at, '-infinity'::timestamptz)
  )
  select x.id, x.other_id, x.n
    from (
      select mine.id, mine.other_id,
             (select count(*)::integer from (
                select 1 from public.messages m
                 where m.conversation_id = mine.id
                   and m.created_at > mine.read_at
                   and m.sender_id is distinct from auth.uid()
                 limit 100) l) as n
        from mine
    ) x
   where x.n > 0;
$$;

create or replace function admin.registration_received_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status = 'registered' then
      perform public.notify(new.vendor_id, 'registration_received', 'Your registration is in',
        'We''re checking your documents (usually 3–5 days). Your first listing goes live after review (24–48 hours).',
        null);
    elsif new.status = 'pending_review' then
      perform public.notify(new.vendor_id, 'registration_received', 'Waiting for Cosora''s approval',
        'We''ll tell you when your registration is approved.', null);
    end if;
  exception when others then
    raise warning 'registration_received_notice: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function admin.registration_received_notice() from public, anon, authenticated;

drop trigger if exists trg_vendor_registrations_notice on public.vendor_registrations;
create trigger trg_vendor_registrations_notice
  after insert on public.vendor_registrations
  for each row execute function admin.registration_received_notice();

do $$
begin
  if position('archived_at' in pg_get_functiondef('public.chat_unread_counts()'::regprocedure)) = 0 then
    raise exception 'chat_unread_counts self-check: archived chats must be left out';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_vendor_registrations_notice') then
    raise exception 'registration notice self-check: trigger missing';
  end if;
end $$;
