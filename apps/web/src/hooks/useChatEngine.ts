import { useCallback, useMemo, useState } from 'react';
import type { Message } from '@hin/types';
import {
  applyDelivered,
  applyMessagesRead,
  mergeAndSortMessages,
} from '../lib/chatWasmBridge';
import {
  capMessageWindow,
  excludeDeletedIds,
  mergeAndSortMessagesExcludingDeleted,
} from '../lib/chatMessages';
import { addTombstone, removeTombstone } from '../lib/chatDeleteTombstones';

// App.tsx (Agent 1) should import delete-integrity helpers from:
//   - '../lib/chatMessages' — excludeDeletedIds, mergeAndSortMessagesExcludingDeleted, capMessageWindow
//   - '../lib/chatDeleteTombstones' — addTombstone, removeTombstone
// Re-exported here for hook consumers / incremental migration.
export {
  excludeDeletedIds,
  mergeAndSortMessagesExcludingDeleted,
  capMessageWindow,
  addTombstone,
  removeTombstone,
};

/**
 * Chat engine helpers + reply draft state.
 * Full App.tsx ownership migrates incrementally; this hook owns reply/delete
 * local reductions and merge helpers used by ChatBox / MessagesPanel wiring.
 */
export function useChatEngine() {
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);

  const clearReply = useCallback(() => setReplyingToMessage(null), []);
  const setReplyTo = useCallback((msg: Message | null) => setReplyingToMessage(msg), []);

  const removeMessageLocal = useCallback((messages: Message[], msg: Message): Message[] => {
    return messages.filter(
      m =>
        !(
          m.id === msg.id ||
          (msg.clientMessageId && m.clientMessageId === msg.clientMessageId)
        ),
    );
  }, []);

  const applyIncomingDeleted = useCallback((messages: Message[], messageId: number): Message[] => {
    return messages.filter(m => m.id !== messageId);
  }, []);

  const actions = useMemo(
    () => ({
      mergeAndSortMessages,
      mergeAndSortMessagesExcludingDeleted,
      excludeDeletedIds,
      capMessageWindow,
      addTombstone,
      removeTombstone,
      applyDelivered,
      applyMessagesRead,
      setReplyTo,
      clearReply,
      removeMessageLocal,
      applyIncomingDeleted,
    }),
    [setReplyTo, clearReply, removeMessageLocal, applyIncomingDeleted],
  );

  return {
    state: { replyingToMessage },
    actions,
  };
}
