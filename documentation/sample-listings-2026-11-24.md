# Sample listings — plan and record (2026-11-24)

Mitra asked for "dummy listings with all the information, 10 products in each category". Asked where and how, Mitra
first chose unlabelled listings from invented sellers on the live site with photos taken from the internet. That was
declined: real buyers would send requirements and chats to businesses that don't exist, Meta was reviewing the
company's identity at the time, and internet photos belong to other brands and photographers. Mitra then chose
**option 1: labelled samples on the live site.**

## What is live

- **28 sample sellers, one per main category, 10 listings each (280).** Ten is the Free plan's cap, so none can ever
  be paused. Sub-categories are spread inside each main category.
- **Labelled everywhere:**
  - the store name ends "(Sample)" and its About text says it isn't a real business;
  - every listing name starts "Sample ·" and every description opens with "Sample listing: this shows how a listing
    looks on Cosora. It isn't for sale, and its seller can't be contacted.";
  - the product and store pages show a "Sample listing" / "Sample store" notice (`<SampleListingNotice>`);
  - the shared feed card and New Arrivals' cards show "Sample listing · not for sale" where Call Now would be.
- **Nobody can reach a sample seller.** The database refuses a chat, a requirement sent to one, and a review of one
  or its listings (`admin.refuse_sample_contact`, migration `20261124120000`). Sample sellers have no phone, WhatsApp,
  GSTIN, PAN or verified badge, and their auth accounts are banned, so nobody signs in as one. Every Call button
  (`useCallVendor()`) says "Sample listing" and dials nothing; Chat, Call and review buttons are hidden on their pages.
- **Photos are Cosora's own category pictures** (`src/assets/categories/tiles/…`), uploaded to
  `product-images/<seller>/samples/`. Several listings share a picture.
- They were added by Cosora directly, so they skipped product moderation; they are Cosora's own content.

## Files

- `supabase/migrations/20261124120000_sample_listings_guard.sql`: `admin.sample_vendors`, `is_sample_vendor()`,
  `sample_vendor_ids()`, the contact guard.
- `scripts/samples/sample_data.py`: the sellers and listings. `build.py` generates
  `seed-sample-listings.sql`, `remove-sample-listings.sql` and the photo folder. Edit the data and rebuild; never edit
  the generated SQL.
- App: `src/lib/samples.ts`, `<SampleListingNotice>` in `src/components/buyer/SampleProfile.tsx`, and the card, product,
  store and call changes.

## Removing them

Run `scripts/samples/remove-sample-listings.sql` (CLI `db query --linked --file`), then delete
`product-images/<seller>/samples/` for the 28 sellers it lists. The guard and the app code can stay: with no sample
sellers they do nothing.

## Open

- Real sellers rank above samples only when they're on a paid plan; on Free they mix in the feeds by recency.
- Trends, Sale, Search Results, Recently Viewed and saved collections keep their own Call Now buttons on sample cards;
  the "Sample ·" name labels them, and a tap says it's a sample instead of calling.
