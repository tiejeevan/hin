import { useEffect, useMemo } from 'react';
import { X, Shield, SquarePen, ChevronLeft, Maximize2, Minimize2, Send, MessageCircle } from 'lucide-react';
import { ChatThread, Message, User as UserType } from '@hin/types';
import { ChatRecipient } from '../../types/ui';
import { UserAvatar } from '../profile/UserAvatar';
import { EquippedBadgesInline } from '../gamification/EquippedBadgesInline';
import { useOverscrollBounce } from '../../hooks/useOverscrollBounce';

interface MessagesPanelProps {
  isOpen: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  threads: ChatThread[];
  currentUser: UserType;
  chatRecipient: ChatRecipient | null;
  chatMessages: Message[];
  newMsgText: string;
  typingUsers: Record<number, boolean>;
  onlineUserIds: Set<number>;
  chatBottomRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onSelectThread: (thread: ChatRecipient) => void;
  onBackToList: () => void;
  onNewMsgTextChange: (text: string) => void;
  onSendDM: (e: React.FormEvent) => void;
  onTyping: (recipientId: number) => void;
  onOpenProfile: (userId: number, opts?: { username?: string }) => void;
}

export function MessagesPanel({
  isOpen,
  isExpanded,
  onToggleExpand,
  threads,
  currentUser,
  chatRecipient,
  chatMessages,
  newMsgText,
  typingUsers,
  onlineUserIds,
  chatBottomRef,
  onClose,
  onSelectThread,
  onBackToList,
  onNewMsgTextChange,
  onSendDM,
  onTyping,
  onOpenProfile,
}: MessagesPanelProps) {
  const sorted = useMemo(() => {
    return [...threads].sort((a, b) => {
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime();
      }
      if (a.lastMessage) return -1;
      if (b.lastMessage) return 1;
      return a.username.localeCompare(b.username);
    });
  }, [threads]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isExpanded) onToggleExpand();
        else onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isExpanded, onClose, onToggleExpand]);

  // Scroll stays wherever the pointer is (no page lock). These give the chat and
  // conversation lists a rubber-band bump at the start/end and stop scroll from
  // chaining to the page behind.
  const chatScrollRef = useOverscrollBounce<HTMLDivElement>(isOpen);
  const listScrollRef = useOverscrollBounce<HTMLDivElement>(isOpen);

  useEffect(() => {
    if (!isOpen || isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      const panel = document.getElementById('messages-panel');
      const fab = document.getElementById('messages-fab-trigger');
      const target = e.target as Node;
      if (panel?.contains(target) || fab?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isExpanded, onClose]);

  if (!isOpen) return null;

  const showingChat = !!chatRecipient;
  const anchorBottom = 'bottom-[4.75rem]';

  return (
    <>
      {!isExpanded && (
        <div
          className="fixed inset-0 z-40 bg-black/20 animate-backdrop-fade-in"
          onClick={onClose}
          aria-hidden
        />
      )}

      <div
        id="messages-panel"
        className={
          isExpanded
            ? 'fixed inset-0 z-50 flex flex-col bg-bg-secondary border border-border-custom shadow-2xl overflow-hidden animate-panel-pop-anchor'
            : `fixed right-4 ${anchorBottom} z-50 flex flex-col w-[min(380px,calc(100vw-2rem))] h-[min(520px,62vh)] bg-bg-secondary border border-border-custom shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)] overflow-hidden animate-panel-pop-anchor rounded-2xl rounded-br-xl`
        }
        role="dialog"
        aria-label="Messages"
      >
        <PanelHeader
          showingChat={showingChat}
          chatRecipient={chatRecipient}
          isOnline={chatRecipient ? onlineUserIds.has(chatRecipient.id) : false}
          isExpanded={isExpanded}
          onBack={onBackToList}
          onToggleExpand={onToggleExpand}
          onClose={onClose}
          onOpenProfile={onOpenProfile}
        />

        {showingChat && chatRecipient ? (
          <>
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2 bg-chat-bg min-h-0">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-muted text-[11px] gap-1.5 py-8">
                  <MessageCircle className="h-7 w-7 opacity-40" />
                  <span>No messages yet. Say hello!</span>
                </div>
              ) : (
                chatMessages.map((msg, index) => {
                  const isMe = msg.senderId === currentUser.id;
                  const prevMsg = index > 0 ? chatMessages[index - 1] : null;
                  const isLast = index === chatMessages.length - 1;
                  const showTime =
                    !prevMsg ||
                    new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 15 * 60 * 1000;

                  return (
                    <div key={msg.id} className="flex flex-col">
                      {showTime && (
                        <div className="text-[10px] text-text-muted font-medium text-center my-2">
                          {new Date(msg.createdAt).toLocaleDateString([], {
                            weekday: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-[18px] px-3 py-2 text-[12px] leading-snug ${
                            isMe
                              ? 'bg-msg-me text-msg-me-text rounded-br-[4px]'
                              : 'bg-msg-other text-msg-other-text rounded-bl-[4px] border border-border-custom'
                          }`}
                        >
                          <p className="break-words text-left">{msg.content}</p>
                        </div>
                      </div>
                      {isLast && isMe && (
                        <div className="text-[10px] text-text-muted text-right pr-1 mt-0.5">
                          {msg.read ? 'Read' : 'Delivered'}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            <form
              onSubmit={onSendDM}
              className="p-2.5 bg-chat-input border-t border-border-custom flex items-center gap-2 shrink-0 pb-safe"
            >
              <input
                type="text"
                required
                placeholder="Message"
                value={newMsgText}
                onChange={e => {
                  onNewMsgTextChange(e.target.value);
                  onTyping(chatRecipient.id);
                }}
                className="flex-grow bg-input-bg border border-border-custom rounded-2xl px-3 py-2 text-[12px] text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-indigo-500/20 min-h-[40px]"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-full shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </>
        ) : (
          <div ref={listScrollRef} className="overflow-y-auto overscroll-contain divide-y divide-border-custom/50 flex-1 min-h-0">
            {sorted.length === 0 ? (
              <div className="px-3 py-10 text-center text-[11px] text-text-muted leading-snug flex flex-col items-center gap-2">
                <SquarePen className="h-4 w-4 opacity-50" />
                No messages yet.
              </div>
            ) : (
              sorted.map(t => {
                const hasUnread = t.unreadCount > 0;
                const isOnline = onlineUserIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelectThread({ id: t.id, username: t.username, role: t.role, avatarUrl: t.avatarUrl })}
                    className={`w-full px-3 py-2.5 flex gap-2.5 text-left cursor-pointer transition-colors min-h-[52px] ${
                      hasUnread
                        ? 'bg-indigo-950/20 hover:bg-indigo-950/30 border-l-2 border-l-indigo-500'
                        : 'hover:bg-bg-tertiary/50'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <UserAvatar
                        username={t.username}
                        avatarUrl={t.avatarUrl}
                        size="md"
                        className={hasUnread ? 'ring-2 ring-indigo-500/60' : ''}
                      />
                      <span
                        className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg-secondary ${
                          isOnline ? 'bg-emerald-500' : 'bg-text-muted/60'
                        }`}
                        title={isOnline ? 'Online' : 'Offline'}
                        aria-label={isOnline ? 'Online' : 'Offline'}
                      />
                      {hasUnread && (
                        <span className="absolute -top-0.5 -right-0.5 h-[18px] min-w-[18px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-bg-secondary">
                          {t.unreadCount > 9 ? '9+' : t.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1">
                        <p
                          className={`text-[11px] truncate ${hasUnread ? 'font-bold text-text-primary' : 'font-semibold text-text-primary'}`}
                        >
                          {t.username}
                          {t.equippedBadges && t.equippedBadges.length > 0 && (
                            <EquippedBadgesInline
                              badges={t.equippedBadges}
                              size="sm"
                              className="ml-0.5 align-text-bottom"
                            />
                          )}
                          {t.role === 'admin' && (
                            <Shield className="h-3 w-3 text-amber-500 inline ml-0.5 align-text-bottom" />
                          )}
                        </p>
                        {t.lastMessage && (
                          <span
                            className={`text-[10px] shrink-0 leading-none ${hasUnread ? 'text-indigo-400 font-medium' : 'text-text-muted'}`}
                          >
                            {new Date(t.lastMessage.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        {typingUsers[t.id] ? (
                          <p className="text-[10px] font-medium text-indigo-400">Typing…</p>
                        ) : t.lastMessage ? (
                          <p
                            className={`text-[10px] truncate leading-snug ${hasUnread ? 'text-text-primary font-semibold' : 'text-text-muted'}`}
                          >
                            {t.lastMessage.senderId === currentUser.id ? 'You: ' : ''}
                            {t.lastMessage.content}
                          </p>
                        ) : (
                          <p className="text-[10px] text-text-muted italic">No messages yet</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </>
  );
}

function PanelHeader({
  showingChat,
  chatRecipient,
  isOnline,
  isExpanded,
  onBack,
  onToggleExpand,
  onClose,
  onOpenProfile,
}: {
  showingChat: boolean;
  chatRecipient: ChatRecipient | null;
  isOnline: boolean;
  isExpanded: boolean;
  onBack: () => void;
  onToggleExpand: () => void;
  onClose: () => void;
  onOpenProfile: (userId: number, opts?: { username?: string }) => void;
}) {
  return (
    <div className="px-3 py-2 flex items-center justify-between bg-bg-primary/50 border-b border-border-custom/60 shrink-0 gap-2">
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {showingChat && chatRecipient ? (
          <>
            <button
              onClick={onBack}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-indigo-400 hover:bg-bg-tertiary cursor-pointer shrink-0"
              aria-label="Back to conversations"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onOpenProfile(chatRecipient.id, { username: chatRecipient.username })}
              className="flex items-center gap-2 min-w-0 rounded-lg hover:bg-bg-tertiary/60 px-1 -mx-1 py-0.5 transition-colors cursor-pointer text-left"
              aria-label={`View ${chatRecipient.username}'s profile`}
            >
              <div className="relative shrink-0">
                <UserAvatar
                  username={chatRecipient.username}
                  avatarUrl={chatRecipient.avatarUrl}
                  size="sm"
                />
                <span
                  className={`absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-bg-primary ${
                    isOnline ? 'bg-emerald-500' : 'bg-text-muted/60'
                  }`}
                  title={isOnline ? 'Online' : 'Offline'}
                  aria-label={isOnline ? 'Online' : 'Offline'}
                />
              </div>
              <div className="min-w-0 leading-tight">
                <span className="text-[11px] font-semibold text-text-primary truncate block hover:text-indigo-400 transition-colors">
                  {chatRecipient.username}
                </span>
                <span className={`text-[10px] ${isOnline ? 'text-emerald-500' : 'text-text-muted'}`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </button>
          </>
        ) : (
          <span className="text-[11px] font-semibold text-text-secondary tracking-wide">Messages</span>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onToggleExpand}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer transition-colors"
          aria-label={isExpanded ? 'Collapse messages' : 'Expand messages'}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button
          onClick={onClose}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer transition-colors"
          aria-label="Dismiss messages"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
