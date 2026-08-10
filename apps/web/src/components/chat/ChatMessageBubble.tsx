import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Reply } from 'lucide-react';
import type { Message } from '@hin/types';
import { LinkPreviewCard } from '../feed/LinkPreviewCard';
import { getOlabidItemIdFromUrl } from '../../lib/appRoutes';
import { deriveLocalStatus } from '../../lib/chatMessages';
import { safeMediaUrl } from '../../lib/safeUrl';
import { DeliveryTicks } from './DeliveryTicks';
import { MessageActionMenu } from './MessageActionMenu';

const SWIPE_THRESHOLD = 48;
const AXIS_LOCK_PX = 6;
const DOUBLE_TAP_MS = 300;
const LONG_PRESS_MS = 500;
const MAX_PULL = 80;

export interface ChatMessageBubbleProps {
  msg: Message;
  isMe: boolean;
  currentUserId: number;
  olabidEnabled?: boolean;
  onOpenOlabidItem?: (id: number) => void;
  onClosePanel?: () => void;
  onRetryFailedMessage?: (msg: Message) => void;
  onReply: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  onCopy?: (msg: Message) => void;
  staggerIndex?: number;
}

/** Dampen pull only in the reply direction (negative for sent, positive for received). */
function dampReplyPull(rawDx: number, replyDir: 1 | -1): number {
  const along = rawDx * replyDir; // >0 when moving in reply direction
  if (along <= 0) return 0;
  const dampened = along < SWIPE_THRESHOLD ? along : SWIPE_THRESHOLD + (along - SWIPE_THRESHOLD) * 0.35;
  return replyDir * Math.min(dampened, MAX_PULL);
}

function ReplyQuoteChip({ reply, isMe }: { reply: NonNullable<Message['replyTo']>; isMe: boolean }) {
  const body = reply.deleted
    ? 'Original message deleted'
    : reply.content?.trim()
      ? reply.content
      : reply.mediaUrl
        ? 'Photo'
        : 'Message';

  return (
    <div
      className={`mb-1.5 rounded-lg px-2 py-1 text-[11px] leading-snug border-l-2 ${
        isMe ? 'border-white/50 bg-black/10' : 'border-sky-400/80 bg-black/5 dark:bg-white/5'
      }`}
    >
      {!reply.deleted && (
        <p className="font-semibold truncate opacity-90">{reply.senderUsername}</p>
      )}
      <p className={`truncate opacity-75 ${reply.deleted ? 'italic' : ''}`}>{body}</p>
    </div>
  );
}

export function ChatMessageBubble({
  msg,
  isMe,
  currentUserId: _currentUserId,
  olabidEnabled = true,
  onOpenOlabidItem,
  onClosePanel,
  onRetryFailedMessage,
  onReply,
  onDelete,
  onCopy,
  staggerIndex,
}: ChatMessageBubbleProps) {
  const status = deriveLocalStatus(msg);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Sent → swipe left (−1). Received → swipe right (+1).
  const replyDir: 1 | -1 = isMe ? -1 : 1;
  // RP-010: optimistic / unacked messages cannot swipe-to-reply.
  const canSwipeReply = msg.id > 0;

  const rowRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const axisRef = useRef<'h' | 'v' | null>(null);
  const dragXRef = useRef(0);
  const lastTapRef = useRef(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const openMenu = () => setMenuOpen(true);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const resetGesture = () => {
    clearLongPress();
    pointerIdRef.current = null;
    axisRef.current = null;
    dragXRef.current = 0;
    setDragX(0);
    setDragging(false);
  };

  useEffect(() => () => clearLongPress(), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Don't steal vertical scroll yet — capture only after horizontal lock.
    pointerIdRef.current = e.pointerId;
    startRef.current = { x: e.clientX, y: e.clientY };
    axisRef.current = null;
    dragXRef.current = 0;
    longPressFiredRef.current = false;
    setDragX(0);
    setDragging(true);

    // SW-015: long-press opens menu if hold stays within AXIS_LOCK_PX.
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (axisRef.current === 'h') return;
      longPressFiredRef.current = true;
      lastTapRef.current = 0;
      dragXRef.current = 0;
      setDragX(0);
      setDragging(false);
      openMenu();
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    // Menu already opened via long-press — ignore residual drag.
    if (longPressFiredRef.current) return;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    // Cancel long-press once movement exceeds the axis-lock dead zone.
    if (Math.abs(dx) >= AXIS_LOCK_PX || Math.abs(dy) >= AXIS_LOCK_PX) {
      clearLongPress();
    }

    if (!axisRef.current) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      axisRef.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      if (axisRef.current === 'v' || (axisRef.current === 'h' && !canSwipeReply)) {
        // Vertical scroll, or RP-010: no horizontal reply swipe for pending ids.
        resetGesture();
        return;
      }
      // Locked horizontal — cancel long-press and own the pointer.
      clearLongPress();
      try {
        rowRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    if (axisRef.current !== 'h') return;

    e.preventDefault();
    const next = dampReplyPull(dx, replyDir);
    dragXRef.current = next;
    setDragX(next);
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    const axis = axisRef.current;
    const pull = dragXRef.current;
    const along = pull * replyDir;
    const longPressFired = longPressFiredRef.current;

    try {
      if (rowRef.current?.hasPointerCapture(e.pointerId)) {
        rowRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }

    longPressFiredRef.current = false;
    resetGesture();

    if (longPressFired) {
      lastTapRef.current = 0;
      return;
    }

    // RP-010: only committed messages (id > 0) can swipe-to-reply.
    if (canSwipeReply && axis === 'h' && along >= SWIPE_THRESHOLD) {
      onReply(msg);
      lastTapRef.current = 0;
      return;
    }

    // Tap / double-tap (only if we never locked horizontal).
    if (axis !== 'h' && Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) {
      if (e.pointerType === 'touch') {
        const now = Date.now();
        if (now - lastTapRef.current < DOUBLE_TAP_MS) {
          lastTapRef.current = 0;
          openMenu();
        } else {
          lastTapRef.current = now;
        }
      }
    } else {
      // Prevent double-tap menu during / after horizontal swipe.
      lastTapRef.current = 0;
    }
  };

  const onBubbleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // SW-014 / AX-005: ContextMenu or Shift+F10 opens the action menu.
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      openMenu();
    }
  };

  const iconOpacity = Math.min(1, (dragX * replyDir) / SWIPE_THRESHOLD);
  const staggerStyle: CSSProperties | undefined =
    staggerIndex !== undefined
      ? ({ '--stagger': String(staggerIndex) } as CSSProperties)
      : undefined;
  const mediaSrc = safeMediaUrl(msg.mediaUrl);
  const previewUrl = msg.linkPreview ? safeMediaUrl(msg.linkPreview.url) : null;
  const previewImageUrl = msg.linkPreview
    ? safeMediaUrl(msg.linkPreview.imageUrl)
    : null;

  return (
    <div
      role="article"
      tabIndex={0}
      className="relative flex flex-col w-full min-w-0 animate-message-fade-in select-none outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-1 rounded-sm"
      style={staggerStyle}
      data-testid={`chat-msg-${msg.id}`}
      onKeyDown={onBubbleKeyDown}
      onDoubleClick={e => {
        e.preventDefault();
        openMenu();
      }}
    >
      <div
        ref={rowRef}
        className={`relative z-[1] flex w-full min-w-0 ${isMe ? 'justify-end' : 'justify-start'}`}
        style={{
          transform: dragX ? `translateX(${dragX}px)` : undefined,
          transition: dragging ? 'none' : 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
          // Allow vertical list scroll; claim horizontal pans for reply swipe.
          touchAction: 'pan-y',
          cursor: canSwipeReply ? 'grab' : 'default',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <div className="relative max-w-[80%] min-w-0">
          {/* Reply affordance sits on the side we pull away from (clipped by chat overflow-x-hidden) */}
          {canSwipeReply ? (
            <div
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-sky-400 ${
                isMe ? 'left-full ml-2' : 'right-full mr-2'
              }`}
              style={{ opacity: iconOpacity }}
              aria-hidden
            >
              <Reply className="h-4 w-4" />
            </div>
          ) : null}

          <div
            className={`rounded-[18px] px-3 py-2 text-[12px] leading-snug min-w-0 overflow-hidden ${
              isMe
                ? 'bg-msg-me text-msg-me-text rounded-br-[4px]'
                : 'bg-msg-other text-msg-other-text rounded-bl-[4px] border border-border-custom'
            }`}
          >
            {msg.replyTo ? <ReplyQuoteChip reply={msg.replyTo} isMe={isMe} /> : null}
            {mediaSrc && (
              <a
                href={mediaSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="block mb-1.5 -mx-0.5 rounded-xl overflow-hidden bg-black/10"
                onClick={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
              >
                <img
                  src={mediaSrc}
                  alt="Attachment"
                  className="max-w-full max-h-56 object-cover"
                  loading="lazy"
                  draggable={false}
                />
              </a>
            )}
            {msg.content ? (
              <p
                dir="auto"
                className="break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-left"
              >
                {msg.content}
              </p>
            ) : null}
            {msg.linkPreview && previewUrl && (
              <div className="mt-1.5 -mx-0.5">
                <LinkPreviewCard
                  preview={{
                    ...msg.linkPreview,
                    url: previewUrl,
                    imageUrl: previewImageUrl,
                  }}
                  compact
                  inAppOlabidLinks={olabidEnabled}
                  onClick={e => {
                    const itemId = getOlabidItemIdFromUrl(previewUrl);
                    if (itemId !== null && onOpenOlabidItem) {
                      e.preventDefault();
                      onOpenOlabidItem(itemId);
                      onClosePanel?.();
                    }
                  }}
                />
              </div>
            )}
          </div>

          {menuOpen && (
            <MessageActionMenu
              msg={msg}
              isMe={isMe}
              onClose={() => setMenuOpen(false)}
              onCopy={onCopy}
              onReply={onReply}
              onRetry={onRetryFailedMessage}
              onDelete={onDelete}
            />
          )}
        </div>
      </div>

      {isMe && (
        <div className="flex items-center justify-end gap-1.5 pr-1 mt-0.5 min-h-[14px]">
          {status === 'failed' && onRetryFailedMessage ? (
            <button
              type="button"
              onClick={() => onRetryFailedMessage(msg)}
              onPointerDown={e => e.stopPropagation()}
              className="text-[10px] text-red-400 hover:text-red-300 font-medium cursor-pointer underline-offset-2 hover:underline"
            >
              Retry
            </button>
          ) : null}
          <DeliveryTicks status={status} />
        </div>
      )}
    </div>
  );
}
