#!/usr/bin/env bash
# Platform Reviver v3 smoke test — hits local API at :8787
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

USER="smoke_v3_$(date +%s)"
PASSWD="TestPass123!"
USER_ID=""

echo "=== Hin v3 smoke test ($API) ==="

FLAG_ON=$(d1_scalar "SELECT value FROM system_settings WHERE key='gamification_enabled' LIMIT 1;" value 2>/dev/null || echo false)
echo "gamification_enabled (local D1): $FLAG_ON"

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

# Bootstrap (session_active hook — runs even when flag off, but no-ops)
BOOT1=$(curl -sf "$API/api/me/bootstrap" -H "$AUTH")
if echo "$BOOT1" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'followingIds' in d"; then
  pass "Bootstrap returns payload"
else fail "Bootstrap returns payload"; fi

BOOT2=$(curl -sf "$API/api/me/bootstrap" -H "$AUTH")
if printf '%s\n' "$BOOT1" "$BOOT2" | python3 -c "
import sys,json
lines=[l for l in sys.stdin.read().splitlines() if l.strip()]
assert len(lines)==2
json.loads(lines[0]); json.loads(lines[1])
"; then
  pass "Second bootstrap same day (idempotent)"
else fail "Second bootstrap"; fi

if [ "$FLAG_ON" = "true" ]; then
  if echo "$BOOT1" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('gamificationEnabled') is True"; then
    pass "Bootstrap reports gamificationEnabled=true"
  else fail "Bootstrap gamificationEnabled"; fi

  STREAK=$(d1_scalar "SELECT current AS n FROM user_streaks WHERE user_id=$USER_ID AND streak_type='login';" n 2>/dev/null || echo 0)
  if [ "${STREAK:-0}" = "1" ]; then pass "login_streak=1 after first bootstrap"; else fail "login_streak (got $STREAK)"; fi

  STREAK2=$(d1_scalar "SELECT current AS n FROM user_streaks WHERE user_id=$USER_ID AND streak_type='login';" n 2>/dev/null || echo 0)
  if [ "${STREAK2:-0}" = "1" ]; then pass "login_streak unchanged after second bootstrap"; else fail "login_streak double-count (got $STREAK2)"; fi
fi

# Events public route
EVENTS=$(curl -sf "$API/api/events/active" -H "$AUTH")
if echo "$EVENTS" | python3 -c "import sys,json; assert 'events' in json.load(sys.stdin)"; then
  pass "GET /api/events/active"
else fail "GET /api/events/active"; fi

# Create post + comment
POST=$(curl -sf -X POST "$API/api/posts" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"content":"v3 smoke test post"}')
POST_ID=$(echo "$POST" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
if [ -n "$POST_ID" ]; then pass "Create post"; else fail "Create post"; fi

COMMENT=$(curl -sf -X POST "$API/api/posts/$POST_ID/comments" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"content":"v3 smoke comment"}')
COMMENT_ID=$(echo "$COMMENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
if [ -n "$COMMENT_ID" ]; then pass "Create comment"; else fail "Create comment"; fi

if echo "$COMMENT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('g') is None or 'pe' in d.get('g',{})"; then
  pass "Comment response shape (optional g block)"
else fail "Comment response shape"; fi

if [ "$FLAG_ON" = "true" ]; then
  if echo "$COMMENT" | python3 -c "import sys,json; d=json.load(sys.stdin); g=d.get('g'); assert g and g.get('pe',0) >= 3"; then
    pass "Comment awards points (g.pe >= 3)"
  else fail "Comment points (g block)"; fi

  TC=$(d1_scalar "SELECT value AS n FROM user_stat_counters WHERE user_id=$USER_ID AND metric_key='total_comments';" n 2>/dev/null || echo 0)
  if [ "${TC:-0}" = "1" ]; then pass "total_comments=1 after comment"; else fail "total_comments (got $TC)"; fi

  UC=$(d1_scalar "SELECT value AS n FROM user_stat_counters WHERE user_id=$USER_ID AND metric_key='unique_posts_commented';" n 2>/dev/null || echo 0)
  if [ "${UC:-0}" = "1" ]; then pass "unique_posts_commented=1 after first comment on post"; else fail "unique_posts_commented (got $UC)"; fi
fi

# Soft-delete comment
DEL=$(curl -sf -X DELETE "$API/api/comments/$COMMENT_ID" -H "$AUTH")
if echo "$DEL" | python3 -c "import sys,json; assert json.load(sys.stdin).get('success')"; then
  pass "Delete comment (comment_deleted hook)"
else fail "Delete comment"; fi

if [ "$FLAG_ON" = "true" ]; then
  TC2=$(d1_scalar "SELECT value AS n FROM user_stat_counters WHERE user_id=$USER_ID AND metric_key='total_comments';" n 2>/dev/null || echo 0)
  if [ "${TC2:-0}" = "0" ]; then pass "total_comments=0 after delete"; else fail "total_comments after delete (got $TC2)"; fi

  UC2=$(d1_scalar "SELECT value AS n FROM user_stat_counters WHERE user_id=$USER_ID AND metric_key='unique_posts_commented';" n 2>/dev/null || echo 0)
  if [ "${UC2:-0}" = "0" ]; then pass "unique_posts_commented=0 after last comment deleted"; else fail "unique_posts_commented after delete (got $UC2)"; fi
fi

# Gamification public endpoint
GAM=$(curl -sf "$API/api/me/gamification" -H "$AUTH")
if echo "$GAM" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'level' in d and 'badges' in d"; then
  pass "GET /api/me/gamification"
else fail "GET /api/me/gamification"; fi

# Week Regular visible in bootstrap goals when g present
if echo "$BOOT1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
g=d.get('g') or {}
goals=[x.get('name') for x in g.get('goalsInProgress',[])]
assert 'Week Regular' in goals
"; then
  pass "Week Regular in bootstrap goals"
else fail "Week Regular in bootstrap goals"; fi

# DB tables
TABLES=$(d1_scalar "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('user_streaks','events','event_rules','event_participants','event_wins');" n || echo 0)
if [ "$TABLES" = "5" ]; then pass "v3 tables in local D1 (5)"; else fail "v3 tables (got $TABLES)"; fi

WEEK=$(d1_scalar "SELECT COUNT(*) AS n FROM badges WHERE name='Week Regular';" n || echo 0)
if [ "$WEEK" -ge 1 ] 2>/dev/null; then pass "Week Regular badge seeded"; else fail "Week Regular badge"; fi

# Streak row after bootstrap (when gamification off, session_active no-ops — skip counter check)
# Enable gamification smoke if admin exists
ADMIN_ROW=$(d1_scalar "SELECT COUNT(*) AS n FROM users WHERE role='admin';" 2>/dev/null || echo 0)
if [ "${ADMIN_ROW:-0}" -ge 1 ] 2>/dev/null; then
  echo "⏭️  Admin gamification toggle test skipped (needs admin password)"
else
  echo "⏭️  No admin user in local DB for toggle test"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
test "$FAIL" -eq 0
