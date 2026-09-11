# SEO deployment runbook

This guide is **domain-agnostic**. `https://hingot.com` is the current production example; any public origin works the same way via environment variables.

## Architecture

- **API Worker** — D1 `share_previews` cache, `/api/seo/*`, dynamic `/sitemap.xml`
- **Cloudflare Pages** — React SPA + `_worker.js` (bot OG HTML + sitemap proxy)
- **No hardcoded domains in SEO runtime code** — all URLs come from env

## Environment contract

| Variable | Where | Purpose |
|----------|-------|---------|
| `SITE_URL` | API Worker + Pages binding | Canonical web origin for sitemap, OG, cache rows |
| `API_PUBLIC_URL` | API Worker | Absolute `/api/media/...` URLs (defaults to `SITE_URL` when same host) |
| `VITE_SITE_URL` | Web build CI/env | Injected into `index.html`, `robots.txt`, `_worker.js` |
| `VITE_API_URL` | Web build CI/env | Worker default for sitemap proxy + share-preview fetch |
| `API_URL` | Pages runtime binding | Optional override without rebuild |
| `GOOGLE_SITE_VERIFICATION` | Build or Pages | Search Console meta tag |

Local dev defaults (no env): `http://localhost:5173` + `http://localhost:8787`.

## Deploy steps (any domain)

### 1. API Worker

```bash
npm run db:migrate:prod --workspace=packages/db
```

Set Cloudflare Worker vars (per environment):

- `SITE_URL=https://your-domain.com`
- `API_PUBLIC_URL=https://your-domain.com` (or `https://api.your-domain.com`)

```bash
npm run deploy --workspace=apps/api
```

Verify:

```bash
curl -sI "$API_URL/sitemap.xml"   # 200, application/xml
curl -s "$API_URL/api/seo/health" # siteUrl + cache stats
```

### 2. Web / Pages

Build with that environment's URLs:

```bash
VITE_SITE_URL=https://your-domain.com \
VITE_API_URL=https://your-domain.com \
npm run build --workspace=apps/web
```

Deploy `apps/web/dist/` to Cloudflare Pages. Set bindings:

- `SITE_URL`, `API_URL`, optional `GOOGLE_SITE_VERIFICATION`

`_worker.js` intercepts bots and `/sitemap.xml`; all other routes serve SPA assets.

### 3. Populate share preview cache

```bash
API_URL=https://your-domain.com ADMIN_TOKEN=<admin_jwt> ./scripts/backfill-share-previews.sh
```

Re-run whenever `SITE_URL` changes or after bulk content migration.

For very large datasets, use batched mode (default) or fire-and-forget:

```bash
ASYNC=1 API_URL=... ADMIN_TOKEN=... ./scripts/backfill-share-previews.sh
```

### 4. Search Console (per domain)

1. Add property for your canonical host
2. Verify (DNS or meta tag via `GOOGLE_SITE_VERIFICATION`)
3. Submit `https://your-domain.com/sitemap.xml`

### 5. Post-deploy smoke (mandatory)

```bash
SITE_URL=https://your-domain.com API_URL=https://your-domain.com ./scripts/seo-smoke.sh
```

The script exits non-zero if `SITE_URL` or `API_URL` are unset — no silent defaults to a specific domain.

## Switching domains / rebranding

1. Set new `SITE_URL` / `API_PUBLIC_URL` on API Worker
2. Rebuild web with new `VITE_SITE_URL` / `VITE_API_URL`
3. Update Pages bindings
4. Re-run batched backfill (rewrites all `canonical_url` rows)
5. Run `./scripts/seo-smoke.sh` with new env
6. Add new Search Console property + submit sitemap

## Staging / preview environments

Use the same flow with different env, e.g.:

```bash
SITE_URL=https://staging.example.com \
API_URL=https://staging-api.example.com \
./scripts/seo-smoke.sh
```

Each environment should use its own D1 database (or run backfill against that DB only).

## Apex vs www

Pick one canonical host in `SITE_URL`. Redirect the other with a 301. Use a single Search Console property for the canonical host.

## Common failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Sitemap shows SPA title | `_worker.js` not deployed | Redeploy Pages with worker |
| Sitemap URLs wrong domain | Backfill with old/missing `SITE_URL` | Fix env; re-run backfill |
| Share previews generic | `API_URL` binding wrong | Fix Pages env; run smoke script |
| Empty sitemap | Backfill not run | Run `./scripts/backfill-share-previews.sh` |
| Protected-account posts indexed | Stale cache | Re-run backfill (purge step removes orphans) |
| Privacy toggle slow / timeout | Old sync refresh of every post preview | Fixed: bulk privacy update returns immediately; full refresh runs in background via `waitUntil` |

### Privacy toggle and share previews

When a user toggles **Private account**, the API:

1. Updates `users.is_private` and synchronously upserts share-preview rows for the profile and all root posts (visibility-aware, no per-post poll/link fetches).
2. Returns the settings response without waiting for a full preview rebuild.
3. Schedules a background `refreshPostSharePreviewsForUser` pass (poll titles, link images, etc.) via the Worker `waitUntil` hook.

Share-preview JSON for crawlers reflects the privacy change immediately after step 1. Step 3 may refine titles/images within seconds. Run `./scripts/smoke-perf.sh` after deploy to verify PATCH latency and preview flip.

## Local verification

```bash
npm run dev
curl -s http://localhost:5173/sitemap.xml | head
curl -s http://localhost:5173/robots.txt | grep -i GPTBot
curl -s http://localhost:8787/api/seo/health
npm run test:e2e -- e2e/seo.spec.ts
npm run test:smoke:perf
```

Note: Facebook-style HTML shell for crawlers only works on **Cloudflare Pages**, not Vite dev (API JSON share-preview works locally).
