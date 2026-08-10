import { describe, it, expect } from 'vitest';
import { isSafeMediaUrl, safeMediaUrl } from './safeUrl';

describe('isSafeMediaUrl / safeMediaUrl', () => {
  it('rejects javascript:', () => {
    expect(isSafeMediaUrl('javascript:alert(1)')).toBe(false);
    expect(safeMediaUrl('javascript:alert(1)')).toBeNull();
    expect(isSafeMediaUrl('  javascript:void(0)  ')).toBe(false);
  });

  it('allows https', () => {
    expect(isSafeMediaUrl('https://cdn.example.com/photo.jpg')).toBe(true);
    expect(safeMediaUrl('https://cdn.example.com/photo.jpg')).toBe(
      'https://cdn.example.com/photo.jpg',
    );
    expect(isSafeMediaUrl('http://example.com/a.png')).toBe(true);
  });

  it('allows blob:', () => {
    expect(isSafeMediaUrl('blob:https://example.com/uuid-here')).toBe(true);
    expect(safeMediaUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
  });

  it('allows data:image/png', () => {
    expect(isSafeMediaUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(safeMediaUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(
      'data:image/jpeg;base64,/9j/4AAQ',
    );
    expect(isSafeMediaUrl('data:image/webp;base64,UklGR')).toBe(true);
  });

  it('rejects data:text/html', () => {
    expect(isSafeMediaUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(safeMediaUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
  });

  it('rejects empty', () => {
    expect(isSafeMediaUrl('')).toBe(false);
    expect(isSafeMediaUrl('   ')).toBe(false);
    expect(isSafeMediaUrl(null)).toBe(false);
    expect(isSafeMediaUrl(undefined)).toBe(false);
    expect(safeMediaUrl('')).toBeNull();
  });

  it('rejects vbscript and relative/weird schemes', () => {
    expect(isSafeMediaUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeMediaUrl('/relative/path.jpg')).toBe(false);
    expect(isSafeMediaUrl('not-a-url')).toBe(false);
    expect(isSafeMediaUrl('ftp://files.example.com/a.jpg')).toBe(false);
  });
});
