import { describe, expect, it } from 'vitest';
import {
  BACKFILL_PROFILE_CURSOR_BASE,
  buildHomeSharePreview,
  buildPostSharePreviewFields,
  buildProfileSharePreviewFields,
  buildSitemapXml,
  parseSharePath,
  resolveShareImageUrl,
  truncateForOg,
} from './sharePreview';

const urls = {
  siteUrl: 'https://hingot.com',
  apiOrigin: 'https://hingot.com',
};

describe('truncateForOg', () => {
  it('truncates long text with ellipsis', () => {
    const long = 'a'.repeat(250);
    expect(truncateForOg(long, 200).endsWith('…')).toBe(true);
    expect(truncateForOg(long, 200).length).toBeLessThanOrEqual(200);
  });
});

describe('resolveShareImageUrl', () => {
  it('uses brand image when empty', () => {
    expect(resolveShareImageUrl(null, urls)).toBe('https://hingot.com/icons/icon-512.png');
  });

  it('prefixes api media paths', () => {
    expect(resolveShareImageUrl('/api/media/abc.png', urls)).toBe('https://hingot.com/api/media/abc.png');
  });

  it('keeps absolute URLs', () => {
    expect(resolveShareImageUrl('https://cdn.example/x.png', urls)).toBe('https://cdn.example/x.png');
  });
});

describe('buildPostSharePreviewFields', () => {
  it('indexes public posts', () => {
    const dto = buildPostSharePreviewFields({
      postId: 42,
      username: 'alice',
      content: 'Hello world',
      type: 'text',
      mediaUrls: null,
      authorAvatarUrl: '/api/media/avatar.png',
      visibility: 'public',
      authorIsPrivate: false,
      deleted: false,
      urls,
    });

    expect(dto.isPublic).toBe(true);
    expect(dto.robots).toBe('index,follow');
    expect(dto.title).toBe('@alice on Hin');
    expect(dto.canonicalUrl).toBe('https://hingot.com/post/42');
  });

  it('noindexes private posts', () => {
    const dto = buildPostSharePreviewFields({
      postId: 7,
      username: 'bob',
      content: 'Secret',
      type: 'text',
      mediaUrls: null,
      visibility: 'followers',
      authorIsPrivate: false,
      deleted: false,
      urls,
    });

    expect(dto.isPublic).toBe(false);
    expect(dto.robots).toBe('noindex,nofollow');
    expect(dto.title).toBe('Hin');
  });

  it('uses poll question as title', () => {
    const dto = buildPostSharePreviewFields({
      postId: 1,
      username: 'alice',
      content: '',
      type: 'poll',
      pollQuestion: 'Favorite color?',
      mediaUrls: null,
      visibility: 'public',
      authorIsPrivate: false,
      deleted: false,
      urls,
    });

    expect(dto.title).toBe('Favorite color?');
  });

  it('noindexes public posts from protected accounts', () => {
    const dto = buildPostSharePreviewFields({
      postId: 99,
      username: 'secret',
      content: 'Looks public but author is private',
      type: 'text',
      mediaUrls: null,
      visibility: 'public',
      authorIsPrivate: true,
      deleted: false,
      urls,
    });

    expect(dto.isPublic).toBe(false);
    expect(dto.robots).toBe('noindex,nofollow');
    expect(dto.description).toContain('protected account');
  });
});

describe('buildProfileSharePreviewFields', () => {
  it('indexes public profiles', () => {
    const dto = buildProfileSharePreviewFields({
      username: 'alice',
      bio: 'Builder',
      avatarUrl: '/api/media/a.png',
      coverUrl: null,
      isPrivate: false,
      deleted: false,
      urls,
    });

    expect(dto.isPublic).toBe(true);
    expect(dto.title).toBe('@alice on Hin');
    expect(dto.description).toBe('Builder');
  });

  it('noindexes private profiles', () => {
    const dto = buildProfileSharePreviewFields({
      username: 'secret',
      bio: 'Hidden',
      isPrivate: true,
      deleted: false,
      urls,
    });

    expect(dto.isPublic).toBe(false);
    expect(dto.robots).toBe('noindex,nofollow');
  });
});

describe('buildHomeSharePreview', () => {
  it('returns indexable home metadata', () => {
    const dto = buildHomeSharePreview(urls);
    expect(dto.resourceType).toBe('home');
    expect(dto.isPublic).toBe(true);
    expect(dto.canonicalUrl).toBe('https://hingot.com/');
  });
});

describe('parseSharePath', () => {
  it('parses post and profile paths', () => {
    expect(parseSharePath('/post/12')).toEqual({ type: 'post', key: '12' });
    expect(parseSharePath('/profile/alice')).toEqual({ type: 'profile', key: 'alice' });
    expect(parseSharePath('/')).toEqual({ type: 'home', key: 'home' });
  });
});

describe('backfill cursor encoding', () => {
  it('uses profile phase base cursor constant', () => {
    expect(BACKFILL_PROFILE_CURSOR_BASE).toBe(1_000_000_000);
  });
});

describe('privacy bulk preview semantics', () => {
  it('marks public-visibility posts non-public when author becomes private', () => {
    const dto = buildPostSharePreviewFields({
      postId: 1,
      username: 'alice',
      content: 'Hello',
      type: 'text',
      mediaUrls: null,
      visibility: 'public',
      authorIsPrivate: true,
      deleted: false,
      urls,
    });
    expect(dto.isPublic).toBe(false);
    expect(dto.robots).toBe('noindex,nofollow');
  });

  it('restores public posts when author is public again', () => {
    const dto = buildPostSharePreviewFields({
      postId: 1,
      username: 'alice',
      content: 'Hello',
      type: 'text',
      mediaUrls: null,
      visibility: 'public',
      authorIsPrivate: false,
      deleted: false,
      urls,
    });
    expect(dto.isPublic).toBe(true);
    expect(dto.robots).toBe('index,follow');
  });

  it('keeps followers-only posts private when author is public', () => {
    const dto = buildPostSharePreviewFields({
      postId: 1,
      username: 'alice',
      content: 'Hello',
      type: 'text',
      mediaUrls: null,
      visibility: 'followers',
      authorIsPrivate: false,
      deleted: false,
      urls,
    });
    expect(dto.isPublic).toBe(false);
  });
});

describe('buildSitemapXml', () => {
  it('escapes XML entities', () => {
    const xml = buildSitemapXml([
      { loc: 'https://hingot.com/post/1', lastmod: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(xml).toContain('<loc>https://hingot.com/post/1</loc>');
    expect(xml).toContain('<lastmod>2026-01-01</lastmod>');
  });
});
