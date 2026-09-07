-- Backfill: enqueue every live reel that predates its embedding trigger.
--
-- Exactly one row today. That is not a reason to skip it and not a reason to
-- gate it: the trigger only fires on write, so a row seeded before the trigger
-- existed is never going to embed on its own, whether there is one of them or a
-- thousand. Volume is a product problem (get vendors uploading), not a schema
-- problem, so there is deliberately no "wait until N videos exist" condition
-- anywhere in this migration — the pipeline is correct at n=1 and correct at
-- n=10000.
--
-- Same predicate shape as 20260907120300, with one addition: status = 'live'.
-- That mirrors enqueue_video_embedding rather than the products backfill, which
-- enqueues every status on purpose (a draft product promoted to live later never
-- re-enqueues, because the products trigger lists text columns only). Videos do
-- not need that hedge — status IS in the video trigger's column list, so a reel
-- approved later enqueues itself at the moment of approval.
--
-- Cost: one row through text-embedding-3-small. It stays queued and costs
-- nothing at all until OpenAI billing is active — see 20260907120300 for the two
-- operator secrets still outstanding, which block this row exactly as they block
-- the other 35.
select pgmq.send('embedding_jobs', jsonb_build_object(
         'table', 'product_videos', 'id', v.id,
         'text',  public.build_video_search_text(v)))
from public.product_videos v
where v.status = 'live'
  and v.embedding is null
  and nullif(trim(coalesce(public.build_video_search_text(v), '')), '') is not null;
