import { describe, it, expect } from 'vitest';
import {
  ALLOWED_CHAT_IMAGE_MIMES,
  isAllowedChatImageFile,
  isAllowedChatImageMime,
} from './chatMediaMime';

describe('chatMediaMime', () => {
  it('lists jpeg, png, and webp as allowed', () => {
    expect(ALLOWED_CHAT_IMAGE_MIMES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it.each(['image/jpeg', 'image/png', 'image/webp', 'Image/JPEG', ' image/png '])(
    'allows %s',
    mime => {
      expect(isAllowedChatImageMime(mime)).toBe(true);
    },
  );

  it.each(['audio/mpeg', 'audio/wav', 'image/gif', 'image/svg+xml', 'video/mp4', '', 'text/plain'])(
    'rejects %s',
    mime => {
      expect(isAllowedChatImageMime(mime)).toBe(false);
    },
  );

  it('isAllowedChatImageFile uses File.type', () => {
    expect(isAllowedChatImageFile(new File([], 'a.jpg', { type: 'image/jpeg' }))).toBe(true);
    expect(isAllowedChatImageFile(new File([], 'a.png', { type: 'image/png' }))).toBe(true);
    expect(isAllowedChatImageFile(new File([], 'a.webp', { type: 'image/webp' }))).toBe(true);
    expect(isAllowedChatImageFile(new File([], 'a.mp3', { type: 'audio/mpeg' }))).toBe(false);
  });
});
