-- Product semantic search — schema (Phase 1).

-- ── Why this wrapper exists ──
-- array_to_string() is STABLE, not IMMUTABLE (its generic anyarray signature
-- can't promise the element type's output function is immutable), and a stored
-- generated column requires an IMMUTABLE expression. For text[] with a literal
-- separator the operation genuinely is immutable, so a thin wrapper that says
-- so is the standard escape hatch. Do not widen this to other element types.
create or replace function public.immutable_array_to_string(arr text[], sep text)
returns text language sql immutable parallel safe as 'select array_to_string(arr, sep)';

-- ── category_name: denormalised so the generated columns can see it ──
-- category is the best-populated signal on this table (100% of rows), but a
-- generated column cannot run a subquery, so the name has to live on the row.
alter table public.products add column if not exists category_name text;

create or replace function public.sync_product_category_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is null then
    new.category_name := null;
  else
    select c.name into new.category_name from public.categories c where c.id = new.category_id;
  end if;
  return new;
end $$;

-- SECURITY DEFINER: categories has RLS, and this lookup must resolve the same
-- way for a vendor inserting a listing as for an admin editing one.
drop trigger if exists trg_products_sync_category_name on public.products;
create trigger trg_products_sync_category_name
before insert or update of category_id on public.products
for each row execute function public.sync_product_category_name();

update public.products p set category_name = c.name
from public.categories c where p.category_id = c.id;

-- ── Search columns ──
-- fts inlines the whole expression rather than reading search_text because
-- Postgres forbids one generated column referencing another. The duplication is
-- deliberate and safe: both derive from the same own-row columns, so they can
-- never drift.
alter table public.products add column search_text text
generated always as (
  coalesce(name,'') || ' ' || coalesce(description,'') || ' ' ||
  coalesce(fabric,'') || ' ' || coalesce(gsm,'') || ' ' ||
  coalesce(fit_type,'') || ' ' || coalesce(colour,'') || ' ' ||
  coalesce(public.immutable_array_to_string(pattern,' '),'') || ' ' ||
  coalesce(public.immutable_array_to_string(occasion,' '),'') || ' ' ||
  coalesce(neck_type,'') || ' ' || coalesce(sleeve_type,'') || ' ' ||
  coalesce(collar_type,'') || ' ' || coalesce(category_name,'')
) stored;

alter table public.products add column fts tsvector
generated always as (to_tsvector('english',
  coalesce(name,'') || ' ' || coalesce(description,'') || ' ' ||
  coalesce(fabric,'') || ' ' || coalesce(gsm,'') || ' ' ||
  coalesce(fit_type,'') || ' ' || coalesce(colour,'') || ' ' ||
  coalesce(public.immutable_array_to_string(pattern,' '),'') || ' ' ||
  coalesce(public.immutable_array_to_string(occasion,' '),'') || ' ' ||
  coalesce(neck_type,'') || ' ' || coalesce(sleeve_type,'') || ' ' ||
  coalesce(collar_type,'') || ' ' || coalesce(category_name,'')
)) stored;

alter table public.products add column embedding extensions.halfvec(1536);

create index products_fts_idx  on public.products using gin (fts);
create index products_trgm_idx on public.products using gin (search_text extensions.gin_trgm_ops);

-- ── Embedding enqueue ──
-- An OpenAI round-trip must never sit on the critical path of a vendor saving a
-- listing, so the trigger only drops a job on the queue; pg_cron drains it.
create or replace function public.enqueue_product_embedding()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A listing with no text at all has nothing to embed. Skipping it here is
  -- what makes "embedding is null" mean "pipeline hasn't run yet" rather than
  -- "this row is empty", which Phase 5's completeness check relies on.
  if new.search_text is null or length(trim(new.search_text)) = 0 then
    return null;
  end if;
  perform pgmq.send('embedding_jobs', jsonb_build_object(
    'table', 'products', 'id', new.id, 'text', new.search_text));
  return null;
end $$;

-- category_id is in the column list so that recategorising a product re-embeds
-- it, and so the categories-rename cascade below actually reaches this trigger.
drop trigger if exists trg_products_enqueue_embedding on public.products;
create trigger trg_products_enqueue_embedding
after insert or update of
  name, description, fabric, gsm, fit_type, colour,
  pattern, occasion, neck_type, sleeve_type, collar_type, category_id
on public.products
for each row execute function public.enqueue_product_embedding();

-- ── Category rename cascade ──
-- Renaming a category has to reach every product filed under it, or
-- category_name (and therefore search_text, fts and the embedding) goes stale.
-- `set category_id = category_id` is a deliberate no-op write: UPDATE ... OF
-- fires on the columns NAMED in the statement, not on the ones whose values
-- changed, so this re-triggers both the sync and the enqueue above.
-- Verified against this database: the no-op write does produce a queue job.
create or replace function public.cascade_category_rename()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.products set category_id = category_id where category_id = old.id;
  return null;
end $$;

-- SECURITY DEFINER because the admin renaming a category is not necessarily a
-- product_moderator, and products' UPDATE policy would otherwise reject the
-- cascade. The WHEN guard keeps a no-change UPDATE from fanning out.
drop trigger if exists trg_categories_cascade_rename on public.categories;
create trigger trg_categories_cascade_rename
after update of name on public.categories
for each row when (new.name is distinct from old.name)
execute function public.cascade_category_rename();
