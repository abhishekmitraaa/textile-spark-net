"""
Cosora full-surface sweep for the vendor subscriptions build (P0-P13), local stack only.

Every static route of the buyer/vendor app (vercel.json's rewrites) and of Cosora-Admin (its router)
is opened as each persona: a visitor, a buyer, a seller on each plan (every feature switch lists the
fixtures), and each admin role; at desktop and phone width; the subscription pages also in Hindi.
For every visit it records: where the page ended up (plan gating), console errors and uncaught
exceptions, failed requests and HTTP errors, "undefined"/"NaN"/"Invalid Date"/"[object Object]" in the
text, an error screen, a page stuck on "Loading", sideways overflow, and (in Hindi) runs of English
left untranslated. Fixtures are made at the start and put back at the end.

Usage:  python scripts/local-stack/surface-sweep.py <out dir> [--workers 3]
        python scripts/local-stack/surface-sweep-analyze.py <out dir>     (findings.md in <out dir>)
Needs:  pip install playwright requests; python -m playwright install chromium
        LOCAL_STACK_ENV (as the local specs), COSORA_ADMIN_REPO (Cosora-Admin's checkout, for its routes),
        both apps' dev servers (LOCAL_BUYER_URL, LOCAL_ADMIN_URL; defaults :8092 and :5186).
Written for the subscriptions build's complete test run, 2026-10-09 (subscription-session/TEST-REPORT.md).
"""
import json
import multiprocessing as mp
import os
import re
import subprocess
import sys
import time
from urllib.parse import urlparse

import requests
from playwright.sync_api import sync_playwright

ENV_PATH = os.environ.get("LOCAL_STACK_ENV") or sys.exit("set LOCAL_STACK_ENV (the local stack's env JSON)")
BUYER_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ADMIN_REPO = os.environ.get("COSORA_ADMIN_REPO") or sys.exit("set COSORA_ADMIN_REPO (Cosora-Admin's checkout)")
BUYER = os.environ.get("LOCAL_BUYER_URL", "http://localhost:8092")
ADMIN = os.environ.get("LOCAL_ADMIN_URL", "http://localhost:5186")
ENV = json.load(open(ENV_PATH, encoding="utf-8"))
API, ANON, SERVICE, PASSWORD = ENV["API"], ENV["ANON"], ENV["SERVICE"], ENV["PASSWORD"]
STORAGE_KEY = f"sb-{urlparse(API).hostname.split('.')[0]}-auth-token"
if urlparse(API).hostname not in ("127.0.0.1", "localhost"):
    sys.exit("refusing: not the local stack")

DESKTOP = {"width": 1280, "height": 900}
PHONE = {"width": 390, "height": 844}
TIERS = ["free", "basic", "silver", "gold", "vip"]
# Least plan that may open each gated page (the plan's design; vendor_entitlements decides).
GATED = {
    "/lead-alerts": "basic", "/visibility": "basic",
    "/crm": "silver", "/crm/follow-ups": "silver", "/account-manager": "silver", "/catalogue/bulk-import": "silver",
    "/overseas-leads": "gold", "/crm/analytics": "gold",
}
VENDOR_ROUTES = ["/dashboard", "/products", "/upload", "/leads", "/quotes", "/advertisements", "/analytics", "/subscription",
                 "/my-payments", "/settings", "/notifications", "/my-store", "/business-profile", "/kyc", "/cosora-studio",
                 "/chats", "/help", "/competitor-ads", "/upload-catalogue", "/upload-video", *GATED.keys()]
HINDI_ROUTES = ["/subscription", "/leads", "/products", "/advertisements", "/settings", *GATED.keys()]
ADMIN_ROLES = ["super_admin", "finance_admin", "support", "manager", "account_manager", "product_moderator"]
BAD_TEXT = re.compile(r"\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|\bnull\b(?= ?(products|plan|days|₹|%))")
ERROR_SCREEN = re.compile(r"Something went wrong|Unexpected Application Error|Application error|Cannot read properties")
STUCK = re.compile(r"^(Loading…|Loading\.\.\.|Loading)$", re.M)
# Words that stay English in Hindi (names, brands, codes).
KEEP_ENGLISH = {"cosora", "razorpay", "whatsapp", "gold", "silver", "basic", "vip", "free", "gst", "gstin", "pan", "csv", "excel",
                "google", "sheets", "utf", "pdf", "crm", "sms", "upi", "id", "kyc", "moq", "pcs", "ai", "tradeseal", "india",
                "surat", "mills", "textiles", "test", "inr", "otp", "email", "app", "cosora's", "studio", "url", "https", "the",
                "e.g.", "rfq", "b2b", "ist", "faq", "ok"}


def sql(q):
    r = subprocess.run(["docker", "exec", "-i", "supabase_db_localstack", "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"],
                       input=q, capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[:500])
    return r.stdout.strip()


def fresh(prefix, seller=False):
    email = f"{prefix}-{int(time.time() * 1000):x}@cosora.test"
    h = {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"}
    r = requests.post(f"{API}/auth/v1/admin/users", headers=h, json={
        "email": email, "password": PASSWORD, "email_confirm": True,
        "user_metadata": {"active_role": "seller" if seller else "buyer", "full_name": f"{prefix} test"}})
    r.raise_for_status()
    uid = r.json()["id"]
    sql(f"update public.profiles set onboarded = true where id = '{uid}';")
    if seller:
        sql(f"""insert into public.vendor_profiles (id, brand_name, city, country, business_type, onboarding_complete, state_code)
                values ('{uid}', '{prefix} Textiles', 'Surat', 'India', 'Manufacturer', true, 'GJ') on conflict (id) do nothing;""")
    s = requests.post(f"{API}/auth/v1/token?grant_type=password", headers={"apikey": ANON}, json={"email": email, "password": PASSWORD})
    s.raise_for_status()
    sess = s.json()
    sess.setdefault("expires_at", int(time.time()) + int(sess.get("expires_in", 3600)))
    return {"id": uid, "email": email, "session": sess}


def setup():
    stamp = f"{int(time.time()):x}"
    people = {"buyer": fresh(f"sweep-buyer-{stamp}")}
    cat = sql("select id from public.categories where name = 'Activewear' order by (parent_id is not null) desc limit 1")
    for t in TIERS:
        who = fresh(f"sweep-{t}-{stamp}", seller=True)
        people[f"seller_{t}"] = who
        sql(f"""insert into public.products (vendor_id, name, status, category_id, price_value, currency, moq)
                select '{who['id']}', 'Sweep {t} polo ' || g, 'live', '{cat}', 240 + g, '₹', '500 pcs' from generate_series(1, 2) g;""")
        if t != "free":
            sql(f"""insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
                    values ('{who['id']}', '{t}', 'monthly', 'active', now() - interval '5 days', now() + interval '25 days')
                    on conflict (vendor_id) do update set plan_id = excluded.plan_id, status = 'active',
                      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end;
                    update public.vendor_profiles set plan_id = '{t}', plan_expires_at = now() + interval '32 days' where id = '{who['id']}';""")
    for role in ADMIN_ROLES:
        who = fresh(f"sweep-{role.replace('_', '-')}-{stamp}")
        sql(f"insert into admin.admin_users (id, admin_role, is_active) values ('{who['id']}', '{role}', true) "
            f"on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;")
        people[f"admin_{role}"] = who
    ids = [p["id"] for p in people.values()]
    saved = sql("select coalesce(json_agg(json_build_object('key', key, 'allow', allow_profile_ids)), '[]') from public.feature_flags")
    arr = "'{" + ",".join(ids) + "}'::uuid[]"
    sql(f"update public.feature_flags set allow_profile_ids = array(select distinct unnest(coalesce(allow_profile_ids, '{{}}') || {arr}));")
    return people, saved


def teardown(people, saved):
    for f in json.loads(saved):
        allow = f["allow"] or []
        arr = "'{" + ",".join(allow) + "}'::uuid[]"
        sql(f"update public.feature_flags set allow_profile_ids = {arr} where key = '{f['key']}';")
    for k, p in people.items():
        i = p["id"]
        sql(f"""delete from public.vendor_subscriptions where vendor_id = '{i}';
                delete from public.products where vendor_id = '{i}';
                update public.vendor_profiles set plan_id = null, plan_expires_at = null where id = '{i}';
                update admin.admin_users set is_active = false where id = '{i}';""")


def visit(job):
    """One persona, one browser, a list of (app, route, lang, viewport)."""
    persona, session, items, out_dir = job
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for app, route, lang, vp_name in items:
            vp = DESKTOP if vp_name == "desktop" else PHONE
            ctx = browser.new_context(viewport=vp)
            init = []
            if session:
                init.append(f"localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(json.dumps(session))});")
            if lang:
                init.append(f"localStorage.setItem('cosora.lang', {json.dumps(lang)});")
            if init:
                ctx.add_init_script("try {" + "".join(init) + "} catch (e) {}")
            page = ctx.new_page()
            rec = {"persona": persona, "app": app, "route": route, "lang": lang or "en", "viewport": vp_name,
                   "console": [], "pageerror": [], "http": [], "failed": []}
            page.on("dialog", lambda d: d.dismiss())
            page.on("console", lambda m, rec=rec: rec["console"].append(m.text[:300]) if m.type == "error" else None)
            page.on("pageerror", lambda e, rec=rec: rec["pageerror"].append(str(e)[:300]))
            page.on("response", lambda r, rec=rec: rec["http"].append(f"{r.status} {r.request.method} {r.url[:220]}") if r.status >= 400 else None)
            page.on("requestfailed", lambda r, rec=rec: rec["failed"].append(f"{r.failure} {r.url[:200]}")
                    if r.failure and "ERR_ABORTED" not in r.failure else None)
            base = BUYER if app == "buyer" else ADMIN
            t0 = time.time()
            try:
                page.goto(base + route, wait_until="domcontentloaded", timeout=30000)
                try:
                    page.wait_for_load_state("networkidle", timeout=12000)
                except Exception:
                    rec["note"] = "never idle"
                page.wait_for_timeout(1200)
                rec["final"] = urlparse(page.url).path + (("?" + urlparse(page.url).query) if urlparse(page.url).query else "")
                text = page.evaluate("() => document.body ? document.body.innerText : ''")
                rec["bad_text"] = sorted(set(m.group(0) for m in BAD_TEXT.finditer(text)))
                rec["error_screen"] = bool(ERROR_SCREEN.search(text))
                rec["stuck"] = bool(STUCK.search(text))
                rec["overflow"] = page.evaluate(
                    "() => { const e = document.scrollingElement; return e ? Math.max(0, e.scrollWidth - e.clientWidth) : 0 }")
                if lang == "hi":
                    rec["english"] = page.evaluate("""(keep) => {
                      const out = new Set();
                      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                      let n;
                      while ((n = walk.nextNode())) {
                        const el = n.parentElement;
                        if (!el || el.closest('[data-no-translate],script,style,code,input,textarea,[translate=no]')) continue;
                        const r = el.getBoundingClientRect();
                        if (!r.width || !r.height) continue;
                        const t = n.textContent.trim();
                        const words = t.match(/[A-Za-z][A-Za-z'’.-]+/g) || [];
                        const real = words.filter(w => !keep.includes(w.toLowerCase()));
                        // Already translated (Devanagari or Gujarati in it), or the sweep's own fixtures: not English left over.
                        if (/[ऀ-ॿ઀-૿]/.test(t) || /sweep/i.test(t)) continue;
                        if (real.length >= 2 && /[a-z]{3}/.test(t)) out.add(t.slice(0, 120));
                      }
                      return [...out].slice(0, 40);
                    }""", sorted(KEEP_ENGLISH))
                slug = re.sub(r"[^a-z0-9]+", "-", f"{persona}-{app}{route}-{lang or 'en'}-{vp_name}".lower()).strip("-")
                problem = (rec["pageerror"] or rec["error_screen"] or rec["bad_text"] or rec["stuck"] or rec["overflow"] > 2
                           or any(not re.search(r"favicon|Failed to load resource", c) for c in rec["console"]))
                if problem or vp_name == "phone" and route in GATED:
                    page.screenshot(path=os.path.join(out_dir, slug + ".png"), full_page=False)
                    rec["shot"] = slug + ".png"
            except Exception as e:
                rec["exception"] = str(e)[:300]
            rec["ms"] = int((time.time() - t0) * 1000)
            results.append(rec)
            ctx.close()
        browser.close()
    return results


def plan(people):
    buyer_routes = json.load(open(os.path.join(BUYER_REPO, "vercel.json"), encoding="utf-8"))["rewrites"]
    buyer_routes = [r["source"] for r in buyer_routes
                    if ":" not in r["source"] and not r["source"].startswith("/api") and "sitemap" not in r["source"]
                    and "robots" not in r["source"] and not r["source"].startswith("/auth/")]
    admin_src = open(os.path.join(ADMIN_REPO, "src", "App.tsx"), encoding="utf-8").read()
    admin_routes = [r for r in re.findall(r'path="([^"]+)"', admin_src)
                    if ":" not in r and r not in ("*", "/login", "/reset-password", "/set-password")]
    gold = people["seller_gold"]["id"]
    admin_routes += [f"/vendors/{gold}"]
    jobs = [
        ("visitor", None, [("buyer", r, None, "phone") for r in buyer_routes]),
        ("buyer", people["buyer"]["session"], [("buyer", r, None, "phone") for r in buyer_routes]),
        ("buyer", people["buyer"]["session"], [("buyer", r, None, "desktop") for r in buyer_routes]),
        ("seller_gold", people["seller_gold"]["session"], [("buyer", r, None, "desktop") for r in buyer_routes]),
        ("seller_gold", people["seller_gold"]["session"], [("buyer", r, None, "phone") for r in VENDOR_ROUTES]),
        ("seller_gold", people["seller_gold"]["session"], [("buyer", r, "hi", "desktop") for r in HINDI_ROUTES]),
        # Hindi on every route: the seller at desktop, the buyer on a phone.
        ("seller_gold", people["seller_gold"]["session"], [("buyer", r, "hi", "desktop") for r in buyer_routes if r not in HINDI_ROUTES]),
        ("buyer", people["buyer"]["session"], [("buyer", r, "hi", "phone") for r in [*buyer_routes, "/search/results?category=Activewear"]]),
    ]
    for t in ["free", "basic", "silver", "vip"]:
        jobs.append((f"seller_{t}", people[f"seller_{t}"]["session"],
                     [("buyer", r, None, "desktop") for r in [*GATED.keys(), "/subscription", "/leads", "/products", "/advertisements", "/dashboard"]]))
    for role in ADMIN_ROLES:
        jobs.append((f"admin_{role}", people[f"admin_{role}"]["session"], [("admin", r, None, "desktop") for r in admin_routes]))
    jobs.append(("admin_super_admin", people["admin_super_admin"]["session"], [("admin", r, None, "phone") for r in ["/subscriptions", "/feature-flags", "/billing-details", "/my-vendors", "/system-health", "/leads"]]))
    return jobs


def main():
    out_dir = sys.argv[1]
    workers = int(sys.argv[sys.argv.index("--workers") + 1]) if "--workers" in sys.argv else 3
    os.makedirs(out_dir, exist_ok=True)
    people, saved = setup()
    json.dump({k: {"id": v["id"], "email": v["email"]} for k, v in people.items()}, open(os.path.join(out_dir, "people.json"), "w"), indent=1)
    try:
        jobs = plan(people)
        # Split each persona's list into chunks so the workers stay busy.
        chunks = []
        for persona, session, items in jobs:
            for i in range(0, len(items), 12):
                chunks.append((persona, session, items[i:i + 12], out_dir))
        print(f"{sum(len(c[2]) for c in chunks)} visits in {len(chunks)} chunks, {workers} workers", flush=True)
        results = []
        with mp.Pool(workers) as pool:
            for n, res in enumerate(pool.imap_unordered(visit, chunks), 1):
                results.extend(res)
                if n % 10 == 0:
                    print(f"  {n}/{len(chunks)} chunks", flush=True)
        json.dump(results, open(os.path.join(out_dir, "results.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"wrote {len(results)} visits", flush=True)
    finally:
        teardown(people, saved)
        print("fixtures put back", flush=True)


if __name__ == "__main__":
    main()
