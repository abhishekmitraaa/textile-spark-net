# Medium bugs, batch 1 of 4: buyer browsing (2026-11-19)

Source: `ToDo.md`, "Buyer-side review 2026-11-18" (75 Medium). Batches are grouped by feature:

| Batch | Feature | Items |
|---|---|---|
| 1 (this) | Home tabs, For You, Following, Search, Saves | M-02–M-11, M-15–M-20, M-26, M-27, M-30, M-38 |
| 2 | Frame, gate and Back; sign-up and registration; unregistered seller shell | M-01, M-12–M-14, M-28, M-29, M-43, M-48, M-53–M-64 |
| 3 | Requirements and quotes, chat, profile, Seller Home | M-39–M-42, M-44–M-47, M-49–M-52, M-65–M-67, M-70–M-74 |
| 4 | Speed and database | M-21–M-25, M-31–M-37, M-68, M-69, M-75 |

## Mitra's decisions (2026-11-19)
- M-08 "Hide brand": save it. A hidden follow is a mute: the buyer still follows (the seller keeps the follower), the
  brand's listings leave the Following feed, and Following › View All lists it with Unhide.
- M-16 "Save vendor": build saved sellers (My Saves › Sellers), apart from Follow.
- M-16 "Save search": remove the button.

## Decided without asking (obvious fixes)
- M-02: a new page opens at the top (push or replace to another path); Back keeps the browser's restore.
- M-03: For You's sign-up and first-run screens keep the Home tabs.
- M-04 / M-15: For You's place filter and Search Results' facets still filter loaded rows (documented design), but the
  page keeps loading pages until it has a screenful or the feed ends, and says "Looking through more listings…".
  Search Results with nothing typed asks the database for the price, rating, discount and popular orders
  (`feed_products` sorts) instead of sorting 96 rows.
- M-05: city aliases (Tiruppur/Tirupur, Bengaluru/Bangalore, Noida/Gurugram/Gurgaon/Ghaziabad/Faridabad as Delhi NCR,
  Navi Mumbai/Thane as Mumbai).
- M-06: "Reset preferences" asks first.
- M-07: Follow / Unfollow / Hide toast only after the database said yes.
- M-09: Following's "Trusted Seal" filter and badge use `trustSealFromParts()` like every other card.
- M-10: Most Popular's controls offer gender and sort only (the seal filter is for followed brands).
- M-11: Following shows signed out, loading and error apart from "not following anyone".
- M-17: recent searches are kept on this device, per account (localStorage), at most 8.
- M-18 / M-19 / M-20: Saves have a sync state (loading, ready, error with Retry); ids are read 100 at a time; every
  save, unsave, folder and Recently Viewed removal waits for the database and is undone on screen with a message when
  refused; /saved and /saved/:id show signed out, loading and error.
- M-26: one function, `my_followed_brands()`, returns the followed sellers with their live listing counts, seal parts
  and the hidden flag (no download of every listing).
- M-27: untrue copy replaced with what is true ("Mitra: Replace with honest copy", 2026-11-05).
- M-30: Following, Sale, Search Results and the seller page keep their filters in the address (replace), so Back
  returns to them; feeds don't refetch every loaded page when revisited within 5 minutes.
- M-38: `for_you_products` searches 200 candidates (`hnsw.ef_search = 200`, `hnsw.iterative_scan = strict_order`).

## Database
- `20261119100000_follows_hidden_saved_vendors.sql`: `follows.hidden_at` + update policy; `saved_vendors` table
  (own rows, `account_not_deleted`), `my_followed_brands()`, `for_you_products` settings; deletion sweep and data
  export include saved sellers.
