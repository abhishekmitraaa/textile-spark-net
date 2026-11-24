"""One answer per listing-form question for a sample listing, in this order: the item's own hand-written answer,
its fields, the category's rule, an option matching the item's words, then a sensible default. Credentials are never
answered (attr_rules.NEVER)."""
import json
import os

import attr_fill as F
import attr_rules as R
from attr_extra import extra_for

BLANK = (None, [], "")


def seller_category(cats_by_name, top):
    return cats_by_name.get(top)


def answers_for(defs, seller_cat, sub_id, item, seller):
    """{key: answer} for every question this item's form asks, and the keys left unanswered."""
    sub, pic, name, price, moq, unit, extra, detail = item[:8]
    own, generic = extra_for(name, seller_cat["id"] if seller_cat else None)
    hand = dict(own)
    hand.update(item[8] if len(item) > 8 else {})
    out, missing = {}, []
    for d in F.questions_for(defs, seller_cat, sub_id):
        key = d["key"]
        if key in R.NEVER or (key in hand and hand[key] is None):
            continue
        a = hand.get(key) if key in hand else None
        if a in BLANK and key in generic:
            g = generic[key]
            if d["options"]:
                fits = [v for v in (g if isinstance(g, list) else [g]) if str(v) in d["options"]]
                g = (fits if isinstance(g, list) else fits[0]) if fits else None
            a = g
        if a not in BLANK and d["options"]:
            vals = a if isinstance(a, list) else [a]
            bad = [v for v in vals if str(v) not in d["options"]]
            if bad:
                raise ValueError(f"{name}: {key} = {bad} is not one of {d['options']}")
            if d["kind"] == "multiselect" and not isinstance(a, list):
                a = [a]
            if d["kind"] != "multiselect" and isinstance(a, list):
                a = a[0]
        if a in BLANK and key in ("moq", "location", "locations", "customizationAvailable", "sizes", "hourlyRate",
                                  "priceModel", "turnaround", "apparelGender", "colors", "colour"):
            a = F.answer(d, item, seller[1])
        if a in BLANK:
            a = R.category_answer(seller_cat["id"] if seller_cat else None, d, item, seller)
        if a in BLANK:
            a = F.answer(d, item, seller[1])
        if isinstance(a, list):
            a = [x for x in a if x not in BLANK]
        if a in BLANK:
            missing.append(key)
        else:
            out[key] = a
    return out, missing


DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def load(folder=DATA):
    """The listing form's questions (public.attribute_definitions, form 'product', read 2026-11-24) and the seller
    categories by name, from the snapshots in data/."""
    defs = F.load_defs(os.path.join(folder, "attribute-definitions.json"))
    cats = json.load(open(os.path.join(folder, "seller-categories.json"), encoding="utf-8"))
    return defs, {c["name"]: c for c in cats}


def sub_id_for(seller_cat, sub):
    if not seller_cat or not sub:
        return None
    return next((s["id"] for s in seller_cat["subs"] if s["name"] == sub), None)
