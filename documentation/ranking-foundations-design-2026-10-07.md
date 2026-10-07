# Personalised ranking, Part 1: Foundations — design

**Status:** design approved by Mitra in chat, 2026-10-07 ("approve and start the spec and then get to work"). Part 1
of three: **Foundations → Fit (Part 3) → Standing (Part 2)**. Ranking itself does not change in Part 1; Parts 3 and 2
read what it stores.

## The decisions (Mitra, 2026-10-06/07)

| Question | Decision |
|---|---|
| Where vendor ranking is used | Two scores. **Fit** (vendor ↔ requirement) orders each vendor's lead feed; every vendor still sees every lead. **Standing** (reviews, traffic, activity, company type, trust) ranks vendors for buyers: suggested suppliers on a requirement, quote order in My Quotes, search. |
| Location | The vendor's base location (profile) plus optional "states I serve", against the buyer's profile location. The requirement form never asks for a delivery city. |
| Buyer location source | The buyer's profile city/state. When missing, location is neutral for that requirement; a gentle nudge on the profile and My Quotes (shipping with Part 3, when location starts to count), never on the requirement form. |
| "How often and how many people" | Both: buyer interest (unique buyers, repeat visits) weighted more; vendor activity (how often they answer requirements, how fast). Part 2. |
| Category attributes | Vendors fill them on products; the requirement form shows the same category's attributes as optional fields. |
| Company type | One required primary type plus optional capability tags. |
| Capacity | Per category family, a monthly number in that family's unit. Optional; scale is neutral when missing. |
| Attribute definitions | Per family, in a table super admins edit in Cosora-Admin. |
| Order | Foundations → Fit → Standing, each with its own spec, plan and release. |

## What the code and data show (2026-10-07)

- **Both forms already ask category questions, and both throw most answers away.**
  - The product form (`Upload.tsx`) builds its fields from `src/data/sellerCategories.ts`: 16 top-level seller
    categories with several hundred field definitions (fabric composition and width for raw materials, material for
    packaging, turnaround for services, and so on). On save it keeps only the 13 fields that have a `products` column
    (fabric, GSM, fit, gender, sizes, colour, pattern, occasion, neck, sleeve, collar, origin, waist sizes, lengths).
    The rest is discarded.
  - The requirement form (`PostRequirement.tsx`) asks one of 12 question sets per category. On save it extracts a
    title, quantity and budget by guessing at key names, and keeps the description. The rest is discarded.
  - The two forms use different keys for the same idea, so a requirement and a product can't be compared on them.
- **Vendor profile:** `state` is free text and filled for 3 of 11 vendors; `capacity` holds buyer-facing bands
  (Small-batch, Medium, Large, Export-grade), set for 1 of 11; `business_type` is "Manufacturer" for 6 of 11;
  `category` holds business labels in four groups (Manufacturer, Trader/Wholesaler, Retailer, Services), set for 4.
- **Buyer profile:** city or state for 1 of 10. Sign-up offers device location (BigDataCloud) but it's optional.
- **No canonical list of states** ("this project has no gazetteer", `AccountInfo.tsx`).
- `products.search_text` / `fts` and `rfqs.search_text` are generated columns, and the embedding triggers fire on a
  fixed column list. Postgres 17 can change a generated column's expression in place (`SET EXPRESSION`).
- `vendor_profiles` exposes columns one by one (35 column grants since the PII revoke); a new public column needs
  its own grant.

## Refinements to the chat design

1. **Families are the 16 existing top-level seller categories**, not nine new ones. Their fields already exist, so
   they seed the definitions table instead of a fresh draft. Mitra or Andy reviews them in the admin page.
2. **Company types follow the existing business groups**: Manufacturer, Trader/Wholesaler, Retailer, Job worker,
   Service provider, Freelancer. The detailed business labels stay as they are (category search reads them).
3. **Part 1 ships as three releases**, F1 first, because F1 stops data being lost today.

## F1 — Keep what the forms already collect

- `products.attributes` and `rfqs.attributes`, `jsonb`, default `{}`: an object of scalar or string-array values,
  at most 8 KB.
- The product form saves every field it asks that has no column of its own into `attributes`, keyed by the field's
  existing id; editing a product loads them back into the form.
- The requirement form saves its category answers into `rfqs.attributes`, keyed by its existing question keys,
  alongside today's title, quantity and budget.
- Attribute values join `search_text` (and `fts` for products) through an immutable helper, and both embedding
  triggers fire when `attributes` changes, so keyword search and text matching use them at once.
- A vendor's lead card and Cosora-Admin's lead detail show the requirement's details, so vendors see what the buyer
  actually asked.
- No question is added, removed or reworded in F1.

## F2 — Who the vendor is, and where

- **States:** `public.india_states` (36 rows: code, name, Hindi, Gujarati), readable by everyone.
- **Vendor profile:** `state_code`, `served_states` (codes), `primary_type`, `capabilities`, each with a public
  column grant.
  - Primary types: `manufacturer`, `trader_wholesaler`, `retailer`, `job_worker`, `service_provider`, `freelancer`.
  - Capabilities: `private_label`, `made_to_order`, `export_ready`, `sampling`, `sustainable`.
  - Backfill: a free-text state that names a state gets its code; business labels map to a type and capabilities
    ("Private Label Manufacturer" → manufacturer + private label; "Export-grade manufacturers" → manufacturer +
    export-ready; "Garment Wholesaler" → trader/wholesaler; and so on, one mapping table in the migration).
  - The business profile gets a state picker (required when the contact details are saved), "States I serve", a
    primary-type picker and capability chips. The free-text `state` keeps the picked state's name for display.
- **Capacity:** `public.vendor_capacity` (vendor, top-level category, monthly number). The unit comes from the
  category (garments: pieces; fabric: metres; yarn, chemicals: kg; services: projects or orders). Readable by the
  vendor and admins only; ranking reads it through a definer function. The buyer-facing capacity bands stay.
- **Buyer:** `buyer_profiles.state_code`; the buyer profile edit uses the same picker. The one-line nudge on the
  profile and My Quotes moved to Part 3: nothing reads buyer location until Fit ships, so "get nearby suppliers
  first" would promise something not yet live.

## F3 — One vocabulary, editable by admins

- `public.attribute_definitions`: top-level category, optional subcategory, key, label and Hindi/Gujarati labels,
  kind (text, number, choice, multiple choice, yes/no), options, unit, required, applies to (product, requirement),
  match weight, order, active. Seeded by a generated migration from `sellerCategories.ts`, so day one shows vendors
  exactly today's questions.
- The product form and buyer search facets read the definitions from the database, falling back to the code list
  if the read fails.
- The requirement form's category section is built from the same definitions (those that apply to requirements),
  all optional. Its core questions (quantity, budget, timeline, description, voice, images) stay. Keys F1 stored
  under the old question sets are mapped to the shared keys where they mean the same thing.
- A validation trigger refuses unknown keys and wrong value kinds from a browser once F3 ships.
- Cosora-Admin **Attributes** page (super admin): labels and translations, options, weights, new attributes,
  deactivate (never delete). Every change in the Admin Log.

## Not in Part 1

- No ranking change. Part 3 (Fit) reads attributes, location, served states, capacity and company type; Part 2
  (Standing) reads reviews, traffic, activity, company type and trust.

## Testing

Each release: a self-rolling-back SQL harness (`scripts/ranking/`), the migration's self-check, the local stack,
typecheck, i18n, lint, and a local browser spec. Ask Mitra before every production apply and every merge.

## For Mitra or Andy to review later

- The seeded attribute lists (today's form questions) in the F3 admin page.
- The wording of the primary types and capability tags.
