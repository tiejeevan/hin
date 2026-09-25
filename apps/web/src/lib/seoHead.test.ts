import { describe, expect, it } from 'vitest';
import { titleForRoute } from './seoHead';

describe('titleForRoute', () => {
  it('returns profile title', () => {
    expect(titleForRoute('/profile/alice', '')).toBe('@alice on Hin');
  });

  it('returns post title', () => {
    expect(titleForRoute('/post/99', '')).toBe('Post on Hin');
  });

  it('returns home title', () => {
    expect(titleForRoute('/', '')).toBe('Hin — Social Media Platform');
    expect(titleForRoute('/contact', '')).toBe('Contact — Hin');
  });
});
