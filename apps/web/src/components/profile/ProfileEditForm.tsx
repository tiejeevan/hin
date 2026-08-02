import { useEffect, useRef, useState } from 'react';
import { X, Calendar, Camera, Loader2, ImagePlus } from 'lucide-react';
import { User as UserType } from '@hin/types';
import { API_URL } from '../../config';
import { uploadAvatarWithThumbnail, uploadCompressedImage } from '../../lib/compressImage';
import { EmailVerificationSection } from './EmailVerificationSection';

interface ProfileEditFormProps {
  user: UserType;
  token: string;
  onSave: (updated: UserType) => void;
  onEmailVerified?: (updated: UserType) => void;
  onCancel: () => void;
}

export function ProfileEditForm({ user, token, onSave, onEmailVerified, onCancel }: ProfileEditFormProps) {
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [coverUrl, setCoverUrl] = useState(user.coverUrl || '');
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth || '');
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState<'avatar' | 'cover' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemoveAvatar, setConfirmRemoveAvatar] = useState(false);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarBlobRef = useRef<string | null>(null);
  const coverBlobRef = useRef<string | null>(null);

  const busy = isSaving || uploading !== null;

  useEffect(() => {
    return () => {
      if (avatarBlobRef.current) URL.revokeObjectURL(avatarBlobRef.current);
      if (coverBlobRef.current) URL.revokeObjectURL(coverBlobRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busy) return;
      if (confirmRemoveAvatar) {
        setConfirmRemoveAvatar(false);
        return;
      }
      onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, confirmRemoveAvatar, onCancel]);

  const revokeBlob = (kind: 'avatar' | 'cover') => {
    const ref = kind === 'avatar' ? avatarBlobRef : coverBlobRef;
    if (ref.current) {
      URL.revokeObjectURL(ref.current);
      ref.current = null;
    }
  };

  const triggerCoverSelect = () => {
    if (!busy) coverInputRef.current?.click();
  };

  const triggerAvatarSelect = () => {
    if (!busy) avatarInputRef.current?.click();
  };

  const clearCover = () => {
    revokeBlob('cover');
    setCoverUrl('');
  };

  const clearAvatar = () => {
    revokeBlob('avatar');
    setAvatarUrl('');
    setConfirmRemoveAvatar(false);
  };

  const uploadSingle = async (files: File[], kind: 'avatar' | 'cover') => {
    const file = files[0];
    if (!file) return;

    setUploading(kind);
    setError(null);

    const previousUrl = kind === 'avatar' ? avatarUrl : coverUrl;
    const previewUrl = URL.createObjectURL(file);
    revokeBlob(kind);
    if (kind === 'avatar') {
      avatarBlobRef.current = previewUrl;
      setAvatarUrl(previewUrl);
    } else {
      coverBlobRef.current = previewUrl;
      setCoverUrl(previewUrl);
    }

    try {
      const result =
        kind === 'avatar'
          ? await uploadAvatarWithThumbnail(file, token, API_URL)
          : await uploadCompressedImage(file, kind, token, API_URL);

      revokeBlob(kind);
      if (kind === 'avatar') setAvatarUrl(result.url);
      else setCoverUrl(result.url);
    } catch (e) {
      revokeBlob(kind);
      if (kind === 'avatar') setAvatarUrl(previousUrl);
      else setCoverUrl(previousUrl);
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
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          dateOfBirth: dateOfBirth || null,
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
    <div className="glass-panel rounded-2xl overflow-hidden animate-fade-in relative w-full">
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            void uploadSingle(Array.from(e.target.files), 'cover');
          }
          e.target.value = '';
        }}
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            void uploadSingle(Array.from(e.target.files), 'avatar');
          }
          e.target.value = '';
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-custom/60 px-4 py-3 bg-bg-secondary/70 backdrop-blur-md sticky top-0 z-30">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-text-muted hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50 min-h-[40px]"
          aria-label="Cancel editing"
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline text-xs font-medium">Cancel</span>
        </button>
        <h2 className="text-sm font-semibold text-text-primary tracking-wide">Edit Profile</h2>
        <button
          id="save-profile-btn"
          type="button"
          onClick={() => void handleSave()}
          disabled={busy}
          className="btn-gradient text-white text-xs font-semibold px-4 py-2 rounded-full transition-all duration-200 shadow-sm cursor-pointer disabled:opacity-50 min-h-[40px] min-w-[72px]"
        >
          {isSaving ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving
            </span>
          ) : (
            'Save'
          )}
        </button>
      </div>

      {/* Cover + avatar */}
      <div className="relative">
        <button
          type="button"
          onClick={triggerCoverSelect}
          disabled={busy}
          className="relative w-full h-36 md:h-44 bg-gradient-to-br from-indigo-600/35 via-violet-600/25 to-bg-tertiary overflow-hidden border-b border-border-custom cursor-pointer group disabled:cursor-wait"
          aria-label="Change cover photo"
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-text-muted">
              <ImagePlus className="h-6 w-6 opacity-70" />
              <span className="text-xs font-medium">Add cover photo</span>
            </div>
          )}

          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200" />

          {uploading === 'cover' && (
            <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
          )}
        </button>

        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
          <button
            type="button"
            onClick={triggerCoverSelect}
            disabled={busy}
            className="p-2 rounded-full bg-black/55 text-white hover:bg-black/75 backdrop-blur-md border border-white/15 transition-all cursor-pointer disabled:opacity-50"
            title="Change cover"
            aria-label="Change cover photo"
          >
            <Camera className="h-4 w-4" />
          </button>
          {coverUrl && (
            <button
              type="button"
              onClick={clearCover}
              disabled={busy}
              className="p-2 rounded-full bg-black/55 text-rose-300 hover:bg-black/75 backdrop-blur-md border border-white/15 transition-all cursor-pointer disabled:opacity-50"
              title="Remove cover"
              aria-label="Remove cover photo"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 z-10">
          <div className="relative w-24 h-24 md:w-28 md:h-28">
            <button
              type="button"
              onClick={triggerAvatarSelect}
              disabled={busy}
              className="w-full h-full rounded-full border-[3px] border-bg-secondary bg-bg-tertiary shadow-lg overflow-hidden cursor-pointer group disabled:cursor-wait focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
              aria-label="Change profile picture"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[11px] text-text-muted font-medium">
                  Add photo
                </span>
              )}

              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <Camera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
              </div>

              {uploading === 'avatar' && (
                <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={triggerAvatarSelect}
              disabled={busy}
              className="absolute bottom-0.5 right-0.5 bg-indigo-600 border-2 border-bg-secondary rounded-full p-1.5 text-white shadow-md hover:bg-indigo-500 active:scale-95 transition-all z-20 cursor-pointer disabled:opacity-50 min-h-[32px] min-w-[32px] flex items-center justify-center"
              title="Change profile picture"
              aria-label="Change profile picture"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>

            {avatarUrl && (
              <button
                type="button"
                onClick={() => setConfirmRemoveAvatar(true)}
                disabled={busy}
                className="absolute -top-0.5 -right-0.5 bg-bg-secondary border border-border-custom rounded-full p-1.5 text-rose-400 shadow-sm hover:bg-bg-tertiary transition-all z-20 cursor-pointer disabled:opacity-50"
                title="Remove profile picture"
                aria-label="Remove profile picture"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {confirmRemoveAvatar && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-avatar-title"
        >
          <div className="w-full max-w-xs rounded-2xl border border-border-custom bg-bg-secondary shadow-xl p-5 space-y-3">
            <h3 id="remove-avatar-title" className="text-sm font-semibold text-text-primary">
              Remove profile picture?
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Your photo will be cleared. Save your profile to make the change permanent.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmRemoveAvatar(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-text-muted hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearAvatar}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer min-h-[40px]"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fields */}
      <div className="px-5 pb-5 pt-16 md:pt-[4.25rem] space-y-5">
        <div id="profile-edit-basics" className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="first-name-input" className="text-[11px] font-semibold text-text-muted uppercase tracking-wider ml-0.5">
                First Name
              </label>
              <div className="input-glass rounded-xl px-3.5 min-h-[44px] flex items-center">
                <input
                  id="first-name-input"
                  type="text"
                  maxLength={100}
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                  className="w-full bg-transparent border-none outline-none p-0 text-sm text-text-primary placeholder-text-muted focus:ring-0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="last-name-input" className="text-[11px] font-semibold text-text-muted uppercase tracking-wider ml-0.5">
                Last Name
              </label>
              <div className="input-glass rounded-xl px-3.5 min-h-[44px] flex items-center">
                <input
                  id="last-name-input"
                  type="text"
                  maxLength={100}
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="w-full bg-transparent border-none outline-none p-0 text-sm text-text-primary placeholder-text-muted focus:ring-0"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="birthday-input" className="text-[11px] font-semibold text-text-muted uppercase tracking-wider ml-0.5">
              Birthday
            </label>
            <div className="input-glass rounded-xl px-3.5 min-h-[44px] flex items-center gap-2 relative">
              <input
                id="birthday-input"
                type="date"
                value={dateOfBirth}
                onChange={e => setDateOfBirth(e.target.value)}
                className="w-full bg-transparent border-none outline-none p-0 text-sm text-text-primary placeholder-text-muted focus:ring-0 relative z-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
              <Calendar className="h-4 w-4 text-text-muted shrink-0 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="space-y-2 border-t border-border-custom/70 pt-4">
          <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider ml-0.5">
            Contact
          </p>
          <EmailVerificationSection
            token={token}
            onVerified={updated => {
              (onEmailVerified ?? onSave)(updated);
            }}
          />
        </div>

        <div className="space-y-1.5 border-t border-border-custom/70 pt-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="bio-input" className="text-[11px] font-semibold text-text-muted uppercase tracking-wider ml-0.5">
              Bio
            </label>
            <span className="text-[10px] text-text-muted tabular-nums">{bio.length}/500</span>
          </div>
          <div className="input-glass rounded-xl p-3.5">
            <textarea
              id="bio-input"
              rows={4}
              maxLength={500}
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell others about yourself…"
              className="w-full bg-transparent border-none outline-none p-0 text-sm text-text-primary placeholder-text-muted focus:ring-0 resize-none leading-relaxed"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
