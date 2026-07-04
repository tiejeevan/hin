#!/usr/bin/env bash
# Smoke-test R2 + D1 media upload sync against a running API (wrangler dev).
# Usage: API_URL=http://127.0.0.1:8787 USER=demo PASS=demo123 ./scripts/test-media.sh

set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:8787}"
USER="${USER:-demo}"
PASS="${PASS:-demo123}"

echo "==> Login as $USER"
LOGIN=$(curl -sf -X POST "$API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "    token ok"

echo "==> R2 + DB health check"
HEALTH=$(curl -sf "$API_URL/api/upload/health" -H "Authorization: Bearer $TOKEN")
echo "    $HEALTH"
echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('synced') is True, d"

# Tiny 1x1 PNG
PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
TMP=$(mktemp /tmp/hin-test-XXXXXX.png)
echo "$PNG_B64" | base64 -d > "$TMP"

echo "==> Upload post image"
UPLOAD=$(curl -sf -X POST "$API_URL/api/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMP;type=image/png" \
  -F "type=post")
echo "    $UPLOAD"
URL=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])")
ID=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "==> Fetch media from R2 via API"
curl -sf -o /dev/null -w "    HTTP %{http_code}\n" "$URL"

echo "==> Create post with media"
POST=$(curl -sf -X POST "$API_URL/api/posts" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"Media test post\",\"mediaUrls\":[\"$URL\"]}")
echo "    $POST"
echo "$POST" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$URL' in d.get('mediaUrls',[]), d"

echo "==> Upload avatar"
AVATAR=$(curl -sf -X POST "$API_URL/api/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMP;type=image/png" \
  -F "type=avatar")
AVATAR_URL=$(echo "$AVATAR" | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])")
echo "    $AVATAR_URL"

echo "==> All media checks passed (upload id=$ID)"
rm -f "$TMP"
