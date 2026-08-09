import { X } from 'lucide-react';
import type { Message } from '@hin/types';

export interface ReplyQuoteBarProps {
  message: Message;
  onDismiss: () => void;
}

function snippetFor(message: Message): string {
  const text = message.content?.trim();
  if (text) {
    return text.length > 96 ? `${text.slice(0, 96)}…` : text;
  }
  if (message.mediaUrl) return 'Photo';
  return 'Message';
}

export function ReplyQuoteBar({ message, onDismiss }: ReplyQuoteBarProps) {
  return (
    <div
      data-testid="reply-quote-bar"
      className="flex items-stretch gap-2 px-2.5 py-2 bg-chat-input border-t border-border-custom animate-reply-quote-in"
    >
      <div className="w-0.5 shrink-0 rounded-full bg-sky-400 self-stretch" aria-hidden />
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-[11px] font-semibold text-sky-400 truncate">
          {message.senderUsername}
        </p>
        <p className="text-[11px] text-text-muted truncate">{snippetFor(message)}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 self-center p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
        aria-label="Cancel reply"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
