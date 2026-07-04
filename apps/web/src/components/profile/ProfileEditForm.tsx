import { useState } from 'react';
import { User as UserType } from '@hin/types';
import { API_URL } from '../../config';

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
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState<'avatar' | 'cover' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadImage = async (file: File, type: 'avatar' | 'cover') => {
    setIsUploading(type);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const res = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }

      const { url } = await res.json();
      if (type === 'avatar') setAvatarUrl(url);
      else setCoverUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setIsUploading(null);
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
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={isUploading === 'cover'}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) uploadImage(file, 'cover');
              e.target.value = '';
            }}
            className="text-xs text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:cursor-pointer"
          />
          {isUploading === 'cover' && <span className="text-xs text-text-muted">Uploading...</span>}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-text-muted font-medium">Profile Picture</label>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={isUploading === 'avatar'}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) uploadImage(file, 'avatar');
              e.target.value = '';
            }}
            className="text-xs text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:cursor-pointer"
          />
          {isUploading === 'avatar' && <span className="text-xs text-text-muted">Uploading...</span>}
        </div>
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
          disabled={isSaving || isUploading !== null}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-all shadow-md cursor-pointer min-h-[44px]"
        >
          {isSaving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}
