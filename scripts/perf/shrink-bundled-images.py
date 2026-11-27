"""Shrink the pictures bundled with the app (speed plan 2.6, 2026-11-27).

    python scripts/perf/shrink-bundled-images.py          report only
    python scripts/perf/shrink-bundled-images.py --write  rewrite the files

Keeps every file's name, format and pixel size where a rule fixes them (category tiles 480 x 480, banners 1440 x 630,
documentation/claude.md "Category pictures"): JPEGs are re-encoded progressive at the quality below, metadata dropped,
and a file is replaced only when the new one is at least 15 % smaller. Two pictures are also resized to the largest
size they are shown at (times 3 for phone screens): the Trusted Seal (shown at most 32 px high) and the Studio hero
(at most ~480 px wide on a phone). Needs Pillow.
"""
import os
import sys
from PIL import Image

WRITE = "--write" in sys.argv
MIN_SAVING = 0.15
ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "assets")

JPEG_DIRS = {
    os.path.join("categories", "tiles"): 80,
    os.path.join("categories", "banners"): 78,
    "advertisments": 78,
}
RESIZE = {
    "Trustedseal.png": ("height", 112),
    "cosora-studio-hero.jpg": ("width", 1440),
}


def encode(im, path, quality):
    tmp = path + ".tmp"
    if path.lower().endswith(".png"):
        im.save(tmp, "PNG", optimize=True)
    else:
        im.convert("RGB").save(tmp, "JPEG", quality=quality, optimize=True, progressive=True)
    return tmp


def consider(path, quality, resize=None):
    before = os.path.getsize(path)
    im = Image.open(path)
    im.load()
    if resize:
        side, target = resize
        w, h = im.size
        if (side == "height" and h > target) or (side == "width" and w > target):
            scale = target / (h if side == "height" else w)
            im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    tmp = encode(im, path, quality)
    after = os.path.getsize(tmp)
    keep = after <= before * (1 - MIN_SAVING)
    if keep and WRITE:
        os.replace(tmp, path)
    else:
        os.remove(tmp)
    return before, after if keep else before


total_before = total_after = changed = 0
for rel, (side, target) in RESIZE.items():
    b, a = consider(os.path.join(ROOT, rel), 78, (side, target))
    total_before += b; total_after += a; changed += a < b
    print(f"{rel}: {b // 1024} KB -> {a // 1024} KB")
for rel_dir, quality in JPEG_DIRS.items():
    for d, _, files in os.walk(os.path.join(ROOT, rel_dir)):
        for f in files:
            if f.lower().endswith((".jpg", ".jpeg")):
                b, a = consider(os.path.join(d, f), quality)
                total_before += b; total_after += a; changed += a < b
print(f"{changed} files {'rewritten' if WRITE else 'would change'}: {total_before // 1024} KB -> {total_after // 1024} KB")
