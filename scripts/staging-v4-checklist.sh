#!/usr/bin/env bash
# Platform Reviver v4 — staging verification checklist
# Run from repo root after deploying API + web to staging.
#
# Usage:
#   export API_URL=https://your-staging-api.example.com
#   export ADMIN_USER=admin
#   export ADMIN_PASS=your-admin-password
#   ./scripts/staging-v4-checklist.sh

set -euo pipefail

API="${API_URL:?Set API_URL to your staging API base URL}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:?Set ADMIN_PASS}"

echo "=== Platform Reviver v4 staging checklist ==="
echo "API: $API"
echo ""

pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; exit 1; }

# 1. Health
curl -sf "$API/" | grep -q "Hin API" && pass "API health" || fail "API health"

# 2. Remote migration (manual — run once before this script)
echo ""
echo "⏭️  Ensure migration 0028 applied remotely:"
echo "    cd apps/api && npx wrangler d1 migrations apply hin-d1 --remote -c wrangler.toml"
echo ""

# 3. Admin login
ADMIN_JSON=$(curl -sf -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}") || fail "Admin login"
ADMIN_TOKEN=$(echo "$ADMIN_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
pass "Admin login"

# 4. Enable gamification (staging only)
curl -sf -X PATCH "$API/api/admin/gamification/settings" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"gamificationEnabled":true}' > /dev/null
ENABLED=$(curl -sf "$API/api/admin/gamification/settings" -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('gamificationEnabled'))")
[ "$ENABLED" = "True" ] && pass "Gamification enabled in staging" || fail "Gamification toggle"

# 5. Metric catalog
METRIC_COUNT=$(curl -sf "$API/api/admin/gamification/metrics" -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('metrics',[])))")
[ "$METRIC_COUNT" -ge 8 ] && pass "Metric catalog ($METRIC_COUNT metrics)" || fail "Metric catalog"

# 6. Register test user + session tick
USER="staging_v4_$(date +%s)"
REG=$(curl -sf -X POST "$API/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"TestPass123!\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
USER_ID=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")
pass "Register test user $USER"

TICK=$(curl -sf -X POST "$API/api/me/session-tick" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"minutes":5}')
echo "$TICK" | python3 -c "import sys,json; assert json.load(sys.stdin).get('ok')" && pass "Session tick" || fail "Session tick"

# 7. Admin user lookup (no rule leakage)
LOOKUP=$(curl -sf "$API/api/admin/gamification/users/$USER_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$LOOKUP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'counters' in d and 'badges' in d and 'recentLedger' in d
assert 'metric_key' not in str(d)
assert 'badge_rules' not in str(d)
" && pass "Admin user lookup (no rule leakage)" || fail "Admin user lookup"

# 8. Bootstrap streak
BOOT=$(curl -sf "$API/api/me/bootstrap" -H "Authorization: Bearer $TOKEN")
echo "$BOOT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('gamificationEnabled') is True" \
  && pass "Bootstrap with gamification" || fail "Bootstrap"

# 9. Ledger archival endpoint
ARCH=$(curl -sf -X POST "$API/api/admin/gamification/maintenance/archive-ledger" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$ARCH" | python3 -c "import sys,json; assert 'archived' in json.load(sys.stdin)" \
  && pass "Ledger archival endpoint" || fail "Ledger archival"

echo ""
echo "=== Automated staging checks passed ==="
echo ""
echo "Manual checks still required:"
echo "  [ ] Tab open 5+ min → total_session_minutes increases (Warming Up badge at 5)"
echo "  [ ] Rapid comment/share spam → rate limit or daily point cap blocks farming"
echo "  [ ] Admin UI: User support lookup, metric catalog table, manual badge award"
echo "  [ ] Create raffle event → end → winner recorded in event_wins"
echo "  [ ] Load test ~100 concurrent users — no D1 limit errors"
echo "  [ ] Production gamification_enabled decision documented"
echo ""
echo "To disable after testing:"
echo "  curl -X PATCH $API/api/admin/gamification/settings \\"
echo "    -H 'Authorization: Bearer \$ADMIN_TOKEN' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"gamificationEnabled\":false}'"
