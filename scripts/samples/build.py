"""Builds the sample-listings seed and removal SQL, and the folder of photos to upload (Mitra, 2026-11-24, option 1).

    python scripts/samples/build.py <photo-staging-dir>

Writes scripts/samples/seed-sample-listings.sql and scripts/samples/remove-sample-listings.sql, and copies each
picture a listing uses to <photo-staging-dir>/<seller id>/samples/<group>-<slug>.jpg, ready for
`supabase storage cp -r <dir>/<seller id> ss:///product-images/<seller id> --linked --experimental`.
Ids are fixed (uuid5), so running it again gives the same rows and paths.
"""
import json
import os
import shutil
import sys
import uuid

sys.path.insert(0, os.path.dirname(__file__))
from sample_data import CATEGORIES  # noqa: E402
import details  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
TILES = os.path.join(REPO, "src", "assets", "categories", "tiles")
STORAGE = "https://vxdhhgdfubqedfpwfyrb.supabase.co/storage/v1/object/public/product-images"
NS = uuid.UUID("6f1c2b0e-7a51-4c2e-9d0a-2026112401cc")  # Cosora sample listings, 2026-11-24


def q(v):
    """A SQL literal."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, list):
        return "array[" + ", ".join(q(x) for x in v) + "]::text[]"
    return "'" + str(v).replace("'", "''") + "'"


def main(stage, photos=None):
    seed, remove = [], []
    details.check_hand_tables()
    defs, cats_by_name = details.fill.load()
    vendors = []
    n_products = 0
    for ci, cat in enumerate(CATEGORIES, 1):
        brand, city, state_code, ptype, business = cat["seller"]
        assert brand.endswith("(Sample)"), brand
        assert len(cat["items"]) == 10, (cat["top"], len(cat["items"]))
        vid = str(uuid.uuid5(NS, "vendor:" + cat["top"]))
        vendors.append(vid)
        email = f"sample-seller-{ci:02d}@samples.cosora.invalid"
        about = details.store_about(brand, business, city, cat["top"])  # labelled or not: details.LABELLED
        seed.append(f"""
-- {ci:02d}. {cat['top']}: {brand}
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        banned_until, confirmation_token, recovery_token, email_change_token_new, email_change,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', {q(vid)}, 'authenticated', 'authenticated', {q(email)},
        '{{"provider":"email","providers":["email"],"cosora_sample":true}}'::jsonb,
        {q(json.dumps({"full_name": details.shown_brand(brand), "active_role": "seller"}))}::jsonb, now(), now(),
        '2999-01-01'::timestamptz, '', '', '', '', '', '', '', '');
update public.profiles set full_name = {q(details.shown_brand(brand))}, active_role = 'seller', onboarded = true where id = {q(vid)};
insert into public.vendor_profiles (id, brand_name, about, city, state, state_code, country, country_code,
                                    business_type, primary_type, category, onboarding_complete, is_verified)
values ({q(vid)}, {q(details.shown_brand(brand))}, {q(about)}, {q(city)},
        (select s.name from public.india_states s where s.code = {q(state_code)}), {q(state_code)}, 'India', 'IN',
        {q(business)}, {q(ptype)}, array[{q(business)}]::text[], true, false);
insert into admin.sample_vendors (vendor_id) values ({q(vid)});
insert into admin.registration_exempt (vendor_id, reason) values ({q(vid)}, 'Sample seller (2026-11-24): shows how Cosora looks; takes no orders.');""")
        top_id = f"(select c.id from public.categories c where c.parent_id is null and c.name = {q(cat['top'])})"
        for ii, item in enumerate(cat["items"], 1):
            sub, pic, name, price, moq, unit, extra, detail = item[:8]
            n_listing = n_products + 1
            if f"{cat['top']}:{ii}" in details.PHOTOS:
                # The listing's own photo (fetch_photos.py final <work>: <work>/final/<n>.jpg), 2026-11-24; a listing
                # with no fitting openly licensed photo keeps its category picture.
                assert photos, "photo-sources.json exists: pass the folder of chosen photos (fetch_photos.py final)"
                src = os.path.join(photos, f"{n_listing:03d}.jpg")
                fname = os.path.basename(details.photo_object(vid, ii))
            else:
                src = os.path.join(TILES, *pic.split("/")) + ".jpg"
                fname = pic.replace("/", "-") + ".jpg"
            assert os.path.isfile(src), f"missing picture {src}"
            dest = os.path.join(stage, vid, "samples", fname)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copyfile(src, dest)
            pid = str(uuid.uuid5(NS, f"product:{cat['top']}:{ii}"))
            cat_expr = (f"(select c.id from public.categories c where c.name = {q(sub)} and c.parent_id = {top_id})"
                        if sub else top_id)
            # Every detail (the form's answers, the apparel columns, the description): details.py, 2026-11-24.
            attrs, cols, description, _missing = details.details_for(cat, item, defs, cats_by_name, ii)
            col_names = ", ".join(details.DETAIL_COLUMNS)
            col_values = ", ".join(q(cols[c]) for c in details.DETAIL_COLUMNS)
            seed.append(f"""insert into public.products (id, vendor_id, name, description, price_value, currency, moq, unit, category_id,
  status, location, attributes, customization_available, {col_names})
values ({q(pid)}, {q(vid)}, {q(details.shown_name(name))}, {q(description)}, {q(price)}, '₹', {q(moq)}, {q(unit)}, {cat_expr},
  'live', {q(city)}, {q(json.dumps(attrs, ensure_ascii=False))}::jsonb, {q(extra.get('customization_available', False))},
  {col_values});
insert into public.product_images (product_id, url, position) values ({q(pid)}, {q(f'{STORAGE}/{vid}/samples/{fname}')}, 0);""")
            n_products += 1

    header = f"""-- Sample listings seed (Mitra, 2026-11-24, option 1). Generated by scripts/samples/build.py: edit sample_data.py
-- and run it again, never this file. Needs migration 20261124120000_sample_listings_guard.sql first, and the photos
-- uploaded to product-images/<seller>/samples/ (see build.py).
-- {len(vendors)} sample sellers, {n_products} listings. Remove everything with remove-sample-listings.sql.
begin;
"""
    check = f"""
-- Self-check: every listing has a category and a photo, every seller is registered as a sample.
do $check$
begin
  if (select count(*) from admin.sample_vendors) <> {len(vendors)} then
    raise exception 'samples: % sample sellers, expected {len(vendors)}', (select count(*) from admin.sample_vendors);
  end if;
  if (select count(*) from public.products p join admin.sample_vendors s on s.vendor_id = p.vendor_id
       where p.status = 'live' and p.category_id is not null) <> {n_products} then
    raise exception 'samples: a listing is not live or has no category';
  end if;
  if exists (select 1 from public.products p join admin.sample_vendors s on s.vendor_id = p.vendor_id
              where not exists (select 1 from public.product_images i where i.product_id = p.id)) then
    raise exception 'samples: a listing has no photo';
  end if;
  if exists (select 1 from public.vendor_profiles v join admin.sample_vendors s on s.vendor_id = v.id
              where {"v.brand_name not like '%(Sample)' or " if details.LABELLED else ""}v.is_verified or v.has_phone or v.gstin is not null) then
    raise exception 'samples: a sample seller is not labelled, or claims a phone, GSTIN or verification';
  end if;
end
$check$;
commit;
"""
    with open(os.path.join(HERE, "seed-sample-listings.sql"), "w", encoding="utf-8", newline="\n") as f:
        f.write(header + "\n".join(seed) + "\n" + check)

    ids = ",\n  ".join(q(v) for v in vendors)
    with open(os.path.join(HERE, "remove-sample-listings.sql"), "w", encoding="utf-8", newline="\n") as f:
        f.write(f"""-- Removes every sample seller and listing added by seed-sample-listings.sql (2026-11-24). Generated by build.py.
-- Then remove the photos: product-images/<seller>/samples/ for each seller below (Storage objects don't cascade).
begin;
create temp table sample_ids on commit drop as
  select s.vendor_id from admin.sample_vendors s where s.vendor_id in (
  {ids});
delete from public.product_images where product_id in (select p.id from public.products p where p.vendor_id in (select vendor_id from sample_ids));
delete from public.products where vendor_id in (select vendor_id from sample_ids);
delete from admin.registration_exempt where vendor_id in (select vendor_id from sample_ids);
delete from admin.sample_vendors where vendor_id in (select vendor_id from sample_ids);
delete from public.vendor_profiles where id in (select vendor_id from sample_ids);
delete from auth.users where id in (select vendor_id from sample_ids);
commit;
""")
    with open(os.path.join(stage, "vendors.txt"), "w") as f:
        f.write("\n".join(vendors))
    print(f"{len(vendors)} sellers, {n_products} listings; photos staged in {stage}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
