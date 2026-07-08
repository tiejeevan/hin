import imageCompression from 'browser-image-compression';

export type ImageCompressKind = 'avatar' | 'cover' | 'post' | 'badge' | 'event_banner';

/**
 * `crypto.randomUUID()` only exists in secure contexts (HTTPS or localhost).
 * When the dev server is reached over a LAN IP (e.g. testing on a phone) the
 * page is not a secure context, so fall back to a manual UUID v4 generator.
 */
function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const PRESETS: Record<ImageCompressKind, { maxWidthOrHeight: number; maxSizeMB: number; initialQuality: number }> = {
  avatar: { maxWidthOrHeight: 512, maxSizeMB: 0.2, initialQuality: 0.7 },
  cover: { maxWidthOrHeight: 1600, maxSizeMB: 0.4, initialQuality: 0.75 },
  post: { maxWidthOrHeight: 1920, maxSizeMB: 0.5, initialQuality: 0.75 },
  badge: { maxWidthOrHeight: 256, maxSizeMB: 0.15, initialQuality: 0.8 },
  event_banner: { maxWidthOrHeight: 1200, maxSizeMB: 0.5, initialQuality: 0.85 },
};

/**
 * Heavy client-side compression before upload.
 * Resizes and re-encodes to WebP (falls back to JPEG if WebP fails).
 */
export async function compressImage(file: File, kind: ImageCompressKind): Promise<File> {
  const preset = PRESETS[kind];

  try {
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: preset.maxWidthOrHeight,
      maxSizeMB: preset.maxSizeMB,
      initialQuality: preset.initialQuality,
      useWebWorker: true,
      fileType: 'image/webp',
    });

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([compressed], name, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    // Fallback: JPEG via canvas path in the library
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: preset.maxWidthOrHeight,
      maxSizeMB: preset.maxSizeMB,
      initialQuality: preset.initialQuality,
      useWebWorker: true,
      fileType: 'image/jpeg',
    });

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([compressed], name, { type: 'image/jpeg', lastModified: Date.now() });
  }
}

async function postUpload(
  formData: FormData,
  token: string,
  apiUrl: string,
): Promise<{ id: number; url: string; sizeBytes: number }> {
  const res = await fetch(`${apiUrl}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || 'Upload failed');
  }

  return res.json();
}

export async function uploadCompressedImage(
  file: File,
  kind: ImageCompressKind,
  token: string,
  apiUrl: string,
): Promise<{ id: number; url: string; sizeBytes: number }> {
  const compressed = await compressImage(file, kind);
  const formData = new FormData();
  formData.append('file', compressed);
  formData.append('type', kind);
  return postUpload(formData, token, apiUrl);
}

/** Tiny avatar for feed, header, and message list (~1–3 KB WebP at 48px). */
export async function compressAvatarThumbnail(file: File): Promise<File> {
  try {
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: 48,
      maxSizeMB: 0.003,
      initialQuality: 0.55,
      useWebWorker: true,
      fileType: 'image/webp',
    });
    const name = file.name.replace(/\.[^.]+$/, '') + '_thumb.webp';
    return new File([compressed], name, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: 48,
      maxSizeMB: 0.003,
      initialQuality: 0.55,
      useWebWorker: true,
      fileType: 'image/jpeg',
    });
    const name = file.name.replace(/\.[^.]+$/, '') + '_thumb.jpg';
    return new File([compressed], name, { type: 'image/jpeg', lastModified: Date.now() });
  }
}

/** Upload full avatar plus a paired `_thumb` variant for small UI regions. */
export async function uploadAvatarWithThumbnail(
  file: File,
  token: string,
  apiUrl: string,
): Promise<{ id: number; url: string; sizeBytes: number }> {
  const [fullFile, thumbFile] = await Promise.all([
    compressImage(file, 'avatar'),
    compressAvatarThumbnail(file),
  ]);
  const baseName = randomId();

  const fullForm = new FormData();
  fullForm.append('file', fullFile);
  fullForm.append('type', 'avatar');
  fullForm.append('baseName', baseName);

  const fullResult = await postUpload(fullForm, token, apiUrl);

  try {
    const thumbForm = new FormData();
    thumbForm.append('file', thumbFile);
    thumbForm.append('type', 'avatar');
    thumbForm.append('baseName', baseName);
    thumbForm.append('variant', 'thumb');
    await postUpload(thumbForm, token, apiUrl);
  } catch {
    // Full avatar is enough; small views fall back to the full URL.
  }

  return fullResult;
}
