import { useEffect, useRef, useState } from 'react';
import { BarChart3, Globe, Loader2, Lock, MoreVertical, Send, Users, X } from 'lucide-react';
import { useMentionAutocomplete } from '../../hooks/useMentionAutocomplete';
import { MentionSuggestions } from '../ui/MentionSuggestions';
import type { PostVisibility } from '@hin/types';
import { ImagePicker, PickedImage } from '../ui/ImagePicker';
import { uploadCompressedImage } from '../../lib/compressImage';
import { API_URL } from '../../config';
import {
  PollCreatorFields,
  defaultPollDraft,
  validatePollDraft,
  pollDraftToApiFields,
  type PollDraft,
} from './PollCreatorFields';

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string; Icon: typeof Globe }[] = [
  { value: 'public', label: 'Public', Icon: Globe },
  { value: 'followers', label: 'Followers', Icon: Users },
  { value: 'only_me', label: 'Only me', Icon: Lock },
];

export type CreatePostSubmitPayload =
  | { kind: 'text'; mediaUrls: string[]; visibility: PostVisibility }
  | { kind: 'poll'; mediaUrls: string[]; poll: ReturnType<typeof pollDraftToApiFields>; visibility: PostVisibility };

interface CreatePostFormProps {
  content: string;
  token: string;
  onContentChange: (value: string) => void;
  onSubmit: (e: React.FormEvent, payload: CreatePostSubmitPayload) => void | Promise<void>;
  onClose: () => void;
}

export function CreatePostForm({
  content,
  token,
  onContentChange,
  onSubmit,
  onClose,
}: CreatePostFormProps) {
  const {
    suggestions,
    showDropdown,
    activeIndex,
    inputRef,
    handleInputChange,
    handleKeyDown,
    selectSuggestion,
  } = useMentionAutocomplete({
    value: content,
    onChange: onContentChange,
    token,
  });

  const [hasPoll, setHasPoll] = useState(false);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [pollDraft, setPollDraft] = useState<PollDraft>(defaultPollDraft);
  const [showPollSettings, setShowPollSettings] = useState(false);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visibilityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !visibilityOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (visibilityRef.current && !visibilityRef.current.contains(e.target as Node)) {
        setVisibilityOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setVisibilityOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen, visibilityOpen]);

  const handleAddFiles = async (files: File[]) => {
    setError(null);
    const placeholders: PickedImage[] = files.map(file => ({
      previewUrl: URL.createObjectURL(file),
      remoteUrl: '',
      file,
    }));
    setImages(prev => [...prev, ...placeholders].slice(0, 5));
    setUploading(true);

    try {
      for (let i = 0; i < placeholders.length; i++) {
        const placeholder = placeholders[i];
        try {
          const result = await uploadCompressedImage(placeholder.file, 'post', token, API_URL);
          setImages(prev =>
            prev.map(img =>
              img.previewUrl === placeholder.previewUrl
                ? { ...img, remoteUrl: result.url, uploadId: result.id }
                : img,
            ),
          );
        } catch (e) {
          setImages(prev => prev.filter(img => img.previewUrl !== placeholder.previewUrl));
          URL.revokeObjectURL(placeholder.previewUrl);
          setError(e instanceof Error ? e.message : 'Upload failed');
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (index: number) => {
    setImages(prev => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading || submitting) return;
    const pending = images.some(img => !img.remoteUrl);
    if (pending) {
      setError('Please wait for images to finish uploading');
      return;
    }

    if (hasPoll) {
      const pollError = validatePollDraft(pollDraft);
      if (pollError) {
        setError(pollError);
        return;
      }
    } else if (!content.trim()) {
      setError('Write something for your post');
      return;
    }

    setSubmitting(true);
    setError(null);
    const mediaUrls = images.map(img => img.remoteUrl);
    try {
      if (hasPoll) {
        await onSubmit(e, { kind: 'poll', mediaUrls, poll: pollDraftToApiFields(pollDraft), visibility });
      } else {
        await onSubmit(e, { kind: 'text', mediaUrls, visibility });
      }
      images.forEach(img => URL.revokeObjectURL(img.previewUrl));
      setImages([]);
      setPollDraft(defaultPollDraft());
      setHasPoll(false);
      setShowPollSettings(false);
      setVisibility('public');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setSubmitting(false);
    }
  };

  const currentVisibility = VISIBILITY_OPTIONS.find(o => o.value === visibility) ?? VISIBILITY_OPTIONS[0];
  const VisibilityIcon = currentVisibility.Icon;

  return (
    <div className="bg-bg-secondary border border-border-custom rounded-2xl p-4 space-y-3">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            rows={3}
            placeholder="What is on your mind?"
            value={content}
            onChange={e => {
              onContentChange(e.target.value);
              handleInputChange(e);
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-bg-primary border border-border-custom rounded-xl p-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors resize-none"
          />
          {showDropdown && (
            <MentionSuggestions
              suggestions={suggestions}
              activeIndex={activeIndex}
              onSelect={selectSuggestion}
            />
          )}
        </div>

        {hasPoll && (
          <section className="space-y-3 pt-1 border-t border-border-custom/60">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Poll
            </label>
            <PollCreatorFields
              draft={pollDraft}
              onChange={setPollDraft}
              showSettings={showPollSettings}
              onToggleSettings={() => setShowPollSettings(prev => !prev)}
            />
          </section>
        )}

        <ImagePicker
          images={images}
          max={5}
          uploading={uploading}
          error={error}
          onAddFiles={handleAddFiles}
          onRemove={handleRemove}
          disabled={submitting}
          actions={
            <div className="flex items-center gap-0.5">
              <div ref={visibilityRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setVisibilityOpen(prev => !prev);
                    setMenuOpen(false);
                  }}
                  className="text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors cursor-pointer p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title={`Visibility: ${currentVisibility.label}`}
                  aria-haspopup="menu"
                  aria-expanded={visibilityOpen}
                  aria-label={`Visibility: ${currentVisibility.label}`}
                >
                  <VisibilityIcon className="h-4 w-4" />
                </button>

                {visibilityOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 bottom-full mb-1 w-44 rounded-xl border border-border-custom bg-bg-secondary shadow-lg overflow-hidden z-10"
                  >
                    {VISIBILITY_OPTIONS.map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={visibility === value}
                        onClick={() => {
                          setVisibility(value);
                          setVisibilityOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors cursor-pointer min-h-[44px] ${
                          visibility === value
                            ? 'text-indigo-400 bg-indigo-500/10'
                            : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(prev => !prev);
                    setVisibilityOpen(false);
                  }}
                  className="text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors cursor-pointer p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="Post options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 bottom-full mb-1 w-44 rounded-xl border border-border-custom bg-bg-secondary shadow-lg overflow-hidden z-10"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        if (hasPoll) {
                          setHasPoll(false);
                          setPollDraft(defaultPollDraft());
                          setShowPollSettings(false);
                        } else {
                          setHasPoll(true);
                        }
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-indigo-400 transition-colors cursor-pointer min-h-[44px]"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      {hasPoll ? 'Remove Poll' : 'Add Poll'}
                    </button>
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={uploading || submitting}
                className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-50 rounded-lg transition-colors cursor-pointer p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={
                  uploading ? 'Uploading' : submitting ? 'Publishing' : 'Publish post'
                }
                title={
                  uploading ? 'Uploading…' : submitting ? 'Publishing…' : 'Publish post'
                }
              >
                {uploading || submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors cursor-pointer p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Cancel"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          }
        />
      </form>
    </div>
  );
}
