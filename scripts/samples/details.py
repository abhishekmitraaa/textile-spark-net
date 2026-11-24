"""Every detail of a sample listing (Mitra, 2026-11-24: "make sure every listing has all the descriptions filled").

    python scripts/samples/details.py      # writes scripts/samples/update-sample-details.sql

For each listing: the listing form's answers (fill.py), split the way the form saves them (a question with a column of
its own goes to that column, the rest to `products.attributes`, as Upload.tsx does), the apparel columns of a garment
(attr_rules.apparel_cols) and a full description. build.py writes the same into the seed, so the seed stays the source
of truth; the update SQL brings listings already in production up to it, by their fixed ids.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import attr_rules as R  # noqa: E402
import fill  # noqa: E402
from sample_data import CATEGORIES, NOTICE  # noqa: E402

# src/lib/formAttributes.ts PRODUCT_COLUMN_FIELDS: these answers are columns, never attributes.
PRODUCT_COLUMN_FIELDS = {
    "moq", "fabric", "gsm", "fit", "fit_type", "gender", "sizes", "colors", "color", "pattern", "occasion",
    "neckType", "sleeveType", "collarType", "originCountry", "waistSizes", "lengths", "location",
    "customizationAvailable",
}
# Answer key -> products column, for the columns the seed doesn't already set from the item.
ANSWER_COLUMNS = {
    "fabric": "fabric", "gsm": "gsm", "fit": "fit_type", "fit_type": "fit_type", "gender": "gender",
    "sizes": "sizes", "colors": "colour", "color": "colour", "pattern": "pattern", "occasion": "occasion",
    "neckType": "neck_type", "sleeveType": "sleeve_type", "collarType": "collar_type",
    "originCountry": "country_of_origin", "waistSizes": "waist_sizes", "lengths": "lengths",
}
ARRAY_COLUMNS = {"sizes", "pattern", "occasion", "waist_sizes", "lengths"}
DETAIL_COLUMNS = ["fabric", "gsm", "colour", "gender", "fit_type", "sizes", "country_of_origin", "pattern", "occasion",
                  "neck_type", "sleeve_type", "collar_type", "waist_sizes", "lengths"]

# The listing photos (fetch_photos.py final): "<top>:<index>" -> source and credit. Empty until photos are chosen.
_SOURCES = os.path.join(HERE, "photo-sources.json")
PHOTOS = json.load(open(_SOURCES, encoding="utf-8")) if os.path.exists(_SOURCES) else {}


def photo_object(vendor_id, index):
    """The listing photo's path in the product-images bucket."""
    return f"{vendor_id}/samples/listing-{index:02d}.jpg"


def photo_credit(src):
    """CC BY / BY-SA ask for the author, the licence, the source and any change; given for public domain too."""
    return f"Photo: {src['artist']}, {src['licence']}, via {src['source']} ({src['page']}); resized."


SINGULAR = {"pieces": "piece", "metres": "metre", "sets": "set", "pairs": "pair", "packs": "pack",
            "bottles": "bottle", "tubes": "tube", "bars": "bar", "products": "product", "listings": "listing",
            "parcels": "parcel", "units": "unit", "panels": "panel", "sheets": "sheet", "prints": "print",
            "cones": "cone"}


NOT_APPLICABLE = {"N/A", "None", "Not applicable"}


def _attr_value(v):
    """The form's cleaning (formAttributes.ts clean()): text trimmed, numbers as text, a ticked box true, blanks out.
    "N/A" is dropped too: a question that doesn't apply shows nothing on the listing."""
    if isinstance(v, str) and v.strip() in NOT_APPLICABLE:
        return None
    if isinstance(v, bool):
        return True if v else None
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        items = [str(x).strip() for x in v if str(x).strip()]
        return items or None
    s = str(v).strip() if v is not None else ""
    return s or None


def _col_value(col, v):
    if v is None or v == [] or v == "" or (isinstance(v, str) and v.strip() in NOT_APPLICABLE):
        return None
    if col in ARRAY_COLUMNS:
        return [str(x) for x in (v if isinstance(v, list) else [v])]
    return ", ".join(map(str, v)) if isinstance(v, list) else str(v)


def _price_line(price, unit):
    amount = f"{price:,}" if isinstance(price, int) else f"{price:,.2f}"
    if unit.startswith("%"):
        return f"Fee: {price}% of order value"
    if " / " in unit:
        a, b = unit.split(" / ", 1)
        return f"Price: ₹{amount} per {a} per {b}"
    return f"Price: ₹{amount} per {SINGULAR.get(unit, unit)}"


def _moq_line(moq, unit):
    if unit.startswith("%"):
        return None
    m = str(moq).strip()
    if not m:
        return None
    if " / " in unit:
        unit = unit.split(" / ", 1)[0]
    word = unit if m != "1" else SINGULAR.get(unit, unit)
    return f"Minimum order: {m} {word}" if m.replace(",", "").isdigit() else f"Minimum order: {m}"


# Unlabelled while Cosora isn't open to customers (Mitra, 2026-11-24: "remove the sample listing from all the 280
# posts ... the app is not open for customers ... will show how it will actually look"). The stores and listings read
# like real ones; the contact guard (admin.refuse_sample_contact) still refuses chats, requirements and reviews.
# They must all be removed before launch (ToDo.md, securityflags.md). True puts every label back.
LABELLED = False


def shown_brand(brand):
    return brand if LABELLED else brand.replace(" (Sample)", "")


def shown_name(name):
    return f"Sample · {name}" if LABELLED else name


def store_about(brand, business, city, top=None):
    if LABELLED:
        return (f"{brand} is a sample seller created by Cosora to show how a store looks. "
                f"It isn't a real business: it takes no orders, messages or requirements.")
    return f"{shown_brand(brand)} {STORE_ABOUT.get(top, 'supplies businesses across India')}, from {city}."


# What each store does, for its About line while unlabelled (by main category).
STORE_ABOUT = {
    "Accessories": "makes handcrafted bags, belts, stoles and jewellery for retailers and brands",
    "Activewear": "manufactures activewear and athleisure for brands and retailers",
    "Apparel & Home Categories": "manufactures everyday apparel, innerwear and home linen in bulk",
    "Chemicals & Dyes": "supplies dyes and processing chemicals to textile mills and dye houses",
    "Cosmetics & Beauty": "makes skincare, haircare and beauty products for private labels and retailers",
    "Dress": "designs and manufactures women's dresses and jumpsuits for brands and boutiques",
    "Ethnic Wear": "makes kurtas, sarees, lehengas and other ethnic wear for retailers",
    "Fashion Accessories (Unisex)": "supplies fashion accessories to retailers and online stores",
    "Finance & Compliance Services": "handles GST, tax, registration and finance work for fashion and textile businesses",
    "Footwear": "manufactures footwear for brands, retailers and schools",
    "Freelancers & Job Workers": "is a studio of designers, pattern makers and content creators working with fashion brands",
    "IT, Software & SaaS": "builds software, apps and websites for apparel and textile businesses",
    "Jeans": "manufactures denim jeans, shorts and jeggings for brands and retailers",
    "Kidswear": "manufactures clothing for babies and children",
    "Labels & Tags": "makes woven labels, printed labels and hang tags for garment brands",
    "Logistics & Supply Chain": "moves, stores and clears goods for apparel and textile businesses",
    "Machinery & Equipment": "supplies sewing, cutting, embroidery and finishing machinery to garment units",
    "Marketing, PR & Photography": "shoots, markets and promotes fashion brands",
    "Others (Custom)": "makes custom uniforms, home textiles and branded merchandise to order",
    "Packaging": "makes packaging for apparel brands and online sellers",
    "Printing & Manufacturing Services": "takes printing, embroidery, dyeing and finishing job work for garments and fabric",
    "Raw Materials – Fabrics & Inputs": "supplies fabrics, yarn and sewing inputs to garment makers",
    "Service Providers (Manufacturing & Fashion Ops)": "runs stitching, cutting, inspection and sourcing for fashion brands",
    "Shirt": "manufactures shirts for men, women and children",
    "T-shirts/Tops": "manufactures T-shirts and tops for brands and retailers",
    "Trims & Accessories": "supplies buttons, zips, rivets and other trims to garment makers",
    "Trousers": "manufactures trousers, chinos and pants for brands and retailers",
    "Winter Wear": "makes sweaters, jackets, thermals and shawls for the winter trade",
}


def description(cat, item, answers, cols, photo=None):
    brand, city, _state, _ptype, business = cat["seller"]
    sub, _pic, name, price, moq, unit, extra, detail = item[:8]
    store = shown_brand(brand)
    lines = []
    fabric = cols.get("fabric")
    if fabric:
        gsm = cols.get("gsm")
        lines.append(f"Material: {fabric}" + ((f", {gsm} GSM" if str(gsm).isdigit() else f", {gsm}") if gsm else ""))
    if cols.get("sizes"):
        lines.append("Sizes: " + ", ".join(cols["sizes"]))
    if cols.get("waist_sizes") and cols.get("waist_sizes") != cols.get("sizes"):
        lines.append("Waist sizes: " + ", ".join(cols["waist_sizes"]))
    if cols.get("colour"):
        lines.append(f"Colours: {cols['colour']}")
    lines.append(_price_line(price, unit))
    m = _moq_line(moq, unit)
    if m:
        lines.append(m)
    if answers.get("leadTime"):
        lines.append(f"Lead time: {answers['leadTime']}")
    if answers.get("turnaround"):
        lines.append(f"Turnaround: {answers['turnaround']}")
    if answers.get("availability"):
        lines.append(f"Availability: {answers['availability']}")
    if answers.get("workMode"):
        lines.append(f"Works: {answers['workMode']}")
    lines.append("Customisation: " + ("available" if extra.get("customization_available") else "not offered"))
    origin = cols.get("country_of_origin") or "India"
    lines.append(f"Made in: {city}, {origin}" if R.is_apparel(item) or cat["seller"][3] == "manufacturer"
                 else f"Based in: {city}, {origin}")
    overview = detail.strip()
    if not overview.endswith("."):
        overview += "."
    about = f"Listed by {store} ({business}, {city})."
    if LABELLED:
        about += " Like every sample store, it shows how a seller's listing reads; it takes no orders."
    parts = ([NOTICE] if LABELLED else []) + [f"{name}. {overview}", about,
                                              "Key details\n" + "\n".join("• " + x for x in lines)]
    if photo:
        parts.append(photo_credit(photo))
    return "\n\n".join(parts)


def details_for(cat, item, defs, cats_by_name, index=None):
    """(attributes, columns, description) for one sample listing."""
    seller_cat = cats_by_name.get(cat["top"])
    answers, missing = fill.answers_for(defs, seller_cat, fill.sub_id_for(seller_cat, item[0]), item, cat["seller"])
    extra = item[6]
    cols = {
        "fabric": extra.get("fabric"), "gsm": extra.get("gsm"), "colour": extra.get("colour"),
        "gender": extra.get("gender"), "fit_type": extra.get("fit_type"), "sizes": extra.get("sizes"),
        "country_of_origin": extra.get("country_of_origin"),
        "pattern": None, "occasion": None, "neck_type": None, "sleeve_type": None, "collar_type": None,
        "waist_sizes": None, "lengths": None,
    }
    if R.is_apparel(item):
        for k, v in R.apparel_cols(item).items():
            if k in cols and cols[k] is None:
                cols[k] = v
    for key, col in ANSWER_COLUMNS.items():
        if key in answers and cols.get(col) is None:
            cols[col] = answers[key]
    cols = {k: _col_value(k, v) for k, v in cols.items()}
    attrs = {}
    for key, v in answers.items():
        if key in PRODUCT_COLUMN_FIELDS or key == "sku":
            continue
        val = _attr_value(v)
        if val is not None:
            attrs[key] = val
    photo = PHOTOS.get(f"{cat['top']}:{index}") if index else None
    return attrs, cols, description(cat, item, answers, cols, photo), missing


def q(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, list):
        return "array[" + ", ".join(q(x) for x in v) + "]::text[]"
    return "'" + str(v).replace("'", "''") + "'"


def all_details():
    """[(top, index, item, attrs, cols, description)] for every listing, in seed order."""
    defs, by_name = fill.load()
    out = []
    for cat in CATEGORIES:
        for ii, item in enumerate(cat["items"], 1):
            attrs, cols, desc, _missing = details_for(cat, item, defs, by_name, ii)
            out.append((cat, ii, item, attrs, cols, desc))
    return out


def check_hand_tables():
    """A name written twice in one table of attr_extra.py keeps only its last answers (a dict literal): refuse it."""
    import ast
    tree = ast.parse(open(os.path.join(HERE, "attr_extra.py"), encoding="utf-8").read())
    for node in ast.walk(tree):
        if isinstance(node, ast.Dict):
            keys = [k.value for k in node.keys if isinstance(k, ast.Constant)]
            dup = sorted({k for k in keys if keys.count(k) > 1})
            if dup:
                raise SystemExit(f"attr_extra.py: written twice in one table: {dup}")


def main():
    import uuid
    from build import NS, STORAGE
    check_hand_tables()
    rows = all_details()
    parts = []
    for cat, ii, item, attrs, cols, desc in rows:
        pid = str(uuid.uuid5(NS, f"product:{cat['top']}:{ii}"))
        sets = [f"name = {q(shown_name(item[2]))}", f"description = {q(desc)}",
                f"attributes = {q(json.dumps(attrs, ensure_ascii=False))}::jsonb"]
        sets += [f"{c} = {q(cols[c])}" for c in DETAIL_COLUMNS]
        parts.append(f"-- {cat['top']} {ii}: {item[2]}\nupdate public.products set\n  " + ",\n  ".join(sets)
                     + f"\nwhere id = {q(pid)} and vendor_id in (select vendor_id from admin.sample_vendors);")
        if f"{cat['top']}:{ii}" in PHOTOS:
            # A listing with no fitting openly licensed photo keeps its Cosora category picture.
            vid = str(uuid.uuid5(NS, "vendor:" + cat["top"]))
            parts.append(f"update public.product_images set url = {q(STORAGE + '/' + photo_object(vid, ii))}\n"
                         f"where product_id = {q(pid)} and position = 0;")
    # The stores' names and About text follow LABELLED too.
    for cat in CATEGORIES:
        brand, city, _st, _pt, business = cat["seller"]
        vid = str(uuid.uuid5(NS, "vendor:" + cat["top"]))
        parts.append(f"-- store: {cat['top']}\n"
                     f"update public.vendor_profiles set brand_name = {q(shown_brand(brand))}, "
                     f"about = {q(store_about(brand, business, city, cat['top']))}\n"
                     f"where id = {q(vid)} and id in (select vendor_id from admin.sample_vendors);\n"
                     f"update public.profiles set full_name = {q(shown_brand(brand))}\n"
                     f"where id = {q(vid)} and id in (select vendor_id from admin.sample_vendors);")
    n = len(rows)
    label_check = (f"""
  if exists (select 1 from public.vendor_profiles v join admin.sample_vendors s on s.vendor_id = v.id
              where v.brand_name not like '%(Sample)') then
    raise exception 'sample details: a sample store is not labelled';
  end if;""" if LABELLED else f"""
  if exists (select 1 from public.products p join admin.sample_vendors s on s.vendor_id = p.vendor_id
              where p.name like 'Sample ·%' or p.description like 'Sample listing:%')
     or exists (select 1 from public.vendor_profiles v join admin.sample_vendors s on s.vendor_id = v.id
              where v.brand_name like '%(Sample)' or v.about like '%sample seller%') then
    raise exception 'sample details: a sample label is left';
  end if;""")
    photo_check = "" if not PHOTOS else f"""
  if (select count(*) from public.product_images i join public.products p on p.id = i.product_id
       join admin.sample_vendors s on s.vendor_id = p.vendor_id where i.url like '%/samples/listing-%') <> {len(PHOTOS)} then
    raise exception 'sample details: a chosen listing photo is missing';
  end if;"""
    sql = f"""-- Fills every sample listing's details (Mitra, 2026-11-24: "make sure every listing has all the descriptions
-- filled"). Generated by scripts/samples/details.py: edit sample_data.py / attr_*.py and run it again, never this file.
-- Only rows of sample sellers can change (admin.sample_vendors). {n} listings.
begin;
{chr(10).join(parts)}

do $check$
begin
  if (select count(*) from public.products p join admin.sample_vendors s on s.vendor_id = p.vendor_id
       where p.attributes <> '{{}}'::jsonb and p.description like '%Key details%') <> {n} then
    raise exception 'sample details: not every sample listing was filled';
  end if;{label_check}{photo_check}
end
$check$;
commit;
"""
    with open(os.path.join(HERE, "update-sample-details.sql"), "w", encoding="utf-8", newline="\n") as f:
        f.write(sql)
    print(f"{n} listings written to update-sample-details.sql")


if __name__ == "__main__":
    main()
