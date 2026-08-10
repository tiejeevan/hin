/**
 * Sanitize URLs before using them as href/src sinks in chat UI.
 * Allows http(s), blob:, and data:image/* only.
 */

export function isSafeMediaUrl(url: string | null | undefined): boolean {
  if (url == null) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) {
    return false;
  }

  // blob: and data: — URL constructor is unreliable across runtimes; use prefix checks.
  if (lower.startsWith('blob:')) {
    return trimmed.length > 'blob:'.length;
  }

  if (lower.startsWith('data:')) {
    // Only image subtypes (rejects data:text/html, data:application/*, etc.)
    return /^data:image\/[a-z0-9.+-]+/i.test(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function safeMediaUrl(url: string | null | undefined): string | null {
  if (!isSafeMediaUrl(url)) return null;
  return (url as string).trim();
}
