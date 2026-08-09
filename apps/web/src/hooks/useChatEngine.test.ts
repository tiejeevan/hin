import { describe, it, expect } from 'vitest';
import { applyDelivered, mergeAndSortMessages } from '../lib/chatMessages';
import type { Message } from '@hin/types';

function msg(partial: Partial<Message> & Pick<Message, 'id' | 'content'>): Message {
  return {
    senderId: 1,
    senderUsername: 'a',
    receiverId: 2,
    receiverUsername: 'b',
    createdAt: '2026-01-01T00:00:00.000Z',
    read: false,
    status: 'sent',
    ...partial,
  };
}

describe('useChatEngine merge helpers', () => {
  it('mergeAndSortMessages dedupes', () => {
    const merged = mergeAndSortMessages(
      [msg({ id: 1, content: 'a' })],
      [msg({ id: 1, content: 'a2', status: 'delivered' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('delivered');
  });

  it('applyDelivered upgrades sent', () => {
    const next = applyDelivered([msg({ id: 1, content: 'x', status: 'sent' })], [1], 't');
    expect(next[0].status).toBe('delivered');
  });
});
