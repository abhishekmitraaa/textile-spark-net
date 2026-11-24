"""Answers every listing-form question for each sample listing (Mitra, 2026-11-24: "every listing has all the
descriptions filled").

The questions are Cosora's own (public.attribute_definitions, form 'product'): the base questions for the seller type,
the category's common questions and the sub-category's own. An answer is taken, in order, from:
  1. the item's own `attrs` in sample_data.py (written by hand where the item's text can't decide it);
  2. the item's fields (moq, location, sizes, customisation, colour);
  3. an option whose words appear in the item's name, detail, sub-category or fabric;
  4. KEY_DEFAULTS below, a sensible value per question.
Questions none of these answer are reported, so nothing is filled by guessing.
"""
import json
import re

TOKEN = re.compile(r"[a-z0-9]+")
STOP = {"and", "or", "the", "for", "with", "of", "a", "an", "in", "on", "to", "by", "other", "others", "type", "custom",
        "made", "mens", "women", "womens", "men", "s"}

# Per-question fallbacks: an option containing this text (select/multiselect) or a literal value (text/number).
KEY_DEFAULTS = {
    "leadTime": "15-30", "originCountry": "India", "productCertifications": None,
    "turnaround": "1-2 weeks", "priceModel": None, "experience": 6, "availability": "Full-time",
    "workMode": "Remote", "privateLabelAvailable": "Yes", "customFormulation": "Yes", "sampleAvailable": "Yes",
    "samplePolicy": "Paid", "shelfLife": "24", "packaging": None, "closure": None,
}


def tokens(s):
    # Single digits are kept: "2-hole" and "4-hole" must not look the same.
    return {t for t in TOKEN.findall(str(s).lower()) if t not in STOP and (len(t) > 1 or t.isdigit())}


def pick(options, text_tokens, multi):
    scored = []
    for o in options:
        ot = tokens(o)
        if not ot:
            continue
        hit = len(ot & text_tokens)
        # a stem match ("knitted" ~ "knit", "zippers" ~ "zipper")
        hit += sum(1 for a in ot for b in text_tokens if a != b and len(a) > 3 and len(b) > 3 and (a.startswith(b) or b.startswith(a)))
        if hit:
            scored.append((hit / len(ot), hit, o))
    if not scored:
        return None
    scored.sort(key=lambda x: (-x[0], -x[1]))
    if multi:
        # Only options the text names in full ("Salicylic Acid" isn't named by "hyaluronic acid"), else the best one.
        whole = [o for r, _, o in scored if r >= 1.0]
        return whole[:3] or [scored[0][2]]
    return scored[0][2]


def option_like(options, needle):
    if needle is None or not options:
        return None
    n = str(needle).lower()
    for o in options:
        if n in o.lower():
            return o
    return None


def questions_for(defs, seller_cat, sub_id):
    """Base + common + sub questions, first one per key."""
    out, seen = [], set()
    ctype = seller_cat["type"] if seller_cat else "product"
    for d in defs:
        ok = (
            (d["layer"] == "base" and d["seller_type"] == ctype)
            or (seller_cat and d["layer"] == "common" and d["category_id"] == seller_cat["id"]
                and (not d["applies_to_subcategories"] or (sub_id and sub_id in d["applies_to_subcategories"])))
            or (seller_cat and sub_id and d["layer"] == "sub" and d["category_id"] == seller_cat["id"]
                and d["subcategory_id"] == sub_id)
        )
        if ok and d["key"] not in seen:
            seen.add(d["key"])
            out.append(d)
    return out


def answer(d, item, city):
    """The answer to one question, or None."""
    key, kind, options = d["key"], d["kind"], d["options"] or []
    sub, pic, name, price, moq, unit, extra, detail = item[:8]
    hand = item[8] if len(item) > 8 else {}
    if key in hand:
        return hand[key]
    multi = kind == "multiselect"
    if key == "moq":
        m = re.match(r"\d+", str(moq))
        return int(m.group()) if m else None
    if key in ("location", "locations"):
        return city
    if key == "customizationAvailable":
        return bool(extra.get("customization_available", False))
    if kind == "size-selector" or key == "sizes":
        return extra.get("sizes")
    if key in ("apparelGender",) and extra.get("gender"):
        g = extra["gender"]
        return [o for o in options if o.lower().startswith(g.lower()[:3])] or None
    if key in ("colors", "colour") and extra.get("colour"):
        return extra["colour"]
    if key == "hourlyRate":
        return int(price) if unit == "hour" else None
    if key == "priceModel":
        first = str(unit).split()[0]
        want = {"month": "Retainer", "hour": "Hourly", "project": "Per Project", "campaign": "Per Project",
                "collection": "Per Project", "report": "Fixed Price", "return": "Fixed Price", "session": "Fixed Price",
                "class": "Fixed Price", "shipment": "Fixed Price", "container": "Fixed Price", "trip": "Fixed Price",
                "day": "Fixed Price", "marketplace": "Fixed Price", "%": "Custom Quote"}.get(first, "Fixed Price")
        return option_like(options, want) or option_like(options, "Custom")
    if key == "turnaround":
        first = str(unit).split()[0]
        quick = first in ("pieces", "metres", "kg", "prints", "parcels", "parcel", "units", "products", "listings", "style")
        for want in (["24 Hours", "48 Hours", "1-3 days", "3-5 Days"] if quick else ["1-2 weeks", "1 Week", "3-7 days", "3-5 Days"]):
            hit = option_like(options, want)
            if hit:
                return hit
        return None
    text = tokens(" ".join([name, detail, sub or "", extra.get("fabric") or "", extra.get("fit_type") or "",
                            extra.get("colour") or "", pic.split("/")[-1].replace("-", " ")]))
    if options:
        got = pick(options, text, multi)
        if got:
            return got
        dflt = KEY_DEFAULTS.get(key)
        hit = option_like(options, dflt)
        if hit:
            return [hit] if multi else hit
        return None
    if kind == "number":
        v = KEY_DEFAULTS.get(key)
        return v if isinstance(v, (int, float)) else None
    v = KEY_DEFAULTS.get(key)
    return v if isinstance(v, str) else None


def load_defs(path):
    raw = open(path, encoding="utf-8").read()
    return json.loads(raw[raw.index("{"):])["rows"]
