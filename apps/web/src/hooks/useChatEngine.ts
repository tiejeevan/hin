import { useCallback, useMemo, useState } from 'react';
import type { Message } from '@hin/types';
import {
  applyDelivered,
  applyMessagesRead,
  mergeAndSortMessages,
} from '../lib/chatWasmBridge';

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
