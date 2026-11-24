# Sample listings — plan and record (2026-11-24)

Mitra asked for "dummy listings with all the information, 10 products in each category". Asked where and how, Mitra
first chose unlabelled listings from invented sellers on the live site with photos taken from the internet. That was
declined: real buyers would send requirements and chats to businesses that don't exist, Meta was reviewing the
company's identity at the time, and internet photos belong to other brands and photographers. Mitra then chose
**option 1: labelled samples on the live site.**

**Unlabelled for pre-launch testing (Mitra, 2026-11-24):** "remove the sample listing from all the 280 posts ... the
app is not open for customers so this won't affect and will show how it will actually look for customer for testing".
The labels described below are switched off (`SAMPLES_LABELLED` in `src/lib/samples.ts`, `LABELLED` in
`scripts/samples/details.py`): store names lose "(Sample)" and get a plain About line, listing names lose "Sample ·",
descriptions lose the notice, and the product page, store page and cards show no sample notice or tag. Chat and Call
show as usual and say "Not taking enquiries yet"; reviews stay hidden. The contact guard is unchanged. **Every sample is
removed before Cosora opens to customers** (ToDo.md; securityflags.md 2026-11-24). Setting both switches to true and
applying `update-sample-details.sql` puts the labels back.

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
- **Photos: 140 listings have a photo of their own, the other 140 keep Cosora's category picture** (Mitra,
  2026-11-24, "get the images from internet"; Pexels issues no keys; LIVE 2026-11-24, main 268d915, photos uploaded
  and `update-sample-details.sql` applied with the CLI, not in the ledger).
  The photos are openly licensed files from Wikimedia Commons only: public domain, CC0, CC BY or CC BY-SA, never
  non-commercial or no-derivatives, and not files Commons marks as showing a trademark, insignia or a person's
  likeness. Each was chosen by eye from contact sheets, and left out when it showed an identifiable model (it reads as
  an endorsement), another brand's name or shop (`BRAND_TITLES`), or anything suggestive (`UNSAFE`). Each is resized
  to at most 1200 px, stored at `product-images/<seller>/samples/listing-<nn>.jpg` and credited at the end of its
  description (author, licence, source page, "resized"); `scripts/samples/photo-sources.json` keeps the record.
  A listing with nothing fitting on Commons (most services, software, chemicals and many garments) keeps its category
  picture (`<group>-<slug>.jpg`).
  - How: `fetch_photos.py` takes each listing's searches (`photo_queries.py`; a "Category:<name>" entry names a
    Commons category), looks in Commons categories first, then file titles, then free text, draws contact sheets
    (`sheets`), records picks (`choose n:k`) and downloads them (`final`) as Wikimedia's standard thumbnails (the
    original-file server refuses scripts with 429). Commons limits an unidentified client to about one call every
    two seconds and answers 429 with Retry-After beyond that; `curl_json` waits as told.
- They were added by Cosora directly, so they skipped product moderation; they are Cosora's own content.

## Every detail filled (Mitra, 2026-11-24)

"Make sure every listing has all the descriptions filled": every question the listing form asks of a listing's
category (`attribute_definitions`, form 'product': the seller type's base questions, the category's and the
sub-category's) is answered, 2,180 answers over 280 listings, saved the way the form saves them: a question with a
column of its own in that column, the rest in `products.attributes`. Garments also get pattern, occasion, neck, sleeve,
collar, waist sizes and lengths. Each description is the notice, the listing's own text, the store, and a "Key details"
list (material, sizes, colours, price, minimum order, lead time or turnaround, customisation, where it's made).

- **Credentials are never answered** (certifications, licences, test reports, an INCI list): a sample seller holds none,
  and an unanswered question shows nothing. A question none of the options fits truthfully is left blank too.
- Answers come, in order, from: a listing's hand-written answers (`attr_extra.py`, `EXTRA_BY_NAME` then the
  corrections in `EXTRA_CHECKED`), a category-wide answer where it fits the options, the listing's own fields, the
  category's rules (`attr_rules.py`), then an option the listing's text names in full (`attr_fill.py`). Every answer
  was read against its listing on 2026-11-24, and wrong ones were corrected by hand.
- The questions are a snapshot in `scripts/samples/data/` (read from production 2026-11-24). `details.py` writes
  `update-sample-details.sql` (by fixed id, sample sellers only), and `build.py` puts the same into the seed; on the
  local stack the two gave identical rows for all 280.
- The product page now shows a listing's `attributes` under Product Specifications with the form's own labels
  (`src/lib/attributeSpecs.ts`, `useVocabulary()`), for every listing, not only samples; a row repeating a column's row
  shows once, and the description keeps its line breaks.

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
