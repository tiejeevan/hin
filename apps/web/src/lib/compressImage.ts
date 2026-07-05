import imageCompression from 'browser-image-compression';

export type ImageCompressKind = 'avatar' | 'cover' | 'post';

const PRESETS: Record<ImageCompressKind, { maxWidthOrHeight: number; maxSizeMB: number; initialQuality: number }> = {
  avatar: { maxWidthOrHeight: 512, maxSizeMB: 0.2, initialQuality: 0.7 },
  cover: { maxWidthOrHeight: 1600, maxSizeMB: 0.4, initialQuality: 0.75 },
  post: { maxWidthOrHeight: 1920, maxSizeMB: 0.5, initialQuality: 0.75 },
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
  const baseName = crypto.randomUUID();

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
