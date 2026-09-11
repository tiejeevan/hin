#!/usr/bin/env bash
# Post-deploy SEO preflight — wraps seo-smoke.sh with localhost/stale-domain guards.
#
# Usage:
#   SITE_URL=https://hingot.com API_URL=https://hingot.com ./scripts/seo-deploy-check.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_URL="${SITE_URL:?Set SITE_URL}"
API_URL="${API_URL:?Set API_URL}"
SITE_URL="${SITE_URL%/}"
API_URL="${API_URL%/}"

fail() {
  echo "DEPLOY CHECK FAIL: $1" >&2
  exit 1
}

for var in SITE_URL API_URL; do
  val="${!var}"
  case "$val" in
    *localhost*|*127.0.0.1*) fail "$var must not be localhost for deploy check (got $val)" ;;
  esac
done

robots="$(curl -sS "${SITE_URL}/robots.txt")"
echo "$robots" | grep -q "localhost" && fail "robots.txt still references localhost"

home_html="$(curl -sS "${SITE_URL}/")"
echo "$home_html" | grep -q 'href="http://localhost:5173' && fail "index.html canonical still references localhost"

health="$(curl -sS "${API_URL}/api/seo/health")"
echo "$health" | grep -q '"siteUrl":"'"${SITE_URL}"'"' || fail "API SEO health siteUrl mismatch"

echo "Preflight OK — running full SEO smoke suite..."
exec "${ROOT}/scripts/seo-smoke.sh"
