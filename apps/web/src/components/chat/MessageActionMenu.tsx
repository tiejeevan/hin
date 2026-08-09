import { useEffect, useRef, useState } from 'react';
import { Copy, Reply, RotateCcw, Trash2 } from 'lucide-react';
import type { Message } from '@hin/types';
import { deriveLocalStatus } from '../../lib/chatMessages';

export interface MessageActionMenuProps {
  msg: Message;
  isMe: boolean;
  onClose: () => void;
  onCopy?: (msg: Message) => void;
  onReply?: (msg: Message) => void;
  onRetry?: (msg: Message) => void;
  onDelete: (msg: Message) => void;
}

export function MessageActionMenu({
  msg,
  isMe,
  onClose,
  onCopy,
  onReply,
  onRetry,
  onDelete,
}: MessageActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = deriveLocalStatus(msg);
  const canCopy = Boolean(msg.content?.trim() || msg.mediaUrl);
  const showRetry = status === 'failed' && Boolean(onRetry);
  const canReply = Boolean(onReply) && msg.id > 0;

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleCopy = async () => {
    if (onCopy) {
      onCopy(msg);
    } else {
      const text = msg.content?.trim()
        ? msg.content
        : msg.mediaUrl
          ? msg.mediaUrl
          : 'Photo';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* clipboard may be unavailable */
      }
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      data-testid="message-action-menu"
      className="absolute z-40 min-w-[9.5rem] rounded-xl border border-border-custom bg-bg-secondary shadow-lg overflow-hidden animate-message-menu-in"
      style={{ top: '100%', [isMe ? 'right' : 'left']: 0, marginTop: 4 }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      {canReply && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onReply?.(msg);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[40px]"
        >
          <Reply className="h-3.5 w-3.5 shrink-0" />
          Reply
        </button>
      )}
      {canCopy && (
        <button
          type="button"
          role="menuitem"
          onClick={() => void handleCopy()}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[40px]"
        >
          <Copy className="h-3.5 w-3.5 shrink-0" />
          Copy
        </button>
      )}
      {showRetry && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onRetry?.(msg);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[40px]"
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          Retry
        </button>
      )}
      {isMe && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            onDelete(msg);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-400 hover:bg-bg-tertiary hover:text-red-300 transition-colors cursor-pointer min-h-[40px]"
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          {confirmDelete ? 'Confirm delete?' : 'Delete'}
        </button>
      )}
    </div>
  );
}
