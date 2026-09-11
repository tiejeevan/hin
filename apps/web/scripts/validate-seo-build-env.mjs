#!/usr/bin/env node
/**
 * Fail production web builds when SEO URL env vars are missing or localhost.
 * Dev builds (vite dev) are unaffected — this runs from npm run build only.
 */

const isProdBuild = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

function fail(message) {
  console.error(`SEO build error: ${message}`);
  process.exit(1);
}

function validateUrl(name, value) {
  if (!value || !value.trim()) {
    fail(`${name} is required for production web builds.`);
  }
  const trimmed = value.replace(/\/$/, '');
  if (trimmed.includes('__HIN_')) {
    fail(`${name} still contains build placeholders (${trimmed}).`);
  }
  if (/localhost|127\.0\.0\.1/i.test(trimmed)) {
    fail(`${name} must not use localhost in production builds (got ${trimmed}).`);
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      fail(`${name} must use https in production builds (got ${trimmed}).`);
    }
  } catch {
    fail(`${name} is not a valid URL (got ${trimmed}).`);
  }
  return trimmed;
}

if (isProdBuild) {
  validateUrl('VITE_SITE_URL', process.env.VITE_SITE_URL);
  validateUrl('VITE_API_URL', process.env.VITE_API_URL);
}
