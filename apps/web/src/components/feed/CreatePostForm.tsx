import { X, Image as ImageIcon } from 'lucide-react';

interface CreatePostFormProps {
  content: string;
  mediaUrl: string;
  onContentChange: (value: string) => void;
  onMediaChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function CreatePostForm({
  content,
  mediaUrl,
  onContentChange,
  onMediaChange,
  onSubmit,
  onClose,
}: CreatePostFormProps) {
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
      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          required
          rows={3}
          placeholder="What is on your mind?"
          value={content}
          onChange={e => onContentChange(e.target.value)}
          className="w-full bg-bg-primary border border-border-custom rounded-xl p-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors resize-none"
        />
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Image URL (optional)"
            value={mediaUrl}
            onChange={e => onMediaChange(e.target.value)}
            className="flex-grow bg-bg-primary border border-border-custom rounded-xl px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
          />
        </div>
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
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer min-h-[44px]"
          >
            Publish Post
          </button>
        </div>
      </form>
    </div>
  );
}
