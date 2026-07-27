-- Structured chat messages that reference a quote request / quote reply.
-- messages.kind is free-text (default 'text'), so "quote_request" and "quote_reply"
-- need no enum migration; they are new string values used by app code only.
alter table public.messages
  add column if not exists rfq_id uuid null references public.rfqs(id),
  add column if not exists quote_id uuid null references public.quotes(id);

comment on column public.messages.rfq_id is
  'Set on kind = quote_request messages: the targeted RFQ this message announces.';
comment on column public.messages.quote_id is
  'Set on kind = quote_reply messages: the vendor quote this message announces.';

create index if not exists messages_rfq_id_idx on public.messages (rfq_id) where rfq_id is not null;
create index if not exists messages_quote_id_idx on public.messages (quote_id) where quote_id is not null;
