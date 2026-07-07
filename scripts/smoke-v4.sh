#!/usr/bin/env bash
# Platform Reviver v4 smoke test — hits local API at :8787
set -euo pipefail

API="${API_URL:-http://127.0.0.1:8787}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

d1_scalar() {
  local col="${2:-n}"
  cd "$REPO/apps/api" && npx wrangler d1 execute hin-d1 --local -c wrangler.toml \
    --command "$1" 2>/dev/null | awk '/^\[/{buf=$0; while((getline line) > 0) buf=buf"\n"line} END{print buf}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['results'][0]['$col'])" 2>/dev/null
}

pass() { echo "✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "❌ $1"; FAIL=$((FAIL + 1)); }

USER="smoke_v4_$(date +%s)"
PASSWD="TestPass123!"
USER_ID=""

echo "=== Hin v4 smoke test ($API) ==="

# Health
if curl -sf "$API/" | grep -q "Hin API"; then pass "API root"; else fail "API root"; fi

# Register
REG=$(curl -sf -X POST "$API/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASSWD\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
USER_ID=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")
if [ -n "$TOKEN" ]; then pass "Register user $USER"; else fail "Register user"; fi

AUTH="Authorization: Bearer $TOKEN"

# Session tick (no-op when gamification off)
TICK=$(curl -sf -X POST "$API/api/me/session-tick" -H "$AUTH" -H 'Content-Type: application/json' -d '{"minutes":5}')
if echo "$TICK" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')"; then
  pass "POST /api/me/session-tick"
else fail "POST /api/me/session-tick"; fi

# Warming Up badge seeded
WARM=$(d1_scalar "SELECT COUNT(*) AS n FROM badges WHERE name='Warming Up';" n || echo 0)
if [ "$WARM" -ge 1 ] 2>/dev/null; then pass "Warming Up badge seeded"; else fail "Warming Up badge"; fi

# Archive table
ARCH=$(d1_scalar "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='points_ledger_archive';" n || echo 0)
if [ "$ARCH" = "1" ]; then pass "points_ledger_archive table"; else fail "points_ledger_archive"; fi

# Admin login + user lookup
ADMIN_TOKEN=$(curl -sf -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"087425"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

if [ -n "$ADMIN_TOKEN" ]; then
  LOOKUP=$(curl -sf "$API/api/admin/gamification/users/$USER_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
  if echo "$LOOKUP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('userId')==int('$USER_ID')"; then
    pass "GET /api/admin/gamification/users/:id"
  else fail "Admin user lookup"; fi

  METRICS=$(curl -sf "$API/api/admin/gamification/metrics" -H "Authorization: Bearer $ADMIN_TOKEN")
  if echo "$METRICS" | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d.get('metrics',[]))>=8"; then
    pass "Metric catalog API"
  else fail "Metric catalog"; fi
else
  echo "⏭️  Admin login skipped — no admin user in local DB"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
test "$FAIL" -eq 0
