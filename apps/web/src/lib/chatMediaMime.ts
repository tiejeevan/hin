export const ALLOWED_CHAT_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AllowedChatImageMime = (typeof ALLOWED_CHAT_IMAGE_MIMES)[number];

export function isAllowedChatImageMime(type: string): boolean {
  const normalized = type.trim().toLowerCase();
  return (ALLOWED_CHAT_IMAGE_MIMES as readonly string[]).includes(normalized);
}

export function isAllowedChatImageFile(file: File): boolean {
  return isAllowedChatImageMime(file.type);
}
