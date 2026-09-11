/** Cloudflare Pages worker — crawler OG HTML + sitemap proxy. */
const DEFAULT_SITE_URL = '__HIN_SITE_URL__';
const DEFAULT_API_URL = '__HIN_API_URL__';

const PREVIEW_BOT_UA = /googlebot|bingbot|facebookexternalhit|facebot|meta-externalagent|whatsapp|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|applebot/i;
const AI_TRAINING_BOT_UA = /gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|ccbot|google-extended|applebot-extended|perplexitybot|bytespider|amazonbot|cohere-ai/i;
const GENERIC_BOT_UA = /bot|crawler|spider|slurp/i;

const DISALLOWED_PATH_PREFIXES = ['/admin/', '/search', '/api/', '/olabid/'];

function isDisallowedPath(pathname) {
  return DISALLOWED_PATH_PREFIXES.some((prefix) =>
    pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix),
  );
}

function isPreviewBot(userAgent) {
  return PREVIEW_BOT_UA.test(userAgent || '');
}

function isAiTrainingBot(userAgent) {
  return AI_TRAINING_BOT_UA.test(userAgent || '');
}

function isCrawler(userAgent) {
  if (isAiTrainingBot(userAgent)) return false;
  return isPreviewBot(userAgent) || GENERIC_BOT_UA.test(userAgent || '');
}

function getApiBase(request, env) {
  if (env && env.API_URL) return String(env.API_URL).replace(/\/$/, '');
  if (DEFAULT_API_URL && !DEFAULT_API_URL.includes('__HIN_')) {
    return DEFAULT_API_URL.replace(/\/$/, '');
  }
  return new URL(request.url).origin;
}

function getSiteUrl(request, env) {
  if (env && env.SITE_URL) return String(env.SITE_URL).replace(/\/$/, '');
  if (DEFAULT_SITE_URL && !DEFAULT_SITE_URL.includes('__HIN_')) {
    return DEFAULT_SITE_URL.replace(/\/$/, '');
  }
  return new URL(request.url).origin;
}

function parseShareRoute(pathname) {
  const postMatch = pathname.match(/^\/post\/(\d+)\/?$/);
  if (postMatch) return { type: 'post', key: postMatch[1] };

  const profileMatch = pathname.match(/^\/profile\/([^/]+)\/?$/);
  if (profileMatch) return { type: 'profile', key: decodeURIComponent(profileMatch[1]) };

  if (pathname === '/' || pathname === '') return { type: 'home', key: 'home' };

  return null;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonForScript(json) {
  return String(json)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function ogTypeForResource(resourceType) {
  if (resourceType === 'post') return 'article';
  if (resourceType === 'profile') return 'profile';
  return 'website';
}

function buildJsonLd(preview, siteUrl) {
  if (preview.resourceType === 'profile') {
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      name: preview.title,
      description: preview.description,
      url: preview.canonicalUrl,
      primaryImageOfPage: preview.imageUrl,
    });
  }

  if (preview.resourceType === 'post') {
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SocialMediaPosting',
      headline: preview.title,
      description: preview.description,
      url: preview.canonicalUrl,
      image: preview.imageUrl,
      publisher: { '@type': 'Organization', name: preview.siteName || 'Hin' },
    });
  }

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Hin',
    url: siteUrl,
    description: preview.description,
  });
}

function buildNoindexShell(pathname) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Hin</title>
  <meta name="robots" content="noindex,nofollow" />
</head>
<body><p>Not found</p></body>
</html>`;
}

function buildCrawlerHtml(preview, googleVerification) {
  const verificationMeta = googleVerification
    ? `\n  <meta name="google-site-verification" content="${escapeHtml(googleVerification)}" />`
    : '';

  const jsonLd = buildJsonLd(preview, preview.canonicalUrl.replace(/\/[^/]*\/?$/, '/'));
  const ogType = ogTypeForResource(preview.resourceType);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(preview.title)}</title>
  <meta name="description" content="${escapeHtml(preview.description)}" />
  <meta name="robots" content="${escapeHtml(preview.robots)}" />
  <link rel="canonical" href="${escapeHtml(preview.canonicalUrl)}" />
  <meta property="og:type" content="${escapeHtml(ogType)}" />
  <meta property="og:site_name" content="${escapeHtml(preview.siteName || 'Hin')}" />
  <meta property="og:title" content="${escapeHtml(preview.title)}" />
  <meta property="og:description" content="${escapeHtml(preview.description)}" />
  <meta property="og:image" content="${escapeHtml(preview.imageUrl)}" />
  <meta property="og:url" content="${escapeHtml(preview.canonicalUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(preview.title)}" />
  <meta name="twitter:description" content="${escapeHtml(preview.description)}" />
  <meta name="twitter:image" content="${escapeHtml(preview.imageUrl)}" />${verificationMeta}
  <script type="application/ld+json">${escapeJsonForScript(jsonLd)}</script>
</head>
<body>
  <p>${escapeHtml(preview.description)}</p>
  <a href="${escapeHtml(preview.canonicalUrl)}">View on Hin</a>
</body>
</html>`;
}

async function fetchSharePreview(apiBase, type, key) {
  const url = `${apiBase}/api/seo/share-preview/${encodeURIComponent(type)}/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'HinPagesWorker/1.0' },
  });
  if (!res.ok) return null;
  return res.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';

    if (url.pathname === '/sitemap.xml') {
      const apiBase = getApiBase(request, env);
      const res = await fetch(`${apiBase}/sitemap.xml`);
      return new Response(res.body, {
        status: res.status,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    if (isAiTrainingBot(ua)) {
      return env.ASSETS.fetch(request);
    }

    if (isCrawler(ua)) {
      if (isDisallowedPath(url.pathname)) {
        return new Response(buildNoindexShell(url.pathname), {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      }

      const route = parseShareRoute(url.pathname);
      if (route) {
        const apiBase = getApiBase(request, env);
        const preview = await fetchSharePreview(apiBase, route.type, route.key);
        if (preview) {
          const verification = (env && env.GOOGLE_SITE_VERIFICATION) || '';
          return new Response(buildCrawlerHtml(preview, verification), {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=300',
            },
          });
        }
        if (route.type === 'post' || route.type === 'profile') {
          return new Response(buildNoindexShell(url.pathname), {
            status: 404,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          });
        }
      }
    }

    return env.ASSETS.fetch(request);
  },
};
