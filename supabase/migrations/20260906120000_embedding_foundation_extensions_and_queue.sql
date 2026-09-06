-- Product semantic search — shared foundation (Phase 0).
--
-- pgvector 0.8.2 is what makes halfvec(1536) available: half-precision floats
-- halve the index footprint versus vector(1536) at no measurable recall cost
-- for OpenAI embeddings, and the HNSW opclass (halfvec_cosine_ops) exists only
-- from pgvector 0.7.
--
-- The embedding pipeline is a queue, not an inline call, because an OpenAI
-- round-trip inside a product INSERT would put a third-party API on the
-- critical path of a vendor saving a listing. pgmq holds the job; pg_cron +
-- pg_net drain it out-of-band.
--
-- Where these land on Supabase (verified post-install, not assumed):
--   vector, pg_trgm -> extensions   (already on the DB search_path)
--   pgmq            -> pgmq
--   pg_cron         -> pg_catalog, scheduling API under the `cron` schema
--   pg_net          -> registered against public, FUNCTIONS under `net`
-- That last one is the trap: the extension's namespace and its callable
-- functions are not the same schema, so the cron poller calls net.http_post.

create extension if not exists vector      with schema extensions;
create extension if not exists pg_trgm     with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Durable job queue for embedding work. A message is archived only after the
-- row is successfully updated, so a failed OpenAI call leaves the job in-queue
-- for the next cron poll to retry.
select pgmq.create('embedding_jobs');
