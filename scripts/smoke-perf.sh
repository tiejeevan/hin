#!/usr/bin/env bash
# Performance smoke test — N+1 / query-efficiency regression gate.
# Requires local API at :8787 (npm run dev --workspace=apps/api).
#
# Usage:
#   ./scripts/smoke-perf.sh
#   API_URL=http://127.0.0.1:8787 ./scripts/smoke-perf.sh

set -euo pipefail

API="${API_URL:-http://127.0.0.1:8787}"
API="${API%/}"
PASS=0
FAIL=0

# Max seconds for privacy PATCH response (local dev)
PRIVACY_PATCH_MAX_SEC="${PRIVACY_PATCH_MAX_SEC:-2}"
# Max seconds to wait for share preview isPublic flip after privacy toggle
SHARE_PREVIEW_POLL_MAX_SEC="${SHARE_PREVIEW_POLL_MAX_SEC:-10}"

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

elapsed_ms() {
  python3 -c "import sys; print(int(float(sys.argv[1]) * 1000))" "$1"
}

echo "=== Hin perf smoke test ($API) ==="
echo

# Health
if ! curl -sf "$API/" | grep -q "Hin API"; then
  fail "API root unreachable at $API"
  echo "=== Results: $PASS passed, $FAIL failed ==="
  exit 1
fi
pass "API root"

USER="perf_smoke_$(date +%s)"
PASSWD="TestPass123!"
EMAIL="${USER}@example.com"

REG=$(curl -sf -X POST "$API/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"email\":\"$EMAIL\",\"password\":\"$PASSWD\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
USER_ID=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")
VERIFY_CODE=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('devVerificationCode') or '')")
if [ -n "$VERIFY_CODE" ]; then
  curl -sf -X POST "$API/api/auth/verify-registration" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"code\":\"$VERIFY_CODE\"}" >/dev/null
fi
pass "Register user $USER (id=$USER_ID)"

AUTH="Authorization: Bearer $TOKEN"
POST_IDS=()

for i in 1 2 3 4 5; do
  POST_JSON=$(curl -sf -X POST "$API/api/posts" \
    -H "$AUTH" \
    -H 'Content-Type: application/json' \
    -d "{\"content\":\"Perf smoke post $i $(date +%s)\"}")
  POST_ID=$(echo "$POST_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  POST_IDS+=("$POST_ID")
done
pass "Created 5 posts (${POST_IDS[*]})"

FIRST_POST_ID="${POST_IDS[0]}"

# Warm share preview cache for first post
curl -sf "$API/api/seo/share-preview/post/${FIRST_POST_ID}" >/dev/null || true
PRE=$(curl -sf "$API/api/seo/share-preview/post/${FIRST_POST_ID}")
echo "$PRE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('isPublic') is True" \
  && pass "Share preview public before privacy toggle" \
  || fail "Share preview should be public before privacy toggle"

# Time privacy PATCH
START=$(python3 -c "import time; print(time.time())")
PATCH_RES=$(curl -sf -w "\n%{http_code}" -X PATCH "$API/api/users/me/settings" \
  -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"isPrivate":true}')
END=$(python3 -c "import time; print(time.time())")
PATCH_BODY=$(echo "$PATCH_RES" | sed '$d')
PATCH_CODE=$(echo "$PATCH_RES" | tail -1)
ELAPSED=$(python3 -c "print($END - $START)")

if [ "$PATCH_CODE" = "200" ]; then
  pass "PATCH isPrivate returned 200"
else
  fail "PATCH isPrivate returned $PATCH_CODE"
fi

ELAPSED_MS=$(elapsed_ms "$ELAPSED")
echo "  Privacy PATCH elapsed: ${ELAPSED_MS}ms (max ${PRIVACY_PATCH_MAX_SEC}s)"
if python3 -c "import sys; sys.exit(0 if float('$ELAPSED') < float('$PRIVACY_PATCH_MAX_SEC') else 1)"; then
  pass "Privacy PATCH under ${PRIVACY_PATCH_MAX_SEC}s"
else
  fail "Privacy PATCH took ${ELAPSED}s (max ${PRIVACY_PATCH_MAX_SEC}s)"
fi

echo "$PATCH_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('isPrivate') is True" \
  && pass "Settings isPrivate persisted" \
  || fail "Settings isPrivate not persisted"

# Poll share preview until not public (bulk update should be immediate; full refresh may follow async)
DEADLINE=$(python3 -c "import time; print(time.time() + float('$SHARE_PREVIEW_POLL_MAX_SEC'))")
FLIPPED=0
while python3 -c "import time, sys; sys.exit(0 if time.time() < float('$DEADLINE') else 1)"; do
  PRE=$(curl -sf "$API/api/seo/share-preview/post/${FIRST_POST_ID}" 2>/dev/null || echo '{}')
  if echo "$PRE" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('isPublic') is False else 1)"; then
    FLIPPED=1
    break
  fi
  sleep 0.25
done

if [ "$FLIPPED" = "1" ]; then
  pass "Share preview isPublic=false after privacy toggle"
else
  fail "Share preview did not flip to isPublic=false within ${SHARE_PREVIEW_POLL_MAX_SEC}s"
fi

# User search timing (informational + sanity)
SEARCH_START=$(python3 -c "import time; print(time.time())")
SEARCH=$(curl -sf "$API/api/users/search?q=${USER:0:8}" -H "$AUTH")
SEARCH_END=$(python3 -c "import time; print(time.time())")
SEARCH_MS=$(elapsed_ms "$(python3 -c "print($SEARCH_END - $SEARCH_START)")")
echo "$SEARCH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d, list)" \
  && pass "User search returns array (${SEARCH_MS}ms)" \
  || fail "User search failed"

# Followers list (self — empty ok)
LIST_START=$(python3 -c "import time; print(time.time())")
FOLLOWERS=$(curl -sf "$API/api/follows/${USER_ID}/followers" -H "$AUTH")
LIST_END=$(python3 -c "import time; print(time.time())")
LIST_MS=$(elapsed_ms "$(python3 -c "print($LIST_END - $LIST_START)")")
echo "$FOLLOWERS" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'users' in d" \
  && pass "Followers list endpoint (${LIST_MS}ms)" \
  || fail "Followers list failed"

echo
echo "=== Results: $PASS passed, $FAIL failed ==="
test "$FAIL" -eq 0
