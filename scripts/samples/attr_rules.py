"""Per-category answers and apparel details for the sample listings (Mitra, 2026-11-24).

Credentials a sample seller doesn't hold are never answered: a certification, a licence, test reports, an INCI list.
An unanswered question shows nothing on the listing, which is the truth for a sample.
"""
import re

from attr_fill import option_like

NEVER = {"productCertifications", "certification", "certifications", "manufacturingLicense", "testingReports",
         "inciList", "licenses"}

_GARMENTS = [
    ("bottom", ["jeans", "trouser", "pant", "chino", "jogger", "legging", "shorts", "palazzo", "culotte", "jegging", "track"]),
    ("dress", ["dress", "gown", "jumpsuit", "kaftan", "frock", "pinafore", "lehenga"]),
    ("shirt", ["shirt", "overshirt", "blouse"]),
    ("tee", ["t-shirt", "tee", "polo", "henley", "tank", "top", "vest", "bra", "crop", "pyjama", "onesie", "co-ord", "trunk"]),
    ("ethnic", ["kurta", "sherwani", "saree", "anarkali", "nehru"]),
    ("winter", ["sweater", "cardigan", "jacket", "coat", "hoodie", "sweatshirt", "thermal", "puffer", "bomber"]),
]

# garment: neck, sleeve, closure, occasion
_APPAREL = {
    "tee": ("Round Neck", "Half Sleeve", "Pullover", ["Casual"]),
    "shirt": (None, "Full Sleeve", "Button", ["Casual", "Work"]),
    "bottom": (None, None, "Button", ["Casual"]),
    "dress": ("V-Neck", "Half Sleeve", "Back Zip", ["Casual", "Party"]),
    "ethnic": ("Round Neck", "3/4 Sleeve", "Pullover", ["Festive"]),
    "winter": ("High Neck", "Full Sleeve", "Zipper", ["Casual"]),
    "other": (None, None, None, ["Casual"]),
}

APPAREL_PICS = ("menswear/", "womenswear/", "kidswear/")


def garment(name):
    n = name.lower()
    if "t-shirt" in n:  # "shirt" is in "T-shirt"
        return "tee"
    for kind, words in _GARMENTS:
        if any(w in n for w in words):
            return kind
    return "other"


def is_apparel(item):
    return item[1].startswith(APPAREL_PICS)


def apparel_cols(item):
    """The product page's own apparel columns for a garment listing."""
    name, extra, detail = item[2], item[6], item[7]
    g = garment(name)
    neck, sleeve, closure, occ = _APPAREL[g]
    n = f"{name} {detail}".lower()
    if "v-neck" in n: neck = "V-Neck"
    if "henley" in n: neck = "Henley"
    if "hood" in n: neck = "Hood"
    if "polo" in n or "bra" in n: neck = None
    if any(w in n for w in ["crop", "tank", "sleeveless", "slip dress", "bra", "vest"]): sleeve = "Sleeveless"
    if any(w in n for w in ["long-sleeve", "full-sleeve", "full sleeve"]): sleeve = "Full Sleeve"
    if any(w in n for w in ["resort", "short sleeve", "polo"]): sleeve = "Half Sleeve"
    if "3/4" in n: sleeve = "3/4 Sleeve"
    if any(w in n for w in ["flutter", "puff", "balloon"]): sleeve = "Puff Sleeve"
    if "kids" in n or "boys" in n or "girls" in n or "baby" in n:
        occ = ["Casual"]
    pattern = (["Printed"] if any(w in n for w in ["print", "floral", "graphic", "sublimation", "tropical"])
               else ["Checked"] if "check" in n or "plaid" in n
               else ["Embroidered"] if any(w in n for w in ["embroider", "chikan", "sequin", "zari", "resham"])
               else ["Striped"] if "stripe" in n
               else ["Self Textured"] if any(w in n for w in ["rib", "slub", "cable", "corduroy", "seamless"])
               else ["Solid"])
    if any(w in n for w in ["festive", "wedding", "lehenga", "sherwani", "anarkali", "saree"]): occ = ["Festive", "Party"]
    if any(w in n for w in ["gym", "yoga", "running", "training", "sports", "dri-fit", "compression", "jogger", "track"]):
        occ = ["Sports", "Gym Wear"]
    if "formal" in n or "office" in n or "sheath" in n: occ = ["Formal", "Work"]
    if any(w in n for w in ["pyjama", "nightwear", "lounge"]): occ = ["Casual"]
    collar = None
    if g == "shirt" or "polo" in n or "nehru" in n:
        collar = ("Mandarin Collar" if "mandarin" in n or "nehru" in n or "stand collar" in n
                  else "Polo Collar" if "polo" in n
                  else "Camp Collar" if "camp" in n or "resort" in n
                  else "Button-Down Collar" if "button-down" in n or "oxford" in n
                  else "Cutaway Collar" if "cutaway" in n
                  else "Spread Collar")
    if "jeggings" in n or "elastic" in n or "jogger" in n or "pyjama" in n or "palazzo" in n: closure = "Elastic Waist"
    if "drawstring" in n or "drawcord" in n: closure = "Drawstring"
    if "wrap" in n: closure = "Tie/Wrap"
    sizes = extra.get("sizes") or []
    waist = sizes if g == "bottom" and sizes and all(s.isdigit() for s in sizes) else None
    lengths = None
    if g == "dress":
        lengths = ["Midi"] if "midi" in n else ["Maxi"] if "maxi" in n or "gown" in n or "floor" in n else ["Knee Length"]
    elif g == "bottom":
        lengths = ["Short"] if "shorts" in n else ["Cropped"] if "culotte" in n or "cigarette" in n else ["Full Length"]
    return {"pattern": pattern, "occasion": occ, "neck_type": neck, "sleeve_type": sleeve, "collar_type": collar,
            "waist_sizes": waist, "lengths": lengths, "closure": closure}


_NUMBER_WORDS = {"two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "eight": 8, "ten": 10, "twelve": 12}


def _shades(text):
    """The shade count the listing's own text gives ("in four shades", "in 24 shades"), else one."""
    m = re.search(r"\b(\d+|" + "|".join(_NUMBER_WORDS) + r")\s+shades\b", text)
    if not m:
        return "One shade"
    k = m.group(1)
    n = int(k) if k.isdigit() else _NUMBER_WORDS[k]
    return f"{n} shades"


def _pick(options, values, multi):
    vals = values if isinstance(values, list) else [values]
    hits = [o for v in vals if v for o in options if o.lower() == str(v).lower()]
    hits = hits or [o for v in vals if v for o in options if str(v).lower() in o.lower()]
    if not hits:
        return None
    return hits[:3] if multi else hits[0]


def category_answer(cat_id, d, item, seller):
    """A sensible answer for a question the item's own text doesn't settle, by category."""
    key, kind, options = d["key"], d["kind"], d["options"] or []
    sub, pic, name, price, moq, unit, extra, detail = item[:8]
    n = f"{name} {detail}".lower()
    brand = seller[0].replace(" (Sample)", "")
    moq_text = f"{moq} {unit}"
    multi = kind == "multiselect"

    def opt(needle):
        return option_like(options, needle)

    def fit(value):
        """Match a value to the question's options, or return it as typed when the question has none."""
        if value is None:
            return None
        if options:
            return _pick(options, value, multi)
        return ", ".join(value) if isinstance(value, list) else value

    if key in NEVER:
        return None
    if cat_id == "apparel-home" or is_apparel(item):
        cols = apparel_cols(item)
        m = {"pattern": cols["pattern"], "occasion": cols["occasion"], "neckType": cols["neck_type"] or "N/A",
             "sleeveType": cols["sleeve_type"] or "N/A", "closure": cols["closure"] or "None",
             "collarType": cols["collar_type"] or "N/A", "length": (cols["lengths"] or [None])[0],
             "size": ", ".join(extra.get("sizes") or []) or None, "composition": extra.get("fabric")}
        if key in m:
            return fit(m[key])
    if cat_id == "cosmetics-beauty":
        vol = re.search(r"\d+\s?(ml|g)\b", n)
        # Most specific first: "oil-control compact" is a compact, a soap "with essential oils" a soap.
        pack = next((p for w, p in [("compact", "Compact"), ("soap", "Box"), ("brush", "Pouch"), ("polish", "Bottle"),
                                    ("balm", "Stick"), ("parfum", "Spray"), ("serum", "Dropper"), ("gel", "Tube"),
                                    ("oil", "Bottle")] if w in n), "Bottle")
        return fit({"brandName": brand, "batchSize": moq_text, "volume": vol.group() if vol else "Standard pack",
                    "packaging": pack, "skinType": "All Skin Types",
                    "fragrance": "Lightly Scented" if options else ("Floral, woody and fresh notes" if "parfum" in n else "Light herbal"),
                    "shadeRange": _shades(n),
                    "privateLabelAvailable": "Yes", "customFormulation": "Yes", "sampleAvailable": "Yes (Paid)",
                    "shelfLife": "24"}.get(key))
    if cat_id == "chemicals-dyes":
        dye = sub == "Dyes"
        finishing = any(w in n for w in ["finish", "softener", "enzyme", "wash", "fixing", "pilling"])
        return fit({"packSize": "25 kg HDPE bag" if dye else "50 kg HDPE drum",
                    "form": "Powder" if dye else "Liquid",
                    "application": (["Dyeing"] if dye else ["Finishing", "Washing"] if finishing else ["Pre-treatment", "Dyeing"])
                        if options else detail.rstrip("."),
                    "shadeRange": "Full shade card on request" if dye else "Not applicable",
                    "safetyData": "Yes", "ecoFriendly": "No"}.get(key))
    if cat_id == "fashion-accessories":
        return fit({"closure": "Zipper" if "bag" in n or "backpack" in n else "Buckle" if "belt" in n else "Open",
                    "width": "35" if "belt" in n else None, "occasion": "Daily Wear",
                    "pattern": "Checked" if "check" in n else "Solid", "sizes": "Free size",
                    "dimensions": "Standard sizes; custom sizes on request"}.get(key))
    if cat_id == "freelancers-job-workers":
        return fit({"skills": detail.rstrip("."), "portfolio": "Sample profile: no portfolio",
                    "languages": "English, Hindi", "hourlyRate": 800, "availability": "Project Basis",
                    "workMode": "Remote", "experience": 6}.get(key))
    if cat_id == "marketing-pr-photography":
        return fit({"portfolio": "Sample store: no portfolio", "clientBrands": "None (sample store)",
                    "volume": "100-500"}.get(key))
    if cat_id == "it-software-saas":
        return fit({"deployment": "Both" if "app" in n else "Cloud"}.get(key))
    if cat_id == "labels-tags":
        return fit({"foldType": "End Fold",
                    "size": ("50 × 90 mm; custom sizes on request" if "tag" in n and "size tag" not in n
                             else "60 × 40 mm; custom sizes on request" if "patch" in n
                             else "50 × 15 mm; custom sizes on request"),
                    "form": "Hang Tag" if "tag" in n else "Woven" if "woven" in n or "patch" in n else "Label",
                    "maxColors": 6, "languages": "English"}.get(key))
    if cat_id == "logistics-supply-chain":
        return fit({"specialHandling": "Fragile", "warehouseSize": "40,000 sq ft",
                    "locations": seller[1]}.get(key))
    if cat_id == "machinery-equipment":
        sewing = "sewing" in n or "overlock" in n or "lockstitch" in n
        return fit({"brand": "Other" if options else "Unbranded", "condition": "New",
                    "power": (750 if sewing else 1500) if kind == "number" else ("550 W servo motor" if sewing else "1.5 kW"),
                    "speed": 5000 if sewing else None}.get(key))
    if cat_id == "packaging":
        return fit({"customization": ["Logo Print", "Custom Size"], "size": "Custom sizes on request",
                    "closure": "Peel & Seal"}.get(key))
    if cat_id == "printing-manufacturing":
        return fit({"minOrder": moq_text, "dailyCapacity": 2000 if kind == "number" else "2,000 pieces a day",
                    "maxColors": 6 if kind == "number" else "5-8", "maxPrintSize": "14 × 16 inches",
                    "samplePolicy": "Paid"}.get(key))
    if cat_id == "raw-materials":
        return fit({"composition": extra.get("fabric"), "application": detail.rstrip("."),
                    "width": 58 if kind == "number" else "58" if options else "58 inches"}.get(key))
    if cat_id == "service-providers":
        return fit({"dailyCapacity": "1,500 pieces a day", "turnaround": "3-5"}.get(key))
    if cat_id == "trims-accessories":
        return fit({"size": "16" if options else "Standard sizes; custom sizes on request",
                    "width": "25" if options else "25 mm", "foldType": "End Fold",
                    "colors": extra.get("colour") or "Any shade"}.get(key))
    return None
