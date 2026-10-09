"""surface-sweep-analyze.py <run dir> — groups surface-sweep.py's results into findings (markdown to stdout and <run dir>/findings.md)."""
import json
import os
import re
import sys
from collections import defaultdict

run = sys.argv[1]
R = json.load(open(os.path.join(run, "results.json"), encoding="utf-8"))
TIERS = ["free", "basic", "silver", "gold", "vip"]
GATED = {"/lead-alerts": "basic", "/visibility": "basic", "/crm": "silver", "/crm/follow-ups": "silver",
         "/account-manager": "silver", "/catalogue/bulk-import": "silver", "/overseas-leads": "gold", "/crm/analytics": "gold"}
out = []
p = out.append


def norm_url(u):
    u = re.sub(r"\?.*$", "", u)
    u = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "<id>", u)
    return u


def where(recs, n=6):
    s = sorted({f"{r['persona']}:{r['app']}{r['route']}{'' if r['lang'] == 'en' else '[' + r['lang'] + ']'}{'' if r['viewport'] == 'desktop' else '@phone'}" for r in recs})
    return ", ".join(s[:n]) + (f" … (+{len(s) - n})" if len(s) > n else "")


p(f"# Sweep findings ({len(R)} visits)\n")
ex = [r for r in R if r.get("exception")]
p(f"## Navigation failures: {len(ex)}")
for r in ex[:30]:
    p(f"- {r['persona']} {r['app']}{r['route']}: {r['exception'][:160]}")

groups = defaultdict(list)
for r in R:
    for e in r["pageerror"]:
        groups[("pageerror", re.sub(r"\d+", "#", e[:140]))].append(r)
p(f"\n## Uncaught exceptions: {len(groups)} kinds")
for (k, msg), recs in sorted(groups.items(), key=lambda kv: -len(kv[1])):
    p(f"- ({len(recs)}) `{msg}` — {where(recs)}")

groups = defaultdict(list)
for r in R:
    for c in r["console"]:
        if re.search(r"Failed to load resource|favicon", c):
            continue
        key = re.sub(r"[0-9a-f]{8}-[0-9a-f-]{27}", "<id>", c)
        key = re.sub(r"\d{2,}", "#", key)[:160]
        groups[key].append(r)
p(f"\n## Console errors: {len(groups)} kinds")
for msg, recs in sorted(groups.items(), key=lambda kv: -len(kv[1])):
    p(f"- ({len(recs)}) `{msg}` — {where(recs)}")

groups = defaultdict(list)
for r in R:
    for h in r["http"]:
        st, method, url = h.split(" ", 2)
        groups[(st, method, norm_url(url))].append(r)
p(f"\n## HTTP errors: {len(groups)} kinds")
for (st, method, url), recs in sorted(groups.items(), key=lambda kv: (-len(kv[1]))):
    p(f"- ({len(recs)}) {st} {method} {url} — {where(recs)}")

groups = defaultdict(list)
for r in R:
    for f in r["failed"]:
        groups[re.sub(r"\?.*$", "", f)[:160]].append(r)
p(f"\n## Failed requests: {len(groups)} kinds")
for k, recs in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:30]:
    p(f"- ({len(recs)}) {k} — {where(recs, 4)}")

for label, test in [("Error screens", lambda r: r.get("error_screen")), ("Bad text (undefined/NaN/Invalid Date…)", lambda r: r.get("bad_text")),
                    ("Stuck on Loading", lambda r: r.get("stuck")), ("Sideways overflow > 2px", lambda r: (r.get("overflow") or 0) > 2),
                    ("Never idle (polling)", lambda r: r.get("note") == "never idle")]:
    recs = [r for r in R if test(r)]
    p(f"\n## {label}: {len(recs)}")
    for r in recs[:60]:
        extra = r.get("bad_text") or (f"{r.get('overflow')}px" if label.startswith("Sideways") else "")
        p(f"- {r['persona']} {r['app']}{r['route']} [{r['lang']}, {r['viewport']}] → {r.get('final')} {extra} {r.get('shot', '')}")

p("\n## Plan gating (allowed = stays on the page; refused = sent to /subscription)")
p("| Page | " + " | ".join(TIERS) + " |")
p("|---|" + "---|" * len(TIERS))
wrong = []
for route, least in GATED.items():
    cells = []
    for t in TIERS:
        recs = [r for r in R if r["persona"] == f"seller_{t}" and r["route"] == route and r["viewport"] == "desktop" and r["lang"] == "en"]
        if not recs:
            cells.append("?")
            continue
        final = recs[0].get("final") or ""
        allowed = final.split("?")[0] == route
        expect = TIERS.index(t) >= TIERS.index(least)
        mark = ("open" if allowed else "plans") + ("" if allowed == expect else " ✗")
        if allowed != expect:
            wrong.append(f"{route} on {t}: {'open' if allowed else 'sent to ' + final}, expected {'open' if expect else 'plans'}")
        cells.append(mark)
    p(f"| {route} | " + " | ".join(cells) + " |")
p(f"\nGating mismatches: {len(wrong)}")
for w in wrong:
    p(f"- {w}")

hi = defaultdict(set)
for r in R:
    for t in r.get("english") or []:
        hi[t].add(f"{r['persona']}:{r['route']}")
p(f"\n## English left in Hindi: {len(hi)} strings")
for t, w in sorted(hi.items()):
    p(f"- `{t}` — {', '.join(sorted(w))[:150]}")

slow = sorted(R, key=lambda r: -r["ms"])[:10]
p("\n## Slowest loads")
for r in slow:
    p(f"- {r['ms']} ms {r['persona']} {r['app']}{r['route']} [{r['viewport']}]")

text = "\n".join(out)
open(os.path.join(run, "findings.md"), "w", encoding="utf-8").write(text)
print(text)
