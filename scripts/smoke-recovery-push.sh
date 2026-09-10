#!/usr/bin/env bash
# Account recovery + push subscription smoke test — hits local API at :8787
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

USER="smoke_rp_$(date +%s)"
PASSWD="TestPass123!"
NEWPASS="TestPass456!"
EMAIL="smoke_rp_${RANDOM}@example.com"

echo "=== Recovery + Push smoke ($API) ==="

if curl -sf "$API/" | grep -q "Hin API"; then pass "API root"; else fail "API root"; fi

# Register
REG=$(curl -sf -X POST "$API/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"email\":\"$EMAIL\",\"password\":\"$PASSWD\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
USER_ID=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")
VERIFY_CODE=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('devVerificationCode') or '')")
if [ -n "$TOKEN" ]; then pass "Register $USER"; else fail "Register"; fi
if [ -n "$VERIFY_CODE" ]; then
  curl -sf -X POST "$API/api/auth/verify-registration" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"code\":\"$VERIFY_CODE\"}" >/dev/null
fi
AUTH="Authorization: Bearer $TOKEN"

# Change password — wrong current
WRONG=$(curl -s -o /tmp/rp_wrong.json -w "%{http_code}" -X POST "$API/api/users/me/password" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"nope","newPassword":"abcdef"}')
if [ "$WRONG" = "400" ]; then pass "Change password rejects wrong current"; else fail "Change password wrong current ($WRONG)"; fi

# Change password — success
CHG=$(curl -sf -X POST "$API/api/users/me/password" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"currentPassword\":\"$PASSWD\",\"newPassword\":\"$NEWPASS\"}")
if echo "$CHG" | python3 -c "import sys,json; assert json.load(sys.stdin).get('ok')"; then
  pass "Change password success"
else
  fail "Change password success"
fi

# Login with new password
LOGIN=$(curl -sf -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$NEWPASS\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
AUTH="Authorization: Bearer $TOKEN"
if [ -n "$TOKEN" ]; then pass "Login with new password"; else fail "Login with new password"; fi

# Reset request — unknown user (enumeration-safe)
REQ1=$(curl -sf -X POST "$API/api/auth/password-reset/request" \
  -H 'Content-Type: application/json' \
  -d '{"username":"definitely_missing_user_xyz"}')
REQ2=$(curl -sf -X POST "$API/api/auth/password-reset/request" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\"}")
if [ "$REQ1" = "$REQ2" ] && echo "$REQ1" | grep -q '"ok":true'; then
  pass "Reset request enumeration-safe generic ok"
else
  fail "Reset request enumeration"
fi

# Seed verified email + plant OTP challenge for reset verify path
# Hash must use the same OTP_PEPPER as the Worker (.dev.vars or dev fallback).
PEPPER="$(grep -E '^OTP_PEPPER=' "$REPO/apps/api/.dev.vars" 2>/dev/null | sed 's/^OTP_PEPPER=//' | tr -d '"' | tr -d "'" || true)"
PEPPER="${PEPPER:-hin-otp-pepper-dev-only}"
CODE_HASH=$(PEPPER="$PEPPER" python3 - <<'PY'
import hashlib, os
print(hashlib.sha256(f"654321:{os.environ['PEPPER']}".encode()).hexdigest())
PY
)
EXP=$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc)+timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%S.000Z"))
PY
)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

cd "$REPO/apps/api"
npx wrangler d1 execute hin-d1 --local -c wrangler.toml --command \
  "UPDATE users SET email='$EMAIL', email_verified_at='$NOW' WHERE id=$USER_ID;" >/dev/null 2>&1 || true
npx wrangler d1 execute hin-d1 --local -c wrangler.toml --command \
  "INSERT INTO otp_challenges (purpose, user_id, email, code_hash, attempts, expires_at) VALUES ('password_reset', $USER_ID, '$EMAIL', '$CODE_HASH', 0, '$EXP');" >/dev/null 2>&1 || true

RESET_PASS="ResetPass789!"
VERIFY=$(curl -s -X POST "$API/api/auth/password-reset/verify" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"code\":\"654321\",\"newPassword\":\"$RESET_PASS\"}")
if echo "$VERIFY" | python3 -c "import sys,json; assert json.load(sys.stdin).get('ok')"; then
  pass "Password reset verify"
else
  fail "Password reset verify ($VERIFY)"
fi

LOGIN2=$(curl -sf -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$RESET_PASS\"}")
TOKEN=$(echo "$LOGIN2" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
AUTH="Authorization: Bearer $TOKEN"
if [ -n "$TOKEN" ]; then pass "Login after password reset"; else fail "Login after password reset"; fi

# Settings include notifyPushEnabled
SETTINGS=$(curl -sf "$API/api/users/me/settings" -H "$AUTH")
if echo "$SETTINGS" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'notifyPushEnabled' in d"; then
  pass "Settings include notifyPushEnabled"
else
  fail "Settings notifyPushEnabled"
fi

# Push subscribe / unsubscribe (works even without VAPID for storage)
ENDPOINT="https://example.com/push/smoke-$USER"
SUB=$(curl -sf -X POST "$API/api/push/subscribe" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"endpoint\":\"$ENDPOINT\",\"keys\":{\"p256dh\":\"BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTsmsFqAtNlw1XT7LlkkmA7z4ZGhtp7AJdsksm-db8In4_A8\",\"auth\":\"tBHItJI5svbpez7KI4CCXg\"}}")
if echo "$SUB" | python3 -c "import sys,json; assert json.load(sys.stdin).get('ok')"; then
  pass "Push subscribe"
else
  fail "Push subscribe"
fi

SUB_COUNT=$(d1_scalar "SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id=$USER_ID;" n || echo 0)
if [ "$SUB_COUNT" -ge 1 ] 2>/dev/null; then pass "Push subscription row in D1"; else fail "Push subscription row ($SUB_COUNT)"; fi

UNSUB=$(curl -sf -X DELETE "$API/api/push/subscribe" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"endpoint\":\"$ENDPOINT\"}")
if echo "$UNSUB" | python3 -c "import sys,json; assert json.load(sys.stdin).get('ok')"; then
  pass "Push unsubscribe"
else
  fail "Push unsubscribe"
fi

SUB_COUNT2=$(d1_scalar "SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id=$USER_ID;" n || echo 0)
if [ "$SUB_COUNT2" = "0" ] 2>/dev/null; then pass "Push subscription removed"; else fail "Push subscription still present"; fi

# VAPID public key — ok if configured, else 503 is acceptable for local without secrets
VAPID_CODE=$(curl -s -o /tmp/vapid.json -w "%{http_code}" "$API/api/push/vapid-public-key")
if [ "$VAPID_CODE" = "200" ] || [ "$VAPID_CODE" = "503" ]; then
  pass "VAPID public key endpoint ($VAPID_CODE)"
else
  fail "VAPID public key endpoint ($VAPID_CODE)"
fi

# Existing auth still works
REG2=$(curl -sf -X POST "$API/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${USER}_b\",\"email\":\"${USER}_b@example.com\",\"password\":\"$PASSWD\"}")
if echo "$REG2" | python3 -c "import sys,json; assert json.load(sys.stdin).get('token')"; then
  pass "Existing register still works"
else
  fail "Existing register"
fi

echo ""
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
