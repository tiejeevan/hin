import { useState } from 'react';
import { X } from 'lucide-react';
import { ImagePicker, PickedImage } from '../ui/ImagePicker';
import { uploadCompressedImage } from '../../lib/compressImage';
import { API_URL } from '../../config';

interface CreatePostFormProps {
  content: string;
  token: string;
  onContentChange: (value: string) => void;
  onSubmit: (e: React.FormEvent, mediaUrls: string[]) => void | Promise<void>;
  onClose: () => void;
}

export function CreatePostForm({
  content,
  token,
  onContentChange,
  onSubmit,
  onClose,
}: CreatePostFormProps) {
  const [images, setImages] = useState<PickedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        e,
        images.map(img => img.remoteUrl),
      );
      images.forEach(img => URL.revokeObjectURL(img.previewUrl));
      setImages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-bg-secondary border border-border-custom rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-border-custom/60 pb-2">
        <span className="text-xs font-bold text-text-primary">Create New Post</span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary cursor-pointer p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          required
          rows={3}
          placeholder="What is on your mind?"
          value={content}
          onChange={e => onContentChange(e.target.value)}
          className="w-full bg-bg-primary border border-border-custom rounded-xl p-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors resize-none"
        />
        <ImagePicker
          images={images}
          max={5}
          uploading={uploading}
          error={error}
          onAddFiles={handleAddFiles}
          onRemove={handleRemove}
          disabled={submitting}
        />
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs text-text-muted hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={uploading || submitting}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer min-h-[44px]"
          >
            {uploading ? 'Uploading…' : submitting ? 'Publishing…' : 'Publish Post'}
          </button>
        </div>
      </form>
    </div>
  );
}
