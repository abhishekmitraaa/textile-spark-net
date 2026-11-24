"""Finds an openly licensed photo for each sample listing on Wikimedia Commons (Mitra, 2026-11-24).

    python -I scripts/samples/fetch_photos.py search <work-dir>     # candidates for every listing (cached)
    python -I scripts/samples/fetch_photos.py sheets <work-dir>     # contact sheets of the current picks, to check by eye
    python -I scripts/samples/fetch_photos.py alts <work-dir> <n>…  # sheet of the other candidates for listings n…
    python -I scripts/samples/fetch_photos.py final <work-dir>      # download the picks at 1200 px, write photo-sources.json

Only licences that allow commercial use and changes: public domain, CC0, CC BY, CC BY-SA (never NC or ND, never GFDL
alone). Files Commons marks as showing a trademark, insignia or a person's likeness are skipped. Every photo used is
credited on its listing (photographer, licence, source page) from scripts/samples/photo-sources.json.
HTTP goes through curl (Python's certificate store is out of date on this machine). Downloaded files are data only.
"""
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from photo_queries import PICKS, QUERIES, REJECT  # noqa: E402
from sample_data import CATEGORIES  # noqa: E402

UA = "SampleCatalogueBuilder/1.0 (open-licence photo lookup)"
API = "https://commons.wikimedia.org/w/api.php"
LICENCE_OK = re.compile(r"^(Public domain|CC0( 1\.0)?|PDM( 1\.0)?|CC BY(-SA)? \d\.\d)$", re.I)
SKIP_RESTRICTIONS = ("trademarked", "insignia", "personality")
SKIP_TITLES = re.compile(r"logo|map|coat of arms|flag of|diagram|chart of|\.svg|\.tif|\.gif|stamp|banknote|poster",
                         re.I)


def curl_json(params):
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(3):
        out = subprocess.run(["curl", "-s", "--max-time", "40", "-A", UA, url], capture_output=True).stdout
        try:
            return json.loads(out)
        except ValueError:
            time.sleep(2 + attempt * 3)
    return {}


# Left out of every search: artworks, statues and crowds rank high on words but show no product.
NOT_PRODUCTS = ("-painting -statue -sculpture -portrait -concert -festival -protest -march -engraving -drawing "
                "-museum -illustration -poster -stamp -parade -rally")
STOP = {"a", "an", "the", "of", "for", "with", "and", "in", "on", "women", "men", "kids", "s"}


def _words(s):
    return {w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP and len(w) > 1}


def search(query, width=330, limit=30):
    """Commons files for a query. Thumbnails at 330 px (a standard Wikimedia size, so it's served from cache)."""
    d = curl_json({"action": "query", "format": "json", "generator": "search", "gsrnamespace": "6",
                   "gsrsearch": f"{query} filetype:bitmap {NOT_PRODUCTS}", "gsrlimit": str(limit), "prop": "imageinfo",
                   "iiprop": "url|extmetadata|size|mime", "iiurlwidth": str(width),
                   "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Credit|Restrictions|AttributionRequired"})
    pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    out = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        m = ii.get("extmetadata", {})
        lic = (m.get("LicenseShortName", {}).get("value") or "").strip()
        restr = (m.get("Restrictions", {}).get("value") or "").lower()
        title = p.get("title", "")
        if ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
            continue
        if ii.get("width", 0) < 640 or ii.get("height", 0) < 480:
            continue
        if not LICENCE_OK.match(lic) or any(r in restr for r in SKIP_RESTRICTIONS):
            continue
        if SKIP_TITLES.search(title) or title in REJECT:
            continue
        artist = re.sub(r"<[^>]+>", "", html.unescape(m.get("Artist", {}).get("value") or "")).strip()
        artist = re.sub(r"\s+", " ", artist)[:120] or "Unknown author"
        out.append({"title": title, "page": ii.get("descriptionurl"), "thumb": ii.get("thumburl"),
                    "original": ii.get("url"),
                    "licence": lic, "licence_url": m.get("LicenseUrl", {}).get("value"), "artist": artist,
                    "width": ii.get("width"), "height": ii.get("height")})
    return out


def listings():
    """[(n, top, index, name)] in seed order, n from 1."""
    rows, n = [], 0
    for cat in CATEGORIES:
        for ii, item in enumerate(cat["items"], 1):
            n += 1
            rows.append((n, cat["top"], ii, item[2]))
    return rows


def _candidates(name):
    """Up to 10 files for a listing, those whose titles share most words with its searches first."""
    found, seen = [], set()
    for rank, q in enumerate(QUERIES[name]):
        for c in search(q):
            if c["title"] not in seen:
                seen.add(c["title"])
                c["query"] = q
                c["score"] = 2 * len(_words(q) & _words(c["title"])) - rank
                found.append(c)
        if sum(1 for c in found if c["score"] > 0) >= 8:
            break
        time.sleep(0.5)
    found.sort(key=lambda c: -c["score"])
    return found[:10]


def cmd_search(work):
    from concurrent.futures import ThreadPoolExecutor
    cache_path = os.path.join(work, "candidates.json")
    cand = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}
    todo = [(n, name) for n, _, _, name in listings() if not cand.get(name)]
    with ThreadPoolExecutor(max_workers=3) as pool:
        for (n, name), found in zip(todo, pool.map(lambda t: _candidates(t[1]), todo)):
            cand[name] = found
            print(f"{n:3d} {len(found):2d} {name[:60]}", flush=True)
            json.dump(cand, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    picks_path = os.path.join(work, "picks.json")
    picks = json.load(open(picks_path, encoding="utf-8")) if os.path.exists(picks_path) else {}
    # Only picks made by eye (photo_queries.PICKS, or `choose`); a search never picks by itself.
    picks.update({name: title for name, title in PICKS.items()})
    json.dump(picks, open(picks_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    missing = [name for _, _, _, name in listings() if name not in picks]
    print(f"picked {len(picks)}, none found for {len(missing)}: {missing}")


def _is_image(path):
    try:
        head = open(path, "rb").read(12)
    except OSError:
        return False
    return head[:3] == b"\xff\xd8\xff" or head[:8] == b"\x89PNG\r\n\x1a\n" or (head[:4] == b"RIFF" and head[8:] == b"WEBP")


def fetch(url, dest):
    """Download an image; Wikimedia answers a busy moment with an HTML error page, so check and retry slowly."""
    if _is_image(dest):
        return True
    for wait in (0, 5, 15, 40):
        time.sleep(wait)
        subprocess.run(["curl", "-s", "-L", "--max-time", "60", "-A", UA, "-o", dest, url])
        time.sleep(1.0)
        if _is_image(dest):
            return True
    if os.path.exists(dest):
        os.remove(dest)
    return False


def _sheet(tiles, path, cols=5, size=260):
    from PIL import Image, ImageDraw, ImageFont
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * size, rows * (size + 34)), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=13)
    for i, (label, img_path) in enumerate(tiles):
        x, y = (i % cols) * size, (i // cols) * (size + 34)
        try:
            im = Image.open(img_path).convert("RGB")
            im.thumbnail((size - 6, size - 6))
            sheet.paste(im, (x + (size - im.width) // 2, y + (size - im.height) // 2))
        except Exception:
            draw.text((x + 10, y + 100), "could not open", fill="red", font=font)
        draw.text((x + 4, y + size + 2), label[:38], fill="black", font=font)
        draw.text((x + 4, y + size + 17), label[38:76], fill="black", font=font)
    sheet.save(path, quality=80)


def _thumb_for(work, cand_list, title):
    c = next((c for c in cand_list if c["title"] == title), None)
    if not c:
        return None
    os.makedirs(os.path.join(work, "thumbs"), exist_ok=True)
    dest = os.path.join(work, "thumbs", re.sub(r"[^\w.-]", "_", title)[:150])
    return dest if fetch(c["thumb"], dest) else None


def cmd_sheets(work, first=1, last=280, per_listing=5, listings_per_sheet=4):
    """Sheets to choose from: one row per listing, its top candidates labelled "<n>.<k>"."""
    cand = json.load(open(os.path.join(work, "candidates.json"), encoding="utf-8"))
    rows = [(n, name) for n, _, _, name in listings() if first <= n <= last]
    os.makedirs(os.path.join(work, "sheets"), exist_ok=True)
    for s in range(0, len(rows), listings_per_sheet):
        tiles = []
        for n, name in rows[s:s + listings_per_sheet]:
            cs = cand.get(name, [])[:per_listing]
            for k in range(per_listing):
                if k < len(cs):
                    t = _thumb_for(work, cand[name], cs[k]["title"]) or ""
                    tiles.append((f"{n}.{k} {name}" if k == 0 else f"{n}.{k}", t))
                else:
                    tiles.append((f"{n}.{k} (none)", ""))
        _sheet(tiles, os.path.join(work, "sheets", f"choose-{rows[s][0]:03d}.jpg"), cols=per_listing)
        print(f"sheet {rows[s][0]:03d}", flush=True)


def cmd_choose(work, choices):
    """Record picks: "<n>:<k>" takes candidate k of listing n."""
    cand = json.load(open(os.path.join(work, "candidates.json"), encoding="utf-8"))
    picks_path = os.path.join(work, "picks.json")
    picks = json.load(open(picks_path, encoding="utf-8")) if os.path.exists(picks_path) else {}
    by_n = {n: name for n, _, _, name in listings()}
    for ch in choices:
        n, k = (int(x) for x in ch.split(":"))
        picks[by_n[n]] = cand[by_n[n]][k]["title"]
    json.dump(picks, open(picks_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(picks)} picks")


def cmd_alts(work, numbers):
    cand = json.load(open(os.path.join(work, "candidates.json"), encoding="utf-8"))
    by_n = {n: name for n, _, _, name in listings()}
    for n in numbers:
        name = by_n[n]
        tiles = [(f"{k} {c['title'][5:]}", _thumb_for(work, cand[name], c["title"]) or "")
                 for k, c in enumerate(cand.get(name, [])[:10])]
        _sheet(tiles, os.path.join(work, "sheets", f"alts-{n:03d}.jpg"))
    print("done")


def cmd_final(work):
    from PIL import Image
    cand = json.load(open(os.path.join(work, "candidates.json"), encoding="utf-8"))
    picks = json.load(open(os.path.join(work, "picks.json"), encoding="utf-8"))
    out_dir = os.path.join(work, "final")
    os.makedirs(out_dir, exist_ok=True)
    sources = {}
    for n, top, ii, name in listings():
        title = picks.get(name)
        c = next((c for c in cand.get(name, []) if c["title"] == title), None)
        if not c:
            raise SystemExit(f"{n} {name}: no pick")
        # 1280 px is a standard Wikimedia thumbnail size; a smaller file is taken as it is.
        big = re.sub(r"/\d+px-", "/1280px-", c["thumb"]) if c["width"] > 1280 else c["original"]
        raw = os.path.join(out_dir, f"raw-{n:03d}")
        if not fetch(big, raw):
            raise SystemExit(f"{n} {name}: download failed")
        im = Image.open(raw).convert("RGB")
        im.thumbnail((1200, 1200))
        im.save(os.path.join(out_dir, f"{n:03d}.jpg"), "JPEG", quality=85, optimize=True, progressive=True)
        sources[f"{top}:{ii}"] = {"listing": name, "file": title, "page": c["page"], "artist": c["artist"],
                                  "licence": c["licence"], "licence_url": c["licence_url"],
                                  "source": "Wikimedia Commons", "changes": "resized"}
    json.dump(sources, open(os.path.join(HERE, "photo-sources.json"), "w", encoding="utf-8"), ensure_ascii=False,
              indent=1)
    print(f"{len(sources)} photos in {out_dir}; photo-sources.json written")


if __name__ == "__main__":
    cmd, work = sys.argv[1], sys.argv[2]
    os.makedirs(work, exist_ok=True)
    if cmd == "search":
        cmd_search(work)
    elif cmd == "sheets":
        cmd_sheets(work, *(int(x) for x in sys.argv[3:5]))
    elif cmd == "choose":
        cmd_choose(work, sys.argv[3:])
    elif cmd == "alts":
        cmd_alts(work, [int(x) for x in sys.argv[3:]])
    elif cmd == "final":
        cmd_final(work)
