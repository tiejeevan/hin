import { useRef, useEffect, useState } from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import { ChatThread, Message, User as UserType } from '@hin/types';
import { ChatRecipient } from '../../types/ui';
import { MessagesPanel } from '../messages/MessagesPanel';

interface FloatingActionStackProps {
  showNewPostForm: boolean;
  showMessagesDropdown: boolean;
  messagesPanelExpanded: boolean;
  threads: ChatThread[];
  currentUser: UserType;
  chatRecipient: ChatRecipient | null;
  chatMessages: Message[];
  newMsgText: string;
  typingUsers: Record<number, boolean>;
  unreadMessagesCount: number;
  messageIconPulseAt: number;
  chatBottomRef: React.RefObject<HTMLDivElement>;
  hasBottomNav: boolean;
  onOpenCreatePost: () => void;
  onToggleMessages: () => void;
  onCloseMessages: () => void;
  onToggleMessagesExpand: () => void;
  onSelectThread: (thread: ChatRecipient) => void;
  onBackToList: () => void;
  onNewMsgTextChange: (text: string) => void;
  onSendDM: (e: React.FormEvent) => void;
  onTyping: (recipientId: number) => void;
}

export function FloatingActionStack({
  showNewPostForm,
  showMessagesDropdown,
  messagesPanelExpanded,
  threads,
  currentUser,
  chatRecipient,
  chatMessages,
  newMsgText,
  typingUsers,
  unreadMessagesCount,
  messageIconPulseAt,
  chatBottomRef,
  hasBottomNav,
  onOpenCreatePost,
  onToggleMessages,
  onCloseMessages,
  onToggleMessagesExpand,
  onSelectThread,
  onBackToList,
  onNewMsgTextChange,
  onSendDM,
  onTyping,
}: FloatingActionStackProps) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const fabBottom = hasBottomNav ? 'bottom-20' : 'bottom-4';
  const hasUnread = unreadMessagesCount > 0;
  const [isPulsing, setIsPulsing] = useState(false);
  const lastPulseAtRef = useRef(0);

  useEffect(() => {
    if (messageIconPulseAt === 0 || messageIconPulseAt === lastPulseAtRef.current) return;
    lastPulseAtRef.current = messageIconPulseAt;
    setIsPulsing(true);
    const timer = setTimeout(() => setIsPulsing(false), 1200);
    return () => clearTimeout(timer);
  }, [messageIconPulseAt]);

  if (showNewPostForm) return null;

  return (
    <>
      <div className={`fixed ${fabBottom} right-4 z-20 flex flex-col items-center gap-3`}>
        <button
          onClick={onOpenCreatePost}
          className="h-14 w-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center cursor-pointer transition-all active:scale-95"
          aria-label="Create post"
        >
          <Plus className="h-6 w-6" />
        </button>

        <div ref={messagesRef} className={showMessagesDropdown && !messagesPanelExpanded ? 'z-50' : ''}>
          <button
            id="messages-fab-trigger"
            onClick={onToggleMessages}
            className={`relative h-12 w-12 rounded-full border shadow-md flex items-center justify-center cursor-pointer transition-all active:scale-95 ${
              showMessagesDropdown
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : hasUnread
                  ? `bg-indigo-950/40 border-rose-500/50 text-indigo-300 ${isPulsing ? 'animate-unread-glow-once' : ''}`
                  : 'bg-bg-secondary border-border-custom text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
            aria-label={hasUnread ? `Messages, ${unreadMessagesCount} unread` : 'Messages'}
            aria-expanded={showMessagesDropdown}
          >
            <MessageSquare className="h-5 w-5" />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold h-[18px] min-w-[18px] px-0.5 rounded-full flex items-center justify-center border-2 border-bg-secondary">
                {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <MessagesPanel
        isOpen={showMessagesDropdown}
        isExpanded={messagesPanelExpanded}
        onToggleExpand={onToggleMessagesExpand}
        threads={threads}
        currentUser={currentUser}
        chatRecipient={chatRecipient}
        chatMessages={chatMessages}
        newMsgText={newMsgText}
        typingUsers={typingUsers}
        chatBottomRef={chatBottomRef}
        hasBottomNav={hasBottomNav}
        onClose={onCloseMessages}
        onSelectThread={onSelectThread}
        onBackToList={onBackToList}
        onNewMsgTextChange={onNewMsgTextChange}
        onSendDM={onSendDM}
        onTyping={onTyping}
      />
    </>
  );
}
