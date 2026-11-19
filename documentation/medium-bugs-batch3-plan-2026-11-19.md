# Medium bugs, batch 3 of 4: quotes, chat, profile, Seller Home (2026-11-19)

Items: M-39, M-40, M-41, M-42, M-44, M-45, M-46, M-47, M-49, M-50, M-51, M-52, M-65, M-66, M-67, M-70, M-71, M-72,
M-73, M-74. Branch `fix/medium-batch3-2026-11-19` from main `1220ed7` (batches 1 and 2 plus the unpushed follow-up).

## Mitra's decision (2026-11-19)
- M-50 "Show to chat sellers": a buyer's web links show on the buyer card a seller gets once the buyer has written to
  them in a chat, never while blocked (`chat_buyer_social()`, the same rule as `chat_buyer_card()`).

## Decided without asking
- M-39: My Quotes' "Payment Terms" box saved nothing; it is gone ("Agree payment terms with the seller in chat").
- M-40: no invented "Avg. response ~2 hours"; a seller with no reviews reads "No reviews yet"; an unknown sampling cost
  reads "Not specified", never ₹0.
- M-41: My Quotes reads the newest 200 requirements, throws on every read, and reads ids in groups (20 for quotes and
  covers, so PostgREST's 1,000-row cap can't cut a group).
- M-42: signed out, loading and a failed first read are their own screens; a failed refresh keeps the page.
- M-44/M-45: with the hub live, a "chat" event refreshes the chat list and the open thread, which keeps no
  postgres_changes channel of its own (support threads still do; their rollout is off).
- M-46: `chat_unread_counts()` reads the caller once.
- M-47: the profile phone (what a seller dials) is a 10-digit Indian mobile or a +country number, stored as E.164;
  the database checks a browser's new or changed value (`admin.profiles_phone_check`).
- M-49: settings pages never save over a read that failed or hasn't arrived.
- M-51: the Privacy Policy says how deletion is asked for while the code can't be sent (call Support).
- M-52: Regional settings no longer write `regional.language`.
- M-65: Recent Leads puts direct requests the seller hasn't quoted on first.
- M-66/M-67: Seller Home re-reads after KYC, a delete, registration and review notices; a failed refresh keeps the
  page with a note.
- M-70/M-71/M-72: the registration and Seller Home banners are drawn by the app (the pictures said "0% commission",
  "only 10 minutes", "proven strategies" and showed another marketplace's app); My Store doesn't promise verification.
- M-73: the next step skips what Cosora is reviewing; M-74: Seller Home rows open from the keyboard.

## Database
- `20261119120000_medium_batch3.sql`: `chat_unread_counts()`, `seller_home_summary()` recent leads order (string
  replace on the live body, anchored), `chat_buyer_social(uuid)`, `admin.profiles_phone_check` (definer; insert and
  update of phone).
