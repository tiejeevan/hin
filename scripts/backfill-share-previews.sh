#!/usr/bin/env bash
# Backfill share_previews for existing public posts and profiles (batched).
# Requires an admin JWT (Authorization: Bearer …).
#
# Usage:
#   export API_URL=http://localhost:8787   # required for non-local if not default
#   export ADMIN_TOKEN=your_admin_jwt
#   ./scripts/backfill-share-previews.sh
#
# Options:
#   BATCH_LIMIT=100   rows per request (default 100)
#   ASYNC=1           fire-and-forget full backfill (202 Accepted)

set -euo pipefail

API_URL="${API_URL:-http://localhost:8787}"
ADMIN_TOKEN="${ADMIN_TOKEN:?Set ADMIN_TOKEN to an admin JWT}"
BATCH_LIMIT="${BATCH_LIMIT:-100}"

if [[ "${ASYNC:-}" == "1" ]]; then
  curl -sS -X POST "${API_URL}/api/seo/backfill?async=1" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    | (command -v jq >/dev/null && jq . || cat)
  echo
  exit 0
fi

cursor=0
total=0
while true; do
  response="$(curl -sS -X POST "${API_URL}/api/seo/backfill?cursor=${cursor}&limit=${BATCH_LIMIT}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json")"

  echo "$response" | (command -v jq >/dev/null && jq . || cat)

  done_flag="$(echo "$response" | (command -v jq >/dev/null && jq -r '.done // false' || echo false))"
  processed="$(echo "$response" | (command -v jq >/dev/null && jq -r '.processed // 0' || echo 0))"
  next_cursor="$(echo "$response" | (command -v jq >/dev/null && jq -r '.nextCursor // empty' || echo ""))"

  total=$((total + processed))

  if [[ "$done_flag" == "true" ]]; then
    echo "Backfill complete. Total processed in final batches: ${total}"
    break
  fi

  if [[ -z "$next_cursor" ]]; then
    echo "Backfill stopped: missing nextCursor" >&2
    exit 1
  fi

  cursor="$next_cursor"
done

echo
