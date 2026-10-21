-- The rest of the 2026-10-21 vendor audit, database half (Mitra: "now fix the items which are left").
--
--   #11 A seller is told when Cosora approves or rejects their listing, video or catalogue. Cosora-Admin
--       moderates with a plain status update (lib/moderation.ts), and nothing told the seller: a rejected
--       listing just turned up as "Draft" with no reason. admin.notify_moderation_outcome() runs after a
--       status change made by staff: under review → live is "approved", → rejected is "not approved" with the
--       moderator's reason. A listing Cosora removes (admin_product_remove) already sends its own notice, so it
--       is skipped here; changes the seller or the plan system makes are not staff's and send nothing.
--   Low: quotes.updated_at, set by the database when the seller revises a quote's terms (price, MOQ, lead time,
--       sampling, fabric, comment, currency). My Quotes showed the first send date as "Last updated". Null until
--       the first revision; the client can't set it.

do $pin$
begin
  if to_regprocedure('admin.notify_moderation_outcome()') is not null
     or to_regprocedure('public.quotes_touch_updated_at()') is not null then
    raise exception 'pre-check: this migration has already run';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'quotes' and column_name = 'updated_at') then
    raise exception 'pre-check: quotes.updated_at already exists';
  end if;
  if to_regprocedure('public.notify(uuid,text,text,text,uuid)') is null then
    raise exception 'pre-check: public.notify(uuid,text,text,text,uuid) is missing';
  end if;
end
$pin$;

-- ── #11 ────────────────────────────────────────────────────────────────────────────────────────────────────
create function admin.notify_moderation_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row    jsonb := to_jsonb(new);
  v_what   text;
  v_kind   text;
  v_name   text;
  v_reason text;
begin
  if new.status::text is not distinct from old.status::text or not coalesce(public.is_admin(), false) then
    return null;
  end if;
  if tg_table_name = 'products' then
    if new.removed_at is not null then
      return null; -- admin_product_remove sends its own notice
    end if;
    v_what := 'listing';   v_kind := 'product';   v_name := v_row ->> 'name';
  elsif tg_table_name = 'catalogues' then
    v_what := 'catalogue'; v_kind := 'catalogue'; v_name := v_row ->> 'title';
  else
    v_what := 'video';     v_kind := 'video';     v_name := v_row ->> 'brand_line';
  end if;
  v_name := case when nullif(btrim(v_name), '') is null then '' else '"' || btrim(v_name) || '"' end;

  if new.status::text = 'live' and old.status::text = 'under_review' then
    perform public.notify(new.vendor_id, v_kind || '_approved', 'Your ' || v_what || ' is live',
      case when v_name = '' then 'It passed review. Buyers can see it now.'
           else v_name || ' passed review. Buyers can see it now.' end);
  elsif new.status::text = 'rejected' then
    v_reason := coalesce(nullif(btrim(v_row ->> 'rejection_reason'), ''), 'No reason was given.');
    perform public.notify(new.vendor_id, v_kind || '_rejected', 'Your ' || v_what || ' wasn''t approved',
      case when v_name = '' then '' else v_name || ': ' end || v_reason || ' Edit it and send it for review again.');
  end if;
  return null;
end
$function$;
revoke all on function admin.notify_moderation_outcome() from public, anon, authenticated;

create trigger trg_products_moderation_notice
  after update of status on public.products
  for each row execute function admin.notify_moderation_outcome();
create trigger trg_product_videos_moderation_notice
  after update of status on public.product_videos
  for each row execute function admin.notify_moderation_outcome();
create trigger trg_catalogues_moderation_notice
  after update of status on public.catalogues
  for each row execute function admin.notify_moderation_outcome();

-- ── quotes.updated_at ──────────────────────────────────────────────────────────────────────────────────────
alter table public.quotes add column updated_at timestamptz;

create function public.quotes_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.updated_at := null;
  elsif (new.price_per_unit, new.price_inr, new.moq, new.lead_time, new.sampling_cost, new.sample_timeline,
         new.fabric, new.comment, new.currency)
        is distinct from
        (old.price_per_unit, old.price_inr, old.moq, old.lead_time, old.sampling_cost, old.sample_timeline,
         old.fabric, old.comment, old.currency) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end
$function$;
revoke all on function public.quotes_touch_updated_at() from public, anon, authenticated;

create trigger trg_quotes_updated_at
  before insert or update on public.quotes
  for each row execute function public.quotes_touch_updated_at();

-- ── Self-checks ────────────────────────────────────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from pg_trigger
       where tgname in ('trg_products_moderation_notice', 'trg_product_videos_moderation_notice', 'trg_catalogues_moderation_notice')) <> 3 then
    raise exception 'self-check: the three moderation notice triggers are not all there';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_quotes_updated_at' and tgrelid = 'public.quotes'::regclass) then
    raise exception 'self-check: trg_quotes_updated_at is missing';
  end if;
  if (select prosecdef from pg_proc where oid = 'admin.notify_moderation_outcome()'::regprocedure) is not true then
    raise exception 'self-check: notify_moderation_outcome is not security definer';
  end if;
end
$check$;
