# Low bugs, batch 1 of 6: buyer Home and feeds (2026-11-20)

Items: L-01–L-08, L-10–L-17, L-19, L-20, L-22, L-23. Branch `fix/low-batch1-2026-11-20` from main `52d4e50`. No
migration. The other batches: 2 listings, store and browsing content (L-09, L-18, L-21, L-24–L-37); 3 requirements,
chats, help and profile (L-38–L-52); 4 sign-up and onboarding (L-53–L-71); 5 Seller Home (L-72–L-85); 6 database and
routes (L-86–L-104).

## Mitra's decision (2026-11-20)
- L-06: "the new ins of the paid plan holders will be shown first". Today's New In keeps paid-plan sellers' new
  listings first (the `newest` boost of `feed_products`), and its heading stays.

## Decided without asking
- L-01: the bottom bar's Home is lit on every Home tab (`homeTabOf()`).
- L-02, L-15, L-23: one tab strip, `<HomeTabs>`, on all five Home pages (four had their own copy). The open tab
  carries the "✦" and `aria-current`; a tab tap replaces the history entry; "FOLLOWING", 11 px with 8 px gaps below
  640 px so the five fit a 360 px phone.
- L-03: past `feed_products`' depth (984 listings) the feed says "That's the newest 984. Browse by category for more",
  not "You've seen everything new" (`useFeed().capped`).
- L-04: each page after the first re-reads the last 4 listings of the one before (dropped as duplicates), so a listing
  that moves up between two pages isn't skipped.
- L-05: a drag over the carousel no longer ends in a click on the slide.
- L-07: Following's feed takes the 500 most recently followed sellers (`feed_products`' limit; it was the first 500 by
  id) and says so when there are more.
- L-08: one rating chip, `<RatingChip>`: nothing without a rating, "4.2" with one; the unlabelled enquiry count went.
- L-10: the menu drawer is a dialog (`Sheet`: focus, Escape, "Menu"); labels on the logo, Saved, menu and grid buttons.
- L-11: "Looking for these?" cards' photo is a link a keyboard reaches.
- L-12: Save sits beside the photo's link on every product card and the carousel, not inside it.
- L-13: the carousel has a pause / play button.
- L-14: a laptop's top bar has Chats with the unread count (the phone's bottom bar has it); Brand Picks' arrow went
  (there is no page of all Brand Picks).
- L-16: the spotlight query runs only when the switch is on for the visitor.
- L-17: the bell and the chat badge wait up to 5 s for the live-updates hub before opening their own channels.
- L-19: fabric, GSM and fit show only what the listing states (`<CardSpecs>`); Sale's and Trends' cards keep Call Now
  at the bottom, so a row's cards line up.
- L-20: the carousel's side cards are less faded on a laptop; the Video Close-Ups row ends in "Watch all Video
  Close-Ups".
- L-22: "Looking for products?" once on Home per device (after 5 rows), not every 5 rows.

## Checked on the local stack (browser)
At 360 px all five tabs fit on every Home page with the open one marked; switching tabs adds no history entries; Home
lit on Sale; no button inside a link; no "0" or "0.0" chips; no "GSM: —"; the drawer is a dialog named Menu with focus
inside, and Escape closes it; the pause button; one requirement card on a phone and on a laptop; no spotlight request
for a visitor the switch is off for; signed in on a laptop "Chats, 11 unread"; a drag stays on Home and a click opens
the product; no page errors. tsc, i18n 8256/8256, lint, build.
