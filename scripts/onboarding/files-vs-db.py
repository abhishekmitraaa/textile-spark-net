"""What is tested is what ships (registration fixes, 2026-11-13), on the LOCAL stack.

1. Every function a 20261113 migration defines has, in the local database, exactly the body the file gives it
   (md5 of the text between the dollar quotes; a migration that patches a body is checked through the self-checks).
2. Every self-check block (`do $check$ … $check$;`) in those files runs cleanly against the local database.
Usage: python scripts/onboarding/files-vs-db.py   (prints PASS/FAIL lines; exits 1 on any FAIL)
"""
import glob, hashlib, re, subprocess, sys

FILES = sorted(glob.glob("supabase/migrations/20261113*.sql"))
PSQL = ["docker", "exec", "-i", "supabase_db_localstack", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"]


def psql(sql: str) -> tuple[int, str]:
    p = subprocess.run(PSQL, input=sql.encode(), capture_output=True)
    return p.returncode, (p.stdout + p.stderr).decode(errors="replace").strip()


failed = 0
for f in FILES:
    s = open(f, encoding="utf-8", newline="").read().replace("\r\n", "\n")
    name = f.replace("\\", "/").split("/")[-1]
    for m in re.finditer(r"create or replace function ([a-z_]+\.[a-z_0-9]+)\((.*?)\)\s*returns.*?as (\$[a-z_]*\$)(.*?)\3",
                         s, re.S | re.I):
        fn, body = m.group(1), m.group(4)
        if fn.startswith("pg_temp."):
            continue
        want = hashlib.md5(body.encode()).hexdigest()
        rc, got = psql(f"select string_agg(md5(prosrc), ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                       f"where n.nspname || '.' || p.proname = '{fn}';")
        ok = rc == 0 and want in got.split(",")
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'}: {name} {fn} body = file{'' if ok else f' (file {want}, db {got})'}")
    for m in re.finditer(r"do \$check\$.*?\$check\$;", s, re.S):
        rc, out = psql("begin;\n" + m.group(0) + "\nrollback;\n")
        ok = rc == 0 and "ERROR" not in out
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'}: {name} self-check{'' if ok else ' ' + out[-300:]}")
print(f"== files vs db: {failed} failed")
sys.exit(1 if failed else 0)
