/**
 * Extract the first http(s) URL or bare domain from text.
 * Mirrors `crates/hin-chat-core/src/url.rs` (`extract_first_url`).
 */

const TRAILING_PUNCT = /[.,!?;:)\]}>'"]+$/;

function stripTrailingPunct(s: string): string {
  return s.replace(TRAILING_PUNCT, '');
}

function isBareStartBoundary(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1]!;
  if (prev === '@') return false;
  return !/[A-Za-z0-9_.-]/.test(prev);
}

function trySchemeUrl(text: string, lower: string, i: number): { start: number; end: number; bare: false } | null {
  const rest = lower.slice(i);
  let schemeLen = 0;
  if (rest.startsWith('https://')) schemeLen = 8;
  else if (rest.startsWith('http://')) schemeLen = 7;
  else return null;

  const start = i;
  let j = i + schemeLen;
  while (j < text.length) {
    const c = text[j]!;
    if (/\s/.test(c) || c === '<' || c === '>' || c === '"' || c === "'" || c === ')') break;
    j += 1;
  }
  const sliced = stripTrailingPunct(text.slice(start, j));
  if (sliced.length === 0) return null;
  return { start, end: start + sliced.length, bare: false };
}

function tryBareDomain(text: string, lower: string, i: number): { start: number; end: number } | null {
  if (!isBareStartBoundary(text, i)) return null;
  const first = text[i];
  if (!first || !/[A-Za-z0-9]/.test(first)) return null;

  const start = i;
  let j = i;
  let hasLetter = false;
  let dotCount = 0;
  let lastDot = -1;
  let prevWasDot = false;

  while (j < text.length) {
    const c = lower[j]!;
    if (/[a-z0-9-]/.test(c)) {
      if (/[a-z]/.test(c)) hasLetter = true;
      prevWasDot = false;
      j += 1;
    } else if (c === '.') {
      if (prevWasDot) return null;
      lastDot = j;
      dotCount += 1;
      prevWasDot = true;
      j += 1;
    } else {
      break;
    }
  }

  if (!hasLetter || dotCount === 0 || prevWasDot || lastDot < 0) return null;

  const tld = lower.slice(lastDot + 1, j);
  if (tld.length < 2 || !/^[a-z]+$/.test(tld)) return null;

  const hostEnd = j;
  if (j < text.length && text[j] === '/') {
    j += 1;
    while (j < text.length) {
      const c = text[j]!;
      if (/\s/.test(c) || c === '<' || c === '>' || c === '"' || c === "'" || c === ')') break;
      j += 1;
    }
  }

  const sliced = stripTrailingPunct(text.slice(start, j));
  const end = start + sliced.length;
  if (end < hostEnd || end <= start) return null;
  return { start, end };
}

/** First http(s) URL or bare domain (`https://` prefixed). */
export function extractFirstUrl(text: string): string | null {
  const lower = text.toLowerCase();
  for (let i = 0; i < text.length; i += 1) {
    const scheme = trySchemeUrl(text, lower, i);
    if (scheme) {
      return text.slice(scheme.start, scheme.end);
    }
    const bare = tryBareDomain(text, lower, i);
    if (bare) {
      return `https://${text.slice(bare.start, bare.end)}`;
    }
  }
  return null;
}
