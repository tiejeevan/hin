export type AvatarDisplaySize = 'sm' | 'md' | 'lg' | 'xl';

/** Pixel widths for each avatar display size (Tailwind h-* classes). */
export const AVATAR_DISPLAY_PX: Record<AvatarDisplaySize, number> = {
  sm: 32,
  md: 36,
  lg: 80,
  xl: 112,
};

const THUMB_SIZES: AvatarDisplaySize[] = ['sm', 'md'];

/**
 * Derives the companion thumbnail URL from a full avatar URL.
 * Thumbnails are stored alongside the full image with a `_thumb` suffix.
 */
export function avatarThumbnailUrl(avatarUrl: string): string {
  return avatarUrl.replace(/\.(webp|jpe?g|png)$/i, '_thumb.$1');
}

/** Pick full or thumbnail URL based on where the avatar is rendered. */
export function avatarUrlForDisplay(
  avatarUrl: string | null | undefined,
  size: AvatarDisplaySize,
): string | null {
  if (!avatarUrl) return null;
  if (THUMB_SIZES.includes(size)) return avatarThumbnailUrl(avatarUrl);
  return avatarUrl;
}
