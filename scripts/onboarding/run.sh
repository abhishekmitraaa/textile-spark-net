#!/usr/bin/env bash
# Run registration harnesses against the LOCAL stack. Exits 1 when any case prints FAIL or psql errors.
# Usage: bash scripts/onboarding/run.sh scripts/onboarding/registration.sql [more.sql ...]
set -u
status=0
for f in "$@"; do
  out=$(docker exec -i supabase_db_localstack psql -U postgres -d postgres -q < "$f" 2>&1)
  lines=$(printf '%s\n' "$out" | grep -E "PASS|FAIL|ERROR" | sed 's/^.*NOTICE:  //')
  printf '%s\n' "$lines"
  pass=$(printf '%s\n' "$lines" | grep -c "^PASS")
  fail=$(printf '%s\n' "$lines" | grep -cE "^FAIL|ERROR")
  echo "== $f: $pass passed, $fail failed"
  [ "$fail" -eq 0 ] || status=1
done
exit $status
