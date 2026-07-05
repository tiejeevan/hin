import { useState } from 'react';
import { User as UserType } from '@hin/types';
import { API_URL } from '../../config';
import { ImagePicker, PickedImage } from '../ui/ImagePicker';
import { uploadAvatarWithThumbnail, uploadCompressedImage } from '../../lib/compressImage';

interface ProfileEditFormProps {
  user: UserType;
  token: string;
  onSave: (updated: UserType) => void;
  onCancel: () => void;
}

export function ProfileEditForm({ user, token, onSave, onCancel }: ProfileEditFormProps) {
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [coverUrl, setCoverUrl] = useState(user.coverUrl || '');
  const [avatarImages, setAvatarImages] = useState<PickedImage[]>(
    user.avatarUrl
      ? [{ previewUrl: user.avatarUrl, remoteUrl: user.avatarUrl, file: new File([], 'avatar') }]
      : [],
  );
  const [coverImages, setCoverImages] = useState<PickedImage[]>(
    user.coverUrl
      ? [{ previewUrl: user.coverUrl, remoteUrl: user.coverUrl, file: new File([], 'cover') }]
      : [],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState<'avatar' | 'cover' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadSingle = async (files: File[], kind: 'avatar' | 'cover') => {
    const file = files[0];
    if (!file) return;
    setUploading(kind);
    setError(null);
    const previewUrl = URL.createObjectURL(file);
    const placeholder: PickedImage = { previewUrl, remoteUrl: '', file };
    if (kind === 'avatar') setAvatarImages([placeholder]);
    else setCoverImages([placeholder]);

    try {
      const result =
        kind === 'avatar'
          ? await uploadAvatarWithThumbnail(file, token, API_URL)
          : await uploadCompressedImage(file, kind, token, API_URL);
      const uploaded: PickedImage = { previewUrl, remoteUrl: result.url, uploadId: result.id, file };
      if (kind === 'avatar') {
        setAvatarImages([uploaded]);
        setAvatarUrl(result.url);
      } else {
        setCoverImages([uploaded]);
        setCoverUrl(result.url);
      }
    } catch (e) {
      URL.revokeObjectURL(previewUrl);
      if (kind === 'avatar') {
        setAvatarImages(
          avatarUrl
            ? [{ previewUrl: avatarUrl, remoteUrl: avatarUrl, file: new File([], 'avatar') }]
            : [],
        );
      } else {
        setCoverImages(
          coverUrl
            ? [{ previewUrl: coverUrl, remoteUrl: coverUrl, file: new File([], 'cover') }]
            : [],
        );
      }
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bio: bio.trim() || null,
          avatarUrl: avatarUrl || null,
          coverUrl: coverUrl || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save profile');
      }

      onSave(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 bg-bg-secondary border border-border-custom rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-text-primary">Edit Profile</h3>

      <div className="space-y-2">
        <label className="text-xs text-text-muted font-medium">Cover Image</label>
        <ImagePicker
          images={coverImages}
          max={1}
          uploading={uploading === 'cover'}
          onAddFiles={files => uploadSingle(files, 'cover')}
          onRemove={() => {
            setCoverImages([]);
            setCoverUrl('');
          }}
          disabled={isSaving || uploading === 'avatar'}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-text-muted font-medium">Profile Picture</label>
        <ImagePicker
          images={avatarImages}
          max={1}
          uploading={uploading === 'avatar'}
          onAddFiles={files => uploadSingle(files, 'avatar')}
          onRemove={() => {
            setAvatarImages([]);
            setAvatarUrl('');
          }}
          disabled={isSaving || uploading === 'cover'}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-text-muted font-medium">Bio</label>
        <textarea
          rows={4}
          maxLength={500}
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="Tell others about yourself..."
          className="w-full bg-bg-primary border border-border-custom rounded-xl p-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors resize-none"
        />
        <p className="text-[10px] text-text-muted text-right">{bio.length}/500</p>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-3.5 py-1.5 rounded-xl text-xs text-text-muted hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || uploading !== null}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-all shadow-md cursor-pointer min-h-[44px]"
        >
          {isSaving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}
