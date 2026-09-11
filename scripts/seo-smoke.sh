#!/usr/bin/env bash
# Domain-agnostic SEO smoke test for any deployed environment.
#
# Usage:
#   SITE_URL=https://hingot.com API_URL=https://hingot.com ./scripts/seo-smoke.sh
#   SITE_URL=https://staging.example.com API_URL=https://api.example.com ./scripts/seo-smoke.sh
#
# Optional:
#   POST_ID=123   known public post id (auto-discovered from sitemap when unset)

set -euo pipefail

SITE_URL="${SITE_URL:?Set SITE_URL to your public web origin (e.g. https://hingot.com)}"
API_URL="${API_URL:?Set API_URL to your public API origin}"

SITE_URL="${SITE_URL%/}"
API_URL="${API_URL%/}"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

pass() {
  echo "PASS: $1"
}

echo "SEO smoke test"
echo "  SITE_URL=${SITE_URL}"
echo "  API_URL=${API_URL}"
echo

# Sitemap on web origin
web_sitemap="$(curl -sS "${SITE_URL}/sitemap.xml")"
content_type="$(curl -sSI "${SITE_URL}/sitemap.xml" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print tolower($2); exit}')"
echo "$content_type" | grep -qi 'xml' || fail "Web sitemap Content-Type should be XML (got: ${content_type})"
echo "$web_sitemap" | grep -q '^<?xml' || fail "Web sitemap body should start with <?xml"
echo "$web_sitemap" | grep -q "<loc>${SITE_URL}/" || fail "Web sitemap should contain loc entries for SITE_URL"
pass "Web sitemap.xml"

# robots.txt
robots="$(curl -sS "${SITE_URL}/robots.txt")"
echo "$robots" | grep -q "Sitemap: ${SITE_URL}/sitemap.xml" || fail "robots.txt missing Sitemap line for SITE_URL"
echo "$robots" | grep -qi 'GPTBot' || fail "robots.txt should block GPTBot"
pass "robots.txt"

# API sitemap
api_sitemap="$(curl -sS "${API_URL}/sitemap.xml")"
echo "$api_sitemap" | grep -q '^<?xml' || fail "API sitemap body should start with <?xml"
pass "API sitemap.xml"

# No stale domains in sitemap (only check http(s) loc entries)
while IFS= read -r loc; do
  case "$loc" in
    "${SITE_URL}"*) ;;
    *) fail "Sitemap contains loc outside SITE_URL: ${loc}" ;;
  esac
done < <(echo "$web_sitemap" | sed -n 's:.*<loc>\([^<]*\)</loc>.*:\1:p')

pass "Sitemap URLs match SITE_URL"

# Discover post id
POST_ID="${POST_ID:-}"
if [[ -z "$POST_ID" ]]; then
  POST_ID="$(echo "$web_sitemap" | sed -n 's:.*<loc>'"${SITE_URL}"'/post/\([0-9]*\)</loc>.*:\1:p' | head -1)"
fi
[[ -n "$POST_ID" ]] || fail "Could not discover POST_ID from sitemap; set POST_ID env"

# Share preview API
preview_json="$(curl -sS "${API_URL}/api/seo/share-preview/post/${POST_ID}")"
echo "$preview_json" | grep -q '"canonicalUrl"' || fail "Share preview JSON missing canonicalUrl"
case "$preview_json" in
  *"\"canonicalUrl\":\"${SITE_URL}/post/${POST_ID}\""*) ;;
  *) fail "Share preview canonicalUrl should start with SITE_URL" ;;
esac
pass "Share preview API for post/${POST_ID}"

# Crawler OG shell on web (Pages worker — may fail on local Vite-only deploy)
og_html="$(curl -sS -A 'facebookexternalhit/1.1' "${SITE_URL}/post/${POST_ID}")"
if echo "$og_html" | grep -q 'property="og:title"'; then
  pass "Crawler OG shell on /post/${POST_ID}"
else
  echo "WARN: Crawler OG shell not detected (expected on Cloudflare Pages with _worker.js)"
fi

# SEO health endpoint
health="$(curl -sS "${API_URL}/api/seo/health")"
echo "$health" | grep -q '"siteUrl"' || fail "SEO health missing siteUrl"
pass "SEO health endpoint"

echo
echo "All required SEO smoke checks passed."
