-- Help & Support: covering indexes for the four support foreign keys that the
-- performance advisor lists as unindexed (ToDo.md, 2026-10-01).
--
-- The first two also serve admin.support_rate_check(), which counts a sender's
-- messages and uploads by time on every send. Without them each send would scan
-- the whole table once it grows. All four tables are empty today (rollout off),
-- so a plain CREATE INDEX holds its lock for milliseconds.

create index if not exists support_messages_author_created_idx
  on public.support_messages (author_id, created_at);
create index if not exists support_attachments_uploader_created_idx
  on public.support_attachments (uploader_id, created_at);
create index if not exists support_ticket_staff_reviewed_by_idx
  on public.support_ticket_staff (reviewed_by);
create index if not exists support_tickets_category_idx
  on public.support_tickets (category);

-- Self-check: every foreign key on a support table now has an index whose first
-- column is the key's column.
do $check$
declare
  missing text;
begin
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ' order by 1)
    into missing
  from pg_constraint c
  where c.contype = 'f'
    and c.conrelid in (
      'public.support_tickets'::regclass, 'public.support_messages'::regclass,
      'public.support_attachments'::regclass, 'public.support_ticket_staff'::regclass,
      'public.support_callbacks'::regclass, 'public.support_events'::regclass,
      'public.support_fraud_details'::regclass)
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]);
  if missing is not null then
    raise exception 'support foreign keys still without a leading index: %', missing;
  end if;
end
$check$;
